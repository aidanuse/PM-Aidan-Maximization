@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Install the current Node.js LTS from https://nodejs.org/ then run this file again.
  pause
  exit /b 1
)
call npm ci --no-audit --no-fund
if errorlevel 1 goto failed
call npx playwright install chromium
if errorlevel 1 goto failed
call npm start
if errorlevel 1 goto failed
exit /b 0
:failed
echo Setup stopped. Read the error above; no calendar sync has been enabled.
pause
exit /b 1
