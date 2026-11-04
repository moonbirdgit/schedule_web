'use strict';
/**
 * 本機伺服器：
 *   - 提供網站檔案（index.html、script.js…）
 *   - /api/ntub/*  幫瀏覽器代登北商校務系統（瀏覽器直接連會被 CORS 擋）
 *
 * 啟動：npm start → http://localhost:3000
 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const ntub = require('./ntub');
const { toAppCourses } = require('./parse');

const PORT = +process.env.PORT || 3000;
// NTUB_MOCK=1：不連學校，用 test/ 裡的假課表（沒有北商帳號的組員可以用這個測畫面）
const MOCK = process.env.NTUB_MOCK === '1';
const MOCK_CAPTCHA = 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="42"><rect width="120" height="42" fill="#eef1f6"/><text x="16" y="29" font-family="monospace" font-size="22" font-weight="700" letter-spacing="6" fill="#3a4357">7K3P</text></svg>').toString('base64');
const ROOT = path.resolve(__dirname, '..');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webp': 'image/webp' };

// 允許 Live Server（127.0.0.1:5500）之類的本機頁面呼叫 API
const allowOrigin = o => /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o || '');

function send(res, status, data, origin) {
  const headers = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
  if (allowOrigin(origin)) { headers['access-control-allow-origin'] = origin; headers.vary = 'Origin'; }
  res.writeHead(status, headers);
  res.end(JSON.stringify(data));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > 1e5) { reject(new Error('太大')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString() || '{}')); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

async function api(req, res, url) {
  const origin = req.headers.origin;
  if (req.method === 'OPTIONS') {
    res.writeHead(204, allowOrigin(origin) ? {
      'access-control-allow-origin': origin, 'access-control-allow-methods': 'GET, POST',
      'access-control-allow-headers': 'content-type', vary: 'Origin' } : {});
    return res.end();
  }
  try {
    if (MOCK && url.pathname === '/api/ntub/captcha') return send(res, 200, { sid: 'mock', image: MOCK_CAPTCHA, guess: '7K3P', needCaptcha: true }, origin);
    if (MOCK && url.pathname === '/api/ntub/import' && req.method === 'POST') {
      const { captcha } = await readJson(req);
      if (String(captcha).toUpperCase() !== '7K3P') throw new ntub.LoginError('驗證碼錯誤（假資料模式的驗證碼是 7K3P）', 'CAPTCHA');
      const semester = require('./parse').parseSchedule(fs.readFileSync(path.join(__dirname, 'test', 'fixture_sel_student.html'), 'utf8'));
      return send(res, 200, { semester, courses: toAppCourses(semester) }, origin);
    }
    if (url.pathname === '/api/ntub/captcha' && req.method === 'GET') {
      const sid = url.searchParams.get('sid');
      return send(res, 200, sid ? await ntub.refreshCaptcha(sid) : await ntub.startLogin(), origin);
    }
    if (url.pathname === '/api/ntub/import' && req.method === 'POST') {
      const { sid, account, password, captcha, year, term } = await readJson(req);
      if (!sid || !account || !password) return send(res, 400, { error: '請輸入學號和密碼', code: 'BAD_REQUEST' }, origin);
      const s = await ntub.finishLogin(sid, String(account).trim(), String(password), String(captcha || '').trim());
      try {
        const semester = await ntub.fetchSchedule(s, { year, term });
        return send(res, 200, { semester, courses: toAppCourses(semester) }, origin);
      } finally {
        ntub.endSession(sid); // 抓完就丟掉，學校的登入 cookie 不留在伺服器
      }
    }
    return send(res, 404, { error: '沒有這個 API' }, origin);
  } catch (err) {
    const known = err instanceof ntub.LoginError;
    if (!known) console.error('[ntub]', err.message); // 只印錯誤訊息，不印請求內容（裡面有密碼）
    return send(res, known ? 401 : 502, { error: known ? err.message : `連線學校系統失敗：${err.message}`, code: err.code || 'UPSTREAM' }, origin);
  }
}

function serveStatic(req, res, url) {
  let p = decodeURIComponent(url.pathname);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.resolve(ROOT, '.' + p);
  const rel = path.relative(ROOT, file);
  // 不提供 server/、node_modules/、.git 之類的檔案
  if (rel.startsWith('..') || /^(server|node_modules)([\\/]|$)/.test(rel) || rel.split(path.sep).some(s => s.startsWith('.'))) {
    res.writeHead(404); return res.end('Not found');
  }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(buf);
  });
}

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/api/')) return api(req, res, url);
  serveStatic(req, res, url);
}).listen(PORT, () => console.log(`課表網站：http://localhost:${PORT}${MOCK ? '（假資料模式）' : ''}`));
