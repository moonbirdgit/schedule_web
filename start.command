#!/bin/bash
# Mac：雙擊這個檔案就會開啟課表網站（第一次會自動安裝套件）
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo "找不到 Node.js，請先到 https://nodejs.org 下載安裝（選 LTS 版本），裝完再雙擊一次。"
  read -r -p "按 Enter 關閉…" _; exit 1
fi
if [ ! -d node_modules ]; then
  echo "第一次使用，正在安裝套件（約 1 分鐘）…"
  npm install --no-audit --no-fund || { read -r -p "安裝失敗，按 Enter 關閉…" _; exit 1; }
fi
node server/server.js --open
