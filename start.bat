@echo off
chcp 65001 >nul
REM Windows：雙擊這個檔案就會開啟課表網站（第一次會自動安裝套件）
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo 找不到 Node.js，請先到 https://nodejs.org 下載安裝（選 LTS 版本），裝完再雙擊一次。
  pause
  exit /b 1
)
if not exist node_modules (
  echo 第一次使用，正在安裝套件（約 1 分鐘）...
  call npm install --no-audit --no-fund
  if errorlevel 1 ( pause & exit /b 1 )
)
node server\server.js --open
pause
