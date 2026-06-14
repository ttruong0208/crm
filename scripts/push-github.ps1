# Push Zalo CRM to GitHub (first time)
# Run from project root:
#   powershell -ExecutionPolicy Bypass -File scripts/push-github.ps1

$ErrorActionPreference = "Stop"
$Root = Split-Path $PSScriptRoot -Parent
Set-Location $Root

if (-not (Test-Path "server.js")) {
  Write-Error "Không tìm thấy server.js — chạy từ thư mục zalo-crm-mvp"
}

if (-not (Test-Path ".git")) {
  git init
}

Write-Host "Repo: $Root"

$blockedPatterns = @(
  '^\.env$',
  '^\.env\.',
  '^node_modules/',
  '^data/',
  '^backups/'
)

git add -A
$staged = git diff --cached --name-only
if ($staged) {
  foreach ($file in $staged) {
    foreach ($pat in $blockedPatterns) {
      if ($file -match $pat -and $file -ne '.env.example') {
        git reset HEAD -- $file 2>$null | Out-Null
        Write-Warning "Đã bỏ khỏi commit (nhạy cảm/runtime): $file"
      }
    }
  }
}

$stagedAfter = git diff --cached --name-only
if (git ls-files --error-unmatch .env 2>$null) {
  Write-Error ".env vẫn đang được track — chạy: git rm --cached .env"
}

if (-not $stagedAfter) {
  Write-Host "Không có file an toàn để commit."
} else {
  Write-Host "Sẽ commit $($stagedAfter.Count) file (đã loại secret/runtime)."
  git commit -m "first commit"
}

git branch -M main

if (git remote get-url origin 2>$null) {
  git remote set-url origin https://github.com/ttruong0208/crm.git
} else {
  git remote add origin https://github.com/ttruong0208/crm.git
}

Write-Host ""
Write-Host "--- git log -1 ---"
git log -1 --oneline
Write-Host ""
Write-Host "--- git remote -v ---"
git remote -v
Write-Host ""
Write-Host "Đang push..."
git push -u origin main
