$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$rootDir = Split-Path -Parent $scriptDir
$buildDir = Join-Path $rootDir "build"
$publicDir = Join-Path $rootDir "public"
New-Item -ItemType Directory -Force -Path $buildDir | Out-Null
New-Item -ItemType Directory -Force -Path $publicDir | Out-Null

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

function New-Pen {
  param([string]$Color, [float]$Width)
  $pen = New-Object System.Drawing.Pen ([System.Drawing.ColorTranslator]::FromHtml($Color)), $Width
  $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  return $pen
}

function New-GitHubResearchFallbackIcon {
  param([int]$Size)

  $bitmap = New-Object System.Drawing.Bitmap $Size, $Size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
  $graphics.Clear([System.Drawing.Color]::Transparent)
  $graphics.ScaleTransform($Size / 256, $Size / 256)

  $background = [System.Drawing.ColorTranslator]::FromHtml("#111313")
  $panel = [System.Drawing.ColorTranslator]::FromHtml("#171918")
  $accent = [System.Drawing.ColorTranslator]::FromHtml("#d97757")
  $accentHot = [System.Drawing.ColorTranslator]::FromHtml("#f0a06e")
  $cyan = [System.Drawing.ColorTranslator]::FromHtml("#7bbbd8")
  $ivory = [System.Drawing.ColorTranslator]::FromHtml("#f5f2ea")
  $muted = [System.Drawing.ColorTranslator]::FromHtml("#5d6b67")

  $networkPen = $null
  $lensPen = $null
  $handlePen = $null
  $trendPen = $null
  $basePen = $null
  $starBrush = $null

  try {
    $shape = New-RoundedRectanglePath 10 10 236 236 44
    $graphics.FillPath((New-Object System.Drawing.SolidBrush $background), $shape)
    $inner = New-RoundedRectanglePath 25 25 206 206 34
    $graphics.FillPath((New-Object System.Drawing.SolidBrush $panel), $inner)

    # Repository/network nodes behind the lens.
    $networkPen = New-Pen "#38413e" 5
    $graphics.DrawLine($networkPen, 64, 77, 105, 107)
    $graphics.DrawLine($networkPen, 105, 107, 79, 152)
    $graphics.DrawLine($networkPen, 105, 107, 152, 83)
    $graphics.DrawLine($networkPen, 152, 83, 181, 128)
    $graphics.DrawLine($networkPen, 79, 152, 136, 164)
    foreach ($node in @(@(64,77,15,$cyan), @(105,107,13,$ivory), @(79,152,12,$accent), @(152,83,12,$cyan), @(181,128,12,$accentHot), @(136,164,10,$ivory))) {
      $brush = New-Object System.Drawing.SolidBrush $node[3]
      $graphics.FillEllipse($brush, $node[0] - $node[2] / 2, $node[1] - $node[2] / 2, $node[2], $node[2])
      $brush.Dispose()
    }

    # Research lens.
    $lensPen = New-Pen "#f5f2ea" 13
    $graphics.DrawEllipse($lensPen, 61, 52, 113, 113)
    $handlePen = New-Pen "#d97757" 17
    $graphics.DrawLine($handlePen, 151, 151, 205, 205)

    # Trend signal inside the lens.
    $trendPen = New-Pen "#d97757" 9
    $graphics.DrawLines($trendPen, [System.Drawing.Point[]]@(
      (New-Object System.Drawing.Point 85,128),
      (New-Object System.Drawing.Point 107,113),
      (New-Object System.Drawing.Point 126,119),
      (New-Object System.Drawing.Point 151,91)
    ))
    $starBrush = New-Object System.Drawing.SolidBrush $accentHot
    $graphics.FillEllipse($starBrush, 145, 84, 18, 18)

    # Subtle bottom research baseline.
    $basePen = New-Pen "#5d6b67" 5
    $graphics.DrawLine($basePen, 54, 210, 161, 210)
    $graphics.FillEllipse((New-Object System.Drawing.SolidBrush $muted), 173, 205, 10, 10)
  }
  finally {
    if ($networkPen) { $networkPen.Dispose() }
    if ($lensPen) { $lensPen.Dispose() }
    if ($handlePen) { $handlePen.Dispose() }
    if ($trendPen) { $trendPen.Dispose() }
    if ($basePen) { $basePen.Dispose() }
    if ($starBrush) { $starBrush.Dispose() }
    $graphics.Dispose()
  }

  return $bitmap
}

function New-ResizedBitmapFromSource {
  param([string]$Path, [int]$Size)

  $source = [System.Drawing.Image]::FromFile($Path)
  $bitmap = New-Object System.Drawing.Bitmap $Size, $Size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  try {
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $graphics.Clear([System.Drawing.Color]::Transparent)
    $graphics.DrawImage($source, 0, 0, $Size, $Size)
  }
  finally {
    $graphics.Dispose()
    $source.Dispose()
  }
  return $bitmap
}

function Write-IcoFromBitmap {
  param([System.Drawing.Bitmap]$Bitmap, [string]$Path)

  $memory = New-Object System.IO.MemoryStream
  $Bitmap.Save($memory, [System.Drawing.Imaging.ImageFormat]::Png)
  $pngBytes = $memory.ToArray()

  $file = [System.IO.File]::Create($Path)
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
  }
}

$assetSize = 1024
$icoSize = 256
$pngPath = Join-Path $buildDir "icon.png"
$sourcePath = Join-Path $buildDir "icon-source.png"
$publicPath = Join-Path $publicDir "icon.png"
$icoPath = Join-Path $buildDir "icon.ico"

$bitmap = $null
$icoBitmap = $null
try {
  $shouldRegenerateSource = $true
  if (Test-Path $sourcePath) {
    $sourceProbe = [System.Drawing.Image]::FromFile($sourcePath)
    try {
      $shouldRegenerateSource = $sourceProbe.Width -lt 512 -or $sourceProbe.Height -lt 512
    }
    finally {
      $sourceProbe.Dispose()
    }
  }

  if ($shouldRegenerateSource) {
    $sourceBitmap = New-GitHubResearchFallbackIcon $assetSize
    try {
      $sourceBitmap.Save($sourcePath, [System.Drawing.Imaging.ImageFormat]::Png)
    }
    finally {
      $sourceBitmap.Dispose()
    }
  }

  $bitmap = New-ResizedBitmapFromSource $sourcePath $assetSize
  $bitmap.Save($pngPath, [System.Drawing.Imaging.ImageFormat]::Png)
  $bitmap.Save($publicPath, [System.Drawing.Imaging.ImageFormat]::Png)

  $icoBitmap = New-ResizedBitmapFromSource $sourcePath $icoSize
  Write-IcoFromBitmap $icoBitmap $icoPath
}
finally {
  if ($bitmap) { $bitmap.Dispose() }
  if ($icoBitmap) { $icoBitmap.Dispose() }
}

Write-Host "Created $pngPath, $icoPath, and $publicPath from $sourcePath"
