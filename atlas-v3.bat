@echo off
setlocal enabledelayedexpansion
title Atlas OS v3
cd /d "%~dp0"

echo.
echo   Atlas OS — V3 Modu
echo   -------------------

rem ── Ses / Transkripsiyon sunucusu ────────────────────────────────────────────
netstat -ano | findstr ":3001 " >nul 2>&1
if %errorlevel% neq 0 (
  echo   [1/4] Ses sunucusu baslatiliyor  ^(localhost:3001^)...
  start "Atlas Transcribe" /min cmd /k "%~dp0transcribe\start.bat"
) else (
  echo   [1/4] Ses sunucusu zaten calisiyor.
)

rem ── Vault index — arka planda yenile ────────────────────────────────────────
echo   [2/4] Vault index yenileniyor...
start /b "" cmd /c "python "%~dp0tools\indexer.py" 2>nul"

rem ── CodeGraph bridge ─────────────────────────────────────────────────────────
where node >nul 2>&1
if %errorlevel%==0 (
  echo   [3/4] CodeGraph bridge baslatiliyor  ^(localhost:4245^)...
  start /b "Atlas CodeGraph" node "%~dp0tools\codegraph_bridge.js" "%~dp0ide"
) else (
  echo   [3/4] Node bulunamadi — CodeGraph bridge atlanıyor.
)

rem ── IDE ──────────────────────────────────────────────────────────────────────
echo   [4/4] Atlas IDE baslatiliyor...
echo.

if exist "%~dp0ide\src-tauri\target\release\atlas.exe" (
  start "" "%~dp0ide\src-tauri\target\release\atlas.exe"
) else (
  echo   Release binary bulunamadi — dev modda baslatiliyor...
  echo   Tip: atlas.bat menusu ^> ^[B^] Build IDE ile once derleyin.
  echo.
  start /min "Atlas IDE Dev" cmd /k "title Atlas IDE Dev && cd /d "%~dp0ide" && npx tauri dev"
  timeout /t 3 /nobreak >nul
)
