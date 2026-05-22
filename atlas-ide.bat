@echo off
rem Thin wrapper — delegates to atlas.bat for the single source of truth.
rem Usage:  atlas-ide              → IDE + API
rem         atlas-ide sentor       → IDE + API + Flowise agent builder
rem
rem  For Sentor Worker CLI (görev katmanı) use atlas.bat directly:
rem    atlas new-task              → interactive task wizard
rem    atlas run <id> [--wait]     → run a saved task
rem    atlas task list             → list saved tasks
rem    atlas provider status       → probe local-ollama / lmstudio / openrouter
rem    atlas notify "msg"          → send a notification
"%~dp0atlas.bat" ide %*
