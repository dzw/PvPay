@echo off
@rem chcp 65001 >nul
setlocal

REM ============================================================
REM PvPay 本地测试 (与 npm test 一致,4 个测试文件)
REM - 不需要 wrangler / 联网
REM - 需要 Node 22+ (node:sqlite)
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
echo [1/5] MD5 自测 (9 条 PHP md5 比对) ...
node tests\test_md5.mjs
if errorlevel 1 goto :fail

echo.
echo [2/5] 核心 API 端到端 ...
node tests\test_api.mjs
if errorlevel 1 goto :fail

echo.
echo [3/5] altmanlib v1 HMAC JSON 协议 ...
node tests\test_api_v1.mjs
if errorlevel 1 goto :fail

echo.
echo [4/5] v2 HMAC-SHA256 监控端签名 ...
node tests\test_sign_v2.mjs
if errorlevel 1 goto :fail

echo.
echo [5/5] 收款日志 pay_log (开关/裁剪) ...
node tests\test_paylog.mjs
if errorlevel 1 goto :fail

echo.
echo [DONE] 全部通过
pause & exit /b 0

:fail
echo.
echo [X] 测试有失败用例
pause & exit /b 1
