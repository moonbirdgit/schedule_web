# 北商登入匯入（王鵬瑋）

為什麼要有後端：瀏覽器的網頁不能直接連到 `ntcbadm1.ntub.edu.tw` 去登入（跨網域會被 CORS 擋），所以由本機的 Node 伺服器代替瀏覽器登入、抓課表，再把整理好的 JSON 交給前端。

## 怎麼跑

```bash
npm install        # 只會裝 tesseract.js（驗證碼辨識用，裝不起來也能跑，只是要自己打驗證碼）
npm start          # http://localhost:3000  ← 連真的學校系統
npm run mock       # 假資料模式：不連學校，驗證碼固定是 7K3P，沒有北商帳號的組員用這個
npm test           # 測試課表解析
npm run probe      # 看程式從學校登入頁偵測到哪些欄位（除錯用）
```

用 Live Server 開 `index.html` 也可以，只要另外開著 `npm start`，前端會自動打 `http://localhost:3000`。

## 流程

```
前端 login.js                    server/server.js                    北商校務系統
 GET /api/ntub/captcha  ───────▶ startLogin()  ── GET login.aspx ──▶ cookie、__VIEWSTATE
                        ◀─────── {sid, image, guess} ◀── GET 驗證碼圖片 + OCR
 POST /api/ntub/import  ───────▶ finishLogin() ── POST login.aspx ─▶ 登入
   {sid, 學號, 密碼, 驗證碼}        fetchSchedule() ─ GET STDWEB/Sel_Student.aspx
                        ◀─────── {semester, courses}   parse.js 解析 bgBase 表格
```

- `semester`：分工圖上訂的統一 JSON（`periods`、`courses[].times[]`，day 1=週一…7=週日）
- `courses`：轉好的 `script.js` 格式（`{id,name,room,teacher,day,s,e,type,credits}`），前端確認後直接寫進 `S.courses`

## 密碼

- 密碼只出現在 `finishLogin()` 那一次 POST，不存進 session、不寫 log
- 抓完課表就把 session（含學校的登入 cookie）刪掉
- 之後要部署到網路上，一定要走 HTTPS

## 偵測不到欄位時

程式會自動從登入頁找「密碼欄、學號欄、驗證碼欄、驗證碼圖片、登入按鈕」。如果 `npm run probe` 顯示的名稱不對，把 `ntub.config.example.json` 複製成 `ntub.config.json`，填上正確的 `name`（打開登入頁按右鍵「檢查」就看得到）。

## 驗證碼辨識

- 有裝 `tesseract.js` 就會自動辨識並填好，使用者可以改
- 驗證碼錯了，前端會自動換一張新的
- 如果知道驗證碼固定幾碼、只有數字，可以設環境變數提高準確度：
  `CAPTCHA_LEN=4 CAPTCHA_CHARS=0123456789 npm start`
