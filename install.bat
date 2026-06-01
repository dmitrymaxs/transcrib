@echo off
chcp 65001 >nul
title Transcrib Electron - Установка

echo ======================================
echo   Transcrib Electron - Установка
echo ======================================
echo.

cd /d "%~dp0"

echo Установка зависимостей...
npm install

if errorlevel 1 (
    echo.
    echo Ошибка установки!
    pause
    exit /b 1
)

echo.
echo Установка завершена!
echo.
echo Для запуска используйте: npm start
echo.

pause
