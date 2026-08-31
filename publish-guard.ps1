<#
    Anonymous-site release guard.

    The guard checks the files that Git would publish, rather than dist/ or a
    local browser cache.  It is deliberately independent from build.mjs so it
    can be run before either a GitHub Pages push or a static-site build.

    Examples (Windows PowerShell 5.1 and PowerShell 7):
      powershell -ExecutionPolicy Bypass -File publish-guard.ps1
      powershell -ExecutionPolicy Bypass -File publish-guard.ps1 -StrictPaths
      powershell -ExecutionPolicy Bypass -File publish-guard.ps1 -StagedOnly
      powershell -ExecutionPolicy Bypass -File publish-guard.ps1 -CheckHistory

    Exit codes: 0 = no blocking findings, 1 = release blocked, 2 = guard
    error.  Warnings do not change the exit code unless -StrictPaths is used.

    Anonymous mode is the default.  Public HTML surfaces (index, detail,
    status, and the calculator entry point) must contain a noindex robots
    directive.  The cv.html template and source copies are reported as
    warnings so the guard can pass while they remain private tooling.  Use
    -AllowIndexing only after the owner has deliberately approved discovery.

    The public path allowlist is intentionally narrow.  GitHub Pages publishes
    every tracked file at the repository root, so files outside this list are
    reported.  Add an explicit -AllowPath pattern or use -StrictPaths once the
    repository has been split into a public deployment tree.
#>

[CmdletBinding()]
param(
    [string] $Root = '',
    [switch] $StagedOnly,
    [switch] $IncludeUntracked,
    [switch] $IncludeIgnored,
    [switch] $StrictPaths,
    [switch] $AllowIndexing,
    [switch] $AllowPublicIdentifier,
    [switch] $CheckHistory,
    [string[]] $AllowEmail = @(),
    [string[]] $AllowPath = @()
)

$ErrorActionPreference = 'Stop'
$script:Blocking = 0
$script:Warnings = 0
$script:Findings = New-Object System.Collections.Generic.List[object]

function Write-Section {
    param([string] $Text)
    Write-Host ''
    Write-Host $Text -ForegroundColor Cyan
    Write-Host ('-' * 72)
}

function Write-Info {
    param([string] $Text)
    Write-Host $Text -ForegroundColor DarkGray
}

function Add-Finding {
    param(
        [ValidateSet('block', 'warn')][string] $Severity,
        [string] $Rule,
        [string] $File,
        [int] $Line = 0,
        [string] $Detail = ''
    )
    if ($Severity -eq 'warn' -and $script:StrictPaths -and $Rule -eq 'PATH_NOT_ALLOWLISTED') {
        $Severity = 'block'
    }
    $script:Findings.Add([pscustomobject]@{
        Severity = $Severity
        Rule     = $Rule
        File     = $File
        Line     = $Line
        Detail   = $Detail
    })
    if ($Severity -eq 'block') { $script:Blocking++ } else { $script:Warnings++ }
}

function Get-LineNumber {
    param([string] $Text, [int] $Index)
    if ($Index -le 0) { return 1 }
    return ([regex]::Matches($Text.Substring(0, [Math]::Min($Index, $Text.Length)), "`n")).Count + 1
}

function Mask-Value {
    param([string] $Value)
    if ([string]::IsNullOrEmpty($Value)) { return '***' }
    if ($Value.Length -le 4) { return '***' }
    return $Value.Substring(0, 2) + '***' + $Value.Substring($Value.Length - 2, 2)
}

function Normalize-RelativePath {
    param([string] $Path)
    return (($Path -replace '\\', '/') -replace '^\./', '').TrimStart('/')
}

function Get-GitLines {
    param([string[]] $Arguments)
    $output = @(& git -C $script:RootPath @Arguments 2>$null)
    if ($LASTEXITCODE -ne 0) {
        throw "git command failed: git -C `"$($script:RootPath)`" $($Arguments -join ' ')"
    }
    return @($output | ForEach-Object { [string] $_ })
}

function Get-ProcessOutputBytes {
    param([string[]] $Arguments)

    $start = New-Object System.Diagnostics.ProcessStartInfo
    $start.FileName = 'git'
    $start.UseShellExecute = $false
    $start.CreateNoWindow = $true
    $start.RedirectStandardOutput = $true
    $start.RedirectStandardError = $true

    # ArgumentList exists on .NET Core (PowerShell 7).  Windows PowerShell 5.1
    # uses the quoted Arguments property instead.
    $argumentListProperty = $start.PSObject.Properties['ArgumentList']
    if ($null -ne $argumentListProperty) {
        [void] $start.ArgumentList.Add('-C')
        [void] $start.ArgumentList.Add($script:RootPath)
        foreach ($argument in $Arguments) { [void] $start.ArgumentList.Add($argument) }
    } else {
        $quoted = @('-C', $script:RootPath) + $Arguments | ForEach-Object {
            '"' + (($_ -replace '\\', '\\') -replace '"', '\"') + '"'
        }
        $start.Arguments = $quoted -join ' '
    }

    $process = New-Object System.Diagnostics.Process
    $process.StartInfo = $start
    [void] $process.Start()
    $stream = New-Object System.IO.MemoryStream
    $process.StandardOutput.BaseStream.CopyTo($stream)
    $errorText = $process.StandardError.ReadToEnd()
    $process.WaitForExit()
    $bytes = $stream.ToArray()
    $stream.Dispose()
    if ($process.ExitCode -ne 0) {
        throw "git blob read failed for $($Arguments -join ' '): $errorText"
    }
    return $bytes
}

function Read-WorktreeText {
    param([string] $FullPath)
    if (-not (Test-Path -LiteralPath $FullPath -PathType Leaf)) { return $null }
    $bytes = [System.IO.File]::ReadAllBytes($FullPath)
    if ($bytes.Length -eq 0) { return '' }
    if ([Array]::IndexOf($bytes, [byte] 0) -ge 0) { return $null }
    return [System.Text.Encoding]::UTF8.GetString($bytes)
}

function Read-IndexText {
    param([string] $RelativePath)
    $bytes = Get-ProcessOutputBytes @('cat-file', 'blob', ":$RelativePath")
    if ($bytes.Length -eq 0) { return '' }
    if ([Array]::IndexOf($bytes, [byte] 0) -ge 0) { return $null }
    return [System.Text.Encoding]::UTF8.GetString($bytes)
}

function Test-AllowedPattern {
    param([string] $Value, [string[]] $Patterns)
    foreach ($pattern in $Patterns) {
        if ($Value -like $pattern -or $Value -match $pattern) { return $true }
    }
    return $false
}

function Get-TrackedPaths {
    if (-not (Test-Path -LiteralPath (Join-Path $script:RootPath '.git'))) {
        return @()
    }
    return @(Get-GitLines @('ls-files', '--cached', '--full-name') |
        ForEach-Object { Normalize-RelativePath $_ } |
        Where-Object { $_ })
}

function Get-UntrackedPaths {
    if (-not (Test-Path -LiteralPath (Join-Path $script:RootPath '.git'))) {
        return @()
    }
    if ($script:IncludeIgnored) {
        return @(Get-GitLines @('ls-files', '--others', '--full-name') |
            ForEach-Object { Normalize-RelativePath $_ } |
            Where-Object { $_ })
    }
    return @(Get-GitLines @('ls-files', '--others', '--exclude-standard', '--full-name') |
        ForEach-Object { Normalize-RelativePath $_ } |
        Where-Object { $_ })
}

function Get-TextRules {
    # Patterns are intentionally high-confidence.  Values are masked in all
    # output so running the guard cannot copy a secret into a build log.
    return @(
        @{ Id = 'EMAIL'; Severity = 'block'; Pattern = '(?i)(?<![A-Z0-9._%+-])[A-Z0-9._%+-]{1,64}@[A-Z0-9-]+(?:\.[A-Z0-9-]+)*\.[A-Z]{2,63}(?![A-Z0-9._-])' }
        @{ Id = 'PHONE_CN'; Severity = 'block'; Pattern = '(?<!\d)(?:\+?86[\s-]?)?1[3-9]\d{9}(?!\d)' }
        # Require a plausible Chinese ID birth-date segment.  A bare 18-digit
        # run also occurs inside floating-point model coefficients.
        @{ Id = 'CN_ID'; Severity = 'block'; Pattern = '(?<!\d)[1-8]\d{5}(?:19\d{2}|20\d{2})(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}[\dXx](?!\d)' }
        @{ Id = 'PRIVATE_KEY'; Severity = 'block'; Pattern = '(?i)-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----' }
        @{ Id = 'GITHUB_TOKEN'; Severity = 'block'; Pattern = '(?i)\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b' }
        @{ Id = 'OPENAI_TOKEN'; Severity = 'block'; Pattern = '(?i)\bsk-[A-Za-z0-9]{20,}\b' }
        @{ Id = 'AWS_ACCESS_KEY'; Severity = 'block'; Pattern = '\bAKIA[0-9A-Z]{16}\b' }
        @{ Id = 'GOOGLE_API_KEY'; Severity = 'block'; Pattern = '\bAIza[0-9A-Za-z_-]{35}\b' }
        @{ Id = 'SLACK_TOKEN'; Severity = 'block'; Pattern = '\bxox[baprs]-[0-9A-Za-z-]{10,}\b' }
        @{ Id = 'JWT'; Severity = 'block'; Pattern = '\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b' }
        @{ Id = 'BEARER_TOKEN'; Severity = 'block'; Pattern = '(?i)\bBearer\s+[A-Za-z0-9._~+/=-]{20,}' }
        @{ Id = 'SECRET_URL'; Severity = 'block'; Pattern = '(?i)(?:[?&](?:token|access_token|refresh_token|api[_-]?key|secret|password|signature)=)[^&#\s"'']{8,}' }
        @{ Id = 'SECRET_ASSIGNMENT'; Severity = 'block'; Pattern = '(?i)\b(?:api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|password|passwd|secret|authorization|cookie)\b\s*[:=]\s*["''][^"'']{8,}["'']' }
        # This is an internal project identifier rather than an API secret;
        # report it as a warning unless strict path/content review is requested.
        @{ Id = 'OPENAI_PROJECT_ID'; Severity = 'warn'; Pattern = '\bappgprj_[A-Za-z0-9]{10,}\b' }
        @{ Id = 'LOCAL_PATH'; Severity = 'block'; Pattern = '(?i)\b[A-Z]:\\(?:Users\\|claude research\\)' }
        @{ Id = 'LOCAL_ENDPOINT'; Severity = 'warn'; Pattern = '(?i)\b(?:https?://)?(?:127\.0\.0\.1|localhost)(?::\d+)?\b' }
        @{ Id = 'OLD_SITE_HOST'; Severity = 'warn'; Pattern = '(?i)https?://cosine753\.github\.io(?:[/"''<\s]|$)' }
    )
}

$script:RootPath = $null
$script:IncludeIgnored = [bool] $IncludeIgnored
$script:StrictPaths = [bool] $StrictPaths
try {
    if ([string]::IsNullOrWhiteSpace($Root)) { $Root = $PSScriptRoot }
    if ([string]::IsNullOrWhiteSpace($Root)) { $Root = (Get-Location).Path }
    $script:RootPath = (Resolve-Path -LiteralPath $Root).Path
    if (-not (Test-Path -LiteralPath $script:RootPath -PathType Container)) {
        throw "Root is not a directory: $script:RootPath"
    }

    $hasGit = Test-Path -LiteralPath (Join-Path $script:RootPath '.git')
    if ($hasGit) {
        $paths = @(Get-TrackedPaths)
        # A worktree scan includes ordinary untracked files by default. This
        # catches a newly-created page or accidentally copied secret before it
        # reaches `git add`; -StagedOnly is the frozen-index mode.
        if (-not $StagedOnly -or $IncludeUntracked -or $IncludeIgnored) {
            $paths += @(Get-UntrackedPaths)
        }
        $paths = @($paths | Sort-Object -Unique)
    } else {
        if ($StagedOnly -or $CheckHistory) {
            throw '-StagedOnly and -CheckHistory require a Git repository.'
        }
        $paths = @(Get-ChildItem -LiteralPath $script:RootPath -File -Recurse |
            Where-Object { $_.FullName -notmatch '[\\/]\.git[\\/]' } |
            ForEach-Object { Normalize-RelativePath $_.FullName.Substring($script:RootPath.Length) })
    }
    if ($paths.Count -eq 0) { throw 'No files found to scan.' }

    $publicAllowlist = @(
        'index.html',
        '404.html',
        'assets/site.css',
        'assets/motion.js',
        'og.png',
        'robots.txt',
        'sitemap.xml',
        'CNAME',
        'myopia-risk-calculator/index.html',
        'demo/index.html',
        'status.html',
        'privacy.html',
        'assets/status.css',
        'work/myopia-risk-calculator/index.html',
        'work/myopia-risk-calculator/verification.json'
    ) + @($AllowPath)

    $sensitivePathRules = @(
        @{ Id = 'INTERNAL_OPENAI_PATH'; Pattern = '(^|/)\.openai(/|$)' }
        @{ Id = 'BUILD_OUTPUT_PATH'; Pattern = '(^|/)dist(/|$)' }
        @{ Id = 'DIAGNOSTIC_TOOL_PATH'; Pattern = '(^|/)tools/(?!make-og\.ps1$)' }
        @{ Id = 'SENSITIVE_FILENAME'; Pattern = '(?i)(^|/)(?:myinfo|.*(?:secret|credential|token|cookie|session|private|diagnostic|screenshot|browser|dns|api)).*$' }
        @{ Id = 'ARCHIVE_OR_BACKUP'; Pattern = '(?i)\.(?:bak|log|tgz|tar|zip|7z|rar|dump|sql)$' }
    )

    Write-Section 'Publish set and path boundary'
    Write-Host ("Mode: " + ($(if ($StagedOnly) { 'Git index (staged snapshot)' } else { 'Git tracked worktree' })))
    if ($StagedOnly) {
        Write-Host 'Untracked files: excluded (staged index snapshot)'
    } elseif ($IncludeIgnored) {
        Write-Host 'Untracked files: included, including ignored files'
    } else {
        Write-Host 'Untracked files: included (ignored files remain excluded)'
    }
    Write-Host ("Public allowlist: " + ($publicAllowlist -join ', '))

    $entries = New-Object System.Collections.Generic.List[object]
    foreach ($relative in $paths) {
        $normalized = Normalize-RelativePath $relative
        $full = Join-Path $script:RootPath ($normalized -replace '/', '\\')
        foreach ($pathRule in $sensitivePathRules) {
            if ($normalized -match $pathRule.Pattern) {
                # Internal metadata/build output is a warning while the
                # legacy root Pages layout remains in use. Clearly sensitive
                # filenames and diagnostic bundles always block; -StrictPaths
                # upgrades every remaining path warning.
                $alwaysBlock = @('DIAGNOSTIC_TOOL_PATH', 'SENSITIVE_FILENAME', 'ARCHIVE_OR_BACKUP')
                $pathSeverity = if ($StrictPaths -or $pathRule.Id -in $alwaysBlock) { 'block' } else { 'warn' }
                Add-Finding -Severity $pathSeverity -Rule $pathRule.Id -File $normalized -Detail 'Do not publish this path.'
            }
        }

        $allowed = Test-AllowedPattern -Value $normalized -Patterns $publicAllowlist
        if (-not $allowed) {
            Add-Finding -Severity 'warn' -Rule 'PATH_NOT_ALLOWLISTED' -File $normalized -Detail 'Move it out of the Pages tree or add an explicit allowlist entry.'
        }

        $text = if ($StagedOnly -and $hasGit) { Read-IndexText $normalized } else { Read-WorktreeText $full }
        if ($null -eq $text) {
            if (-not $StagedOnly -and -not (Test-Path -LiteralPath $full -PathType Leaf)) {
                Add-Finding -Severity 'block' -Rule 'MISSING_WORKTREE_FILE' -File $normalized -Detail 'Tracked path is absent from the worktree.'
            }
            $entries.Add([pscustomobject]@{ Path = $normalized; Text = $null })
        } else {
            $entries.Add([pscustomobject]@{ Path = $normalized; Text = $text })
        }
    }

    Write-Section 'Sensitive content'
    $rules = @(Get-TextRules)
    foreach ($entry in $entries) {
        $path = $entry.Path
        $text = $entry.Text
        if ($null -eq $text) { continue }
        $isHtml = $path -match '(?i)\.html?$'
        $isSourceCopy = $path -match '(?i)(^|/)(?:third_party|vendor|fixtures?)(/|$)'
        $isExampleTool = $path -match '(?i)^(?:README|check|fill|build|serve|test-site|publish-guard)(?:\.[A-Za-z0-9_-]+)?$'
        # These are the pages a user can reasonably reach as part of the
        # published site.  Tooling templates and vendored snapshots are kept
        # out of this strict HTML gate and still receive path warnings.
        $strictHtml = $isHtml -and -not $isSourceCopy -and (
            $path -eq 'index.html' -or
            $path -eq '404.html' -or
            $path -eq 'status.html' -or
            $path -eq 'myopia-risk-calculator/index.html' -or
            $path -eq 'demo/index.html' -or
            $path -eq 'work/myopia-risk-calculator/index.html' -or
            $path -match '(?i)(^|/)(?:detail|details|status)(?:/|\.html$)' -or
            $path -match '(?i)^work/(?:.+/)?(?:detail|details|status)(?:/|\.html$)'
        )

        # Anonymous pages are the strict surface.  This catches both the
        # homepage and any accidentally copied detail/status/calculator page.
        if ($strictHtml) {
            $robotsTags = [regex]::Matches($text, '(?is)<meta\b[^>]*>')
            $hasNoindex = $false
            foreach ($tag in $robotsTags) {
                if ($tag.Value -match '(?i)\bname\s*=\s*["'']robots["'']' -and
                    $tag.Value -match '(?i)\bcontent\s*=\s*["''][^"'']*\bnoindex\b') {
                    $hasNoindex = $true
                    break
                }
            }
            if (-not $AllowIndexing -and -not $hasNoindex) {
                Add-Finding -Severity 'block' -Rule 'ROBOTS_NOINDEX_MISSING' -File $path -Line 1 -Detail 'Anonymous mode requires a robots noindex directive on every HTML page.'
            }
            if (-not $AllowIndexing -and $text -match '(?i)\bindex\s*,\s*follow\b') {
                Add-Finding -Severity 'block' -Rule 'ROBOTS_INDEX_FOLLOW' -File $path -Line (Get-LineNumber $text $text.IndexOf('index')) -Detail 'index, follow conflicts with anonymous mode.'
            }
            foreach ($m in [regex]::Matches($text, '(?i)\brel\s*=\s*["'']?me(?:["''\s>]|$)')) {
                Add-Finding -Severity 'block' -Rule 'IDENTITY_REL_ME' -File $path -Line (Get-LineNumber $text $m.Index) -Detail 'rel="me" creates an explicit identity link.'
            }
        }

        foreach ($rule in $rules) {
            # Tooling and README files contain deliberately quoted examples
            # (including regexes for secrets and identifiers).  They are not a
            # content surface; path policy still reports them.  Real HTML and
            # assets continue through every high-confidence rule.
            if ($isExampleTool) {
                continue
            }
            $matches = [regex]::Matches($text, $rule.Pattern)
            if ($matches.Count -eq 0) { continue }
            $shown = 0
            foreach ($m in $matches) {
                $value = $m.Value
                if ($rule.Id -eq 'EMAIL' -and (Test-AllowedPattern -Value $value -Patterns $AllowEmail)) { continue }
                if ($rule.Id -eq 'OLD_SITE_HOST') {
                    $severity = 'warn'
                } elseif ($rule.Id -eq 'LOCAL_ENDPOINT') {
                    $severity = 'warn'
                } else {
                    $severity = $rule.Severity
                }
                # ORCID is public by design, but it defeats this anonymous
                # trial unless explicitly allowed.
                if ($rule.Id -eq 'PUBLIC_IDENTIFIER' -and $AllowPublicIdentifier) { continue }
                $line = Get-LineNumber $text $m.Index
                $detail = if ($rule.Id -in @('EMAIL', 'PHONE_CN', 'CN_ID', 'PRIVATE_KEY', 'GITHUB_TOKEN', 'OPENAI_TOKEN', 'AWS_ACCESS_KEY', 'GOOGLE_API_KEY', 'SLACK_TOKEN', 'JWT', 'BEARER_TOKEN', 'SECRET_URL', 'SECRET_ASSIGNMENT', 'OPENAI_PROJECT_ID')) {
                    'value=' + (Mask-Value $value)
                } else {
                    'Review this match before publishing.'
                }
                Add-Finding -Severity $severity -Rule $rule.Id -File $path -Line $line -Detail $detail
                $shown++
                if ($shown -ge 8) { break }
            }
            if ($matches.Count -gt $shown) {
                Add-Finding -Severity 'warn' -Rule ($rule.Id + '_MORE') -File $path -Line 1 -Detail ("Additional matches omitted: " + ($matches.Count - $shown))
            }
        }

        if (-not $AllowPublicIdentifier -and -not $isExampleTool) {
            foreach ($m in [regex]::Matches($text, '\b\d{4}-\d{4}-\d{4}-\d{3}[\dXx]\b')) {
                $identifierSeverity = if ($strictHtml) { 'block' } else { 'warn' }
                Add-Finding -Severity $identifierSeverity -Rule 'PUBLIC_IDENTIFIER' -File $path -Line (Get-LineNumber $text $m.Index) -Detail 'ORCID/public identifier can deanonymize the trial; pass -AllowPublicIdentifier only deliberately.'
            }
        }

        # Placeholders in HTML are always a release blocker.  In README and
        # tooling files they are documentation examples, so they are reported
        # only by the older check.ps1 workflow rather than this strict surface.
        if ($isHtml) {
            $placeholderMatches = [regex]::Matches($text, '\{\{[^}\r\n]{1,160}\}\}')
            $placeholderSeverity = if ($strictHtml) { 'block' } else { 'warn' }
            $placeholderDetail = if ($strictHtml) {
                'HTML must not contain template placeholders.'
            } else {
                'Template source is not a public page; keep it out of the deployment tree.'
            }
            $placeholderShown = 0
            foreach ($m in $placeholderMatches) {
                Add-Finding -Severity $placeholderSeverity -Rule 'UNRESOLVED_PLACEHOLDER' -File $path -Line (Get-LineNumber $text $m.Index) -Detail $placeholderDetail
                $placeholderShown++
                if ($placeholderShown -ge 8) { break }
            }
            if ($placeholderMatches.Count -gt $placeholderShown) {
                Add-Finding -Severity 'warn' -Rule 'UNRESOLVED_PLACEHOLDER_MORE' -File $path -Line 1 -Detail ("Additional placeholders omitted: " + ($placeholderMatches.Count - $placeholderShown))
            }
        }
    }

    if ($CheckHistory) {
        Write-Section 'Git history identity audit'
        $history = @(Get-GitLines @('log', '--all', '--format=%H%x09%ae%x09%ce'))
        foreach ($row in $history) {
            $parts = $row -split "`t"
            if ($parts.Count -lt 3) { continue }
            $hash = $parts[0]
            foreach ($field in @(@{ Name = 'author'; Value = $parts[1] }, @{ Name = 'committer'; Value = $parts[2] })) {
                $email = [string] $field.Value
                if ([string]::IsNullOrWhiteSpace($email)) { continue }
                $safe = $email -match '(?i)@users\.noreply\.github\.com$' -or
                        $email -match '(?i)^noreply@github\.com$' -or
                        (Test-AllowedPattern -Value $email -Patterns $AllowEmail)
                if (-not $safe) {
                    Add-Finding -Severity 'block' -Rule 'HISTORY_EMAIL' -File '(git history)' -Line 0 -Detail ("$hash $($field.Name)=" + (Mask-Value $email))
                }
            }
        }
        Write-Info 'This check is advisory about history only; it never rewrites commits. Use a deliberate history-redaction plan if needed.'
    }

    Write-Section 'Result'
    if ($script:Findings.Count -eq 0) {
        Write-Host 'No findings.' -ForegroundColor Green
    } else {
        foreach ($finding in $script:Findings) {
            $label = if ($finding.Severity -eq 'block') { '[BLOCK]' } else { '[WARN ]' }
            $location = if ($finding.Line -gt 0) { "$($finding.File):$($finding.Line)" } else { $finding.File }
            Write-Host ("{0} {1,-28} {2}  {3}" -f $label, $finding.Rule, $location, $finding.Detail) -ForegroundColor $(if ($finding.Severity -eq 'block') { 'Red' } else { 'Yellow' })
        }
    }
    Write-Host ''
    Write-Host ("Scanned files: $($entries.Count); blocking findings: $($script:Blocking); warnings: $($script:Warnings)")
    if ($script:Blocking -gt 0) {
        Write-Host 'Release blocked. Resolve the findings, then run the guard again.' -ForegroundColor Red
        exit 1
    }
    if ($script:Warnings -gt 0) {
        Write-Host 'No blocking findings. Review warnings before publishing.' -ForegroundColor Yellow
    } else {
        Write-Host 'Release guard passed.' -ForegroundColor Green
    }
    exit 0
} catch {
    Write-Host ("Guard error: " + $_.Exception.Message) -ForegroundColor Red
    exit 2
}
