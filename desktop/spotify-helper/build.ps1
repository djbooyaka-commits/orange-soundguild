$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
go run github.com/akavel/rsrc@v0.10.2 -manifest app.manifest -arch amd64 -o rsrc_windows_amd64.syso
if ($LASTEXITCODE -ne 0) { throw "Manifest generation failed" }
go test core.go update.go core_test.go update_test.go
if ($LASTEXITCODE -ne 0) { throw "Helper tests failed" }
$env:GOOS = "windows"
$env:GOARCH = "amd64"
$env:CGO_ENABLED = "0"
go build -trimpath -ldflags="-s -w -H windowsgui" -o ../../public/downloads/OSG-Spotify-Helper.exe .
if ($LASTEXITCODE -ne 0) { throw "Windows packaging failed" }
$exe = Resolve-Path ../../public/downloads/OSG-Spotify-Helper.exe
$manifest = @{
  version = (Get-Content version.txt -Raw).Trim()
  url = "https://orangesoundguild.com/downloads/OSG-Spotify-Helper.exe"
  sha256 = (Get-FileHash $exe -Algorithm SHA256).Hash.ToLowerInvariant()
  size = (Get-Item $exe).Length
}
$manifest | ConvertTo-Json | Set-Content ../../public/downloads/spotify-helper-update.json -Encoding utf8NoBOM