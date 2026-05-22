@echo off
rem Thin wrapper — delegates to atlas.bat for the single source of truth.
rem Usage:  atlas-serve [port]
"%~dp0atlas.bat" serve %*
