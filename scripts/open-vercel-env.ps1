# Tạo .env.vercel từ mẫu để import Vercel
$Root = Split-Path $PSScriptRoot -Parent
Set-Location $Root

$example = Join-Path $Root ".env.vercel.example"
$target = Join-Path $Root ".env.vercel"

if (-not (Test-Path $example)) {
  Write-Error "Thiếu .env.vercel.example"
}

if (Test-Path $target) {
  Write-Host "Đã có .env.vercel — mở Notepad để sửa..."
} else {
  Copy-Item $example $target
  Write-Host "Đã tạo .env.vercel từ mẫu."
}

notepad $target

Write-Host ""
Write-Host "=== Import Vercel ===" -ForegroundColor Cyan
Write-Host "1. Vercel → Project crm → Settings → Environment Variables"
Write-Host "2. Import .env → chọn file: $target"
Write-Host "3. Tick Production + Preview + Development"
Write-Host "4. Save → Deployments → Redeploy"
Write-Host ""
Write-Host "JWT_SECRET nhanh (copy dán vào file):" -ForegroundColor Yellow
$secret = [Convert]::ToBase64String((1..48 | ForEach-Object { Get-Random -Maximum 256 }))
Write-Host $secret
