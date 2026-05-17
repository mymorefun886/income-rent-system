@echo off
cd /d "%~dp0frontend"
echo ========================
echo 收租系统 - 启动前端
echo ========================
echo.
echo 启动后打开浏览器访问: http://localhost:8080
echo.
npx --yes serve -l 8080
pause
