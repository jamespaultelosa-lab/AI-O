@echo off
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0engram.ps1" %*
exit /b %ERRORLEVEL%
