@echo off
setlocal enabledelayedexpansion
title Sentor v3
cd /d "%~dp0"

echo.
echo   Sentor — V3 Modu
echo   -------------------

netstat -ano | findstr ":3001 " >nul 2>&1
if %errorlevel% neq 0 (
  echo   [1/4] Ses sunucusu baslatiliyor  ^(localhost:3001^)...
  start "Sentor Transcribe" /min cmd /k "%~dp0transcribe\start.bat"
) else (
  echo   [1/4] Ses sunucusu zaten calisiyor.
)

echo   [2/4] Vault index yenileniyor...
start /b "" cmd /c "python "%~dp0tools\indexer.py" 2>nul"

where node >nul 2>&1
if %errorlevel%==0 (
  echo   [3/4] CodeGraph bridge baslatiliyor  ^(localhost:4245^)...
  start /b "Sentor CodeGraph" node "%~dp0tools\codegraph_bridge.js" "%~dp0ide"
) else (
  echo   [3/4] Node bulunamadi — CodeGraph bridge atlanıyor.
)

echo   [4/4] Sentor baslatiliyor...
echo.

set V3_MODE=1

if exist "%~dp0ide\src-tauri\target\release\sentor.exe" (
  start "" "%~dp0ide\src-tauri\target\release\sentor.exe"
) else if exist "%~dp0ide\src-tauri\target\release\sentor.exe" (
  start "" "%~dp0ide\src-tauri\target\release\sentor.exe"
) else (
  echo   Release binary bulunamadi — dev modda baslatiliyor...
  echo   Tip: sentor.bat ^> [B] Build IDE ile once derleyin.
  echo.
  set V3_MODE=1
  start /min "Sentor Dev" cmd /k "title Sentor Dev && set V3_MODE=1 && cd /d "%~dp0ide" && npx tauri dev"
  timeout /t 3 /nobreak >nul
)
