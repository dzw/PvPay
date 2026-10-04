@echo off
chcp 65001 >nul
setlocal

REM ============================================================
REM PvPay 本地开发服务器 (wrangler dev)
REM - 使用本地 D1 SQLite,无需联网/登录 Cloudflare
REM - 默认监听 http://localhost:8787
REM - Ctrl+C 退出
REM ============================================================

cd /d "%~dp0"

echo ============================================
echo   PvPay 本地开发服务器
echo ============================================
echo.

REM 1) 检查 Node
where node >nul 2>nul
if errorlevel 1 (
    echo [X] 未检测到 Node.js,请先安装 Node 18+ :https://nodejs.org
    pause & exit /b 1
)
for /f "tokens=*" %%v in ('node -v') do echo [OK] Node 版本:%%v

REM 2) 检查 wrangler
where wrangler >nul 2>nul
if errorlevel 1 (
    echo [!] 未检测到 wrangler,正在尝试 npx 调用本地依赖...
    if not exist node_modules\wrangler (
        echo [!] 正在安装 wrangler...
        call npm install
        if errorlevel 1 (
            echo [X] npm install 失败,请手动执行 npm install -g wrangler
            pause & exit /b 1
        )
    )
    set "WRANGLER=.\node_modules\.bin\wrangler.cmd"
) else (
    for /f "tokens=*" %%v in ('wrangler --version 2^>nul') do echo [OK] wrangler 版本:%%v
    set "WRANGLER=wrangler"
)

REM 3) 检查本地 D1 schema 是否已初始化
if not exist .wrangler\state\v3\d1 (
    echo [!] 检测到本地 D1 未初始化,自动执行 schema...
    call "%~dp0db-init.bat" silent
)

echo.
echo [OK] 启动 wrangler dev (Ctrl+C 退出)
echo ------------------------------------------
echo   后台:http://localhost:8787/admin/login
echo   默认账号/密码:admin / admin
echo ------------------------------------------
echo.

%WRANGLER% dev --local --ip 127.0.0.1 --port 8787

pause