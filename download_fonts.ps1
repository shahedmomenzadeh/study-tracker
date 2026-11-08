$fontDir = "d:\study-tracker\src\renderer\fonts"
if (!(Test-Path $fontDir)) { New-Item -ItemType Directory -Path $fontDir -Force | Out-Null }

$urlRegular = "https://raw.githubusercontent.com/rastikerdar/vazirmatn/master/fonts/webfonts/Vazirmatn-Regular.woff2"
$urlBold = "https://raw.githubusercontent.com/rastikerdar/vazirmatn/master/fonts/webfonts/Vazirmatn-Bold.woff2"
$urlMedium = "https://raw.githubusercontent.com/rastikerdar/vazirmatn/master/fonts/webfonts/Vazirmatn-Medium.woff2"

try {
    Write-Host "Downloading Vazirmatn-Regular..."
    Invoke-WebRequest -Uri $urlRegular -OutFile (Join-Path $fontDir "Vazirmatn-Regular.woff2") -UseBasicParsing -TimeoutSec 15
    Write-Host "Downloading Vazirmatn-Bold..."
    Invoke-WebRequest -Uri $urlBold -OutFile (Join-Path $fontDir "Vazirmatn-Bold.woff2") -UseBasicParsing -TimeoutSec 15
    Write-Host "Downloading Vazirmatn-Medium..."
    Invoke-WebRequest -Uri $urlMedium -OutFile (Join-Path $fontDir "Vazirmatn-Medium.woff2") -UseBasicParsing -TimeoutSec 15
    Get-ChildItem $fontDir | Select-Object Name, Length
} catch {
    Write-Error $_.Exception.Message
}
