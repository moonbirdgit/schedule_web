'use strict';
/**
 * 驗證碼辨識。
 * 有裝 tesseract.js 就自動辨識；沒裝就回傳空字串，前端讓使用者自己輸入。
 * 安裝：npm install tesseract.js（第一次辨識會下載英文字庫，約 10 MB）
 */
let workerPromise = null;

async function getWorker() {
  let Tesseract;
  try { Tesseract = require('tesseract.js'); } catch { return null; }
  if (!workerPromise) {
    workerPromise = (async () => {
      const w = await Tesseract.createWorker('eng');
      await w.setParameters({
        tessedit_char_whitelist: process.env.CAPTCHA_CHARS || '0123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz',
        tessedit_pageseg_mode: '7' // 單行文字
      });
      return w;
    })().catch(err => { workerPromise = null; throw err; });
  }
  return workerPromise;
}

/** @param {Buffer} buf 驗證碼圖片 @returns {Promise<string>} */
async function recognize(buf) {
  const w = await getWorker();
  if (!w) return '';
  const { data } = await w.recognize(buf);
  const text = (data.text || '').replace(/[^0-9A-Za-z]/g, '');
  const len = +(process.env.CAPTCHA_LEN || 0);
  if (len && text.length !== len) return '';
  return text.length >= 3 && text.length <= 8 ? text : '';
}

module.exports = { recognize };
