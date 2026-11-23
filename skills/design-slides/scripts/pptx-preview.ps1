# Render a .pptx to PDF + one PNG per slide so you can LOOK at it (Windows + PowerPoint installed).
#   powershell -ExecutionPolicy Bypass -File pptx-preview.ps1 -Pptx deck.pptx [-Dpi 48]
# Runs PowerPoint hidden through COM. If PowerPoint was already open it stays open.
# Needs pdftoppm (poppler) for the PNGs; without it you still get the PDF.
param([Parameter(Mandatory = $true)][string]$Pptx, [int]$Dpi = 48)

$full = (Resolve-Path $Pptx).Path
$pdf = [System.IO.Path]::ChangeExtension($full, '.preview.pdf')
$wasRunning = [bool](Get-Process POWERPNT -ErrorAction SilentlyContinue)
$app = New-Object -ComObject PowerPoint.Application
try {
  $deck = $app.Presentations.Open($full, $true, $false, $false)   # read-only, no window
  $deck.SaveAs($pdf, 32)                                           # 32 = ppSaveAsPDF
  $deck.Close()
} finally {
  if (-not $wasRunning) { $app.Quit() }
}
Write-Output $pdf

$prefix = [System.IO.Path]::ChangeExtension($full, $null).TrimEnd('.') + '-slide'
if (Get-Command pdftoppm -ErrorAction SilentlyContinue) {
  & pdftoppm -png -r $Dpi $pdf $prefix
  Get-ChildItem "$prefix-*.png" | ForEach-Object { $_.FullName }
  Write-Output 'Now LOOK at every slide image.'
} else {
  Write-Output 'pdftoppm not found (install poppler); open the PDF and check every slide.'
}
