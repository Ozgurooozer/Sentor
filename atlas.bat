@echo off
setlocal enabledelayedexpansion
title Atlas OS Studio
cd /d "%~dp0"

rem ─────────────────────────────────────────────────────────────
rem  Atlas OS launcher — single source of truth.
rem  Usage:  atlas [serve|ide|index|chat|sentor|all] [extra args]
rem    serve     — start API server (port 4242 unless overridden)
rem    ide       — IDE + background API (use  ide sentor  to also start Flowise)
rem    index     — rebuild .index/pages.{json,js}
rem    chat      — CLI chat loop
rem    sentor    — start Flowise agent builder on port 3000
rem    all       — API + IDE + Flowise (full stack)
rem  Sentor Worker CLI (kendi görev katmanı, Flowise ile karıştırma):
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
if /i "%1"=="index"    goto index
if /i "%1"=="chat"     goto chat
if /i "%1"=="sentor"   goto sentor
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
echo   [1] Start API server   (atlas serve)
echo   [2] Start IDE          (atlas ide)
echo   [3] Start IDE + Sentor (atlas ide sentor)
echo   [4] Start full stack   (atlas all  — API + IDE + Sentor)
echo   [5] Rebuild index      (atlas index)
echo   [6] Chat with AI       (atlas chat)
echo   [7] Start Sentor only  (atlas sentor)
echo.
echo   Sentor Worker:
echo   [8] New task wizard    (atlas new-task)
echo   [9] List tasks         (atlas task list)
echo   [L] List pipelines     (atlas pipeline list)
echo   [D] Start daemon       (atlas serve-daemon)
echo   [P] Provider status    (atlas provider status)
echo   [C] Atlas CLI          (interaktif komut satiri)
echo   [B] Build IDE          (release binary olustur — bir kez yeterli)
echo   [V] Package build      (versiyonlu kopyala → build\atlas-studio-vX.Y.Z\)
echo   [0] Exit
echo.
set /p choice="  Choose: "

if "!choice!"=="1" goto serve
if "!choice!"=="2" goto ide
if "!choice!"=="3" ( set "ide_with_sentor=1" & goto ide )
if "!choice!"=="4" goto all
if "!choice!"=="5" goto index
if "!choice!"=="6" goto chat
if "!choice!"=="7" goto sentor
if "!choice!"=="8" ( python cli\atlas.py new-task & pause & goto menu )
if "!choice!"=="9" ( python cli\atlas.py task list & pause & goto menu )
if /i "!choice!"=="L" ( python cli\atlas.py pipeline list & pause & goto menu )
if /i "!choice!"=="D" ( start "Atlas Daemon" cmd /k "title Atlas Daemon && python cli\atlas.py serve-daemon" & goto menu )
if /i "!choice!"=="P" ( python cli\atlas.py provider status & pause & goto menu )
if /i "!choice!"=="C" goto cli_loop
if /i "!choice!"=="B" goto build_ide
if /i "!choice!"=="V" goto package_build
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
set "ide_with_sentor=1"
goto ide

:ide
rem  `atlas ide sentor` or `atlas all` → also start Sentor.
if /i "%2"=="sentor" set "ide_with_sentor=1"

rem  API server is started inside the IDE's "Çalışan Terminaller" canvas automatically.
rem  No separate CMD window needed — zero desktop clutter.
if defined ide_with_sentor call :start_sentor_window

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

:sentor
call :start_sentor_inline
pause
goto :eof

rem ── Sentor helpers ───────────────────────────────────────────
rem  Two flavours of Sentor launch:
rem    :start_sentor_window  — opens a separate window (used by `ide sentor`)
rem    :start_sentor_inline  — runs in the current window (used by `sentor`)

:start_sentor_window
call :sentor_preflight
if errorlevel 1 goto :eof
echo   Starting Sentor in a separate window...
start "Atlas Sentor" cmd /k "title Atlas Sentor && cd /d "%~dp0modules\Flowise-flowise-3.1.2" && echo Starting Sentor on port 3000... && call start-sentor.bat & echo. & echo Sentor stopped. & pause"
echo   Sentor window opened — ready on port 3000 in ~30-60 seconds.
echo.
goto :eof

:start_sentor_inline
call :sentor_preflight
if errorlevel 1 goto :eof
echo.
echo   Starting Sentor on port 3000 (Node 20 via fnm)...
echo   ----------------------------------------
pushd "%~dp0modules\Flowise-flowise-3.1.2"
call start-sentor.bat
set "run_err=!errorlevel!"
popd
echo.
echo   ----------------------------------------
if !run_err! neq 0 (
  echo   Sentor exited with error code !run_err!
) else (
  echo   Sentor stopped.
)
echo.
goto :eof

rem  :sentor_preflight — verify folder, pnpm, node_modules; offer install.
rem  Returns errorlevel 1 if Sentor cannot be started.
:sentor_preflight
if not exist "%~dp0modules\Flowise-flowise-3.1.2\" (
  echo   ERROR: Folder not found: modules\Flowise-flowise-3.1.2
  echo   Make sure the Flowise archive is extracted there.
  exit /b 1
)
where pnpm >nul 2>&1
if %errorlevel% neq 0 (
  echo   ERROR: pnpm not found in PATH.  Install with:  npm install -g pnpm
  exit /b 1
)
if exist "%~dp0modules\Flowise-flowise-3.1.2\node_modules\" exit /b 0

echo   Sentor dependencies not installed yet (one-time, may take minutes).
set /p si_choice="  Run pnpm install now? [y/N]: "
if /i "!si_choice!" neq "y" (
  echo   Skipped. Run  pnpm install  in modules\Flowise-flowise-3.1.2 manually.
  exit /b 1
)
echo.
echo   Running pnpm install (Node 20 via fnm)...
echo   ----------------------------------------
pushd "%~dp0modules\Flowise-flowise-3.1.2"
fnm exec --using=20 pnpm install
set "install_err=!errorlevel!"
popd
if !install_err! neq 0 (
  echo.
  echo   ERROR: pnpm install failed with code !install_err!
  echo   Common causes: Node version mismatch, network/proxy issues.
  exit /b 1
)
echo.
echo   Install complete.
echo.
exit /b 0
