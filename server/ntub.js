'use strict';
/**
 * 北商校務系統（ntcbadm1.ntub.edu.tw）登入 + 抓課表。
 *
 * 流程：
 *   1. startLogin()   開一個 session：GET login.aspx 拿 cookie 和表單欄位，再抓驗證碼圖片
 *   2. finishLogin()  用使用者輸入的 學號 / 密碼 / 驗證碼 POST 回去
 *   3. fetchSchedule() 帶著同一組 cookie 打 STDWEB/Sel_Student.aspx，解析課表
 *
 * 密碼只在 finishLogin() 這一次 POST 用到，不寫進 session、不寫 log。
 */
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { parseSchedule } = require('./parse');
const { recognize } = require('./ocr');

const BASE = 'https://ntcbadm1.ntub.edu.tw/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36';
const SESSION_TTL = 5 * 60 * 1000;

// 自動偵測不準時，可以在 server/ntub.config.json 直接指定欄位名稱（見 README）
let CONFIG = {};
try { CONFIG = JSON.parse(fs.readFileSync(path.join(__dirname, 'ntub.config.json'), 'utf8')); } catch { /* 沒有就用自動偵測 */ }

class LoginError extends Error {
  constructor(message, code = 'LOGIN_FAILED') { super(message); this.code = code; }
}

/* ---------- cookie ---------- */
class Jar {
  constructor() { this.map = new Map(); }
  take(res) {
    const list = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
    for (const sc of list) {
      const kv = sc.split(';')[0];
      const i = kv.indexOf('=');
      if (i < 0) continue;
      const k = kv.slice(0, i).trim(), v = kv.slice(i + 1).trim();
      if (v === '' || /expires=Thu, 01[- ]Jan[- ]1970/i.test(sc)) this.map.delete(k); else this.map.set(k, v);
    }
  }
  header() { return [...this.map].map(([k, v]) => `${k}=${v}`).join('; '); }
}

/* ---------- HTTP（自己處理轉址，才能每一步都存 cookie） ---------- */
async function request(jar, url, { method = 'GET', form, referer } = {}) {
  let u = new URL(url, BASE).href, m = method, body = form ? new URLSearchParams(form).toString() : undefined;
  const hops = [];
  for (let i = 0; i < 6; i++) {
    const headers = { 'user-agent': UA, accept: 'text/html,image/*,*/*' };
    const ck = jar.header(); if (ck) headers.cookie = ck;
    if (referer) headers.referer = referer;
    if (body) headers['content-type'] = 'application/x-www-form-urlencoded';
    const res = await fetch(u, { method: m, headers, body, redirect: 'manual', signal: AbortSignal.timeout(15000) });
    jar.take(res);
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      hops.push(u);
      referer = u;
      u = new URL(res.headers.get('location'), u).href;
      m = 'GET'; body = undefined;
      continue;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    return { status: res.status, url: u, hops, buf, type: res.headers.get('content-type') || '', text: () => decodeHtml(buf, res.headers.get('content-type')) };
  }
  throw new Error('轉址太多次');
}

function decodeHtml(buf, contentType = '') {
  let cs = (contentType.match(/charset=([\w-]+)/i) || [])[1];
  if (!cs) cs = (buf.subarray(0, 2048).toString('latin1').match(/charset=["']?([\w-]+)/i) || [])[1];
  try { return new TextDecoder(cs || 'utf-8').decode(buf); } catch { return new TextDecoder('utf-8').decode(buf); }
}

/* ---------- 解析登入表單 ---------- */
const attrs = tag => Object.fromEntries([...tag.matchAll(/([\w:$.-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/g)]
  .map(m => [m[1].toLowerCase(), m[3] ?? m[4] ?? m[5] ?? '']));

function readForm(html) {
  const f = html.match(/<form\b[^>]*>[\s\S]*?<\/form>/i);
  if (!f) throw new Error('登入頁找不到 <form>');
  const formTag = attrs(f[0].match(/<form\b[^>]*>/i)[0]);
  const inputs = [...f[0].matchAll(/<input\b[^>]*>/gi)].map(m => attrs(m[0])).filter(a => a.name);
  const imgs = [...f[0].matchAll(/<img\b[^>]*>/gi)].map(m => attrs(m[0]));
  const typeOf = a => (a.type || 'text').toLowerCase();

  const captchaRe = /code|check|valid|captcha|verif|vcode|rand|驗證/i;
  const textish = inputs.filter(a => ['text', 'tel', 'number', 'email', ''].includes(typeOf(a)));
  const password = CONFIG.passwordField || (inputs.find(a => typeOf(a) === 'password') || {}).name;
  const captcha = CONFIG.captchaField || (textish.find(a => captchaRe.test(a.name + ' ' + (a.id || ''))) || {}).name;
  const account = CONFIG.accountField || (textish.find(a => a.name !== captcha) || {}).name;
  const submit = CONFIG.submitField
    ? inputs.find(a => a.name === CONFIG.submitField)
    : inputs.find(a => ['submit', 'image'].includes(typeOf(a)) && !/clear|reset|清除|忘記/i.test(a.value || a.name));
  const img = CONFIG.captchaImage
    ? { src: CONFIG.captchaImage }
    : imgs.find(a => captchaRe.test(a.src || '') || /\.ashx/i.test(a.src || '') || captchaRe.test(a.id || ''));

  const hidden = {};
  for (const a of inputs) if (typeOf(a) === 'hidden') hidden[a.name] = a.value || '';

  return {
    action: formTag.action || 'login.aspx',
    hidden, account, password, captcha,
    submit: submit ? { name: submit.name, value: submit.value || '', image: typeOf(submit) === 'image' } : null,
    captchaSrc: img && img.src ? decodeEntities(img.src) : null
  };
}
const decodeEntities = s => s.replace(/&amp;/g, '&');

/** 把登入頁偵測結果印出來，用來除錯（npm run probe） */
async function probe() {
  const jar = new Jar();
  const r = await request(jar, 'login.aspx');
  const html = r.text();
  return { status: r.status, url: r.url, cookies: [...jar.map.keys()], form: readForm(html) };
}

/* ---------- session ---------- */
const sessions = new Map();
setInterval(() => {
  const now = Date.now();
  for (const [k, s] of sessions) if (now - s.at > SESSION_TTL) sessions.delete(k);
}, 60000).unref();

async function loadCaptcha(s) {
  if (!s.form.captchaSrc) return { image: null, guess: '' };
  // 加時間參數，避免拿到快取的舊圖
  const u = new URL(s.form.captchaSrc, s.loginUrl);
  u.searchParams.set('_', Date.now());
  const r = await request(s.jar, u.href, { referer: s.loginUrl });
  const mime = /image\/[\w+]+/.exec(r.type) ? /image\/[\w+]+/.exec(r.type)[0] : 'image/png';
  const guess = await recognize(r.buf).catch(() => '');
  return { image: `data:${mime};base64,${r.buf.toString('base64')}`, guess };
}

/** 第 1 步：開 session，回傳驗證碼圖片和 OCR 猜的答案 */
async function startLogin() {
  const jar = new Jar();
  const r = await request(jar, 'login.aspx');
  if (r.status !== 200) throw new Error(`學校登入頁回應 ${r.status}`);
  const form = readForm(r.text());
  if (!form.account || !form.password) throw new Error('認不出登入頁的學號／密碼欄位，請設定 server/ntub.config.json');
  const sid = crypto.randomBytes(16).toString('hex');
  const s = { jar, form, loginUrl: r.url, at: Date.now() };
  sessions.set(sid, s);
  const cap = await loadCaptcha(s);
  return { sid, ...cap, needCaptcha: !!form.captcha };
}

/** 換一張驗證碼（同一個 session） */
async function refreshCaptcha(sid) {
  const s = sessions.get(sid);
  if (!s) throw new LoginError('登入逾時，請重新整理驗證碼', 'EXPIRED');
  // ASP.NET 的 __VIEWSTATE 會跟著頁面變，重抓一次登入頁比較保險
  const r = await request(s.jar, 'login.aspx');
  s.form = readForm(r.text()); s.loginUrl = r.url; s.at = Date.now();
  return { sid, ...(await loadCaptcha(s)) };
}

const alertMsg = html => {
  const m = html.match(/alert\(\s*['"]([^'"]+)['"]\s*\)/);
  return m ? m[1].replace(/\\n/g, ' ').trim() : '';
};

/** 第 2 步：送出登入 */
async function finishLogin(sid, account, password, code) {
  const s = sessions.get(sid);
  if (!s) throw new LoginError('登入逾時，請重新整理驗證碼', 'EXPIRED');
  const f = s.form;
  const body = { ...f.hidden, [f.account]: account, [f.password]: password };
  if (f.captcha) body[f.captcha] = code;
  if (f.submit) {
    if (f.submit.image) { body[f.submit.name + '.x'] = '20'; body[f.submit.name + '.y'] = '10'; }
    else body[f.submit.name] = f.submit.value;
  }
  const r = await request(s.jar, new URL(f.action, s.loginUrl).href, { method: 'POST', form: body, referer: s.loginUrl });
  const html = r.text();
  const stillLogin = /type=["']?password/i.test(html) && /login\.aspx/i.test(r.url);
  if (stillLogin) {
    const msg = alertMsg(html);
    const isCaptcha = /驗證碼|檢查碼|verif|captcha/i.test(msg);
    throw new LoginError(msg || '登入失敗，請確認學號、密碼和驗證碼', isCaptcha ? 'CAPTCHA' : 'LOGIN_FAILED');
  }
  s.loggedIn = true; s.at = Date.now();
  return s;
}

/** 第 3 步：抓課表。year / term 不給就用學校預設的（通常是當學期） */
async function fetchSchedule(s, { year, term } = {}) {
  // 先經過入口頁，讓學校系統建立 STDWEB 的 session
  await request(s.jar, 'Portal/Main_total.aspx?SysID=STDWEB').catch(() => {});
  let r = await request(s.jar, 'STDWEB/Sel_Student.aspx', { referer: BASE + 'Portal/indexSTD.aspx' });
  let html = r.text();
  if (/login\.aspx/i.test(r.url) && !/bgBase/.test(html)) throw new LoginError('登入狀態失效，請重新登入', 'EXPIRED');
  let data = parseSchedule(html);

  if ((year && +year !== data.year) || (term && +term !== data.term)) {
    const hidden = {};
    for (const m of html.matchAll(/<input\b[^>]*type="hidden"[^>]*>/gi)) {
      const a = attrs(m[0]); if (a.name) hidden[a.name] = a.value || '';
    }
    r = await request(s.jar, 'STDWEB/Sel_Student.aspx', {
      method: 'POST', referer: r.url,
      form: { ...hidden, ThisYear: String(year || data.year), ThisTeam: String(term || data.term), doQuery: 'Y', ToExcel: '' }
    });
    html = r.text();
    data = parseSchedule(html);
  }
  return data;
}

function endSession(sid) { sessions.delete(sid); }

module.exports = { startLogin, refreshCaptcha, finishLogin, fetchSchedule, endSession, probe, readForm, LoginError };
