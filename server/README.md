# 北商登入匯入（王鵬瑋）

為什麼要有後端：瀏覽器的網頁不能直接連到 `ntcbadm1.ntub.edu.tw` 去登入（跨網域會被 CORS 擋），所以由本機的 Node 伺服器代替瀏覽器登入、抓課表，再把整理好的 JSON 交給前端。

## 怎麼跑

**最簡單：雙擊**
- Mac：雙擊專案裡的 `start.command`（第一次如果跳出「無法打開」，按右鍵 → 打開）
- Windows：雙擊 `start.bat`

第一次會自動 `npm install`，之後會開伺服器並自動打開瀏覽器到匯入頁。要關掉就把那個黑色視窗關掉（或按 Ctrl + C）。

**用終端機**

```bash
npm install        # 第一次要裝：驗證碼辨識（tesseract.js + 字庫 + jimp）
npm start          # 開伺服器並自動打開瀏覽器 → http://localhost:3000/#login
npm run serve      # 只開伺服器，不開瀏覽器
npm run mock       # 假資料模式：不連學校，驗證碼固定是 7K3P
npm test           # 測試課表解析
npm run probe      # 看程式從學校登入頁偵測到哪些欄位（除錯用）
npm run captcha    # 測驗證碼辨識在北商真實驗證碼上的正確率（不需要帳密）
```

已經開著再雙擊一次也沒關係，會直接打開瀏覽器，不會報錯。伺服器只接受這台電腦自己連（127.0.0.1），區網裡其他人連不到。

### 為什麼一定要開伺服器

瀏覽器有安全規則：網頁不能讀別的網站的內容，除非那個網站同意（CORS）。北商系統沒有同意，所以網頁本身連驗證碼圖片都讀不到，只能靠伺服器在中間代為登入。想完全不用開，就要把伺服器放到雲端，或改用「書籤小工具」讓使用者自己在學校網站登入。

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

### 北商登入頁的特殊做法（已照實際原始碼處理）

- 驗證碼欄 `CheckCode` **沒有 name**，不跟表單一起送。前端原本是先用 AJAX 打 `/HttpRequest/Login.ashx`（`CheckCode=…&Model=Check_Code_TF`）檢查驗證碼，答對才去按隱藏的 `loginbtn` 送出表單。伺服器照同樣順序做：
  1. `GET login.aspx` → 拿 `__VIEWSTATE` 等隱藏欄位
  2. `GET /HttpRequest/MakeCheckCodePIC.ashx` → 驗證碼圖片（同時建立 session cookie）
  3. `POST /HttpRequest/Login.ashx` → 回應裡有 `loginbtn` 才算驗證碼正確，否則取 alert 的訊息
  4. `POST login.aspx`：隱藏欄位 + `Type=0`（身分別：學生）+ `UserID` + `PWD` + `loginbtn`
  5. 成功會轉到 `Portal/indexSTD.aspx`，再進 `Portal/Main_total.aspx?SysID=STDWEB` → `STDWEB/Sel_Student.aspx`
- 密碼最多 20 個字元（學校限制）

## 密碼

- 密碼只出現在 `finishLogin()` 那一次 POST，不存進 session、不寫 log
- 抓完課表就把 session（含學校的登入 cookie）刪掉
- 之後要部署到網路上，一定要走 HTTPS

## 偵測不到欄位時

程式會自動從登入頁找「密碼欄、學號欄、驗證碼欄、驗證碼圖片、登入按鈕」。如果 `npm run probe` 顯示的名稱不對，把 `ntub.config.example.json` 複製成 `ntub.config.json`，填上正確的 `name`（打開登入頁按右鍵「檢查」就看得到）。

## 驗證碼辨識

1. 抓驗證碼圖片 → 用 jimp 前處理成 3 個版本（放大 3 倍、灰階、黑白二值化、去雜點）
2. 每個版本給 tesseract.js 認，挑「多個版本都認出一樣」或信心最高的答案
3. **先問學校這個驗證碼對不對**（Login.ashx，學校網頁本來就會先做這一步，不需要帳密）
4. 不對就自動換一張再試，最多 5 次；都不對才請使用者自己輸入

所以畫面上會顯示：
- ✓「已自動辨識，並向學校確認正確」→ 直接按登入就好
- ⚠「自動辨識失敗（試了 5 張都不對）」→ 看圖自己打
- 「沒有安裝自動辨識」→ 執行 `npm install`

字庫用 npm 套件 `@tesseract.js-data/eng` 內附的，不用連網下載，也不會再在專案根目錄產生 `eng.traineddata`。

### 想讓辨識更準

```bash
npm run captcha -- 30                       # 測 30 張，看單張正確率
NTUB_SAVE_CAPTCHA=1 npm run captcha -- 50   # 順便把圖存到 server/captcha-samples/（檔名＝正確答案）
CAPTCHA_LEN=4 CAPTCHA_CHARS=0123456789 npm start   # 確定驗證碼都是 4 碼數字的話，限定之後會更準
CAPTCHA_TRIES=8 npm start                   # 自動重試次數（預設 5，最多 8）
```
