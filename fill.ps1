<#
    一键填写 —— 个人学术主页

    读 myinfo.txt，把 index.html 和 cv.html 里全部 {{需你填写:...}} 占位符替换掉，
    顺便处理三件手工容易漏的事：

      · 选填项留空时，把页面上对应的整块删掉（不留空标题、空行、悬空的说明注释）
      · ORCID 填了就自动取消注释启用，留空就把那两行整个删掉
      · 填完后重新生成带姓名的 og.png，并把 sitemap 的 lastmod、主页与 CV 的更新月份刷成今天

    用法：
      powershell -ExecutionPolicy Bypass -File fill.ps1
      powershell -ExecutionPolicy Bypass -File fill.ps1 -Yes        # 跳过确认
      powershell -ExecutionPolicy Bypass -File fill.ps1 -Yes -GoLive # 并解除 noindex

    动手前每个被改的文件都会存一份 .bak；需要回退时请恢复对应的单个 .bak。

    退出码：0 = 成功；1 = 有问题，什么都没改
#>

[CmdletBinding()]
param(
    [switch] $Yes,      # 跳过交互确认
    [switch] $GoLive    # 填完后顺手删掉 index.html 的 noindex，允许搜索引擎收录
)

$ErrorActionPreference = 'Stop'
$root = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }

function Say     ($t) { Write-Host $t }
function SayHead ($t) { Write-Host ""; Write-Host $t -ForegroundColor Cyan; Write-Host ("-" * 64) }
function SayOk   ($t) { Write-Host "  [好] $t"   -ForegroundColor Green }
function SayWarn ($t) { Write-Host "  [提醒] $t" -ForegroundColor Yellow }
function SayBad  ($t) { Write-Host "  [错] $t"   -ForegroundColor Red }

# ============================================================================
#  工具函数
# ============================================================================

# 用 .Replace()（纯字符串替换）而不是 -replace（正则），避免值里出现
# $ 或反斜杠时被当成正则替换语法吃掉。
function HtmlEsc {
    param([string] $s)
    $s.Replace('&', '&amp;').Replace('<', '&lt;').Replace('>', '&gt;').Replace('"', '&quot;')
}
function JsonEsc {
    param([string] $s)
    $s.Replace('\', '\\').Replace('"', '\"')
}

# 删掉包含 $Marker 的那个 <tag>…</tag> 块，连同它的前导空白和前面的换行，
# 避免留下一行空白。用字符串定位而不是正则跨块匹配，行为更好预测。
function RemoveBlock {
    param([string] $Text, [string] $Marker, [string] $OpenTag, [string] $CloseTag)
    while ($true) {
        $i = $Text.IndexOf($Marker)
        if ($i -lt 0) { break }
        $start = $Text.LastIndexOf($OpenTag, $i)
        $endAt = $Text.IndexOf($CloseTag, $i)
        if ($start -lt 0 -or $endAt -lt 0) { break }   # 结构不符预期，宁可不动
        $end = $endAt + $CloseTag.Length
        while ($start -gt 0 -and ($Text[$start - 1] -eq ' ' -or $Text[$start - 1] -eq "`t")) { $start-- }
        if ($start -gt 0 -and $Text[$start - 1] -eq "`n") {
            $start--
            if ($start -gt 0 -and $Text[$start - 1] -eq "`r") { $start-- }
        }
        $Text = $Text.Substring(0, $start) + $Text.Substring($end)
    }
    return $Text
}

# 删掉正文里包含某段文字的 HTML 注释（用来清掉已经失效的操作说明）
function RemoveComment {
    param([string] $Text, [string] $Needle)
    $ms = [regex]::Matches($Text, '(?s)<!--.*?-->')
    for ($k = $ms.Count - 1; $k -ge 0; $k--) {
        if ($ms[$k].Value.Contains($Needle)) {
            $s = $ms[$k].Index
            $e = $s + $ms[$k].Length
            while ($s -gt 0 -and ($Text[$s - 1] -eq ' ' -or $Text[$s - 1] -eq "`t")) { $s-- }
            if ($s -gt 0 -and $Text[$s - 1] -eq "`n") {
                $s--
                if ($s -gt 0 -and $Text[$s - 1] -eq "`r") { $s-- }
            }
            $Text = $Text.Substring(0, $s) + $Text.Substring($e)
        }
    }
    return $Text
}

function SubIn {
    param([string] $Text, [hashtable] $Vals, [string] $Mode)
    foreach ($k in $Vals.Keys) {
        $v = if ($Mode -eq 'json') { JsonEsc $Vals[$k] } else { HtmlEsc $Vals[$k] }
        $Text = $Text.Replace("{{需你填写:$k}}", $v)
    }
    return $Text
}

# JSON-LD 块里是 JSON 字符串，转义规则和 HTML 不一样：
# 那里要的是 \" 而不是 &quot;，写错的话结构化数据整块失效。
function FillText {
    param([string] $Text, [hashtable] $Vals)
    $m = [regex]::Match($Text, '(?s)<script type="application/ld\+json">.*?</script>')
    if (-not $m.Success) { return SubIn $Text $Vals 'html' }
    $before = $Text.Substring(0, $m.Index)
    $after  = $Text.Substring($m.Index + $m.Length)
    return (SubIn $before $Vals 'html') + (SubIn $m.Value $Vals 'json') + (SubIn $after $Vals 'html')
}

function ReadUtf8 { param([string] $p) [System.IO.File]::ReadAllText($p, [System.Text.Encoding]::UTF8) }

# 注释定位。判断某个占位符会不会真的显示出来，全靠这两个函数。
function GetCommentRanges {
    param([string] $Text)
    $r = @()
    foreach ($c in [regex]::Matches($Text, '(?s)<!--.*?-->')) { $r += ,@($c.Index, ($c.Index + $c.Length)) }
    return ,$r
}
function InComment {
    param($Ranges, [int] $Pos)
    foreach ($r in $Ranges) { if ($Pos -ge $r[0] -and $Pos -lt $r[1]) { return $true } }
    return $false
}
function WriteUtf8 {
    param([string] $p, [string] $s)
    # HTML/XML 不写 BOM：charset 已在文件里声明，BOM 只会给某些工具添乱。
    [System.IO.File]::WriteAllText($p, $s, (New-Object System.Text.UTF8Encoding($false)))
}

# ORCID 校验位：ISO 7064 MOD 11-2
function TestOrcid {
    param([string] $o)
    if ($o -notmatch '^\d{4}-\d{4}-\d{4}-\d{3}[\dXx]$') { return $false }
    $d = $o.Replace('-', '').ToUpper()
    $total = 0
    for ($i = 0; $i -lt 15; $i++) { $total = ($total + [int]::Parse($d[$i])) * 2 }
    $expect = (12 - ($total % 11)) % 11
    $expectCh = if ($expect -eq 10) { 'X' } else { "$expect" }
    return ($d[15] -eq $expectCh[0])
}

# ============================================================================
#  1. 读 myinfo.txt
# ============================================================================
SayHead "1. 读取 myinfo.txt"

$cfgPath = Join-Path $root 'myinfo.txt'
if (-not (Test-Path $cfgPath)) {
    SayBad "找不到 myinfo.txt。它应该和 fill.ps1 在同一个目录。"
    exit 1
}

$cfgText = ReadUtf8 $cfgPath
# 存成 GBK/ANSI 再按 UTF-8 读会出现 U+FFFD。这是 Windows 记事本最常见的坑，
# 不拦住的话中文会以乱码写进网页。
if ($cfgText.Contains([char]0xFFFD)) {
    SayBad "myinfo.txt 不是 UTF-8 编码（中文已经乱码了）。"
    Say    "        用记事本打开它，另存为时把「编码」选成 UTF-8，再跑一次。"
    exit 1
}

$vals = @{}
$lineNo = 0
foreach ($line in ($cfgText -split "`r?`n")) {
    $lineNo++
    $t = $line.Trim()
    if ($t -eq '' -or $t.StartsWith('#')) { continue }
    $eq = $t.IndexOf('=')
    if ($eq -lt 1) {
        SayWarn "第 $lineNo 行没有等号，已跳过：$t"
        continue
    }
    $key = $t.Substring(0, $eq).Trim()
    $val = $t.Substring($eq + 1).Trim()
    $vals[$key] = $val
}
SayOk "读到 $($vals.Count) 个字段"

# ============================================================================
#  2. 与页面里实际存在的占位符对账
# ============================================================================
SayHead "2. 字段与占位符对账"

$pages = Get-ChildItem -Path $root -Filter *.html -Recurse |
         Where-Object { $_.FullName -notmatch '\\\.git\\' }

# 注释里的占位符要区别对待：
#   · ORCID 躺在注释里，但由本脚本负责启用或删除 —— 算数
#   · 其余的（论文、科研项目那两个还没启用的版块模板）不会显示，
#     条目数量也不固定，不该逼着你在 myinfo.txt 里给值 —— 跳过
$found  = @{}   # 页面上真的会显示出来的
$hidden = @{}   # 只存在于注释里的
foreach ($p in $pages) {
    $t = ReadUtf8 $p.FullName
    $ranges = GetCommentRanges $t
    foreach ($m in [regex]::Matches($t, '\{\{需你填写:([^}]+)\}\}')) {
        $bucket = if (InComment $ranges $m.Index) { $hidden } else { $found }
        $f = $m.Groups[1].Value
        if (-not $bucket.ContainsKey($f)) { $bucket[$f] = 0 }
        $bucket[$f]++
    }
}
if ($hidden.ContainsKey('ORCID') -and -not $found.ContainsKey('ORCID')) {
    $found['ORCID'] = $hidden['ORCID']
    $hidden.Remove('ORCID')
}
$tmpl = @($hidden.Keys | Sort-Object)

if ($found.Count -eq 0) {
    if ($GoLive) {
        $indexPath = Join-Path $root 'index.html'
        $original = ReadUtf8 $indexPath
        $updated = RemoveComment $original '避免半成品被搜索引擎收录'
        $updated = [regex]::Replace(
            $updated,
            '(?im)^[ \t]*<meta\s+name="robots"\s+content="noindex[^"]*">[ \t]*\r?\n',
            ''
        )
        if ($updated -ceq $original) {
            SayOk "index.html 已经允许搜索引擎收录，不需要重复修改。"
        } else {
            Copy-Item $indexPath "$indexPath.golive.bak" -Force
            WriteUtf8 $indexPath $updated
            SayOk "已解除 index.html 的 noindex（备份：index.html.golive.bak）"

            $sm = Join-Path $root 'sitemap.xml'
            if (Test-Path $sm) {
                Copy-Item $sm "$sm.golive.bak" -Force
                $sitemap = ReadUtf8 $sm
                $sitemap = [regex]::Replace(
                    $sitemap,
                    '(<lastmod>)[^<]*(</lastmod>)',
                    "`${1}$(Get-Date -Format 'yyyy-MM-dd')`${2}"
                )
                WriteUtf8 $sm $sitemap
                SayOk "sitemap.xml 的 lastmod 已更新为今天"
            }
        }
        Say "        请再运行 check.ps1；通过后再提交和发布。"
        exit 0
    }
    SayWarn "页面里已经没有要填的占位符了 —— 看起来你之前跑过一次 fill.ps1。"
    Say    "        想重填的话，请先查看差异，再从对应 .bak 恢复需要重填的单个文件。"
    Say    "        若只是准备上线，可运行 fill.ps1 -GoLive 解除 noindex。"
    exit 0
}

$missing = @($found.Keys | Where-Object { -not $vals.ContainsKey($_) })
$extra   = @($vals.Keys  | Where-Object { -not $found.ContainsKey($_) })
if ($missing.Count -gt 0) {
    SayBad "myinfo.txt 里缺这些字段（页面上有占位符，配置里没有对应项）："
    $missing | Sort-Object | ForEach-Object { Say "        $_" }
    exit 1
}
foreach ($e in ($extra | Sort-Object)) {
    if ($hidden.ContainsKey($e)) {
        SayWarn "myinfo.txt 里的「$e」属于还没启用的版块，本次不填"
    } else {
        SayWarn "myinfo.txt 里的「$e」在页面上没有对应占位符，将被忽略"
    }
}
SayOk "$($found.Count) 个字段全部对得上，共 $(($found.Values | Measure-Object -Sum).Sum) 处待替换"
if ($tmpl.Count -gt 0) {
    Say "        另有 $($tmpl.Count) 个字段属于还没启用的版块模板（论文 / 科研项目），跳过："
    Say "        $($tmpl -join '、')"
}

# ============================================================================
#  3. 校验
# ============================================================================
SayHead "3. 校验填写内容"

$required = @('姓名', '姓名英文拼写', '现单位与院系', '当前身份', '邮箱',
              '学位一学校院系与专业学位', '学位一起止年份与补充说明')
$bad = 0

foreach ($r in $required) {
    if (-not $vals[$r]) { SayBad "「$r」是必填的，现在是空的"; $bad++ }
}

if ($vals['邮箱']) {
    if ($vals['邮箱'] -notmatch '^[^@\s]+@[^@\s]+\.[^@\s]+$') {
        SayBad "邮箱格式不对：$($vals['邮箱'])"; $bad++
    } elseif ($vals['邮箱'] -match '(?i)@(gmail|qq|163|126|outlook|hotmail|foxmail|sina)\.') {
        SayWarn "你填的是公共邮箱。有机构邮箱的话优先用机构邮箱 —— 页面上只有一个"
        Say    "        公共邮箱，读者会觉得你没有单位归属。"
    }
}

if ($vals['姓名英文拼写'] -match '[一-鿿]') {
    SayBad "「姓名英文拼写」里有汉字，这一项要填罗马化拼写（如 Zhang Wei）"; $bad++
}

if ($vals['ORCID']) {
    if (-not (TestOrcid $vals['ORCID'])) {
        SayBad "ORCID 校验位不对：$($vals['ORCID'])"
        Say    "        正确格式形如 0000-0002-1825-0097；请回 orcid.org 复制完整编号。"
        $bad++
    } else { SayOk "ORCID 校验通过" }
}

$dropDegree2 = -not $vals['学位二学校院系与专业学位']
$dropExp     = -not $vals['如有临床或工作经历请在此说明否则删除本段']
$dropOrcid   = -not $vals['ORCID']

if ($dropDegree2 -and $vals['学位二起止年份与补充说明']) {
    SayWarn "填了「学位二起止年份」但没填「学位二学校院系」，这一条会被整块删掉"
}

if ($bad -gt 0) { Write-Host ""; SayBad "有 $bad 处问题，文件没有改动。修好后再跑一次。"; exit 1 }
SayOk "校验通过"

# ============================================================================
#  4. 确认
# ============================================================================
SayHead "4. 即将写入"

foreach ($k in ($found.Keys | Sort-Object)) {
    $v = $vals[$k]
    $shown = if ($v) { $v } else { "（留空 → 页面上对应内容会被删掉）" }
    Say ("  {0,-24} {1}" -f $k, $shown)
}
Write-Host ""
if ($dropDegree2) { Say "  · 学位二整条会被删掉" }
if ($dropExp)     { Say "  · 临床/工作经历那一段会被删掉" }
if ($dropOrcid)   { Say "  · ORCID 那一行会被删掉" } else { Say "  · ORCID 会被启用（取消注释）" }
if ($GoLive)      { Write-Host "  · index.html 的 noindex 会被删掉 —— 页面将允许被搜索引擎收录" -ForegroundColor Yellow }

if (-not $Yes) {
    Write-Host ""
    $ans = Read-Host "确认无误？输入 y 继续，其他任意键取消"
    if ($ans -ne 'y' -and $ans -ne 'Y') { Say "已取消，没有改动任何文件。"; exit 0 }
}

# ============================================================================
#  5. 备份并写入
# ============================================================================
SayHead "5. 写入"

foreach ($p in $pages) {
    $orig = ReadUtf8 $p.FullName
    $text = $orig

    if ($dropDegree2) {
        $text = RemoveBlock $text '{{需你填写:学位二学校院系与专业学位}}' '<li>' '</li>'
        $text = RemoveComment $text '只有一个学位就删掉'
    }
    if ($dropExp) {
        $text = RemoveBlock $text '{{需你填写:如有临床或工作经历请在此说明否则删除本段}}' '<p' '</p>'
    }
    if ($dropOrcid) {
        # 结构化数据中的 ORCID 不是注释，留空时同时移除对应数组项。
        $text = $text.Replace(', "https://orcid.org/{{需你填写:ORCID}}"', '')
        $text = RemoveComment $text 'orcid.org'
        $text = RemoveComment $text '有 ORCID 后'
    } else {
        # 把那一行从注释里放出来
        $text = [regex]::Replace(
            $text,
            '(?s)<!--\s*(<li><a\b[^>]*href="https://orcid\.org/.*?</li>)\s*-->',
            '$1'
        )
        $text = RemoveComment $text '有 ORCID 后'
    }

    $text = FillText $text $vals

    if ($GoLive -and $p.Name -eq 'index.html') {
        $text = RemoveComment $text '避免半成品被搜索引擎收录'
        $text = [regex]::Replace($text, '(?im)^[ \t]*<meta\s+name="robots"\s+content="noindex[^"]*">[ \t]*\r?\n', '')
    }

    # CV 页脚的更新月份
    $text = [regex]::Replace($text, '(<span class="cv-date">)[^<]*(</span>)',
                             "`${1}$(Get-Date -Format 'yyyy-MM')`${2}")
    # 首页页脚的更新月份
    if ($p.Name -eq 'index.html') {
        $month = Get-Date -Format 'yyyy-MM'
        $text = [regex]::Replace(
            $text,
            '<time\s+class="site-updated"\s+datetime="[^"]*">[^<]*</time>',
            "<time class=`"site-updated`" datetime=`"$month`">$month</time>"
        )
    }

    # 没变化的文件（比如 404.html）不动，免得留下一堆没用的 .bak
    if ($text -ceq $orig) { Say "  [跳过] $($p.Name)：没有需要改的内容"; continue }

    Copy-Item $p.FullName "$($p.FullName).bak" -Force
    WriteUtf8 $p.FullName $text
    # 只数会显示出来的。注释里的模板占位符（论文 / 科研项目）是有意留着的，不算漏填。
    $rg = GetCommentRanges $text
    $left = 0
    foreach ($m in [regex]::Matches($text, '\{\{需你填写:')) {
        if (-not (InComment $rg $m.Index)) { $left++ }
    }
    if ($left -gt 0) { SayBad "$($p.Name)：还剩 $left 处没替换掉（这是脚本的 bug，请检查）" }
    else             { SayOk  "$($p.Name)（原文件已备份为 $($p.Name).bak）" }
}

# sitemap 的 lastmod
$sm = Join-Path $root 'sitemap.xml'
if (Test-Path $sm) {
    Copy-Item $sm "$sm.bak" -Force
    $t = ReadUtf8 $sm
    $t = [regex]::Replace($t, '(<lastmod>)[^<]*(</lastmod>)', "`${1}$(Get-Date -Format 'yyyy-MM-dd')`${2}")
    WriteUtf8 $sm $t
    SayOk "sitemap.xml 的 lastmod 已更新为今天"
}

# ============================================================================
#  6. 重新生成社交卡片图
# ============================================================================
SayHead "6. 重新生成 og.png"

$mk = Join-Path $root 'tools\make-og.ps1'
if (Test-Path $mk) {
    & powershell -ExecutionPolicy Bypass -File $mk -Name $vals['姓名'] -NameEn $vals['姓名英文拼写']
} else {
    SayWarn "找不到 tools\make-og.ps1，og.png 没有重新生成"
}

# ============================================================================
#  7. 下一步
# ============================================================================
Write-Host ""
Write-Host ("=" * 64)
Write-Host "填写完成。接下来：" -ForegroundColor Green
Write-Host ("=" * 64)
Say ""
Say "  1. 跑自检：   powershell -ExecutionPolicy Bypass -File check.ps1"
Say "  2. 本地看一眼：双击 index.html，再打开 cv.html 确认排版"
if (-not $GoLive) {
    Say "  3. 导出 CV：打开 cv.html → Ctrl+P → 另存为 PDF → 存成 cv.pdf"
    Say "  4. 回到 index.html 取消 CV 链接那行的注释"
    Say "  5. 确认无误后运行 fill.ps1 -GoLive，解除 noindex"
    Say "  6. 再跑一次 check.ps1；通过后 git add / commit / push"
} else {
    Say "  3. 导出 CV：打开 cv.html → Ctrl+P → 另存为 PDF → 存成 cv.pdf"
    Say "  4. 回到 index.html 取消 CV 链接那行的注释"
    Say "  5. git add . ; git commit -m `"填写个人信息`" ; git push"
}
Say ""
Say "  验证线上效果时记得带随机查询串，例如 https://cosine753.github.io/?v=123"
Say "  —— GitHub Pages 走 CDN，直接访问原地址很可能拿到旧缓存。"
Write-Host ""
exit 0
