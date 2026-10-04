@echo off
chcp 65001 >nul
setlocal

REM ============================================================
REM 部署到 Cloudflare (wrangler deploy)
REM 前置条件:
REM   1) wrangler login 已完成
REM   2) wrangler.toml 中 database_id 已填写真实值
REM ============================================================

cd /d "%~dp0"

echo ============================================
echo   部署到 Cloudflare
echo ============================================
echo.

where wrangler >nul 2>nul
if errorlevel 1 (
    if exist node_modules\.bin\wrangler.cmd (
        set "WRANGLER=.\node_modules\.bin\wrangler.cmd"
    ) else (
        echo [X] 未检测到 wrangler,请先运行 install.bat
        pause & exit /b 1
    )
) else (
    set "WRANGLER=wrangler"
)

REM 检查 wrangler.toml 中是否还有占位符
findstr /c:"REPLACE_WITH_YOUR_D1_ID" wrangler.toml >nul 2>nul
if not errorlevel 1 (
    echo [X] wrangler.toml 中 database_id 还是占位符!
    echo     请先用 wrangler d1 create pvpay-db 获取 ID,然后填到 wrangler.toml
    pause & exit /b 1
)

echo [!] 确认已 wrangler login ? (y/n)
set /p "CONFIRM="
if /i not "%CONFIRM%"=="y" (
    echo 已取消
    pause & exit /b 0
)

echo.
echo [1/2] 初始化线上 D1 ...
%WRANGLER% d1 execute pvpay-db --file=./schema.sql --remote
if errorlevel 1 (
    echo [X] 线上 D1 初始化失败
    pause & exit /b 1
)

echo.
echo [2/2] 部署 Worker ...
%WRANGLER% deploy
if errorlevel 1 goto :fail

echo.
echo [DONE] 部署完成!Worker URL 已在上面日志中打印
pause & exit /b 0

:fail
echo [X] 部署失败
pause & exit /b 1