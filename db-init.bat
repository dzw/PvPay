@echo off
chcp 65001 >nul
setlocal

REM ============================================================
REM 初始化本地 D1 数据库 (执行 schema.sql)
REM - 不需要登录 Cloudflare
REM - 用法: db-init.bat           默认初始化本地库
REM        db-init.bat remote    初始化线上库 (需要 wrangler login)
REM        db-init.bat silent    静默模式 (被 dev.bat 自动调用)
REM ============================================================

cd /d "%~dp0"

set "MODE=%~1"
if "%MODE%"=="" set "MODE=local"

if "%MODE%"=="silent" (
    REM 静默模式,不 echo 不 pause
    where wrangler >nul 2>nul
    if errorlevel 1 (
        if exist node_modules\.bin\wrangler.cmd (
            set "WRANGLER=.\node_modules\.bin\wrangler.cmd"
        ) else (
            exit /b 0
        )
    ) else (
        set "WRANGLER=wrangler"
    )
    %WRANGLER% d1 execute pvpay-db --file=./schema.sql >nul 2>&1
    exit /b %errorlevel%
)

echo ============================================
echo   D1 数据库初始化 (模式:%MODE%)
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

if /i "%MODE%"=="remote" (
    echo [!] 即将初始化线上 D1 数据库,需要 wrangler login 已完成
    echo     如果还没登录,先执行 wrangler login
    echo.
    %WRANGLER% d1 execute pvpay-db --file=./schema.sql --remote
) else (
    echo 执行 schema.sql 到本地 D1 ...
    %WRANGLER% d1 execute pvpay-db --file=./schema.sql
)

if errorlevel 1 (
    echo [X] D1 初始化失败
    pause & exit /b 1
)

echo.
echo [DONE] D1 初始化完成

if /i not "%MODE%"=="remote" pause