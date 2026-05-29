@echo off
title Atlas Transcribe
cd /d "%~dp0"
set WHISPER_MODEL=small
set WHISPER_DEVICE=cpu
set WHISPER_COMPUTE=int8
echo [transcribe] starting on port 3001 (cpu, int8)...
python server.py 3001
pause
