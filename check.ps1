<#
    发布前自检 —— 个人学术主页
    用法：  powershell -ExecutionPolicy Bypass -File check.ps1
    退出码：0 = 可以发布；1 = 存在阻断项，请勿推送

    检查四件事：
      A. 是否还有未填写的 {{需你填写:...}} 占位符
      B. noindex 开关是否与填写状态一致（没填完就必须挡住搜索引擎）
      C. 是否混入了外部资源（你在中国大陆，页面必须零外部依赖）
      D. 是否混入了本仓库历史上出现过的虚构内容
#>

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$blocking = 0
$warning  = 0

function Write-Head($t) { Write-Host ""; Write-Host $t -ForegroundColor Cyan; Write-Host ("-" * 60) }
function Write-Bad($t)  { Write-Host "  [阻断] $t" -ForegroundColor Red }
function Write-Warn($t) { Write-Host "  [提醒] $t" -ForegroundColor Yellow }
function Write-Ok($t)   { Write-Host "  [通过] $t" -ForegroundColor Green }

$pages = Get-ChildItem -Path $root -Filter *.html -Recurse |
         Where-Object { $_.FullName -notmatch '\\\.git\\' }

if (-not $pages) { Write-Host "没找到任何 .html 文件，检查一下路径。" -ForegroundColor Red; exit 1 }

# ---------- A. 未填写的占位符 ----------
Write-Head "A. 未填写的占位符"
$placeholders = @()
foreach ($p in $pages) {
    $n = 0
    foreach ($line in (Get-Content $p.FullName -Encoding UTF8)) {
        $n++
        foreach ($m in [regex]::Matches($line, '\{\{需你填写:([^}]+)\}\}')) {
            $placeholders += [pscustomobject]@{
                File  = $p.Name
                Line  = $n
                Field = $m.Groups[1].Value
            }
        }
    }
}
if ($placeholders.Count -gt 0) {
    Write-Bad "还有 $($placeholders.Count) 处没填："
    $placeholders | Group-Object Field | Sort-Object Name | ForEach-Object {
        $loc = ($_.Group | ForEach-Object { "$($_.File):$($_.Line)" }) -join ', '
        Write-Host ("        {0,-22} {1}" -f $_.Name, $loc)
    }
    $blocking++
} else {
    Write-Ok "没有残留占位符"
}

# ---------- B. noindex 与填写状态是否一致 ----------
Write-Head "B. 搜索引擎收录开关"
$index = Join-Path $root 'index.html'
$hasNoindex = $false
if (Test-Path $index) {
    $raw = Get-Content $index -Raw -Encoding UTF8
    $hasNoindex = $raw -match '(?i)<meta\s+name\s*=\s*["'']robots["'']\s+content\s*=\s*["''][^"'']*noindex'
}
if ($placeholders.Count -gt 0 -and -not $hasNoindex) {
    Write-Bad "页面还没填完，但 noindex 已被移除 —— 半成品会被搜索引擎收录。"
    Write-Host '        请在 <head> 里加回：<meta name="robots" content="noindex, nofollow">'
    $blocking++
} elseif ($placeholders.Count -eq 0 -and $hasNoindex) {
    Write-Warn "内容已填完，但 noindex 还在 —— 导师搜你的名字会找不到这个页面。"
    Write-Host '        确认无误后删掉 index.html 里那行 <meta name="robots" ...>，再跑一次本脚本。'
    $warning++
} elseif ($placeholders.Count -eq 0) {
    Write-Ok "已填完且允许收录"
} else {
    Write-Ok "未填完，noindex 在位（正确）"
}

# ---------- C. 外部资源 ----------
Write-Head "C. 外部依赖（必须为零）"
$externals = @()
foreach ($p in $pages) {
    $n = 0
    foreach ($line in (Get-Content $p.FullName -Encoding UTF8)) {
        $n++
        foreach ($m in [regex]::Matches($line, '(?i)(?:src|href)\s*=\s*["''](https?://[^"'']+)["'']')) {
            $url = $m.Groups[1].Value
            # 正文里指向外部的超链接是正常的，只有会真正发起网络请求的才算依赖。
            # <link> 要看 rel：canonical / me / alternate 不加载任何东西，
            # 只有 stylesheet / preload / prefetch / preconnect / manifest / icon 才会。
            $isLoader = $false
            if ($line -match '(?i)<(script|img|iframe|video|audio|source|embed|object)\b') {
                $isLoader = $true
            } elseif ($line -match '(?i)<link\b') {
                $isLoader = $line -match '(?i)rel\s*=\s*["''][^"'']*\b(stylesheet|preload|prefetch|preconnect|dns-prefetch|manifest|icon)\b'
            }
            if ($isLoader) {
                $externals += [pscustomobject]@{ File = $p.Name; Line = $n; Url = $url }
            }
        }
    }
}
if ($externals.Count -gt 0) {
    Write-Bad "发现 $($externals.Count) 处外部资源加载（中国大陆访问会白屏或卡住）："
    $externals | ForEach-Object { Write-Host ("        {0}:{1}  {2}" -f $_.File, $_.Line, $_.Url) }
    $blocking++
} else {
    Write-Ok "零外部依赖"
}

# ---------- D. 虚构内容残留 ----------
Write-Head "D. 虚构内容残留"
# 这些是本仓库初版占位样例里出现过的内容，一旦重新出现即为误操作
$forbidden = @(
    '张三', 'San Zhang', '某某医院', '某某大学',
    'npj Digital Medicine', 'IEEE Journal of Biomedical',
    'MICCAI', '中华眼底病杂志',
    'zhangsan@example', '0000-0000-0000-0000', 'XXXXXXX'
)
$hits = @()
foreach ($p in $pages) {
    $n = 0
    foreach ($line in (Get-Content $p.FullName -Encoding UTF8)) {
        $n++
        foreach ($f in $forbidden) {
            if ($line -like "*$f*") { $hits += [pscustomobject]@{ File = $p.Name; Line = $n; Text = $f } }
        }
    }
}
if ($hits.Count -gt 0) {
    Write-Bad "发现初版虚构/占位内容重新出现："
    $hits | ForEach-Object { Write-Host ("        {0}:{1}  「{2}」" -f $_.File, $_.Line, $_.Text) }
    $blocking++
} else {
    Write-Ok "无虚构内容残留"
}

# ---------- 结论 ----------
Write-Host ""
Write-Host ("=" * 60)
if ($blocking -gt 0) {
    Write-Host "结论：请勿推送。有 $blocking 类阻断项待处理。" -ForegroundColor Red
    Write-Host ("=" * 60)
    exit 1
} elseif ($warning -gt 0) {
    Write-Host "结论：可以推送，但有 $warning 条提醒（见上）。" -ForegroundColor Yellow
    Write-Host ("=" * 60)
    exit 0
} else {
    Write-Host "结论：全部通过，可以推送。" -ForegroundColor Green
    Write-Host ("=" * 60)
    exit 0
}
