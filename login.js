'use strict';
/* ==========================================================
   北商登入匯入（王鵬瑋）
   需要本機伺服器：npm start，或雙擊 start.command（Mac）/ start.bat（Windows）
   用到 script.js 的：S、save()、renderAll()、show()、esc()、DAYS
   ========================================================== */
(() => {
  // 用伺服器開的頁面（port 3000）就打同一個網址；用 Live Server 開就打 localhost:3000
  const API = location.port === '3000' ? '' : 'http://localhost:3000';
  const ACC_KEY = 'ntub-account';
  const view = document.getElementById('view-login');
  const q = s => view.querySelector(s);

  const ICON = {
    lock: '<path d="M7 11V8a5 5 0 0 1 10 0v3"/><rect x="4" y="11" width="16" height="10" rx="2"/>',
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    eyeOff: '<path d="M3 3l18 18"/><path d="M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.6 6.6C3.9 8.4 2 12 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
    refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    warn: '<path d="M12 3l10 18H2L12 3z"/><path d="M12 10v5M12 18v.01"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    server: '<rect x="3" y="4" width="18" height="7" rx="2"/><rect x="3" y="13" width="18" height="7" rx="2"/><path d="M7 7.5h.01M7 16.5h.01"/>',
    shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z"/><path d="M9 12l2 2 4-4"/>'
  };
  const icon = (n, size = 18) => `<svg aria-hidden="true" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICON[n]}</svg>`;

  view.innerHTML = `
    <div class="lg">
      <section class="lg-intro">
        <p class="lg-eyebrow">從學校匯入</p>
        <h1>學校課表，<br>一鍵搬進來。</h1>
        <p class="lg-sub">用北商校務系統的帳號登入，課名、老師、教室會自動排好，不用一格一格自己打。</p>
        <ol class="lg-steps" id="lgSteps">
          <li class="on"><span>1</span>登入北商校務系統</li>
          <li><span>2</span>抓取課表與教室</li>
          <li><span>3</span>確認後匯入</li>
        </ol>
        <ul class="lg-safe">
          <li>${icon('shield', 16)}密碼只用來登入學校系統，用完就丟，不會存起來</li>
          <li>${icon('lock', 16)}整個過程都在你自己的電腦上執行</li>
        </ul>
      </section>

      <section class="lg-main">
        <div id="lgBanner" class="lg-banner" hidden></div>

        <form id="lgForm" class="lg-form" novalidate>
          <label class="lg-field">學號
            <input id="lgAcc" name="username" autocomplete="username" autocapitalize="off" spellcheck="false" required>
          </label>
          <label class="lg-check"><input type="checkbox" id="lgRemember"> 記住學號</label>

          <div class="lg-field">
            <label for="lgPwd">密碼</label>
            <div class="lg-pwd">
              <input id="lgPwd" name="password" type="password" autocomplete="current-password" maxlength="20" required>
              <button type="button" id="lgEye" class="lg-iconbtn" aria-label="顯示密碼" aria-pressed="false">${icon('eye')}</button>
            </div>
          </div>

          <div class="lg-field" id="lgCapField">
            <label for="lgCap">驗證碼</label>
            <div class="lg-cap">
              <button type="button" id="lgCapImgBtn" class="lg-capimg" aria-label="換一張驗證碼">
                <img id="lgCapImg" alt="驗證碼圖片">
                <span class="lg-capspin" aria-hidden="true"></span>
              </button>
              <input id="lgCap" autocomplete="off" autocapitalize="off" spellcheck="false" inputmode="text">
            </div>
            <p id="lgCapStatus" class="lg-capstatus" data-state="loading" aria-live="polite"></p>
            <div class="lg-capacts">
              <button type="button" class="lg-link" id="lgCapRetry">${icon('refresh', 14)}重新自動辨識</button>
              <button type="button" class="lg-link" id="lgCapManual">換一張，我自己輸入</button>
            </div>
          </div>

          <details class="lg-more">
            <summary>匯入其他學期</summary>
            <div class="lg-more-body">
              <label class="lg-field">學年度<input id="lgYear" inputmode="numeric" placeholder="例如 115"></label>
              <label class="lg-field">學期<select id="lgTerm"><option value="">目前學期</option><option value="1">第一學期</option><option value="2">第二學期</option></select></label>
            </div>
          </details>

          <div id="lgErr" class="lg-alert" role="alert" hidden></div>

          <button class="primary lg-go" id="lgGo"><span class="lg-spin" aria-hidden="true"></span><span id="lgGoText">登入並匯入課表</span></button>
        </form>

        <div id="lgPreview" class="lg-preview" hidden></div>
      </section>
    </div>
    <div id="lgToast" class="lg-toast" role="status" hidden></div>`;

  /* ---------- 小工具 ---------- */
  const store = {
    get: k => { try { return localStorage.getItem(k); } catch { return null; } },
    set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* 無痕模式 */ } }
  };
  const step = n => [...q('#lgSteps').children].forEach((li, i) => { li.className = i < n ? 'done' : i === n ? 'on' : ''; });
  const showErr = (msg, kind = 'error') => {
    const el = q('#lgErr');
    el.hidden = !msg;
    el.dataset.kind = kind;
    el.innerHTML = msg ? `${icon(kind === 'error' ? 'warn' : 'check', 16)}<span>${msg}</span>` : '';
  };
  function toast(msg) {
    const t = document.getElementById('lgToast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, 3200);
  }

  let sid = null, result = null, busy = false, online = null, capReq = 0;

  async function call(path, opts) {
    let r;
    try { r = await fetch(API + path, opts); }
    catch { throw Object.assign(new Error('連不到本機伺服器'), { code: 'NO_SERVER' }); }
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(data.error || `錯誤 ${r.status}`), { code: data.code });
    return data;
  }

  /* ---------- 伺服器狀態 ---------- */
  function banner(kind) {
    const b = q('#lgBanner');
    if (!kind) { b.hidden = true; return; }
    b.hidden = false;
    b.dataset.kind = kind;
    if (kind === 'offline') {
      const isWin = /Win/.test(navigator.platform);
      b.innerHTML = `
        <div class="lg-banner-head">${icon('server')}<b>還沒開本機伺服器</b></div>
        <p>學校系統不讓網頁直接連，要靠你電腦上的小伺服器代為登入。打開它最簡單的方法：</p>
        <ol>
          <li>到專案資料夾，雙擊 <code>${isWin ? 'start.bat' : 'start.command'}</code></li>
          <li>或在終端機執行 <code>npm start</code></li>
        </ol>
        <p class="lg-muted">開好後瀏覽器會自動打開這一頁；如果沒有，按下面的按鈕。</p>
        <button type="button" class="ghost" id="lgReconnect">${icon('refresh', 14)} 重新連線</button>`;
      q('#lgReconnect').onclick = () => boot(true);
    } else if (kind === 'file') {
      b.innerHTML = `<div class="lg-banner-head">${icon('warn')}<b>請用伺服器開這個網頁</b></div>
        <p>你是直接打開 <code>index.html</code> 檔案，這樣沒辦法登入學校。請先開伺服器，再到 <a href="http://localhost:3000/#login">http://localhost:3000</a>。</p>`;
    } else if (kind === 'mock') {
      b.innerHTML = `<div class="lg-banner-head">${icon('check')}<b>假資料模式</b></div><p>不會連到學校，驗證碼是 <code>7K3P</code>，學號密碼隨便填。</p>`;
    }
  }

  async function boot(manualRetry) {
    if (location.protocol === 'file:') { banner('file'); setFormEnabled(false); return; }
    try {
      const st = await call('/api/ntub/status');
      online = true;
      banner(st.mock ? 'mock' : null);
      setFormEnabled(true);
      loadCaptcha('auto');
    } catch {
      online = false;
      banner('offline');
      setFormEnabled(false);
      if (manualRetry) toast('還是連不到，確認伺服器視窗有沒有開著');
    }
  }
  function setFormEnabled(on) {
    q('#lgForm').classList.toggle('disabled', !on);
    q('#lgForm').querySelectorAll('input,button,select').forEach(el => { el.disabled = !on; });
  }

  /* ---------- 驗證碼 ---------- */
  const CAP_TEXT = {
    loading: '自動辨識中…',
    ok: n => `已自動辨識，並向學校確認正確${n > 1 ? `（試了 ${n} 張）` : ''}`,
    unchecked: '已自動辨識，請核對一下圖片',
    failed: n => `自動辨識失敗（試了 ${n} 張都不對），請看圖自己輸入`,
    'no-ocr': '沒有安裝自動辨識，請看圖輸入（執行 npm install 就會開啟）',
    manual: '請看圖輸入驗證碼',
    edited: '已手動修改',
    error: '驗證碼載入失敗，點圖片再試一次'
  };
  function capStatus(state, n) {
    const el = q('#lgCapStatus');
    const t = CAP_TEXT[state];
    el.dataset.state = state;
    const ic = { ok: 'check', failed: 'warn', error: 'warn', 'no-ocr': 'warn' }[state];
    el.innerHTML = (ic ? icon(ic, 14) : state === 'loading' ? '<span class="lg-dot" aria-hidden="true"></span>' : '') + `<span>${typeof t === 'function' ? t(n) : t}</span>`;
    q('#lgCapImgBtn').classList.toggle('loading', state === 'loading');
  }

  async function loadCaptcha(mode = 'auto') {
    if (!online) return;
    const my = ++capReq; // 連點好幾次時，只採用最後一次的結果
    capStatus(mode === 'auto' ? 'loading' : 'manual');
    q('#lgCapImgBtn').classList.add('loading');
    q('#lgCap').value = '';
    try {
      const qs = new URLSearchParams();
      if (sid) qs.set('sid', sid);
      if (mode === 'manual') qs.set('manual', '1');
      const d = await call('/api/ntub/captcha' + (qs.toString() ? '?' + qs : ''));
      if (my !== capReq) return;
      sid = d.sid;
      q('#lgCapField').hidden = d.needCaptcha === false;
      if (d.image) q('#lgCapImg').src = d.image;
      q('#lgCap').value = d.guess || '';
      capStatus(d.reason === 'no-captcha' ? 'manual' : d.reason || (d.guess ? 'unchecked' : 'manual'), d.tries);
      if (!d.guess && document.activeElement !== q('#lgAcc') && document.activeElement !== q('#lgPwd')) q('#lgCap').focus({ preventScroll: true });
    } catch (e) {
      if (my !== capReq) return;
      if (e.code === 'NO_SERVER') { online = false; banner('offline'); setFormEnabled(false); return; }
      sid = null;
      capStatus('error');
      showErr(e.message);
    } finally {
      if (my === capReq) q('#lgCapImgBtn').classList.remove('loading');
    }
  }

  q('#lgCapImgBtn').onclick = () => loadCaptcha('auto');
  q('#lgCapRetry').onclick = () => loadCaptcha('auto');
  q('#lgCapManual').onclick = () => loadCaptcha('manual');
  q('#lgCap').addEventListener('input', () => { if (q('#lgCapStatus').dataset.state !== 'manual') capStatus('edited'); });

  /* ---------- 帳號、密碼 ---------- */
  const saved = store.get(ACC_KEY);
  if (saved) { q('#lgAcc').value = saved; q('#lgRemember').checked = true; }
  q('#lgEye').onclick = () => {
    const p = q('#lgPwd'), show = p.type === 'password';
    p.type = show ? 'text' : 'password';
    q('#lgEye').innerHTML = icon(show ? 'eyeOff' : 'eye');
    q('#lgEye').setAttribute('aria-pressed', String(show));
    q('#lgEye').setAttribute('aria-label', show ? '隱藏密碼' : '顯示密碼');
  };

  /* ---------- 送出 ---------- */
  let stageTimer = 0;
  function setBusy(on) {
    busy = on;
    const go = q('#lgGo');
    go.disabled = on; go.classList.toggle('busy', on);
    clearTimeout(stageTimer);
    if (on) {
      q('#lgGoText').textContent = '登入學校系統中…';
      stageTimer = setTimeout(() => { q('#lgGoText').textContent = '抓取課表中…'; step(1); }, 1800);
    } else q('#lgGoText').textContent = '登入並匯入課表';
  }

  q('#lgForm').onsubmit = async e => {
    e.preventDefault();
    if (busy || !online) return;
    const acc = q('#lgAcc').value.trim(), pwd = q('#lgPwd').value, cap = q('#lgCap').value.trim();
    if (!acc) { showErr('請輸入學號'); q('#lgAcc').focus(); return; }
    if (!pwd) { showErr('請輸入密碼'); q('#lgPwd').focus(); return; }
    if (!q('#lgCapField').hidden && !cap) { showErr('請輸入驗證碼'); q('#lgCap').focus(); return; }
    if (!sid) { await loadCaptcha('auto'); return; }
    showErr('');
    store.set(ACC_KEY, q('#lgRemember').checked ? acc : null);
    setBusy(true); step(0);
    try {
      const body = { sid, account: acc, password: pwd, captcha: cap };
      const y = q('#lgYear').value.trim(), t = q('#lgTerm').value;
      if (y) body.year = +y;
      if (t) body.term = +t;
      result = await call('/api/ntub/import', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      q('#lgPwd').value = '';
      sid = null;
      step(2);
      renderPreview();
    } catch (err) {
      step(0);
      if (err.code === 'NO_SERVER') { online = false; banner('offline'); setFormEnabled(false); return; }
      if (err.code === 'CAPTCHA') {
        showErr('驗證碼不對，已經自動換一張重新辨識。');
      } else if (err.code === 'LOGIN_FAILED') {
        showErr(`${esc(err.message)}`);
        q('#lgPwd').value = ''; q('#lgPwd').focus();
      } else if (err.code === 'EXPIRED') {
        sid = null; showErr('等太久登入逾時了，已經換一張新的驗證碼，請再按一次。');
      } else {
        showErr(esc(err.message));
      }
      loadCaptcha('auto'); // 學校的驗證碼用過一次就失效，一律換新的
    } finally {
      setBusy(false);
    }
  };

  /* ---------- 預覽與匯入 ---------- */
  const isManual = c => !String(c.id).startsWith('ntub-'); // 不是從學校匯入的，就是使用者自己新增的

  function renderPreview() {
    const { semester, courses } = result;
    const manual = S.courses.filter(isManual);
    const manualNames = [...new Set(manual.map(c => c.name))];
    const days = [1, 2, 3, 4, 5, 6, 7].map(d => ({ d, list: courses.filter(c => c.day === d).sort((a, b) => a.s.localeCompare(b.s)) })).filter(x => x.list.length);
    const weekend = courses.filter(c => c.day >= 6).length;
    q('#lgForm').hidden = true;
    const p = q('#lgPreview');
    p.hidden = false;
    p.innerHTML = `
      <p class="lg-eyebrow">${semester.year} 學年度 第 ${semester.term} 學期</p>
      <h2>找到 ${semester.courses.length} 門課</h2>
      <p class="lg-muted">共 ${courses.length} 個上課時段，確認沒問題就匯入。</p>
      <div class="lg-days">
        ${days.map(({ d, list }) => `
          <section>
            <h3>週${DAYS[d % 7]}</h3>
            <ul>${list.map(c => `
              <li class="t-${c.type}"><time>${c.s}<br>${c.e}</time>
                <div><b>${esc(c.name)}</b><small>${esc(c.room) || '—'}${c.teacher ? ' · ' + esc(c.teacher) : ''}</small></div></li>`).join('')}
            </ul>
          </section>`).join('')}
      </div>
      ${weekend ? `<p class="lg-note">${icon('warn', 14)}有 ${weekend} 個時段在週末，目前週課表只顯示週一到週五。</p>` : ''}
      ${manualNames.length ? `<label class="lg-check lg-keep"><input type="checkbox" id="lgKeep" checked> 保留我自己新增的 ${manualNames.length} 門課（${manualNames.slice(0, 3).map(esc).join('、')}${manualNames.length > 3 ? '…' : ''}）</label>` : ''}
      <p class="lg-note">${icon('check', 14)}匯入會取代課表上的課程，作業、考試和筆記都會保留。</p>
      <div class="lg-actions">
        <button type="button" class="ghost" id="lgBack">重新登入</button>
        <button type="button" class="primary" id="lgOk">確認匯入 ${semester.courses.length} 門課</button>
      </div>`;
    q('#lgBack').onclick = reset;
    q('#lgOk').onclick = () => {
      const keep = q('#lgKeep') && q('#lgKeep').checked ? manual : [];
      S.courses = [...courses, ...keep];
      S.term = `${semester.year} 學年 第 ${semester.term} 學期`;
      S.ntub = { year: semester.year, term: semester.term, periods: semester.periods, importedAt: new Date().toISOString() };
      save(); renderAll();
      toast(`已匯入 ${semester.courses.length} 門課`);
      reset(false);
      show('week');
    };
    q('#lgOk').focus();
  }

  function reset(reload = true) {
    result = null;
    q('#lgPreview').hidden = true;
    q('#lgForm').hidden = false;
    showErr('');
    step(0);
    if (reload) loadCaptcha('auto');
    else started = false; // 下次回到這頁再抓新的驗證碼
  }

  /* ---------- 切到「匯入」頁才開始 ---------- */
  let started = false;
  const maybeStart = () => {
    if (!view.classList.contains('active')) return;
    if (!started) { started = true; boot(); }
  };
  new MutationObserver(maybeStart).observe(view, { attributes: true, attributeFilter: ['class'] });
  maybeStart();

  const toLogin = document.getElementById('toLogin');
  if (toLogin) toLogin.onclick = () => show('login');
})();
