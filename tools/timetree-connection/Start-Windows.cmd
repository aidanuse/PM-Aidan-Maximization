@echo off
if /I "%~1"=="--run" goto run
"%SystemRoot%\System32\cmd.exe" /d /k call "%~f0" --run
exit /b
:run
setlocal
pushd "%~dp0"
if errorlevel 1 goto folderfailed
echo HARDBOND TimeTree setup
echo This window stays open so you can read any error.
echo.
if not exist "connect.mjs" goto missingfiles
if not exist "package-lock.json" goto missingfiles
where node.exe >nul 2>nul
if errorlevel 1 goto missingnode
where npm.cmd >nul 2>nul
if errorlevel 1 goto missingnode
node.exe -e "if(Number(process.versions.node.split('.')[0])<22) process.exit(1)"
if errorlevel 1 goto oldnode
echo Installing setup dependencies...
call npm.cmd ci --no-audit --no-fund
if errorlevel 1 goto failed
echo Installing the calendar browser...
call npx.cmd playwright install chromium
if errorlevel 1 goto failed
echo Starting connection setup...
node.exe connect.mjs
if errorlevel 1 goto failed
echo Setup helper stopped. This window can be closed.
popd
exit /b 0
:missingfiles
echo ERROR: Setup files are missing. Extract ALL files from the ZIP first.
echo Open tools then timetree-connection in the extracted folder.
goto stopped
:missingnode
echo ERROR: Node.js or npm is missing from Windows PATH.
echo Install Node.js LTS from https://nodejs.org/ with npm and PATH enabled.
echo Close this window and run Start-Windows.cmd again after installation.
goto stopped
:oldnode
echo ERROR: This setup needs Node.js 22 or newer.
echo Install the current Node.js LTS from https://nodejs.org/ then retry.
goto stopped
:folderfailed
echo ERROR: Cannot open the setup folder. Extract the ZIP to a local folder first.
goto stopped
:failed
echo.
echo ERROR: Setup stopped. No automatic calendar transfer has been enabled.
echo Read the error above. Share the error text, but do not share your pairing key.
:stopped
echo.
echo This window will remain open. You may close it after reading the message.
exit /b 1
