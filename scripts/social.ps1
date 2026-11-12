# Draws the 1200x630 social/share image for the Pro listing. Called by make-sales-kit.mjs.
# ASCII-only on purpose: every visible text arrives as a parameter.
# Pass -Badge none to draw the brand without the PRO badge (used for the site's own share image).
param(
  [Parameter(Mandatory = $true)][string]$Out,
  [string]$Name = 'PoTerminie', [string]$Price = '29 PLN',
  [string]$Badge = 'PRO', [string]$L1 = '', [string]$L2 = '', [string]$Sub = '', [string]$Note = ''
)
Add-Type -AssemblyName System.Drawing
$W = 1200; $H = 630
$bmp = New-Object System.Drawing.Bitmap $W, $H
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
$ring = New-Object System.Drawing.Pen((Col 20 255 255 255), 64)
$g.DrawEllipse($ring, 860, -190, 520, 520)
$g.FillEllipse((Brush (Col 14 255 255 255)), 760, 420, 460, 460)

# logo + brand + badge
$M = 72; $sz = 64; $k = $sz / 32
$g.FillPath($white, (RoundRect $M $M $sz $sz 16))
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
$fBrand = Fnt 40 $true
$bx = $M + $sz + 18
$w = Draw $Name $fBrand $white $bx ($M + 6)
if ($Badge -and $Badge -ne 'none') {
  $fBadge = Fnt 24 $true
  $bw = (TextW $Badge $fBadge) + 28
  $g.FillPath($yellow, (RoundRect ($bx + $w + 16) ($M + 12) $bw 40 10))
  [void](Draw $Badge $fBadge $ink ($bx + $w + 16 + 14) ($M + 16))
}

# headline
$fH = Fnt 84 $true
[void](Draw $L1 $fH $white $M 190)
[void](Draw $L2 $fH $yellow $M 286)
$fSub = Fnt 34 $false
[void](Draw $Sub $fSub (Brush (Col 230 255 255 255)) $M 408)

# price pill
$fPrice = Fnt 46 $true
$pw = (TextW $Price $fPrice) + 44
$g.FillPath($white, (RoundRect $M 496 $pw 70 16))
[void](Draw $Price $fPrice (Brush $green) ($M + 22) 500)
$fNote = Fnt 28 $false
[void](Draw $Note $fNote (Brush (Col 217 255 255 255)) ($M + $pw + 22) 514)

$g.Dispose()
$bmp.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
