$ErrorActionPreference = "SilentlyContinue"
docker stop kampeerhub
if ($LASTEXITCODE -eq 0) { Write-Host "Stopped." } else { Write-Host "Container not running." }
