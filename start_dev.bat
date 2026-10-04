@echo off
@rem chcp 65001 >nul
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
    echo [X] 未检测到 Node.js,请先安装 Node 22+ :https://nodejs.org
    pause & exit /b 1
)
for /f "tokens=*" %%v in ('node -v') do echo [OK] Node 版本:%%v

REM 2) 定位 wrangler (全局 → 本地 node_modules → npm install)
set "WRANGLER="
where wrangler >nul 2>nul
if not errorlevel 1 set "WRANGLER=wrangler"
if not defined WRANGLER if exist node_modules\.bin\wrangler.cmd set "WRANGLER=.\node_modules\.bin\wrangler.cmd"
if not defined WRANGLER (
    echo [!] 未检测到 wrangler,正在 npm install ...
    call npm install
    if errorlevel 1 (
        echo [X] npm install 失败,可先运行 install.bat
        pause & exit /b 1
    )
    set "WRANGLER=.\node_modules\.bin\wrangler.cmd"
)

REM 3) 检查本地 D1 是否已初始化
if not exist .wrangler\state\v3\d1 (
    echo [!] 本地 D1 未初始化,自动执行 schema.sql ...
    call "%~dp0db-init.bat" silent
)

echo.
echo [OK] 启动 wrangler dev (Ctrl+C 退出)
echo ------------------------------------------
echo   后台: http://localhost:8787/admin/login
echo   默认账号/密码: admin / admin
echo ------------------------------------------
echo.

wrangler dev --local --ip 0.0.0.0 --port 8787

pause
