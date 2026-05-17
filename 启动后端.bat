@echo off
cd /d "%~dp0backend"
set NODE_ENV=development
echo ========================
echo 收租系统 - 启动后端
echo ========================
node server.js
pause
