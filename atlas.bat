@echo off
title Atlas OS
cd /d "%~dp0"

if "%1"=="" goto menu
if /i "%1"=="serve"  goto serve
if /i "%1"=="ide"    goto ide
if /i "%1"=="index"  goto index
if /i "%1"=="chat"   goto chat

:menu
echo.
echo   Atlas OS Launcher
echo   -----------------
echo   [1] Start API server   (atlas serve)
echo   [2] Start IDE          (atlas-ide)
echo   [3] Rebuild index      (atlas index)
echo   [4] Chat with AI       (atlas chat)
echo   [0] Exit
echo.
set /p choice="  Choose: "

if "%choice%"=="1" goto serve
if "%choice%"=="2" goto ide
if "%choice%"=="3" goto index
if "%choice%"=="4" goto chat
if "%choice%"=="0" exit /b
goto menu

:serve
python api\server.py %2
pause
goto :eof

:ide
start "Atlas API" /min python api\server.py
timeout /t 1 /nobreak >nul
cd ide
npx tauri dev
goto :eof

:index
python tools\indexer.py
pause
goto :eof

:chat
python cli\atlas.py chat %2 %3
pause
goto :eof
