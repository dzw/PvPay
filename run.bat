@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

REM ============================================================
REM PvPay 一键菜单
REM ============================================================

cd /d "%~dp0"

:MENU
cls
echo ============================================
echo   PvPay - Cloudflare Workers V免签
echo ============================================
echo.
echo   [1] 安装依赖 (install.bat)
echo   [2] 初始化本地 D1 (db-init.bat)
echo   [3] 启动本地开发服务器 (dev.bat)
echo   [4] 跑本地测试 (test.bat)
echo   [5] 部署到 Cloudflare (deploy.bat)
echo   [6] 重置本地 D1 + 重启服务
echo   [0] 退出
echo.
set /p "CHOICE=请选择 [0-6]: "

if "%CHOICE%"=="1" call "%~dp0install.bat"
if "%CHOICE%"=="2" call "%~dp0db-init.bat"
if "%CHOICE%"=="3" call "%~dp0dev.bat"
if "%CHOICE%"=="4" call "%~dp0test.bat"
if "%CHOICE%"=="5" call "%~dp0deploy.bat"
if "%CHOICE%"=="6" (
    echo.
    echo [!] 删除 .wrangler\state\v3\d1 ...
    if exist .wrangler\state\v3\d1 rd /s /q .wrangler\state\v3\d1
    call "%~dp0db-init.bat"
    call "%~dp0dev.bat"
)
if "%CHOICE%"=="0" exit /b 0

echo.
pause
goto MENU