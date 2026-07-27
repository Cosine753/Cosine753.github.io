<#
    生成社交卡片图 og.png（1731×909，1.91:1）
    —— 导师把主页链接贴进邮件或微信时，显示的就是这张图。

    用法：
      powershell -ExecutionPolicy Bypass -File tools\make-og.ps1
      powershell -ExecutionPolicy Bypass -File tools\make-og.ps1 -Name "张三" -NameEn "Zhang San"

    不传 -Name 时会自己去 index.html 的 <h1> 里读。读到的还是占位符（说明没填），
    就退回到「无姓名版」——那一版同样是有效的卡片图，不会让 og:image 挂 404。
    fill.ps1 填完占位符后会自动再调一次本脚本，把姓名补上。

    只用 .NET 自带的 System.Drawing，无第三方依赖。
#>

[CmdletBinding()]
param(
    [string] $Name    = '',
    [string] $NameEn  = '',
    [string] $Out     = ''
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = Split-Path -Parent $here
if (-not $Out) { $Out = Join-Path $root 'og.png' }

# ---------- 没给姓名就从 index.html 里读 ----------
if (-not $Name) {
    $index = Join-Path $root 'index.html'
    if (Test-Path $index) {
        $raw = Get-Content $index -Raw -Encoding UTF8
        $h1  = [regex]::Match($raw, '(?s)<h1>(.*?)</h1>')
        if ($h1.Success) {
            $inner = $h1.Groups[1].Value
            $enM   = [regex]::Match($inner, '(?s)<span[^>]*class="en"[^>]*>(.*?)</span>')
            if ($enM.Success -and -not $NameEn) {
                $NameEn = [regex]::Replace($enM.Groups[1].Value, '(?s)<[^>]+>', '').Trim()
            }
            $stripped = [regex]::Replace($inner, '(?s)<span[^>]*class="en".*?</span>', '')
            $Name     = [regex]::Replace($stripped, '(?s)<[^>]+>', '').Trim()
        }
    }
}
# 读回来的要是还带着占位符，就当作「没填」
if ($Name   -like '*需你填写*') { $Name   = '' }
if ($NameEn -like '*需你填写*') { $NameEn = '' }

# ---------- 字体：挑一个系统里真的装了的 ----------
function Get-Family {
    param([string[]] $Candidates)
    $installed = (New-Object System.Drawing.Text.InstalledFontCollection).Families
    foreach ($c in $Candidates) {
        $hit = $installed | Where-Object { $_.Name -eq $c } | Select-Object -First 1
        if ($hit) { return $hit.Name }
    }
    return [System.Drawing.FontFamily]::GenericSansSerif.Name
}
$famCJK = Get-Family @('Microsoft YaHei', '微软雅黑', 'Microsoft YaHei UI',
                       'Noto Sans CJK SC', 'Source Han Sans SC', 'SimHei')
$famLat = Get-Family @('Segoe UI', 'Helvetica Neue', 'Arial')

function New-Fnt {
    param([string] $Family, [double] $Px, [string] $Style = 'Regular')
    New-Object System.Drawing.Font(
        $Family, [single]$Px,
        [System.Drawing.FontStyle]::$Style,
        [System.Drawing.GraphicsUnit]::Pixel)
}

$W = 1200; $H = 630; $M = 88   # 逻辑画布与左右留白
$bitmapW = 1731; $bitmapH = 909 # 高分辨率输出，保持 1.91:1

$bmp = New-Object System.Drawing.Bitmap $bitmapW, $bitmapH
$g   = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode     = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
# 用 AntiAliasGridFit 而不是 ClearType：ClearType 是 RGB 次像素渲染，
# 图片被平台缩放后字边会出现彩色毛边。
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic

$disposables = @()
function Track { param($o) ; $script:disposables += $o ; return $o }

try {
    # ---------- 背景：深青，右下角稍亮一点，避免整块死板 ----------
    $bgTop = [System.Drawing.Color]::FromArgb(255, 12, 74, 79)
    $bgBot = [System.Drawing.Color]::FromArgb(255, 17, 100, 106)
    $rect  = New-Object System.Drawing.Rectangle 0, 0, $bitmapW, $bitmapH
    $grad  = Track (New-Object System.Drawing.Drawing2D.LinearGradientBrush(
                    $rect, $bgTop, $bgBot,
                    [System.Drawing.Drawing2D.LinearGradientMode]::ForwardDiagonal))
    $g.FillRectangle($grad, $rect)
    # 后续仍按 1200×630 的逻辑坐标绘制，输出时整体高质量放大。
    $g.ScaleTransform([single]($bitmapW / $W), [single]($bitmapH / $H))

    $white = { param($a) [System.Drawing.Color]::FromArgb($a, 255, 255, 255) }

    # ---------- 左上角的眼睛标记（与 favicon 同一形状） ----------
    $eyeCx = $M + 32; $eyeCy = 104
    $penEye = Track (New-Object System.Drawing.Pen((& $white 235), [single]5))
    $g.DrawEllipse($penEye, [single]($eyeCx - 32), [single]($eyeCy - 32), [single]64, [single]64)
    $brEye = Track (New-Object System.Drawing.SolidBrush((& $white 235)))
    $g.FillEllipse($brEye, [single]($eyeCx - 11), [single]($eyeCy - 11), [single]22, [single]22)

    # ---------- 文案：有没有姓名走两套排版 ----------
    $brHero = Track (New-Object System.Drawing.SolidBrush((& $white 255)))
    $brSub  = Track (New-Object System.Drawing.SolidBrush((& $white 205)))
    $brDim  = Track (New-Object System.Drawing.SolidBrush((& $white 150)))

    $fmt = Track (New-Object System.Drawing.StringFormat)
    $fmt.FormatFlags = [System.Drawing.StringFormatFlags]::NoWrap
    $fmt.Trimming    = [System.Drawing.StringTrimming]::None

    if ($Name) {
        $fHero = Track (New-Fnt $famCJK 92 'Bold')
        $g.DrawString($Name, $fHero, $brHero, [single]$M, [single]196, $fmt)

        if ($NameEn) {
            $wName = $g.MeasureString($Name, $fHero, [System.Drawing.PointF]::Empty, $fmt).Width
            $fEn   = Track (New-Fnt $famLat 34 'Regular')
            # 和中文姓名的基线大致对齐，右侧空一格
            $g.DrawString($NameEn, $fEn, $brSub,
                          [single]($M + $wName + 18), [single]252, $fmt)
        }
        $ruleY   = 330
        $line1   = '眼科临床研究 · 临床证据可核验性'
        $line1Px = 40
        $line2   = '影像采集质量与记录规范 · 可复现性 · 公开数据集参考标准'
    }
    else {
        # 姓名还没填。这一版仍然是有效卡片图，只是把研究方向当主标题。
        $fHero = Track (New-Fnt $famCJK 72 'Bold')
        $g.DrawString('眼科临床研究', $fHero, $brHero, [single]$M, [single]206, $fmt)

        $ruleY   = 322
        $line1   = '临床证据的可核验性与可复现性'
        $line1Px = 38
        $line2   = '影像采集质量与记录规范 · 公开数据集参考标准可靠性'
    }

    # ---------- 分隔线 ----------
    $penRule = Track (New-Object System.Drawing.Pen((& $white 70), [single]1))
    $g.DrawLine($penRule, [single]$M, [single]$ruleY, [single]($W - $M), [single]$ruleY)

    # ---------- 两行说明 ----------
    $f1 = Track (New-Fnt $famCJK $line1Px 'Regular')
    $g.DrawString($line1, $f1, $brSub, [single]$M, [single]($ruleY + 34), $fmt)

    $f2 = Track (New-Fnt $famCJK 27 'Regular')
    $g.DrawString($line2, $f2, $brDim, [single]$M, [single]($ruleY + 100), $fmt)

    # ---------- 页脚网址 ----------
    $fUrl = Track (New-Fnt $famLat 28 'Regular')
    $g.DrawString('cosine753.github.io', $fUrl, $brDim, [single]$M, [single]($H - 92), $fmt)

    $g.Flush()
    $bmp.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)
}
finally {
    foreach ($d in $disposables) { if ($d) { $d.Dispose() } }
    $g.Dispose()
    $bmp.Dispose()
}

$size = [math]::Round((Get-Item $Out).Length / 1KB, 1)
$who  = if ($Name) { "含姓名「$Name」" } else { "无姓名版（index.html 里还是占位符）" }
Write-Host "已生成 $Out —— 1731x909，$size KB，$who" -ForegroundColor Green
if (-not $Name) {
    Write-Host "  填完占位符后 fill.ps1 会自动重新生成一版带姓名的。" -ForegroundColor DarkGray
}
