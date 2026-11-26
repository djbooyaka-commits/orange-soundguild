$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
go run github.com/akavel/rsrc@v0.10.2 -manifest app.manifest -arch amd64 -o rsrc_windows_amd64.syso
if ($LASTEXITCODE -ne 0) { throw "Manifest generation failed" }
go test core.go core_test.go
if ($LASTEXITCODE -ne 0) { throw "Helper tests failed" }
$env:GOOS = "windows"
$env:GOARCH = "amd64"
$env:CGO_ENABLED = "0"
go build -trimpath -ldflags="-s -w -H windowsgui" -o ../../public/downloads/OSG-Spotify-Helper.exe .
if ($LASTEXITCODE -ne 0) { throw "Windows packaging failed" }