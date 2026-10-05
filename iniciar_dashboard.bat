@echo off
setlocal

title Job Tracker Dashboard
color 0b

echo ========================================================
echo   INICIANDO O DASHBOARD DO PROCESSO SELETIVO...
echo ========================================================
echo.

cd /d "%~dp0\dashboard"
where node >nul 2>nul
if errorlevel 1 (
  echo [dashboard] Node.js nao encontrado no PATH do sistema.
  echo [dashboard] Verifique a instalaçao do Node LTS e tente novamente.
  echo.
  pause
  exit /b 1
)

cmd /k "cd /d ""%~dp0dashboard"" && node check_and_start.js"

exit /b %errorlevel%
