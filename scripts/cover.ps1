# Draws the 1080x1080 product cover for the Pro listing. Called by make-sales-kit.mjs.
# ASCII-only on purpose: every visible text arrives as a parameter, so file encoding never matters.
param(
  [Parameter(Mandatory = $true)][string]$Out,
  [string]$Name = 'PoTerminie', [string]$Price = '29 PLN', [string]$HostName = '',
  [string]$L1 = '', [string]$L2a = '', [string]$L2b = '', [string]$L3 = '',
  [string]$Items = '', [string]$Sub = '', [string]$Badge = 'PRO'
)
Add-Type -AssemblyName System.Drawing
$S = 1080
$bmp = New-Object System.Drawing.Bitmap $S, $S
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAlias
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

function Col([int]$a, [int]$r, [int]$gr, [int]$b) { [System.Drawing.Color]::FromArgb($a, $r, $gr, $b) }
function Brush($c) { New-Object System.Drawing.SolidBrush $c }
function Fnt([single]$px, [bool]$bold) {
  $style = if ($bold) { [System.Drawing.FontStyle]::Bold } else { [System.Drawing.FontStyle]::Regular }
  New-Object System.Drawing.Font('Segoe UI', $px, $style, [System.Drawing.GraphicsUnit]::Pixel)
}
function RoundRect([single]$x, [single]$y, [single]$w, [single]$h, [single]$r) {
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = 2 * $r
  $p.AddArc($x, $y, $d, $d, 180, 90); $p.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
  $p.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90); $p.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
  $p.CloseFigure()
  , $p
}
$fmt = [System.Drawing.StringFormat]::GenericTypographic.Clone()
$fmt.FormatFlags = $fmt.FormatFlags -bor [System.Drawing.StringFormatFlags]::MeasureTrailingSpaces
function TextW([string]$t, $font) { $g.MeasureString($t, $font, 4000, $fmt).Width }
function Draw([string]$t, $font, $brush, [single]$x, [single]$y) { $g.DrawString($t, $font, $brush, $x, $y, $fmt); TextW $t $font }

$green = Col 255 10 107 77
$white = Brush (Col 255 255 255 255)
$yellow = Brush (Col 255 255 209 102)
$ink = Brush (Col 255 22 25 29)
$g.Clear($green)

# decoration
$ring = New-Object System.Drawing.Pen((Col 20 255 255 255), 70)
$g.DrawEllipse($ring, 690, -165, 560, 560)
$g.FillEllipse((Brush (Col 14 255 255 255)), 520, 830, 540, 540)

# logo
$M = 84
$g.FillPath($white, (RoundRect $M $M 76 76 19))
$k = 76 / 32
$cx = $M + 16 * $k; $cy = $M + 16 * $k; $rad = 9.2 * $k
$dial = New-Object System.Drawing.Pen((Col 140 10 107 77), (2 * $k))
$g.DrawEllipse($dial, ($cx - $rad), ($cy - $rad), (2 * $rad), (2 * $rad))
$hand = New-Object System.Drawing.Pen($green, (2.6 * $k))
$hand.StartCap = 'Round'; $hand.EndCap = 'Round'; $hand.LineJoin = 'Round'
$pts = [System.Drawing.PointF[]]@(
  (New-Object System.Drawing.PointF($cx, ($M + 9.5 * $k))),
  (New-Object System.Drawing.PointF($cx, $cy)),
  (New-Object System.Drawing.PointF(($M + 20.6 * $k), ($M + 18.7 * $k))))
$g.DrawLines($hand, $pts)

# brand + PRO badge
$fBrand = Fnt 46 $true
$bx = $M + 76 + 22
$w = Draw $Name $fBrand $white $bx ($M + 9)
$fBadge = Fnt 28 $true
$bw = (TextW $Badge $fBadge) + 34
$g.FillPath($yellow, (RoundRect ($bx + $w + 18) ($M + 15) $bw 46 12))
[void](Draw $Badge $fBadge $ink ($bx + $w + 18 + 17) ($M + 20))

# headline
$fH = Fnt 94 $true
$y = 262
[void](Draw $L1 $fH $white $M $y)
$y += 106
$w = Draw $L2a $fH $white $M $y
[void](Draw $L2b $fH $yellow ($M + $w) $y)
$y += 106
[void](Draw $L3 $fH $yellow $M $y)

# benefits
$fItem = Fnt 39 $false
$y = 652
$tick = New-Object System.Drawing.Pen((Col 255 255 255 255), 5)
$tick.StartCap = 'Round'; $tick.EndCap = 'Round'; $tick.LineJoin = 'Round'
foreach ($it in ($Items -split '\|')) {
  if (-not $it) { continue }
  $g.FillEllipse((Brush (Col 46 255 255 255)), $M, ($y + 6), 44, 44)
  $tp = [System.Drawing.PointF[]]@(
    (New-Object System.Drawing.PointF(($M + 12), ($y + 29))),
    (New-Object System.Drawing.PointF(($M + 19.5), ($y + 36))),
    (New-Object System.Drawing.PointF(($M + 32), ($y + 21))))
  $g.DrawLines($tick, $tp)
  [void](Draw $it $fItem $white ($M + 64) $y)
  $y += 66
}

# price + host
$fPrice = Fnt 84 $true
[void](Draw $Price $fPrice $white $M 866)
$fSub = Fnt 30 $false
[void](Draw $Sub $fSub (Brush (Col 217 255 255 255)) $M 966)
if ($HostName) {
  $fHost = Fnt 26 $false
  $hw = TextW $HostName $fHost
  [void](Draw $HostName $fHost (Brush (Col 204 255 255 255)) ($S - $M - $hw) 972)
}

$g.Dispose()
$bmp.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
