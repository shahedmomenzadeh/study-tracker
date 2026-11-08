Add-Type -AssemblyName System.Drawing

$size = 256
$bmp = New-Object System.Drawing.Bitmap $size, $size
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

# Transparent background
$g.Clear([System.Drawing.Color]::Transparent)

# Outer rounded rectangle (Bento Box in Terracotta Orange)
$rect = New-Object System.Drawing.Rectangle 16, 16, 224, 224
$path = New-Object System.Drawing.Drawing2D.GraphicsPath
$radius = 48
$d = $radius * 2

$path.AddArc($rect.X, $rect.Y, $d, $d, 180, 90)
$path.AddArc($rect.Right - $d, $rect.Y, $d, $d, 270, 90)
$path.AddArc($rect.Right - $d, $rect.Bottom - $d, $d, $d, 0, 90)
$path.AddArc($rect.X, $rect.Bottom - $d, $d, $d, 90, 90)
$path.CloseFigure()

# Gradient brush (Orange to Coral)
$brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    (New-Object System.Drawing.Point 0, 0),
    (New-Object System.Drawing.Point $size, $size),
    [System.Drawing.Color]::FromArgb(255, 255, 107, 53),
    [System.Drawing.Color]::FromArgb(255, 255, 149, 102)
)
$g.FillPath($brush, $path)

# Subtle shadow inner border
$penBorder = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(120, 255, 255, 255), 4)
$g.DrawPath($penBorder, $path)

# White compartments / Bento Grid inside
$penGrid = New-Object System.Drawing.Pen([System.Drawing.Color]::White, 10)
$penGrid.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$penGrid.EndCap = [System.Drawing.Drawing2D.LineCap]::Round

# Center Clock / Timer Circle
$whiteBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
$clockPen = New-Object System.Drawing.Pen([System.Drawing.Color]::White, 12)
$clockPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$clockPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round

# Draw clock circle
$g.DrawEllipse($clockPen, 68, 68, 120, 120)

# Clock hands (Pomodoro 25 min mark)
$handPen = New-Object System.Drawing.Pen([System.Drawing.Color]::White, 10)
$handPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$handPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round

# Center point
$cx = 128
$cy = 128
# Hour hand pointing to 12
$g.DrawLine($handPen, $cx, $cy, $cx, 88)
# Minute hand pointing to 5 (approx 25 min)
$g.DrawLine($handPen, $cx, $cy, 160, 150)

# Center dot
$g.FillEllipse($whiteBrush, 122, 122, 12, 12)

# Save PNG
$assetsDir = "d:\study-tracker\assets"
if (!(Test-Path $assetsDir)) { New-Item -ItemType Directory -Path $assetsDir -Force }
$pngPath = "$assetsDir\icon.png"
$bmp.Save($pngPath, [System.Drawing.Imaging.ImageFormat]::Png)

# Convert to ICO
$iconH = $bmp.GetHicon()
$icon = [System.Drawing.Icon]::FromHandle($iconH)
$fs = New-Object System.IO.FileStream "$assetsDir\icon.ico", ([System.IO.FileMode]::Create)
$icon.Save($fs)
$fs.Close()

$g.Dispose()
$bmp.Dispose()
"Icon created successfully at $assetsDir\icon.ico"

