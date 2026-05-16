@echo off
title Atlas OS — API Server
cd /d "%~dp0"
echo.
echo   Atlas OS API Server
echo   http://localhost:4242
echo.
python api\server.py %*
pause
