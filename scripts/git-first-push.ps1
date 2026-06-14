# Sửa lỗi: src refspec main does not match any
# Chạy: powershell -ExecutionPolicy Bypass -File scripts\git-first-push.ps1

$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)

Write-Host "=== Zalo CRM — first push ===" -ForegroundColor Cyan
Write-Host "Folder: $(Get-Location)"

if (-not (Test-Path "server.js")) {
  throw "Sai thư mục — cd vào zalo-crm-mvp trước"
}

if (-not (Test-Path ".git")) {
  Write-Host "git init..."
  git init
}

# Đảm bảo .env không bị track
if (Test-Path ".env") {
  if (git ls-files --error-unmatch .env 2>$null) {
    git rm --cached .env
    Write-Host "Đã gỡ .env khỏi git index (file local vẫn còn)" -ForegroundColor Yellow
  }
}

Write-Host "git add..."
git add -A

$staged = @(git diff --cached --name-only)
if ($staged.Count -eq 0) {
  throw "Không có file nào để commit. Kiểm tra .gitignore hoặc thư mục project."
}

# Double-check .env
if ($staged -contains ".env") {
  git reset HEAD .env
  throw ".env đang trong staging — đã bỏ. KHÔNG push secret."
}

Write-Host "Sẽ commit $($staged.Count) files..."
git commit -m "first commit"

Write-Host "git branch -M main"
git branch -M main

$remote = git remote get-url origin 2>$null
if (-not $remote) {
  git remote add origin https://github.com/ttruong0208/crm.git
} else {
  git remote set-url origin https://github.com/ttruong0208/crm.git
}

Write-Host ""
git log -1 --oneline
git branch -v
git remote -v
Write-Host ""
Write-Host "git push -u origin main..." -ForegroundColor Green
git push -u origin main

Write-Host ""
Write-Host "Xong! Repo: https://github.com/ttruong0208/crm" -ForegroundColor Green
