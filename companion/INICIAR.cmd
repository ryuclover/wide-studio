@echo off
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0INICIAR.ps1"
if errorlevel 1 pause
