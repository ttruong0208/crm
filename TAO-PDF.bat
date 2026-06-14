@echo off
cd /d "%~dp0"
npm.cmd install pdfkit --no-save
node scripts\generate-pdf-kit.js
if exist "docs\Zalo-CRM-Tai-lieu.pdf" (
  start "" "docs\Zalo-CRM-Tai-lieu.pdf"
) else (
  start "" "docs\Zalo-CRM-Tai-lieu.html"
  echo Mo HTML roi bam Ctrl+P - Luu thanh PDF
  pause
)
