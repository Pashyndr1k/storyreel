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

rem Rebuild when there is no build, when the built version differs from
rem package.json, or when any source file is newer than the build - so an
rem updated checkout never launches a stale bundle.
node -e "const fs=require('fs'),p=require('path');const v=require('./package.json').version;let ok=fs.existsSync('dist/index.html');let s='';try{s=fs.readFileSync('dist/.build-version','utf8').trim()}catch{}if(s!==v)ok=false;if(ok){const t=fs.statSync('dist/index.html').mtimeMs;const walk=(d)=>{for(const e of fs.readdirSync(d,{withFileTypes:true})){const f=p.join(d,e.name);if(e.isDirectory())walk(f);else if(fs.statSync(f).mtimeMs>t)ok=false}};walk('src');for(const f of['package.json','index.html','vite.config.js'])if(fs.existsSync(f)&&fs.statSync(f).mtimeMs>t)ok=false}process.exit(ok?0:1)"
if errorlevel 1 (
  echo Building StoryReel...
  call npm run build
  if errorlevel 1 (
    echo.
    echo Build failed.
    pause
    exit /b 1
  )
  node -e "require('fs').writeFileSync('dist/.build-version',require('./package.json').version)"
)

echo Starting StoryReel...
if exist "node_modules\electron\dist\electron.exe" (
  start "" "node_modules\electron\dist\electron.exe" .
) else (
  call npx electron .
)
exit /b 0
