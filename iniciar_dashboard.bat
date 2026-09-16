@echo off
title Job Tracker Dashboard
color 0b
echo ========================================================
echo   INICIANDO O DASHBOARD DO PROCESSO SELETIVO...
echo ========================================================
echo.

cd /d "%~dp0\dashboard"
start "" http://localhost:3000
node server.js

pause
