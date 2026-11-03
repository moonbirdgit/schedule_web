'use strict';
/* ========== 工具 ========== */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const DAYS = ['日', '一', '二', '三', '四', '五', '六'];
const TYPES = { req: '必修', elec: '選修', gen: '通識', lab: '實作', pe: '體育' };
const pad = n => String(n).padStart(2, '0');
const toMin = t => { const [h, m] = t.split(':'); return +h * 60 + +m; };
const fmt = m => pad(Math.floor(m / 60)) + ':' + pad(m % 60);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const md = d => `${d.getMonth() + 1}/${d.getDate()}`;
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const mondayOf = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); return addDays(x, -((x.getDay() + 6) % 7)); };

const START = 480, END = 1050, SPAN = END - START;        // 08:00 – 17:30
const LUNCH = [730, 800];                                  // 午休 12:10 – 13:20
const PERIODS = [[1, 490], [2, 550], [3, 610], [4, 670], [5, 800], [6, 860], [7, 920], [8, 980]];
const pct = m => ((m - START) / SPAN * 100) + '%';

/* ========== 資料 ========== */
const KEY = 'timetable-v1';
const DEFAULTS = {
  term: '115 學年 第 1 學期',
  start: '2026-09-07',
  notes: {},
  courses: [
    { id: 'c1', name: '計算機概論', room: 'A101', teacher: '陳老師', day: 1, s: '08:10', e: '10:00', type: 'req', credits: 3 },
    { id: 'c2', name: '英文（二）', room: 'L203', teacher: 'Smith', day: 1, s: '13:20', e: '15:10', type: 'elec', credits: 2 },
    { id: 'c3', name: '微積分', room: 'S301', teacher: '林老師', day: 2, s: '09:10', e: '12:00', type: 'req', credits: 4 },
    { id: 'c4', name: '網頁設計', room: '電腦教室', teacher: '王老師', day: 2, s: '14:20', e: '16:10', type: 'lab', credits: 3 },
    { id: 'c5', name: '資料結構', room: 'A205', teacher: '張老師', day: 3, s: '08:10', e: '11:00', type: 'req', credits: 3 },
    { id: 'c6', name: '體育', room: '體育館', teacher: '', day: 3, s: '15:20', e: '17:10', type: 'pe', credits: 1 },
    { id: 'c7', name: '微積分', room: 'S301', teacher: '林老師', day: 4, s: '09:10', e: '11:00', type: 'req', credits: 4 },
    { id: 'c8', name: '通識：心理學', room: 'G102', teacher: '黃老師', day: 4, s: '13:20', e: '15:10', type: 'gen', credits: 2 },
    { id: 'c9', name: '專題討論', room: '研究室', teacher: '李老師', day: 5, s: '10:10', e: '12:00', type: 'elec', credits: 3 },
    { id: 'c10', name: '網頁設計', room: '電腦教室', teacher: '王老師', day: 5, s: '14:20', e: '16:10', type: 'lab', credits: 3 }
  ],
  tasks: [
    { id: 't1', title: '資料結構 作業 4', course: '資料結構', due: 5, done: false },
    { id: 't2', title: '網頁設計 期中草稿', course: '網頁設計', due: 5, done: false },
    { id: 't3', title: '微積分 小考', course: '微積分', due: 4, done: false }
  ]
};
let S = load();
function load() {
  try { const d = JSON.parse(localStorage.getItem(KEY)); if (d && d.courses) return d; } catch (e) { /* 忽略 */ }
  return structuredClone(DEFAULTS);
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* 忽略 */ } }

/* ========== 時間計算 ========== */
let off = 0; // 週偏移
const weekNo = m => Math.round((m - mondayOf(new Date(S.start + 'T00:00'))) / 6048e5) + 1;
const typeOf = c => 't-' + c.type;
const byTime = (a, b) => toMin(a.s) - toMin(b.s);

function nextOcc(c, from = new Date()) {
  const d = new Date(from); d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + ((c.day - d.getDay() + 7) % 7));
  const [h, m] = c.s.split(':'); d.setHours(+h, +m);
  if (d < from) d.setDate(d.getDate() + 7);
  return d;
}
function rel(d) {
  const t0 = new Date(); t0.setHours(0, 0, 0, 0);
  const diff = Math.round((new Date(d).setHours(0, 0, 0, 0) - t0) / 864e5);
  const when = diff === 0 ? '今天' : diff === 1 ? '明天' : `週${DAYS[d.getDay()]} ${md(d)}`;
  return `${when} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
const undone = () => S.tasks.filter(t => !t.done).sort((a, b) => a.due - b.due);

/* ========== 週課表 ========== */
function renderWeek() {
  const m = addDays(mondayOf(new Date()), off * 7), now = new Date();
  const todayCol = off === 0 ? now.getDay() : -1, nowMin = now.getHours() * 60 + now.getMinutes();
  $('#weekLabel').textContent = `第 ${weekNo(m)} 週 · ${md(m)} – ${md(addDays(m, 4))}`;

  let h = '<div class="gh"></div>';
  for (let i = 1; i <= 5; i++) {
    const d = addDays(m, i - 1), t = i === todayCol;
    h += `<div class="gh${t ? ' today' : ''}">週${DAYS[i]}${t ? ' · 今天' : ''}<small>${md(d)}</small></div>`;
  }
  h += '<div class="times">' + PERIODS.map(([n, t]) =>
    `<span style="top:${pct(t)}"><b><span class="full">第</span>${n}<span class="full">節</span></b><span class="full">${fmt(t)}</span></span>`).join('') + '</div>';

  const pending = new Set(undone().map(t => t.course));
  for (let i = 1; i <= 5; i++) {
    h += `<div class="col${i === todayCol ? ' today' : ''}" data-day="${i}">`;
    h += `<div class="lunch" style="top:${pct(LUNCH[0])};height:${(LUNCH[1] - LUNCH[0]) / SPAN * 100}%">午休</div>`;
    h += S.courses.filter(c => c.day === i).map(c => {
      const a = toMin(c.s), b = toMin(c.e), t = undone().find(x => x.course === c.name);
      return `<button class="ev ${typeOf(c)}" data-open="${c.id}" style="top:${pct(a)};height:${(b - a) / SPAN * 100}%">
        <b>${esc(c.name)}</b><small>${esc(c.room)}${c.teacher ? ' · ' + esc(c.teacher) : ''}</small><small>${c.s}-${c.e}</small>
        ${pending.has(c.name) && t ? `<span class="chip">作業週${DAYS[t.due]}截止</span>` : ''}</button>`;
    }).join('');
    if (i === todayCol && nowMin >= START && nowMin <= END) h += `<div class="now" style="top:${pct(nowMin)}"></div>`;
    h += '</div>';
  }
  $('#grid').innerHTML = h;
}

/* ========== 今日 ========== */
const todayList = () => S.courses.filter(c => c.day === new Date().getDay()).sort(byTime);

function renderToday() {
  const now = new Date(), list = todayList(), min = now.getHours() * 60 + now.getMinutes();
  let tl = '', shown = false;
  const nowRow = `<li class="nowrow">現在 ${fmt(min)}</li>`;
  list.forEach(c => {
    if (!shown && toMin(c.s) > min) { tl += nowRow; shown = true; }
    const past = toMin(c.e) <= min, on = toMin(c.s) <= min && min < toMin(c.e);
    tl += `<li class="item ${past ? 'past' : ''} ${on ? 'on' : ''} ${typeOf(c)}"><time>${c.s}</time>
      <button data-open="${c.id}"><b>${esc(c.name)}</b><small>${esc(c.room)} · ${c.s}-${c.e}${past ? ' · 已結束' : on ? ' · 上課中' : ''}</small></button></li>`;
  });
  if (!shown && list.length) tl += nowRow;
  const soon = undone().slice(0, 4).map(t => `<li><input type="checkbox" data-task="${t.id}" id="s${t.id}"><label for="s${t.id}" class="tx">${esc(t.title)}</label><span class="due">週${DAYS[t.due]}</span></li>`).join('');

  $('#today').innerHTML = `
    <p class="date">${now.getMonth() + 1}月${now.getDate()}日 · 週${DAYS[now.getDay()]} · 第 ${weekNo(mondayOf(now))} 週</p>
    <h1 class="title">${list.length ? `今天有 ${list.length} 堂課` : '今天沒有課'}</h1>
    <div class="hero" id="hero"></div>
    <p class="sec">今日行程</p>
    ${list.length ? `<ul class="tl">${tl}</ul>` : '<p class="empty">好好休息，或到週課表新增課程。</p>'}
    <p class="sec">快到期</p>
    ${soon ? `<ul class="tasks">${soon}</ul>` : '<p class="empty">目前沒有待完成的作業。</p>'}`;
  tickHero();
}

function tickHero() {
  const el = $('#hero'); if (!el) return;
  const now = new Date(), min = now.getHours() * 60 + now.getMinutes();
  const on = todayList().find(c => toMin(c.s) <= min && min < toMin(c.e));
  let c, label, target;
  if (on) { c = on; label = '上課中 · 距離下課'; target = new Date(now).setHours(0, toMin(on.e), 0, 0); }
  else {
    const all = S.courses.map(x => [x, nextOcc(x, now)]).sort((a, b) => a[1] - b[1])[0];
    if (!all) { el.innerHTML = ''; return; }
    c = all[0]; target = all[1]; label = '下一堂';
  }
  const sec = Math.max(0, Math.floor((target - now) / 1000));
  el.innerHTML = `<small>${label} · ${esc(c.name)}</small>
    <div class="count">${Math.floor(sec / 3600)}:${pad(Math.floor(sec % 3600 / 60))}<span>:${pad(sec % 60)}</span></div>
    <small>${esc(c.room)} · ${c.s}-${c.e}${c.teacher ? ' · ' + esc(c.teacher) : ''}</small>`;
}

/* ========== 作業 ========== */
function renderTasks() {
  const list = [...S.tasks].sort((a, b) => a.done - b.done || a.due - b.due);
  $('#taskList').innerHTML = list.map(t => `<li class="${t.done ? 'done' : ''}">
    <input type="checkbox" data-task="${t.id}" id="k${t.id}" ${t.done ? 'checked' : ''}>
    <label for="k${t.id}" class="tx">${esc(t.title)}<small>${esc(t.course)}</small></label>
    <span class="due">週${DAYS[t.due]}</span>
    <button class="x" style="position:static" data-deltask="${t.id}" aria-label="刪除">✕</button></li>`).join('')
    || '<li class="empty">還沒有作業或考試。</li>';
  const n = undone().length, b = $('#badge'); b.hidden = !n; b.textContent = n;
  const names = [...new Set(S.courses.map(c => c.name))];
  $('#tCourse').innerHTML = names.map(n => `<option>${esc(n)}</option>`).join('');
}

/* ========== 課程詳細 ========== */
function openDetail(id) {
  const c = S.courses.find(x => x.id === id); if (!c) return;
  const same = S.courses.filter(x => x.name === c.name).sort((a, b) => a.day - b.day);
  const tasks = S.tasks.filter(t => t.course === c.name);
  const nx = nextOcc(c), mins = Math.round((nx - new Date()) / 6e4);
  const left = mins < 60 ? `${mins} 分鐘` : mins < 1440 ? `${Math.floor(mins / 60)} 小時 ${mins % 60} 分` : `${Math.floor(mins / 1440)} 天`;
  const d = $('#detail');
  d.className = 'sheet ' + typeOf(c);
  d.dataset.id = id;
  d.innerHTML = `
    <div class="dh"><button class="x" data-close aria-label="關閉">✕</button>
      <span class="tag">${TYPES[c.type]}</span><h2>${esc(c.name)}</h2><p>週${DAYS[c.day]} · ${c.s}–${c.e}</p></div>
    <div class="db">
      <dl>
        <dt>下次上課</dt><dd>${rel(nx)}（還有 ${left}）</dd>
        <dt>每週上課</dt><dd>${same.map(x => `週${DAYS[x.day]} ${x.s}–${x.e}`).join('、')}</dd>
        <dt>地點</dt><dd>${esc(c.room) || '—'}</dd>
        <dt>教師</dt><dd>${esc(c.teacher) || '—'}</dd>
        <dt>學分</dt><dd>${c.credits || '—'}</dd>
      </dl>
      <h3>作業與考試</h3>
      ${tasks.length ? `<ul class="tasks">${tasks.map(t => `<li class="${t.done ? 'done' : ''}"><input type="checkbox" data-task="${t.id}" id="d${t.id}" ${t.done ? 'checked' : ''}><label for="d${t.id}" class="tx">${esc(t.title)}</label><span class="due">週${DAYS[t.due]}</span></li>`).join('')}</ul>` : '<p class="empty" style="padding:0">這堂課沒有待辦事項。</p>'}
      <h3>課堂筆記</h3>
      <textarea id="note" placeholder="例如：記得帶運動服、期中範圍…">${esc(S.notes[c.name] || '')}</textarea>
      <p style="margin-top:18px"><button class="ghost danger" data-delcourse="${id}">刪除這堂課</button></p>
    </div>`;
  if (!d.open) d.showModal();
}

/* ========== 新增課程 ========== */
function openForm(day = 1, start = '09:10') {
  $('#courseForm').reset();
  $('#fErr').textContent = '';
  $('#fType').innerHTML = Object.entries(TYPES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
  $('#fDay').value = day;
  $('#fS').value = start;
  $('#fE').value = fmt(Math.min(toMin(start) + 110, END));
  $('#form').showModal();
  $('#fName').focus();
}

/* ========== 事件 ========== */
document.addEventListener('click', e => {
  const t = e.target;
  const open = t.closest('[data-open]');
  if (open) { openDetail(open.dataset.open); return; }
  if (t.closest('[data-close]') || t.matches('dialog')) { (t.closest('dialog') || t).close(); return; }

  const del = t.closest('[data-delcourse]');
  if (del && confirm('確定要刪除這堂課嗎？')) {
    S.courses = S.courses.filter(c => c.id !== del.dataset.delcourse); save(); $('#detail').close(); renderAll(); return;
  }
  const dt = t.closest('[data-deltask]');
  if (dt) { S.tasks = S.tasks.filter(x => x.id !== dt.dataset.deltask); save(); renderAll(); return; }

  // 點空白格子 → 新增課程（依點擊位置換算時間）
  const col = t.closest('.col');
  if (col && !t.closest('.ev')) {
    const r = col.getBoundingClientRect();
    const m = Math.round((START + (e.clientY - r.top) / r.height * SPAN) / 10) * 10;
    openForm(+col.dataset.day, fmt(Math.max(START, Math.min(m, END - 50))));
  }
});

document.addEventListener('change', e => {
  const id = e.target.dataset.task; if (!id) return;
  const t = S.tasks.find(x => x.id === id); t.done = e.target.checked; save();
  renderAll();
  const d = $('#detail'); if (d.open) openDetail(d.dataset.id);
});

document.addEventListener('input', e => {
  if (e.target.id !== 'note') return;
  const c = S.courses.find(x => x.id === $('#detail').dataset.id);
  S.notes[c.name] = e.target.value; save();
});

$('#prev').onclick = () => { off--; renderWeek(); };
$('#next').onclick = () => { off++; renderWeek(); };
$('#thisWeek').onclick = () => { off = 0; renderWeek(); };
$('#addBtn').onclick = () => openForm(new Date().getDay() >= 1 && new Date().getDay() <= 5 ? new Date().getDay() : 1);

$('#courseForm').onsubmit = e => {
  e.preventDefault();
  if (toMin($('#fE').value) <= toMin($('#fS').value)) { $('#fErr').textContent = '結束時間要晚於開始時間'; return; }
  const name = $('#fName').value.trim(), same = S.courses.find(c => c.name === name);
  S.courses.push({
    id: 'c' + Date.now(), name, room: $('#fRoom').value.trim(), teacher: $('#fTeacher').value.trim(),
    day: +$('#fDay').value, s: $('#fS').value, e: $('#fE').value, type: $('#fType').value, credits: same ? same.credits : 0
  });
  save(); $('#form').close(); renderAll();
};

$('#taskForm').onsubmit = e => {
  e.preventDefault();
  S.tasks.push({ id: 't' + Date.now(), title: $('#tTitle').value.trim(), course: $('#tCourse').value, due: +$('#tDue').value, done: false });
  $('#tTitle').value = ''; save(); renderAll();
};

$('#sTerm').oninput = e => { S.term = e.target.value; save(); renderFoot(); };
$('#sStart').onchange = e => { if (e.target.value) { S.start = e.target.value; save(); renderAll(); } };
$('#reset').onclick = () => { if (confirm('要還原成範例資料嗎？你新增的內容會被清除。')) { S = structuredClone(DEFAULTS); save(); renderAll(); } };

/* ========== 頁面切換 ========== */
function show(view) {
  if (!$('#view-' + view)) view = 'week';
  $$('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + view));
  $$('.nav button').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  if (location.hash !== '#' + view) history.replaceState(null, '', '#' + view);
}
$$('.nav button').forEach(b => b.onclick = () => show(b.dataset.view));
window.addEventListener('hashchange', () => show(location.hash.slice(1)));

/* ========== 啟動 ========== */
function renderFoot() {
  const credits = [...new Map(S.courses.map(c => [c.name, c.credits || 0])).values()].reduce((a, b) => a + b, 0);
  $('#foot').innerHTML = `${esc(S.term)}<br>本學期 ${credits} 學分`;
}
function renderAll() {
  renderWeek(); renderToday(); renderTasks(); renderFoot();
  $('#sTerm').value = S.term; $('#sStart').value = S.start;
}
$('#legend').innerHTML = Object.entries(TYPES).map(([k, v]) => `<span class="t-${k}" style="--c:var(--${k})">${v}</span>`).join('');
renderAll();
show(location.hash.slice(1) || 'week');
setInterval(tickHero, 1000);
setInterval(() => { renderWeek(); renderToday(); }, 30000);