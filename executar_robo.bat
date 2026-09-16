@echo off
title AIHawk LinkedIn Bot
color 0a
echo ========================================================
echo   INICIANDO O ROBO DE CANDIDATURAS DO LINKEDIN...
echo ========================================================
echo.

set "LOCAL_PY=%LOCALAPPDATA%\Programs\Python\Python311\python.exe"

if exist "%LOCAL_PY%" (
    "%LOCAL_PY%" -u main.py
) else (
    python -u main.py
)

echo.
echo Execucao finalizada.
pause
