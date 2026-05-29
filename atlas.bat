@echo off
setlocal enabledelayedexpansion
title Atlas OS Studio
cd /d "%~dp0"

rem ─────────────────────────────────────────────────────────────
rem  Atlas OS launcher — single source of truth.
rem  Usage:  atlas [serve|ide|v3|index|chat|sentor|all] [extra args]
rem    serve     — start API server (port 4242 unless overridden)
rem    ide       — IDE + vault index + CodeGraph (use  ide sentor  for Sentor too)
rem    v3        — V3 mod: ses sunucusu + vault index + CodeGraph + IDE
rem    index     — rebuild .index/pages.{json,js}
rem    chat      — CLI chat loop
rem    sentor    — start mini flow server on port 3000
rem    all       — API + IDE + Sentor (full stack)
rem  Sentor Worker CLI:
rem    new-task  — interactive task wizard
rem    run       — run a saved task:  atlas run <id> [--wait] [--input "..."]
rem    task      — task management:   atlas task list|show|delete
rem    provider  — LLM provider probe: atlas provider status|wait [name]
rem    notify    — send a notification: atlas notify "msg"
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
echo   Atlas OS Studio
echo   ---------------
echo   [1] Start IDE              (atlas ide   — vault index + CodeGraph)
echo   [2] Start V3 modu          (atlas v3    — ses + vault + CodeGraph + IDE)
echo   [3] Start full stack       (atlas all   — API + IDE)
echo   [4] Start API server only  (atlas serve)
echo   [5] Rebuild index          (atlas index)
echo   [6] Chat with AI           (atlas chat)
echo.
echo   Worker / CLI:
echo   [A] New task wizard    (atlas new-task)
echo   [T] List tasks         (atlas task list)
echo   [L] List pipelines     (atlas pipeline list)
echo   [D] Start daemon       (atlas serve-daemon)
echo   [P] Provider status    (atlas provider status)
echo   [C] Atlas CLI          (interaktif komut satiri)
echo   [B] Build IDE          (release binary olustur — bir kez yeterli)
echo   [K] Package build      (versiyonlu kopyala → build\atlas-studio-vX.Y.Z\)
echo   [0] Exit
echo.
set /p choice="  Choose: "

if "!choice!"=="1" goto ide
if "!choice!"=="2" goto v3
if "!choice!"=="3" goto all
if "!choice!"=="4" goto serve
if "!choice!"=="5" goto index
if "!choice!"=="6" goto chat
if /i "!choice!"=="A" ( python cli\atlas.py new-task & pause & goto menu )
if /i "!choice!"=="T" ( python cli\atlas.py task list & pause & goto menu )
if /i "!choice!"=="L" ( python cli\atlas.py pipeline list & pause & goto menu )
if /i "!choice!"=="D" ( start "Atlas Daemon" cmd /k "title Atlas Daemon && python cli\atlas.py serve-daemon" & goto menu )
if /i "!choice!"=="P" ( python cli\atlas.py provider status & pause & goto menu )
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
python cli\atlas.py chat %2 %3 %4 %5
pause
goto :eof

rem  Sentor Worker CLI — new-task / run / task / provider / notify.
rem  Forward all args verbatim to cli\atlas.py.
:passthrough
python cli\atlas.py %*
goto :eof

rem ── Build IDE (release binary) ───────────────────────────────
:build_ide
echo.
echo   Building Atlas IDE release binary...
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
  echo   Build tamamlandi. Artik atlas ide ile temiz baslatabilirsiniz.
)
pause
goto menu

rem ── Package versioned build ──────────────────────────────────
:package_build
echo.
if not exist "%~dp0ide\src-tauri\target\release\atlas.exe" (
  echo   ERROR: Release binary not found.
  echo   Run [B] Build IDE first, then package.
  pause & goto menu
)
echo   Reading version from ide\package.json...
for /f "usebackq delims=" %%V in (`node -e "process.stdout.write(require('./ide/package.json').version)"`) do set "PKG_VERSION=%%V"
for /f "usebackq delims=" %%D in (`node -e "const d=new Date();process.stdout.write(d.toISOString().slice(0,10).replace(/-/g,''))"`) do set "PKG_DATE=%%D"
set "PKG_DIR=%~dp0build\atlas-studio-v%PKG_VERSION%-%PKG_DATE%"
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
copy "%~dp0ide\src-tauri\target\release\atlas.exe" "%PKG_DIR%\atlas.exe" >nul
(
  echo {"version":"%PKG_VERSION%","date":"%PKG_DATE%","exe":"atlas.exe"}
) > "%PKG_DIR%\build-info.json"
echo   Done:
echo     %PKG_DIR%\atlas.exe
echo     %PKG_DIR%\build-info.json
echo.
echo   Canvas Instance path: %PKG_DIR%\atlas.exe
pause
goto menu

rem ── Interactive Atlas CLI ────────────────────────────────────
rem  Prompts for commands in a loop. Type  exit  or  quit  to return.
:cli_loop
cls
echo.
echo   Atlas CLI — Interaktif Mod
echo   ---------------------------
echo   Komutlar:  task list/show/delete   pipeline list/run/show/new
echo              run ^<id^> [--input "..."]  new-task   provider status
echo              notify "mesaj"           chat        serve-daemon
echo   Cikmak icin:  exit
echo.
:cli_prompt
set "cli_cmd="
set /p cli_cmd="  atlas ^> "
if not defined cli_cmd goto cli_prompt
if /i "!cli_cmd!"=="exit" goto menu
if /i "!cli_cmd!"=="quit" goto menu
if /i "!cli_cmd!"=="menu" goto menu
python cli\atlas.py !cli_cmd!
echo.
goto cli_prompt

:all
goto ide

:ide
rem  API server is started inside the IDE's "Çalışan Terminaller" canvas automatically.
rem  No separate CMD window needed — zero desktop clutter.

rem  Rebuild vault index in background so vault-home panel always has fresh data.
start /b "" cmd /c "python "%~dp0tools\indexer.py" 2>nul"

rem  CodeGraph bridge — arka planda, ayrı pencere yok.
where node >nul 2>&1
if %errorlevel%==0 (
  echo   Starting CodeGraph bridge on port 4245...
  start /b "Atlas CodeGraph" node "%~dp0tools\codegraph_bridge.js" "%~dp0ide"
)

echo.
if exist "%~dp0ide\src-tauri\target\release\atlas.exe" (
  echo   Starting Atlas IDE ^(release^)...
  start "" "%~dp0ide\src-tauri\target\release\atlas.exe"
) else (
  echo   Release binary not found — starting in dev mode ^(minimized^).
  echo   Tip: run  cd ide ^&^& npm run tauri build  once for a clean launch.
  echo.
  start /min "Atlas IDE Dev" cmd /k "title Atlas IDE Dev && cd /d "%~dp0ide" && npx tauri dev"
  timeout /t 3 /nobreak >nul
)
goto :eof

:v3
call "%~dp0atlas-v3.bat"
goto :eof

