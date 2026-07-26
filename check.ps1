<#
    发布前自检 —— 个人学术主页
    用法：  powershell -ExecutionPolicy Bypass -File check.ps1
    退出码：0 = 可以发布；1 = 存在阻断项，请勿推送

    检查七件事：
      A. 是否还有未填写的 {{需你填写:...}} 占位符
      B. noindex 开关是否与填写状态一致（没填完就必须挡住搜索引擎）
      C. 是否混入了外部资源（你在中国大陆，页面必须零外部依赖）
      D. 是否混入了本仓库历史上出现过的虚构内容
      E. 页内导航指向的锚点是否真的存在（反过来也查：有版块没进导航）
      F. 页面引用的本地文件是否真的在仓库里（cv.pdf、og.png……）
      G. index.html 与 cv.html 的姓名、邮箱是否一致

    关于注释的处理原则：
      A、E、F 问的是「页面上实际会呈现什么」，所以注释里的内容不算数；
      C、D 问的是「文件里躺着什么」，注释里出现同样要提醒 —— 一段被注释掉的
      CDN 引用，哪天被人取消注释就会立刻生效。
#>

$ErrorActionPreference = 'Stop'
$root = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }
$SITE = 'https://cosine753.github.io/'
$blocking = 0
$warning  = 0

function Write-Head($t) { Write-Host ""; Write-Host $t -ForegroundColor Cyan; Write-Host ("-" * 64) }
function Write-Bad($t)  { Write-Host "  [阻断] $t" -ForegroundColor Red }
function Write-Warn($t) { Write-Host "  [提醒] $t" -ForegroundColor Yellow }
function Write-Ok($t)   { Write-Host "  [通过] $t" -ForegroundColor Green }
function Write-Info($t) { Write-Host "        $t" -ForegroundColor DarkGray }

# ---------- 注释定位：按字符位置判断，行号不受影响 ----------
function Get-CommentRanges {
    param([string] $Text)
    $r = @()
    foreach ($m in [regex]::Matches($Text, '(?s)<!--.*?-->')) { $r += ,@($m.Index, ($m.Index + $m.Length)) }
    return ,$r
}
function Test-InComment {
    param($Ranges, [int] $Pos)
    foreach ($x in $Ranges) { if ($Pos -ge $x[0] -and $Pos -lt $x[1]) { return $true } }
    return $false
}
function Get-LineNo {
    param([string] $Text, [int] $Pos)
    return ([regex]::Matches($Text.Substring(0, $Pos), "`n")).Count + 1
}
function Read-Utf8 { param([string] $p) [System.IO.File]::ReadAllText($p, [System.Text.Encoding]::UTF8) }

$pages = @(Get-ChildItem -Path $root -Filter *.html -Recurse |
           Where-Object { $_.FullName -notmatch '\\\.git\\' } | Sort-Object Name)

if ($pages.Count -eq 0) { Write-Host "没找到任何 .html 文件，检查一下路径。" -ForegroundColor Red; exit 1 }

# 每个文件读一次，后面各项检查复用
$docs = @{}
foreach ($p in $pages) {
    $t = Read-Utf8 $p.FullName
    $docs[$p.Name] = @{ Path = $p.FullName; Text = $t; Comments = (Get-CommentRanges $t) }
}

# ============================================================================
#  A. 未填写的占位符
# ============================================================================
Write-Head "A. 未填写的占位符"
$live = @()      # 会真的显示出来的
$hidden = 0      # 藏在注释里的，不算阻断
foreach ($name in ($docs.Keys | Sort-Object)) {
    $d = $docs[$name]
    foreach ($m in [regex]::Matches($d.Text, '\{\{需你填写:([^}]+)\}\}')) {
        if (Test-InComment $d.Comments $m.Index) { $hidden++; continue }
        $live += [pscustomobject]@{
            File  = $name
            Line  = (Get-LineNo $d.Text $m.Index)
            Field = $m.Groups[1].Value
        }
    }
}
if ($live.Count -gt 0) {
    Write-Bad "还有 $($live.Count) 处没填："
    $live | Group-Object Field | Sort-Object Name | ForEach-Object {
        $loc = ($_.Group | ForEach-Object { "$($_.File):$($_.Line)" }) -join ', '
        Write-Host ("        {0,-24} {1}" -f $_.Name, $loc)
    }
    Write-Info "填 myinfo.txt 然后跑 fill.ps1，这些会一次性替换掉。"
    $blocking++
} else {
    Write-Ok "没有残留占位符"
}
if ($hidden -gt 0) {
    Write-Info "另有 $hidden 处占位符在注释里（例如还没启用的 ORCID）—— 不会显示，不算问题。"
}

# ============================================================================
#  B. noindex 与填写状态是否一致
# ============================================================================
Write-Head "B. 搜索引擎收录开关"
$hasNoindex = $false
if ($docs.ContainsKey('index.html')) {
    $hasNoindex = $docs['index.html'].Text -match '(?i)<meta\s+name\s*=\s*["'']robots["'']\s+content\s*=\s*["''][^"'']*noindex'
}
if ($live.Count -gt 0 -and -not $hasNoindex) {
    Write-Bad "页面还没填完，但 noindex 已被移除 —— 半成品会被搜索引擎收录。"
    Write-Info '请在 <head> 里加回：<meta name="robots" content="noindex, nofollow">'
    $blocking++
} elseif ($live.Count -eq 0 -and $hasNoindex) {
    Write-Warn "内容已填完，但 noindex 还在 —— 导师搜你的名字会找不到这个页面。"
    Write-Info '确认无误后删掉 index.html 里那行 <meta name="robots" ...>，再跑一次本脚本。'
    $warning++
} elseif ($live.Count -eq 0) {
    Write-Ok "已填完且允许收录"
} else {
    Write-Ok "未填完，noindex 在位（正确）"
}
# cv.html 是 PDF 的排版源文件，应当始终保持 noindex
if ($docs.ContainsKey('cv.html') -and
    $docs['cv.html'].Text -notmatch '(?i)content\s*=\s*["''][^"'']*noindex') {
    Write-Warn "cv.html 的 noindex 被删了。它是 cv.pdf 的排版源文件，不该被单独收录。"
    $warning++
}

# ============================================================================
#  C. 外部资源
# ============================================================================
Write-Head "C. 外部依赖（必须为零）"
$ext = @(); $extInComment = @()
foreach ($name in ($docs.Keys | Sort-Object)) {
    $d = $docs[$name]
    foreach ($m in [regex]::Matches($d.Text, '(?i)<(script|img|iframe|video|audio|source|embed|object|link)\b[^>]*>')) {
        $tag = $m.Value
        # 正文里指向外部的超链接是正常的，只有会真正发起网络请求的才算依赖。
        # <link> 要看 rel：canonical / me / alternate 不加载任何东西，
        # 只有 stylesheet / preload / prefetch / preconnect / manifest / icon 才会。
        if ($tag -match '(?i)^<link\b' -and
            $tag -notmatch '(?i)rel\s*=\s*["''][^"'']*\b(stylesheet|preload|prefetch|preconnect|dns-prefetch|manifest|icon)\b') {
            continue
        }
        foreach ($u in [regex]::Matches($tag, '(?i)(?:src|href)\s*=\s*["''](https?://[^"'']+)["'']')) {
            $rec = [pscustomobject]@{
                File = $name; Line = (Get-LineNo $d.Text $m.Index); Url = $u.Groups[1].Value
            }
            if (Test-InComment $d.Comments $m.Index) { $extInComment += $rec } else { $ext += $rec }
        }
    }
}
if ($ext.Count -gt 0) {
    Write-Bad "发现 $($ext.Count) 处外部资源加载（中国大陆访问会白屏或卡住）："
    $ext | ForEach-Object { Write-Host ("        {0}:{1}  {2}" -f $_.File, $_.Line, $_.Url) }
    $blocking++
} else {
    Write-Ok "零外部依赖"
}
if ($extInComment.Count -gt 0) {
    Write-Warn "注释里还躺着 $($extInComment.Count) 处外部资源，取消注释前记得先处理："
    $extInComment | ForEach-Object { Write-Host ("        {0}:{1}  {2}" -f $_.File, $_.Line, $_.Url) }
    $warning++
}

# ============================================================================
#  D. 虚构内容残留
# ============================================================================
Write-Head "D. 虚构内容残留"
# 这些是本仓库初版占位样例、以及各处文档示例里出现过的内容，一旦出现在页面上即为误操作
$forbidden = @(
    '张三', 'San Zhang', '某某医院', '某某大学',
    'npj Digital Medicine', 'IEEE Journal of Biomedical',
    'MICCAI', '中华眼底病杂志',
    'zhangsan@example', '0000-0000-0000-0000', 'XXXXXXX',
    # myinfo.txt 里给的 ORCID 示例。它是一个真实存在的演示账号，
    # 照抄上去等于把别人的持久标识符写成自己的。
    '0000-0002-1825-0097'
)
$hits = @()
foreach ($name in ($docs.Keys | Sort-Object)) {
    $d = $docs[$name]
    foreach ($f in $forbidden) {
        $from = 0
        while ($true) {
            $i = $d.Text.IndexOf($f, $from)
            if ($i -lt 0) { break }
            $hits += [pscustomobject]@{ File = $name; Line = (Get-LineNo $d.Text $i); Text = $f }
            $from = $i + $f.Length
        }
    }
}
if ($hits.Count -gt 0) {
    Write-Bad "发现虚构 / 示例内容出现在页面里："
    $hits | ForEach-Object { Write-Host ("        {0}:{1}  「{2}」" -f $_.File, $_.Line, $_.Text) }
    $blocking++
} else {
    Write-Ok "无虚构内容残留"
}

# ============================================================================
#  E. 页内锚点
# ============================================================================
Write-Head "E. 页内导航与版块"
$deadTotal = 0
foreach ($name in ($docs.Keys | Sort-Object)) {
    $d = $docs[$name]

    # 只认没被注释掉的 id 和链接 —— 注释里的版块不会渲染，指过去就是死锚点
    $ids = @{}
    foreach ($m in [regex]::Matches($d.Text, '(?i)\sid\s*=\s*["'']([^"'']+)["'']')) {
        if (-not (Test-InComment $d.Comments $m.Index)) { $ids[$m.Groups[1].Value] = $true }
    }
    $dead = @()
    foreach ($m in [regex]::Matches($d.Text, '(?i)href\s*=\s*["'']#([^"'']+)["'']')) {
        if (Test-InComment $d.Comments $m.Index) { continue }
        $anchor = $m.Groups[1].Value
        if (-not $ids.ContainsKey($anchor)) {
            $dead += "{0}:{1}  #{2}" -f $name, (Get-LineNo $d.Text $m.Index), $anchor
        }
    }
    if ($dead.Count -gt 0) {
        Write-Bad "$name 里有指向不存在版块的链接（点了没反应）："
        $dead | ForEach-Object { Write-Host "        $_" }
        Write-Info "多半是启用了某个版块却忘了改导航，或者反过来。"
        $deadTotal += $dead.Count
        $blocking++
    }

    # 反向：有版块没进导航
    if ($name -eq 'index.html') {
        $navM = [regex]::Match($d.Text, '(?s)<nav class="site-nav".*?</nav>')
        if ($navM.Success) {
            $navIds = @{}
            foreach ($m in [regex]::Matches($navM.Value, '(?i)href\s*=\s*["'']#([^"'']+)["'']')) {
                # 注释掉的导航条目不会渲染，不能算数 —— 位置要换算回全文再判断
                if (Test-InComment $d.Comments ($navM.Index + $m.Index)) { continue }
                $navIds[$m.Groups[1].Value] = $true
            }
            $orphan = @()
            foreach ($m in [regex]::Matches($d.Text, '(?i)<section\s+id\s*=\s*["'']([^"'']+)["'']')) {
                if (Test-InComment $d.Comments $m.Index) { continue }
                $sid = $m.Groups[1].Value
                if (-not $navIds.ContainsKey($sid)) { $orphan += $sid }
            }
            if ($orphan.Count -gt 0) {
                Write-Warn "这些版块存在于页面上，但页内导航里没有对应条目：$($orphan -join '、')"
                Write-Info '在 .site-nav 的 <ul> 里补一条 <li><a href="#版块id">名称</a></li>。'
                $warning++
            }
        }
    }
}
if ($deadTotal -eq 0) { Write-Ok "导航锚点全部有效" }

# ============================================================================
#  F. 本地引用的文件是否存在
# ============================================================================
Write-Head "F. 引用的本地文件"
$missingRefs = @()
$refCount = 0
foreach ($name in ($docs.Keys | Sort-Object)) {
    $d = $docs[$name]

    # 相对路径引用
    foreach ($m in [regex]::Matches($d.Text, '(?i)(?:href|src)\s*=\s*["'']([^"'']+)["'']')) {
        if (Test-InComment $d.Comments $m.Index) { continue }
        $u = $m.Groups[1].Value
        if ($u -match '^(?i)(https?:|mailto:|tel:|data:|javascript:|//|#)') { continue }
        $rel = ($u -split '[?#]')[0]
        if (-not $rel) { continue }
        $refCount++
        if (-not (Test-Path (Join-Path $root $rel))) {
            $missingRefs += "{0}:{1}  {2}" -f $name, (Get-LineNo $d.Text $m.Index), $u
        }
    }

    # og:image 写的是绝对地址，但文件就在本仓库里，要对得上
    foreach ($m in [regex]::Matches($d.Text, '(?i)<meta\s+property\s*=\s*["'']og:image["'']\s+content\s*=\s*["'']([^"'']+)["'']')) {
        if (Test-InComment $d.Comments $m.Index) { continue }
        $u = $m.Groups[1].Value
        if ($u.StartsWith($SITE)) {
            $rel = $u.Substring($SITE.Length)
            $refCount++
            if (-not (Test-Path (Join-Path $root $rel))) {
                $missingRefs += "{0}:{1}  og:image -> {2}" -f $name, (Get-LineNo $d.Text $m.Index), $u
            }
        } else {
            Write-Warn "$name 的 og:image 不在本站域名下：$u"
            $warning++
        }
    }
}
if ($missingRefs.Count -gt 0) {
    Write-Bad "页面引用了仓库里不存在的文件（线上会是 404）："
    $missingRefs | ForEach-Object { Write-Host "        $_" }
    $blocking++
} else {
    Write-Ok "$refCount 处本地引用全部存在"
}
# cv.pdf 的两个方向
$cvPdf  = Test-Path (Join-Path $root 'cv.pdf')
$cvLink = $false
if ($docs.ContainsKey('index.html')) {
    $d = $docs['index.html']
    foreach ($m in [regex]::Matches($d.Text, '(?i)href\s*=\s*["'']cv\.pdf["'']')) {
        if (-not (Test-InComment $d.Comments $m.Index)) { $cvLink = $true }
    }
}
if ($cvPdf -and -not $cvLink) {
    Write-Warn "cv.pdf 已经做好了，但首页上还没放出链接（那行还注释着）。"
    Write-Info '取消 index.html 里 <li><a href="cv.pdf">…</a></li> 那行的注释。'
    $warning++
} elseif (-not $cvPdf -and -not $cvLink) {
    Write-Warn "还没有 cv.pdf。招生委员会几乎一定会找可下载的 CV —— 这是性价比最高的一项。"
    Write-Info '填完后打开 cv.html → Ctrl+P → 另存为 PDF → 存成 cv.pdf。'
    $warning++
} elseif ($cvPdf -and $cvLink) {
    Write-Ok "cv.pdf 存在且已在首页放出链接"
}

# ============================================================================
#  G. 两份文件的关键信息是否一致
# ============================================================================
Write-Head "G. 首页与 CV 的一致性"
if ($live.Count -gt 0) {
    Write-Info "还没填完，这一项等填完再查。"
} elseif (-not $docs.ContainsKey('cv.html')) {
    Write-Info "没有 cv.html，跳过。"
} else {
    function Get-Name {
        param([string] $t)
        $m = [regex]::Match($t, '(?s)<h1>(.*?)</h1>')
        if (-not $m.Success) { return '' }
        $s = [regex]::Replace($m.Groups[1].Value, '(?s)<span[^>]*class="en".*?</span>', '')
        return ([regex]::Replace($s, '(?s)<[^>]+>', '')).Trim()
    }
    function Get-Mail {
        param([string] $t)
        $m = [regex]::Match($t, '(?i)mailto:([^"''>\s]+)')
        if ($m.Success) { return $m.Groups[1].Value } else { return '' }
    }
    $n1 = Get-Name $docs['index.html'].Text ; $n2 = Get-Name $docs['cv.html'].Text
    $e1 = Get-Mail $docs['index.html'].Text ; $e2 = Get-Mail $docs['cv.html'].Text
    $ok = $true
    if ($n1 -ne $n2) { Write-Bad "姓名不一致：index.html「$n1」 vs cv.html「$n2」"; $ok = $false }
    if ($e1 -ne $e2) { Write-Bad "邮箱不一致：index.html「$e1」 vs cv.html「$e2」"; $ok = $false }
    if (-not $ok) {
        Write-Info "填完之后这两个文件各自独立，改了一个要记得改另一个。"
        $blocking++
    } else {
        Write-Ok "姓名与邮箱一致（$n1 / $e1）"
    }
}

# ============================================================================
#  结论
# ============================================================================
Write-Host ""
Write-Host ("=" * 64)
if ($blocking -gt 0) {
    Write-Host "结论：请勿推送。有 $blocking 类阻断项待处理。" -ForegroundColor Red
    Write-Host ("=" * 64)
    exit 1
} elseif ($warning -gt 0) {
    Write-Host "结论：可以推送，但有 $warning 条提醒（见上）。" -ForegroundColor Yellow
    Write-Host ("=" * 64)
    exit 0
} else {
    Write-Host "结论：全部通过，可以推送。" -ForegroundColor Green
    Write-Host ("=" * 64)
    exit 0
}
