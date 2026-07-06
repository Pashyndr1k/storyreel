@echo off
setlocal
cd /d "%~dp0"
title StoryReel launcher

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required to run StoryReel from source.
  echo Install it from https://nodejs.org and run this file again.
  echo.
  pause
  exit /b 1
)

if not exist node_modules (
  echo Installing dependencies - this happens only on the first run...
  call npm install --no-audit --no-fund
  if errorlevel 1 (
    echo.
    echo npm install failed. Check your internet connection and try again.
    pause
    exit /b 1
  )
)

if not exist dist\index.html (
  echo Building the app...
  call npm run build
  if errorlevel 1 (
    echo.
    echo Build failed.
    pause
    exit /b 1
  )
)

echo Starting StoryReel...
if exist "node_modules\electron\dist\electron.exe" (
  start "" "node_modules\electron\dist\electron.exe" .
) else (
  call npx electron .
)
exit /b 0
