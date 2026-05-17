@echo off
title Atlas OS — IDE
cd /d "%~dp0ide"
start "" /b cmd /c "cd /d "%~dp0" && python api\server.py" 2>nul
echo Starting Atlas IDE...
npx tauri dev
