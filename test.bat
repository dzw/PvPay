@echo off
chcp 65001 >nul
setlocal

REM ============================================================
REM 跑核心 API 测试 (tests/test_api.mjs)
REM - 不需要 wrangler / 联网
REM - 仅需 Node 18+ (Node 22+ 自带 node:sqlite,推荐)
REM ============================================================

cd /d "%~dp0"

echo ============================================
echo   PvPay 本地测试
echo ============================================
echo.

where node >nul 2>nul
if errorlevel 1 (
    echo [X] 未检测到 Node.js
    pause & exit /b 1
)
for /f "tokens=*" %%v in ('node -v') do echo [OK] Node 版本:%%v

REM 检查 Node 版本 >=22 才支持 node:sqlite
for /f "tokens=2 delims=v." %%m in ('node -v') do (
    if %%m lss 22 (
        echo [!] 建议 Node 22+ (当前 %%m),node:sqlite 不可用会报错
    )
)

echo.
echo [1/2] MD5 自测 (9 条 PHP md5 比对) ...
echo.
node tests\test_md5.mjs
if errorlevel 1 goto :fail

echo.
echo [2/2] 核心 API 端到端 (30 个) ...
echo.
node tests\test_api.mjs
if errorlevel 1 goto :fail

echo.
echo [DONE] 全部通过
pause & exit /b 0

:fail
echo.
echo [X] 测试有失败用例
pause & exit /b 1