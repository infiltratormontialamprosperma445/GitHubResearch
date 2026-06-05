$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$rootDir = Split-Path -Parent $scriptDir
$buildDir = Join-Path $rootDir "build"
New-Item -ItemType Directory -Force -Path $buildDir | Out-Null

Add-Type -AssemblyName System.Drawing

function New-RoundedRectanglePath {
  param(
    [float]$X,
    [float]$Y,
    [float]$Width,
    [float]$Height,
    [float]$Radius
  )

  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $diameter = $Radius * 2
  $path.AddArc($X, $Y, $diameter, $diameter, 180, 90)
  $path.AddArc($X + $Width - $diameter, $Y, $diameter, $diameter, 270, 90)
  $path.AddArc($X + $Width - $diameter, $Y + $Height - $diameter, $diameter, $diameter, 0, 90)
  $path.AddArc($X, $Y + $Height - $diameter, $diameter, $diameter, 90, 90)
  $path.CloseFigure()
  return $path
}

$size = 256
$bitmap = New-Object System.Drawing.Bitmap $size, $size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
$graphics.Clear([System.Drawing.Color]::Transparent)

$background = [System.Drawing.ColorTranslator]::FromHtml("#141413")
$accent = [System.Drawing.ColorTranslator]::FromHtml("#c6613f")
$clay = [System.Drawing.ColorTranslator]::FromHtml("#d97757")
$ivory = [System.Drawing.ColorTranslator]::FromHtml("#faf9f5")

$shape = New-RoundedRectanglePath 10 10 236 236 44
$graphics.FillPath((New-Object System.Drawing.SolidBrush $background), $shape)

$curvePen = New-Object System.Drawing.Pen $accent, 18
$curvePen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$curvePen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
$graphics.DrawBezier($curvePen, 36, 182, 88, 180, 118, 153, 147, 116)
$graphics.DrawBezier($curvePen, 147, 116, 166, 92, 190, 82, 220, 79)

$graphics.FillEllipse((New-Object System.Drawing.SolidBrush $clay), 184, 50, 34, 34)

$fontFamily = New-Object System.Drawing.FontFamily "Segoe UI"
$font = New-Object System.Drawing.Font $fontFamily, 78, ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)
$format = New-Object System.Drawing.StringFormat
$format.Alignment = [System.Drawing.StringAlignment]::Center
$format.LineAlignment = [System.Drawing.StringAlignment]::Center
$graphics.DrawString("SI", $font, (New-Object System.Drawing.SolidBrush $ivory), (New-Object System.Drawing.RectangleF 0, 34, 256, 170), $format)

$pngPath = Join-Path $buildDir "icon.png"
$icoPath = Join-Path $buildDir "icon.ico"
$bitmap.Save($pngPath, [System.Drawing.Imaging.ImageFormat]::Png)

$memory = New-Object System.IO.MemoryStream
$bitmap.Save($memory, [System.Drawing.Imaging.ImageFormat]::Png)
$pngBytes = $memory.ToArray()

$file = [System.IO.File]::Create($icoPath)
$writer = New-Object System.IO.BinaryWriter $file
try {
  $writer.Write([UInt16]0)
  $writer.Write([UInt16]1)
  $writer.Write([UInt16]1)
  $writer.Write([Byte]0)
  $writer.Write([Byte]0)
  $writer.Write([Byte]0)
  $writer.Write([Byte]0)
  $writer.Write([UInt16]1)
  $writer.Write([UInt16]32)
  $writer.Write([UInt32]$pngBytes.Length)
  $writer.Write([UInt32]22)
  $writer.Write($pngBytes)
}
finally {
  $writer.Dispose()
  $file.Dispose()
  $memory.Dispose()
  $graphics.Dispose()
  $bitmap.Dispose()
}

Write-Host "Created $pngPath and $icoPath"
