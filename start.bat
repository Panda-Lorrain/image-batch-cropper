@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo [错误] 未检测到 Node.js,请先安装 Node.js (https://nodejs.org)
  pause
  exit /b 1
)
start "" http://127.0.0.1:5173
node server.js
pause
