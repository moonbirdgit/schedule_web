'use strict';
/**
 * 驗證碼辨識。
 *
 * 做法：
 *   1. 用 jimp 把圖片前處理成幾個版本（放大、灰階、去雜點、黑白二值化）
 *   2. 每個版本都丟給 tesseract.js 認一次
 *   3. 挑「長度合理、信心分數最高」的答案
 *
 * 兩個套件都是選用的：
 *   - 沒裝 tesseract.js → 不辨識，前端請使用者自己輸入
 *   - 沒裝 jimp        → 直接拿原圖辨識（比較不準）
 *
 * 字庫用 npm 套件 @tesseract.js-data/eng 內附的，不用連網下載；
 * 萬一沒裝，tesseract 才會自己下載到 server/.cache/（不會再出現在專案根目錄）。
 */
const path = require('node:path');

const CACHE = path.join(__dirname, '.cache');
const CHARS = process.env.CAPTCHA_CHARS || '0123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz';
const LEN = +(process.env.CAPTCHA_LEN || 0); // 0 = 不限定，接受 3–8 碼

let Tesseract = null, Jimp = null;
try { Tesseract = require('tesseract.js'); } catch { /* 沒裝 */ }
try { Jimp = require('jimp'); } catch { /* 沒裝 */ }

let workerPromise = null;
function getWorker() {
  if (!Tesseract) return null;
  if (!workerPromise) {
    workerPromise = (async () => {
      const opts = { cachePath: CACHE, logger: () => {}, errorHandler: () => {} }; // errorHandler：辨識出錯時不要讓整個伺服器當掉
      // 優先用 npm 裝好的字庫（@tesseract.js-data/eng），不用每次從網路下載，離線也能用
      try {
        opts.langPath = path.join(path.dirname(require.resolve('@tesseract.js-data/eng/package.json')), '4.0.0_best_int');
        opts.gzip = true;
      } catch { /* 沒裝就讓 tesseract 自己下載到 server/.cache/ */ }
      const w = await Tesseract.createWorker('eng', 1, opts);
      await w.setParameters({ tessedit_char_whitelist: CHARS, tessedit_pageseg_mode: '7' });
      return w;
    })().catch(err => { workerPromise = null; throw err; });
  }
  return workerPromise;
}

/** 辨識是否可用（給前端顯示用） */
const status = () => ({ ocr: !!Tesseract, preprocess: !!Jimp });

/* ---------- 前處理 ---------- */

/** Otsu 法自動找黑白分界 */
function otsu(hist, total) {
  let sum = 0; for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0, wB = 0, best = 0, th = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t]; if (!wB) continue;
    const wF = total - wB; if (!wF) break;
    sumB += t * hist[t];
    const mB = sumB / wB, mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) ** 2;
    if (between > best) { best = between; th = t; }
  }
  return th;
}

/** 二值化 + 去掉孤立的雜點，回傳新圖 */
function binarize(img, offset = 0) {
  const { width: w, height: h, data } = img.bitmap;
  const hist = new Array(256).fill(0);
  for (let i = 0; i < data.length; i += 4) hist[data[i]]++;
  const th = otsu(hist, w * h) + offset;
  const out = img.clone();
  const d = out.bitmap.data;
  for (let i = 0; i < d.length; i += 4) { const v = d[i] <= th ? 0 : 255; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; }
  // 一個黑點周圍 8 格黑點少於 2 個 → 當成雜點清掉
  const src = Buffer.from(d);
  const dark = (x, y) => x >= 0 && y >= 0 && x < w && y < h && src[(y * w + x) * 4] === 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!dark(x, y)) continue;
    let n = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && dark(x + dx, y + dy)) n++;
    if (n < 2) { const i = (y * w + x) * 4; d[i] = d[i + 1] = d[i + 2] = 255; }
  }
  return out;
}

async function variants(buf) {
  if (!Jimp) return [buf];
  const img = await Jimp.read(buf);
  // 放大 3 倍：tesseract 對小字很不準，驗證碼通常只有 20 多 px 高
  const base = img.clone().greyscale().normalize().scale(3, Jimp.RESIZE_BICUBIC);
  const soft = base.clone().blur(1);
  const png = i => i.getBufferAsync(Jimp.MIME_PNG);
  return Promise.all([
    png(binarize(soft)),            // 黑白 + 去雜點（通常最準）
    png(binarize(soft, -25)),       // 門檻低一點：字比較細的時候
    png(base.clone().contrast(0.5)) // 只加強對比，不二值化
  ]);
}

/* ---------- 辨識 ---------- */

const clean = s => (s || '').replace(/[^0-9A-Za-z]/g, '');
const okLength = t => (LEN ? t.length === LEN : t.length >= 3 && t.length <= 8);

/**
 * @param {Buffer} buf 驗證碼圖片（png / jpg / gif / bmp）
 * @returns {Promise<{text:string, confidence:number}>} 認不出來時 text 為空字串
 */
async function recognize(buf) {
  const worker = await getWorker();
  if (!worker) return { text: '', confidence: 0 };
  let imgs;
  try { imgs = await variants(buf); } catch { imgs = [buf]; }

  const votes = new Map(); // 不同版本認出同一個答案 → 加分
  for (const im of imgs) {
    try {
      const { data } = await worker.recognize(im);
      const text = clean(data.text);
      if (!okLength(text)) continue;
      const v = votes.get(text) || { text, confidence: 0, n: 0 };
      v.n++; v.confidence = Math.max(v.confidence, data.confidence || 0);
      votes.set(text, v);
    } catch { /* 這個版本失敗就換下一個 */ }
  }
  const best = [...votes.values()].sort((a, b) => b.n - a.n || b.confidence - a.confidence)[0];
  return best ? { text: best.text, confidence: Math.round(best.confidence) } : { text: '', confidence: 0 };
}

module.exports = { recognize, status, binarize, otsu };
