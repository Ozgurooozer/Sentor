@echo off
setlocal enabledelayedexpansion
title Sentor
cd /d "%~dp0"

rem ─────────────────────────────────────────────────────────────
rem  Sentor launcher — single source of truth.
rem  Usage:  sentor [serve|ide|v3|index|chat|all] [extra args]
rem    serve     — start API server (port 4242 unless overridden)
rem    ide       — IDE + vault index + CodeGraph
rem    v3        — V3 mod: ses sunucusu + vault index + CodeGraph + IDE
rem    index     — rebuild .index/pages.{json,js}
rem    chat      — CLI chat loop
rem    all       — API + IDE (full stack)
rem  Worker CLI:
rem    new-task  — interactive task wizard
rem    run       — run a saved task:  sentor run <id> [--wait] [--input "..."]
rem    task      — task management:   sentor task list|show|delete
rem    provider  — LLM provider probe: sentor provider status|wait [name]
rem    notify    — send a notification: sentor notify "msg"
rem  No args → interactive menu.
rem ─────────────────────────────────────────────────────────────

if "%1"=="" goto menu
if /i "%1"=="serve"    goto serve
if /i "%1"=="ide"      goto ide
if /i "%1"=="v3"       goto v3
if /i "%1"=="index"    goto index
if /i "%1"=="chat"     goto chat
if /i "%1"=="all"      goto all
if /i "%1"=="new-task"     goto passthrough
if /i "%1"=="run"          goto passthrough
if /i "%1"=="task"         goto passthrough
if /i "%1"=="provider"     goto passthrough
if /i "%1"=="notify"       goto passthrough
if /i "%1"=="pipeline"     goto passthrough
if /i "%1"=="serve-daemon" goto passthrough
echo   Unknown command: %1
echo.

:menu
echo.
echo   Sentor
echo   ---------------
echo   [1] Start IDE              (sentor ide   — vault index + CodeGraph)
echo   [2] Start V3 modu          (sentor v3    — ses + vault + CodeGraph + IDE)
echo   [3] Start full stack       (sentor all   — API + IDE)
echo   [4] Start API server only  (sentor serve)
echo   [5] Rebuild index          (sentor index)
echo   [6] Chat with AI           (sentor chat)
echo.
echo   Worker / CLI:
echo   [A] New task wizard    (sentor new-task)
echo   [T] List tasks         (sentor task list)
echo   [L] List pipelines     (sentor pipeline list)
echo   [D] Start daemon       (sentor serve-daemon)
echo   [P] Provider status    (sentor provider status)
echo   [C] Sentor CLI          (interaktif komut satiri)
echo   [B] Build IDE          (release binary olustur — bir kez yeterli)
echo   [K] Package build      (versiyonlu kopyala → build\sentor-studio-vX.Y.Z\)
echo   [0] Exit
echo.
set /p choice="  Choose: "

if "!choice!"=="1" goto ide
if "!choice!"=="2" goto v3
if "!choice!"=="3" goto all
if "!choice!"=="4" goto serve
if "!choice!"=="5" goto index
if "!choice!"=="6" goto chat
if /i "!choice!"=="A" ( python cli\main.py new-task & pause & goto menu )
if /i "!choice!"=="T" ( python cli\main.py task list & pause & goto menu )
if /i "!choice!"=="L" ( python cli\main.py pipeline list & pause & goto menu )
if /i "!choice!"=="D" ( start "Sentor Daemon" cmd /k "title Sentor Daemon && python cli\main.py serve-daemon" & goto menu )
if /i "!choice!"=="P" ( python cli\main.py provider status & pause & goto menu )
if /i "!choice!"=="C" goto cli_loop
if /i "!choice!"=="B" goto build_ide
if /i "!choice!"=="K" goto package_build
if "!choice!"=="0" exit /b
goto menu

rem ── Subcommands ──────────────────────────────────────────────

:serve
python api\server.py %2 %3 %4 %5
pause
goto :eof

:index
python tools\indexer.py
if exist tools\embedder.py python tools\embedder.py
pause
goto :eof

:chat
python cli\main.py chat %2 %3 %4 %5
pause
goto :eof

:passthrough
python cli\main.py %*
goto :eof

:build_ide
echo.
echo   Building Sentor release binary...
echo   (Bu islem ilk seferinde 5-10 dakika surebilir)
echo.
cd "%~dp0ide"
npm run tauri build
set "build_err=!errorlevel!"
cd "%~dp0"
if !build_err! neq 0 (
  echo.
  echo   Build basarisiz — hata kodu !build_err!
) else (
  echo.
  echo   Build tamamlandi. Artik sentor ide ile temiz baslatabilirsiniz.
)
pause
goto menu

:package_build
echo.
if not exist "%~dp0ide\src-tauri\target\release\sentor.exe" (
  echo   ERROR: Release binary not found.
  echo   Run [B] Build IDE first, then package.
  pause & goto menu
)
echo   Reading version from ide\package.json...
for /f "usebackq delims=" %%V in (`node -e "process.stdout.write(require('./ide/package.json').version)"`) do set "PKG_VERSION=%%V"
for /f "usebackq delims=" %%D in (`node -e "const d=new Date();process.stdout.write(d.toISOString().slice(0,10).replace(/-/g,''))"`) do set "PKG_DATE=%%D"
set "PKG_DIR=%~dp0build\sentor-studio-v%PKG_VERSION%-%PKG_DATE%"
echo   Version : %PKG_VERSION%
echo   Date    : %PKG_DATE%
echo   Output  : %PKG_DIR%
echo.
if exist "%PKG_DIR%\" (
  set /p ow_choice="  Folder exists — overwrite? [y/N]: "
  if /i "!ow_choice!" neq "y" goto menu
)
if not exist "%~dp0build\" mkdir "%~dp0build"
if not exist "%PKG_DIR%\" mkdir "%PKG_DIR%"
copy "%~dp0ide\src-tauri\target\release\sentor.exe" "%PKG_DIR%\sentor.exe" >nul
(
  echo {"version":"%PKG_VERSION%","date":"%PKG_DATE%","exe":"sentor.exe"}
) > "%PKG_DIR%\build-info.json"
echo   Done:
echo     %PKG_DIR%\sentor.exe
echo     %PKG_DIR%\build-info.json
echo.
echo   Canvas Instance path: %PKG_DIR%\sentor.exe
pause
goto menu

:cli_loop
cls
echo.
echo   Sentor CLI — Interaktif Mod
echo   ---------------------------
echo   Komutlar:  task list/show/delete   pipeline list/run/show/new
echo              run ^<id^> [--input "..."]  new-task   provider status
echo              notify "mesaj"           chat        serve-daemon
echo   Cikmak icin:  exit
echo.
:cli_prompt
set "cli_cmd="
set /p cli_cmd="  sentor ^> "
if not defined cli_cmd goto cli_prompt
if /i "!cli_cmd!"=="exit" goto menu
if /i "!cli_cmd!"=="quit" goto menu
if /i "!cli_cmd!"=="menu" goto menu
python cli\main.py !cli_cmd!
echo.
goto cli_prompt

:all
goto ide

:ide
start /b "" cmd /c "python "%~dp0tools\indexer.py" 2>nul"
where node >nul 2>&1
if %errorlevel%==0 (
  echo   Starting CodeGraph bridge on port 4245...
  start /b "Sentor CodeGraph" node "%~dp0tools\codegraph_bridge.js" "%~dp0ide"
)
echo.
if exist "%~dp0ide\src-tauri\target\release\sentor.exe" (
  echo   Starting Sentor ^(release^)...
  start "" "%~dp0ide\src-tauri\target\release\sentor.exe"
) else if exist "%~dp0ide\src-tauri\target\release\sentor.exe" (
  echo   Starting Sentor ^(legacy sentor.exe^)...
  start "" "%~dp0ide\src-tauri\target\release\sentor.exe"
) else (
  echo   Release binary not found — starting in dev mode ^(minimized^).
  echo   Tip: sentor.bat ^> [B] Build IDE ile once derleyin.
  echo.
  start /min "Sentor Dev" cmd /k "title Sentor Dev && cd /d "%~dp0ide" && npx tauri dev"
  timeout /t 3 /nobreak >nul
)
goto :eof

:v3
call "%~dp0sentor-v3.bat"
goto :eof
