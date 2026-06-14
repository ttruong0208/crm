# Sao lưu PostgreSQL Zalo CRM (chạy trên Windows)
param(
  [string]$ContainerName = "zalo-crm-postgres",
  [string]$OutDir = ".\backups"
)

$ErrorActionPreference = "Stop"
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$outFile = Join-Path $OutDir "zalo_crm_$stamp.sql"

Write-Host "Backing up to $outFile ..."
docker exec $ContainerName pg_dump -U postgres zalo_crm | Out-File -FilePath $outFile -Encoding utf8
Write-Host "Done."
