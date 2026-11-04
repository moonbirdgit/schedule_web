'use strict';
/**
 * 測驗證碼辨識在「真的北商驗證碼」上準不準。
 *   npm run captcha            測 20 張
 *   npm run captcha -- 50      測 50 張
 *   NTUB_SAVE_CAPTCHA=1 npm run captcha   順便把圖存到 server/captcha-samples/（檔名＝正確答案，x 開頭＝認錯）
 *
 * 只抓驗證碼圖片、問學校答案對不對，不會用到任何帳號密碼。
 * 每張之間會停一下，避免對學校系統送太多請求。
 */
const ntub = require('./ntub');
const { recognize } = require('./ocr');

const N = Math.max(1, Math.min(100, +process.argv[2] || 20));
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  if (!ntub.ocrStatus().ocr) { console.log('沒有安裝 tesseract.js，請先 npm install'); process.exit(1); }
  let ok = 0, empty = 0, ms = 0;
  for (let i = 1; i <= N; i++) {
    const jar = new ntub.Jar();
    const r = await ntub.request(jar, 'login.aspx');
    const s = { jar, form: ntub.readForm(r.text()), loginUrl: r.url };
    const cap = await ntub.fetchCaptcha(s);
    const t0 = Date.now();
    const { text, confidence } = await recognize(cap.buf);
    ms += Date.now() - t0;
    let right = false;
    if (text) right = (await ntub.checkCaptcha(s, text)).ok; else empty++;
    if (right) ok++;
    console.log(`${String(i).padStart(3)}  ${(text || '（認不出來）').padEnd(10)} 信心 ${String(confidence).padStart(3)}  ${right ? '✓' : '✗'}`);
    await sleep(400);
  }
  const p = ok / N;
  const tries = +(process.env.CAPTCHA_TRIES || 5);
  console.log(`\n單張正確率 ${(p * 100).toFixed(0)}%（${ok}/${N}），認不出來 ${empty} 張，平均 ${Math.round(ms / N)} ms`);
  console.log(`自動重試 ${tries} 次內成功的機率約 ${((1 - (1 - p) ** tries) * 100).toFixed(0)}%`);
  process.exit(0);
})().catch(e => { console.error('失敗：', e.message); process.exit(1); });
