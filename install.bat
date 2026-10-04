@echo off
chcp 65001 >nul
setlocal

REM ============================================================
REM 安装 wrangler (Cloudflare Workers CLI)
REM - 全局 npm i -g wrangler
REM - 安装后验证版本
REM ============================================================

cd /d "%~dp0"

echo ============================================
echo   安装 wrangler (Cloudflare Workers CLI)
echo ============================================
echo.

where node >nul 2>nul
if errorlevel 1 (
    echo [X] 未检测到 Node.js,请先安装 Node 18+ :https://nodejs.org
    pause & exit /b 1
)
for /f "tokens=*" %%v in ('node -v') do echo [OK] Node 版本:%%v
echo.

echo [1/3] 全局安装 wrangler ...
call npm install -g wrangler
if errorlevel 1 (
    echo [X] 安装失败,可尝试:管理员身份运行,或: npm install -g wrangler --registry=https://registry.npmmirror.com
    pause & exit /b 1
)

echo.
echo [2/3] 安装本项目开发依赖 ...
call npm install
if errorlevel 1 goto :err

echo.
echo [3/3] 验证 wrangler 版本 ...
where wrangler >nul 2>nul
if errorlevel 1 (
    echo [X] wrangler 不在 PATH 中,请重启 cmd 或检查 npm 全局目录
    pause & exit /b 1
)
for /f "tokens=*" %%v in ('wrangler --version') do echo [OK] wrangler 版本:%%v

echo.
echo [DONE] 安装完成。下一步:
echo   dev.bat          启动本地开发服务器
echo   db-init.bat      初始化本地 D1 数据库

pause & exit /b 0

:err
echo [X] 出错了,请检查上面的错误信息
pause & exit /b 1