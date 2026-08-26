# Sign purser-windows-x64.exe with Authenticode.
# Requires Windows secrets listed in docs/RELEASING.md. Exits 0 without signing
# when they are missing so CI can still ship checksummed unsigned builds.
$ErrorActionPreference = "Stop"
if (-not $env:AUTHENTICODE_PFX -or -not $env:AUTHENTICODE_PFX_PASSWORD) {
  Write-Host "Authenticode secrets are not set. Leaving the Windows binary unsigned."
  exit 0
}
$dir = if ($args.Count -gt 0) { $args[0] } else { "dist/bin" }
$exe = Join-Path $dir "purser-windows-x64.exe"
if (-not (Test-Path $exe)) {
  Write-Host "No Windows binary at $exe"
  exit 0
}
$pfx = Join-Path $env:TEMP "purser.pfx"
[IO.File]::WriteAllBytes($pfx, [Convert]::FromBase64String($env:AUTHENTICODE_PFX))
& signtool sign /fd SHA256 /f $pfx /p $env:AUTHENTICODE_PFX_PASSWORD /tr http://timestamp.digicert.com /td SHA256 $exe
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Remove-Item $pfx -Force
