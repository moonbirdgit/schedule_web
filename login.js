'use strict';
/* ==========================================================
   北商登入匯入（王鵬瑋）
   需要先 npm start 開本機伺服器，瀏覽器才能透過它登入學校系統。
   用到 script.js 的：S、save()、renderAll()、show()、esc()、DAYS
   ========================================================== */
(() => {
  // 用 npm start 開的頁面（port 3000）直接打同一個網址；用 Live Server 開就打 localhost:3000
  const API = location.port === '3000' ? '' : 'http://localhost:3000';
  const $l = s => document.querySelector(s);
  let sid = null, result = null, busy = false;

  const view = $l('#view-login');
  view.innerHTML = `
    <div class="lg">
      <section class="lg-intro">
        <p class="lg-eyebrow">從學校匯入</p>
        <h1>學校課表，<br>一鍵搬進來。</h1>
        <p class="lg-sub">用北商校務系統的帳號登入，課名、老師、教室會自動排好，不用一格一格自己打。</p>
        <ol class="lg-steps" id="lgSteps">
          <li class="on">登入北商校務系統</li><li>抓取課表與教室</li><li>確認後匯入</li>
        </ol>
      </section>

      <section class="lg-main">
        <form id="lgForm" class="lg-form" autocomplete="on">
          <label>學號<input id="lgAcc" name="username" autocomplete="username" inputmode="text" required></label>
          <label>密碼<input id="lgPwd" name="password" type="password" autocomplete="current-password" required></label>
          <div class="lg-cap" id="lgCapRow">
            <span class="lg-label">驗證碼</span>
            <div class="lg-caprow">
              <img id="lgCapImg" alt="驗證碼圖片" width="120" height="42">
              <input id="lgCap" aria-label="驗證碼" autocomplete="off" spellcheck="false">
              <button type="button" id="lgCapNew" class="ghost" aria-label="換一張驗證碼">↻</button>
            </div>
            <small id="lgCapHint"></small>
          </div>
          <p id="lgErr" class="err" role="alert"></p>
          <button class="primary lg-go" id="lgGo">登入並匯入課表</button>
          <p class="lg-note">密碼只用來登入學校系統抓課表，用完就丟，不會存起來。</p>
        </form>

        <div id="lgPreview" class="lg-preview" hidden></div>
      </section>
    </div>`;

  const step = n => [...$l('#lgSteps').children].forEach((li, i) => li.className = i < n ? 'done' : i === n ? 'on' : '');
  const err = msg => { $l('#lgErr').textContent = msg || ''; };

  async function call(path, opts) {
    let r;
    try { r = await fetch(API + path, opts); }
    catch { throw Object.assign(new Error('連不到本機伺服器，請先在專案資料夾執行 npm start'), { code: 'NO_SERVER' }); }
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(data.error || `錯誤 ${r.status}`), { code: data.code });
    return data;
  }

  async function loadCaptcha() {
    const img = $l('#lgCapImg'), hint = $l('#lgCapHint');
    img.removeAttribute('src'); img.classList.add('loading');
    hint.textContent = '載入驗證碼中…'; hint.className = '';
    try {
      const d = await call('/api/ntub/captcha' + (sid ? `?sid=${sid}` : ''));
      sid = d.sid;
      $l('#lgCapRow').hidden = d.needCaptcha === false;
      if (d.image) img.src = d.image;
      $l('#lgCap').value = d.guess || '';
      hint.textContent = d.guess ? '✓ 已自動辨識，有錯可以自己改' : '看圖片輸入驗證碼';
      hint.className = d.guess ? 'ok' : '';
    } catch (e) {
      sid = null;
      hint.textContent = '';
      err(e.message);
    } finally { img.classList.remove('loading'); }
  }

  $l('#lgCapNew').onclick = () => { err(''); loadCaptcha(); };

  $l('#lgForm').onsubmit = async e => {
    e.preventDefault();
    if (busy) return;
    if (!sid) { await loadCaptcha(); if (!sid) return; }
    busy = true; err('');
    const go = $l('#lgGo'); go.disabled = true; go.textContent = '登入中…';
    step(1);
    try {
      const body = { sid, account: $l('#lgAcc').value, password: $l('#lgPwd').value, captcha: $l('#lgCap').value };
      const d = await call('/api/ntub/import', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      $l('#lgPwd').value = '';
      sid = null;
      result = d;
      renderPreview();
      step(2);
    } catch (e2) {
      step(0);
      err(e2.message);
      if (e2.code === 'CAPTCHA' || e2.code === 'EXPIRED' || e2.code === 'LOGIN_FAILED') {
        if (e2.code !== 'LOGIN_FAILED') sid = null;
        loadCaptcha(); // 驗證碼用過就失效，自動換新的
      }
    } finally {
      busy = false; go.disabled = false; go.textContent = '登入並匯入課表';
    }
  };

  function renderPreview() {
    const { semester, courses } = result;
    const byDay = [1, 2, 3, 4, 5, 6, 7].map(d => courses.filter(c => c.day === d).sort((a, b) => a.s.localeCompare(b.s)));
    const weekend = byDay[5].length + byDay[6].length;
    const p = $l('#lgPreview');
    $l('#lgForm').hidden = true;
    p.hidden = false;
    p.innerHTML = `
      <p class="lg-eyebrow">${semester.year} 學年 第 ${semester.term} 學期</p>
      <h2>找到 ${semester.courses.length} 門課、${courses.length} 個時段</h2>
      <ul class="lg-list">
        ${byDay.map((list, i) => list.map(c => `
          <li class="t-${c.type}"><span class="lg-day">週${DAYS[(i + 1) % 7]}</span>
            <b>${esc(c.name)}</b><small>${c.s}–${c.e} · ${esc(c.room)} · ${esc(c.teacher)}</small></li>`).join('')).join('')}
      </ul>
      ${weekend ? `<p class="lg-warn">有 ${weekend} 個時段在週末，目前週課表只顯示週一到週五。</p>` : ''}
      <p class="lg-warn">匯入會取代現在課表上的所有課程，作業和筆記會保留。</p>
      <div class="actions">
        <button type="button" class="ghost" id="lgBack">重新登入</button>
        <button type="button" class="primary" id="lgOk">確認匯入</button>
      </div>`;
    $l('#lgBack').onclick = reset;
    $l('#lgOk').onclick = () => {
      S.courses = courses;
      S.term = `${semester.year} 學年 第 ${semester.term} 學期`;
      S.ntub = { year: semester.year, term: semester.term, periods: semester.periods, importedAt: new Date().toISOString() };
      save(); renderAll();
      reset();
      show('week');
    };
  }

  function reset() {
    result = null;
    $l('#lgPreview').hidden = true;
    $l('#lgForm').hidden = false;
    step(0);
    loadCaptcha();
  }

  // 第一次切到「匯入」頁才去抓驗證碼
  let started = false;
  const maybeStart = () => { if (!started && view.classList.contains('active')) { started = true; loadCaptcha(); } };
  new MutationObserver(maybeStart).observe(view, { attributes: true, attributeFilter: ['class'] });
  maybeStart();

  const toLogin = document.getElementById('toLogin');
  if (toLogin) toLogin.onclick = () => show('login');
})();
