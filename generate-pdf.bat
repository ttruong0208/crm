@echo off
cd /d "%~dp0"
echo Installing pdfkit...
call npm.cmd install pdfkit --no-save
if errorlevel 1 goto fail
echo Generating PDF...
call node scripts\generate-pdf-kit.js
if errorlevel 1 goto fail
echo.
echo Done: docs\Zalo-CRM-Tai-lieu.pdf
start "" "%~dp0docs\Zalo-CRM-Tai-lieu.pdf"
exit /b 0
:fail
echo.
echo Auto PDF failed. Open docs\Zalo-CRM-Tai-lieu.html then Ctrl+P - Save as PDF
pause
