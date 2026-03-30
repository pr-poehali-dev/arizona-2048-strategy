@echo off
chcp 65001 >nul
echo ================================================
echo   2048 BOT — Установка зависимостей
echo ================================================
echo.

python --version >nul 2>&1
if errorlevel 1 (
    echo [ОШИБКА] Python не найден!
    echo Скачай и установи Python с https://python.org
    echo При установке обязательно отметь "Add Python to PATH"
    pause
    exit /b 1
)

echo [OK] Python найден
echo.
echo Устанавливаю зависимости...
echo.

pip install opencv-python pyautogui mss pillow numpy

echo.
echo ================================================
echo   Установка завершена!
echo   Запусти run.bat для старта бота
echo ================================================
pause
