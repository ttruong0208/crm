@echo off
chcp 65001 >nul
echo === Zalo CRM — Production (Docker) ===
echo.
echo 1. Sua file .env: JWT_SECRET manh, DATABASE_URL, UPLOAD_DIR
echo 2. docker compose -f docker-compose.prod.yml up -d --build
echo 3. docker compose -f docker-compose.prod.yml exec app node scripts/init-db.js
echo 4. Mo http://localhost:3000 — extension: cap nhat crmBaseUrl trong popup
echo 5. Backup DB: powershell -File scripts\backup-db.ps1
echo.
pause
