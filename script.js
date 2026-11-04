'use strict';
/* ========== 工具 ========== */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const DAYS = ['日', '一', '二', '三', '四', '五', '六'];
const TYPES = { req: '必修', elec: '選修', gen: '通識', lab: '實作', pe: '體育' };
const COLORS = ['#2f5bea', '#1f8a5b', '#c77d0a', '#7b4fd6', '#0f8296', '#d6457a']; // 課程自訂顏色
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
// 每節起迄（索引 1–8 = 第 1–8 節）
const PT = [null, ['08:10','09:00'], ['09:10','10:00'], ['10:10','11:00'], ['11:10','12:00'],
  ['13:20','14:10'], ['14:20','15:10'], ['15:20','16:10'], ['16:20','17:10']];
const KINDS = { hw: '作業', exam: '考試' }; // 舊資料的代碼
// 作業種類統一用中文（作業／考試／小考），舊的 hw / exam 也認得
const kindOf = t => KINDS[t.kind] || t.kind || '作業';
const isExam = t => ['考試', '小考'].includes(kindOf(t));
const isoDate = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
// 把時間換成「第 a-b 節」；對不上節次就直接顯示時間
function periodLabel(s, e) {
  const a = PT.findIndex(p => p && p[0] === s), b = PT.findIndex(p => p && p[1] === e);
  if (a > 0 && b >= a) return a === b ? `第 ${a} 節` : `第 ${a}-${b} 節`;
  return `${s}–${e}`;
}
const dueDate = w => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + ((w - d.getDay() + 7) % 7)); return d; };
const pct = m => ((m - START) / SPAN * 100) + '%';

/* ========== 資料 ========== */
const KEY = 'timetable-v1';
const DEFAULTS = {
  term: '115 學年 第 1 學期',
  start: '2026-09-07',
  notes: {},
  absent: {},
  courses: [
    { id: 'c1', name: '計算機概論', room: 'A101', teacher: '陳老師', day: 1, s: '08:10', e: '10:00', type: 'req', credits: 3 },
    { id: 'c2', name: '英文（二）', room: 'L203', teacher: 'Smith', day: 1, s: '13:20', e: '15:10', type: 'elec', credits: 2 },
    { id: 'c3', name: '微積分', room: 'S301', teacher: '林老師', day: 2, s: '09:10', e: '12:00', type: 'req', credits: 4 },
    { id: 'c4', name: '網頁設計', room: '電腦教室', teacher: '王老師', day: 2, s: '14:20', e: '16:10', type: 'lab', credits: 3, email: 'wang@school.edu.tw', grading: '作業 40% · 期中 30% · 期末 30%', absLimit: 3 },
    { id: 'c5', name: '資料結構', room: 'A205', teacher: '張老師', day: 3, s: '08:10', e: '11:00', type: 'req', credits: 3 },
    { id: 'c6', name: '體育', room: '體育館', teacher: '', day: 3, s: '15:20', e: '17:10', type: 'pe', credits: 1 },
    { id: 'c7', name: '微積分', room: 'S301', teacher: '林老師', day: 4, s: '09:10', e: '11:00', type: 'req', credits: 4 },
    { id: 'c8', name: '通識：心理學', room: 'G102', teacher: '黃老師', day: 4, s: '13:20', e: '15:10', type: 'gen', credits: 2 },
    { id: 'c9', name: '專題討論', room: '研究室', teacher: '李老師', day: 5, s: '10:10', e: '12:00', type: 'elec', credits: 3 },
    { id: 'c10', name: '網頁設計', room: '電腦教室', teacher: '王老師', day: 5, s: '14:20', e: '16:10', type: 'lab', credits: 3, email: 'wang@school.edu.tw', grading: '作業 40% · 期中 30% · 期末 30%', absLimit: 3 }
  ],
  tasks: [
    { id: 't1', title: '期中專題：個人網站草稿', course: '網頁設計', due: 6, dueDate:'2026-11-07', kind:'作業', done: false },
    { id: 't2', title: '資料結構 作業 4：Linked List', course: '資料結構', due: 6, dueDate:'2026-11-07', kind:'作業', done: false },
    { id: 't3', title: '英文 單字小考 Unit 6', course: '英文（二）', due: 2, dueDate:'2026-11-10', kind:'小考', done: false },
    { id: 't4', title: 'CSS Flexbox 練習', course: '網頁設計', due: 6, dueDate:'2026-11-14', kind:'作業', done: false },
    { id: 't5', title: '微積分 期中考', course: '微積分', due: 3, dueDate:'2026-11-18', kind:'考試', done: false },
    { id: 't6', title: '心理學 課堂心得', course: '通識：心理學', due: 5, dueDate:'2026-11-20', kind:'作業', done: false },
    { id: 't7', title: 'HTML 表單練習', course: '網頁設計', due: 6, dueDate:'2026-10-31', kind:'作業', done: true }
  ]
};
let S = load();
function load() {
  try { const d = JSON.parse(localStorage.getItem(KEY)); if (d && d.courses) { d.notes ||= {}; d.absent ||= {}; return d; } } catch (e) { /* 忽略 */ }
  return structuredClone(DEFAULTS);
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* 忽略 */ } }

/* ========== 時間計算 ========== */
let off = 0; // 週偏移
const weekNo = m => Math.round((m - mondayOf(new Date(S.start + 'T00:00'))) / 6048e5) + 1;
const typeOf = c => 't-' + c.type;
const colorVar = c => COLORS.includes(c.color) ? `--c:${c.color}` : ''; // 有自訂顏色就蓋過類別顏色
const byTime = (a, b) => toMin(a.s) - toMin(b.s);
const clash = (a, b) => a.day === b.day && toMin(a.s) < toMin(b.e) && toMin(b.s) < toMin(a.e);

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
      return `<button class="ev ${typeOf(c)}" data-open="${c.id}" style="${colorVar(c)};top:${pct(a)};height:${(b - a) / SPAN * 100}%">
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
    tl += `<li class="item ${past ? 'past' : ''} ${on ? 'on' : ''} ${typeOf(c)}" style="${colorVar(c)}"><time>${c.s}</time>
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
  const list = [...S.tasks].sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || '') || a.due - b.due);
  $('#taskList').innerHTML = list.map(t => `<li class="${t.done ? 'done' : ''}">
    <input type="checkbox" data-task="${t.id}" id="k${t.id}" ${t.done ? 'checked' : ''}>
    <label for="k${t.id}" class="tx">${esc(t.title)}<small>${esc(t.course)} · ${kindOf(t)}</small></label>
    <span class="due">週${DAYS[t.due]}</span>
    <button class="x" style="position:static" data-deltask="${t.id}" aria-label="刪除">✕</button></li>`).join('')
    || '<li class="empty">還沒有作業或考試。</li>';
  const n = undone().length, b = $('#badge'); b.hidden = !n; b.textContent = n;
  const names = [...new Set(S.courses.map(c => c.name))];
  $('#tCourse').innerHTML = names.map(n => `<option>${esc(n)}</option>`).join('');
  const courseFilter = $('#taskCourseFilter');
  if (courseFilter) {
    const selected = courseFilter.value || 'all';
    courseFilter.innerHTML = '<option value="all">所有課程</option>' + names.map(n => `<option>${esc(n)}</option>`).join('');
    courseFilter.value = names.includes(selected) ? selected : 'all';
    const pending = S.tasks.filter(t => !t.done), today = new Date(); today.setHours(0,0,0,0);
    const within = pending.filter(t => t.dueDate && (new Date(t.dueDate+'T00:00') - today) / 86400000 <= 14 && new Date(t.dueDate+'T00:00') >= today).length;
    $('#taskStats').innerHTML = `<div class="stat red"><strong>${within}</strong><span>這週要交</span></div><div class="stat amber"><strong>${pending.filter(t => ['考試','小考'].includes(t.kind)).length}</strong><span>兩週內考試</span></div><div class="stat"><strong>${pending.length}</strong><span>未完成</span></div><div class="stat green"><strong>${S.tasks.filter(t=>t.done).length}</strong><span>本學期已完成</span></div>`;
    const filter = document.querySelector('.taskFilters .on')?.dataset.filter || 'all', showDone = $('#showDone')?.checked !== false;
    const filtered = list.filter(t => (showDone || !t.done) && (filter === 'all' || (filter === '考試' ? ['考試','小考'].includes(t.kind) : t.kind === filter)) && (courseFilter.value === 'all' || t.course === courseFilter.value));
    const groups = new Map();
    filtered.forEach(t => { const date = t.dueDate || ''; const key = t.done ? '已完成' : date && date < new Date().toISOString().slice(0,10) ? '逾期' : date && (new Date(date+'T00:00')-new Date(new Date().toDateString()))/86400000 <= 2 ? '這週' : '之後'; if(!groups.has(key))groups.set(key,[]);groups.get(key).push(t); });
    $('#taskGroups').innerHTML = [...groups].map(([g,items])=>`<section class="taskGroup"><h2>${g}</h2><div class="taskRows">${items.map(t=>{const date=t.dueDate?new Date(t.dueDate+'T00:00'):null,remain=date?Math.ceil((date-new Date(new Date().toDateString()))/86400000):null;return `<article class="taskRow ${t.done?'done':''}"><input type="checkbox" data-task="${t.id}" ${t.done?'checked':''} aria-label="標記完成"><div class="taskInfo"><b>${esc(t.title)}</b><small><i class="courseTag">${esc(t.course)}</i><span class="kindTag ${['考試','小考'].includes(t.kind)?'exam':''}">${esc(t.kind||'作業')}</span><span>·</span><span>${date?`${date.getMonth()+1}/${date.getDate()}`:`週${DAYS[t.due]}`}</span></small></div><span class="taskRemain ${remain!==null&&remain<=2&&!t.done?'urgent':''}">${t.done?'已完成':remain!==null?remain<0?`逾期 ${-remain} 天`:remain===0?'今天':`${remain} 天`:`週${DAYS[t.due]}`}</span></article>`}).join('')}</div></section>`).join('') || '<p class="empty">沒有符合條件的項目。</p>';
  }
}

/* ========== 課程詳細 ========== */
function openDetail(id) {
  const c = S.courses.find(x => x.id === id); if (!c) return;
  const same = S.courses.filter(x => x.name === c.name).sort((a, b) => a.day - b.day || byTime(a, b));
  const tasks = S.tasks.filter(t => t.course === c.name).sort((a, b) => a.done - b.done || a.due - b.due);
  const doneN = tasks.filter(t => t.done).length, pctDone = tasks.length ? Math.round(doneN / tasks.length * 100) : 0;
  const rooms = [...new Set(same.map(x => x.room).filter(Boolean))];
  const limit = c.absLimit || 3, abs = S.absent[c.name] || 0;
  const nx = nextOcc(c), mins = Math.round((nx - new Date()) / 6e4);
  const left = mins < 60 ? `${mins} 分鐘` : mins < 1440 ? `${Math.floor(mins / 60)} 小時 ${mins % 60} 分` : `${Math.floor(mins / 1440)} 天`;
  const d = $('#detail');
  const keep = d.querySelector('.db') ? d.scrollTop : 0;
  d.className = 'sheet ' + typeOf(c);
  d.style.cssText = colorVar(c);
  d.dataset.id = id;
  const dayOpts = [1, 2, 3, 4, 5].map(i => `<option value="${i}"${i === 5 ? ' selected' : ''}>週${DAYS[i]}</option>`).join('');
  d.innerHTML = `
    <div class="dh">
      <div class="dtop">
        <button class="back" data-close aria-label="返回">‹</button>
        <span class="dlabel">課程詳情</span>
        <div class="acts">
          <button class="ghost" data-edit="${id}">編輯</button>
          <button class="ghost danger" data-delcourse="${id}">刪除</button>
        </div>
        <button class="x" data-close aria-label="關閉">✕</button>
      </div>
      <div class="dt"><span class="dbar"></span>
        <div><p class="crumb">課程表 › 課程詳情</p><h2>${esc(c.name)}</h2>
          <p class="sub">${TYPES[c.type]} · ${c.credits || 0} 學分${c.teacher ? ' · ' + esc(c.teacher) : ''}</p></div></div>
    </div>
    <div class="db">
      <div class="dcol">
        <section>
          <h3>作業與考試</h3>
          ${tasks.length ? `<ul class="tasks">${tasks.map(t => `<li class="${t.done ? 'done' : ''}"><input type="checkbox" data-task="${t.id}" id="d${t.id}" ${t.done ? 'checked' : ''}>
            <label for="d${t.id}" class="tx">${esc(t.title)}</label><span class="kind ${isExam(t) ? 'exam' : ''}">${kindOf(t)}</span>
            <span class="due">${t.dueDate ? md(new Date(t.dueDate + 'T00:00')) : md(dueDate(t.due))}</span></li>`).join('')}</ul>` : '<p class="empty" style="padding:0 0 6px">這堂課沒有待辦事項。</p>'}
          <button type="button" class="link" data-addtask>＋ 新增作業或考試</button>
          <form class="dtForm inline" hidden>
            <input name="title" placeholder="例如：期中考" required aria-label="標題">
            <select name="kind" aria-label="種類"><option>作業</option><option>考試</option><option>小考</option></select>
            <select name="due" aria-label="截止日">${dayOpts}</select>
            <button class="primary">新增</button>
          </form>
        </section>
        <section>
          <h3>課堂筆記</h3>
          <textarea id="note" placeholder="例如：記得帶運動服、期中範圍…">${esc(S.notes[c.name] || '')}</textarea>
        </section>
      </div>
      <div class="dcol">
        <section>
          <h3>上課時間</h3>
          <ul class="when">${same.map(x => `<li${x.id === id ? ' class="cur"' : ''}><b>週${DAYS[x.day]}</b><span>${periodLabel(x.s, x.e)}</span><time>${x.s}–${x.e}</time></li>`).join('')}</ul>
          <p class="next">下次上課：${rel(nx)}（還有 ${left}）</p>
        </section>
        <section>
          <h3>資料</h3>
          <dl>
            <dt>教室</dt><dd>${rooms.map(esc).join('、') || '—'}</dd>
            <dt>老師信箱</dt><dd>${c.email ? `<a href="mailto:${esc(c.email)}">${esc(c.email)}</a>` : '—'}</dd>
            <dt>評分</dt><dd>${esc(c.grading) || '—'}</dd>
            <dt>課程代碼</dt><dd>${esc(c.code) || '—'}</dd>
            <dt>缺課上限</dt><dd>${limit} 次</dd>
          </dl>
        </section>
        <section class="stats">
          <div class="stat${abs >= limit ? ' warn' : ''}"><b>${abs}<span>/${limit}</span></b><small>缺課次數</small>
            <div class="step"><button type="button" class="ghost" data-abs="-1" aria-label="減少缺課">−</button><button type="button" class="ghost" data-abs="1" aria-label="增加缺課">＋</button></div></div>
          <div class="stat"><b>${pctDone}<span>%</span></b><small>作業完成度（${doneN}/${tasks.length}）</small></div>
        </section>
      </div>
    </div>`;
  if (!d.open) d.showModal();
  d.scrollTop = keep;
}

/* ========== 新增／編輯課程 ========== */
let formColor = ''; // 表單目前選的顏色（空字串＝依類別）

// k: 0 = 開始時間、1 = 結束時間；對不上節次的舊資料會多一個「自訂」選項保留原時間
function periodOpts(val, k) {
  let h = PT.slice(1).map((p, i) => `<option value="${p[k]}"${p[k] === val ? ' selected' : ''}>第 ${i + 1} 節</option>`).join('');
  if (val && !PT.slice(1).some(p => p[k] === val)) h += `<option value="${val}" selected>${val}</option>`;
  return h;
}
function slotRow(s) {
  return `<div class="slot">
    <div class="srow">
      <select class="sDay" aria-label="星期">${[1, 2, 3, 4, 5].map(i => `<option value="${i}"${i === s.day ? ' selected' : ''}>週${DAYS[i]}</option>`).join('')}</select>
      <select class="sS" aria-label="開始節次">${periodOpts(s.s, 0)}</select>
      <select class="sE" aria-label="結束節次">${periodOpts(s.e, 1)}</select>
      <button type="button" class="rm" data-rmslot aria-label="移除這個時段">✕</button>
      <input class="sRoom" placeholder="教室" value="${esc(s.room || '')}" aria-label="教室">
    </div>
    <p class="swarn" hidden></p></div>`;
}

function renderSwatches() {
  $('#fColors').innerHTML = ['', ...COLORS].map(c =>
    `<button type="button" class="sw${c === formColor ? ' on' : ''}" data-color="${c}" style="${c ? 'background:' + c : ''}"
      aria-label="${c ? '顏色 ' + c : '依類別自動配色'}" aria-pressed="${c === formColor}">${c ? '' : '自動'}</button>`).join('');
}

const readSlots = () => $$('.slot').map(r => ({ day: +$('.sDay', r).value, s: $('.sS', r).value, e: $('.sE', r).value, room: $('.sRoom', r).value.trim() }));

// 與其他課程撞時段 → 只提醒，不擋儲存。回傳每個時段的訊息陣列
function conflictsOf(slots, orig) {
  return slots.map(a => {
    if (toMin(a.e) <= toMin(a.s)) return { bad: true, msg: '結束節次要晚於開始節次' };
    const o = S.courses.find(c => c.name !== orig && clash(a, c));
    return o ? { msg: `和「${o.name}」${periodLabel(o.s, o.e)}衝突，仍要儲存嗎？` } : null;
  });
}

function renderPrev() {
  const name = $('#fName').value.trim() || '課程名稱';
  const slots = readSlots();
  const rooms = [...new Set(slots.map(x => x.room).filter(Boolean))].join('、');
  const place = [rooms, $('#fTeacher').value.trim()].filter(Boolean).join(' · ');
  const p = $('#fPrev');
  p.className = 'prev t-' + $('#fType').value;
  p.style.cssText = formColor ? `--c:${formColor}` : '';
  p.innerHTML = `<b>${esc(name)}</b>${place ? `<small>${esc(place)}</small>` : ''}` +
    slots.map(x => `<small>週${DAYS[x.day]} ${x.s}–${x.e}</small>`).join('');
  const days = [...new Set(slots.map(x => '週' + DAYS[x.day]))].join('、');
  const per = [...new Set(slots.map(x => periodLabel(x.s, x.e)))].join('、');
  $('#fSum').innerHTML = `每週 ${slots.length} 次 · ${days}<br>${per} · 共 ${Math.max(0, +$('#fCredits').value || 0)} 學分`;
  // 每個時段下方的衝突提醒
  const cf = conflictsOf(slots, $('#fOrig').value);
  $$('.slot').forEach((r, i) => {
    const w = $('.swarn', r), x = cf[i];
    w.hidden = !x; w.textContent = x ? '⚠ ' + x.msg : ''; w.classList.toggle('bad', !!x?.bad);
  });
}

// name 有值＝編輯該門課；否則是新增（day / start 是預設時段）
function openForm(day = 1, start = '09:10', name = null) {
  $('#courseForm').reset();
  $('#fErr').textContent = '';
  $('#fType').innerHTML = Object.entries(TYPES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');

  const group = name ? S.courses.filter(c => c.name === name).sort((a, b) => a.day - b.day || byTime(a, b)) : [];
  const c = group[0];
  $('#fTitle').textContent = c ? '編輯課程' : '新增課程';
  $('#fOrig').value = c ? c.name : '';
  $('#fName').value = c ? c.name : '';
  $('#fCode').value = c?.code || '';
  $('#fCredits').value = c?.credits ?? 0;
  $('#fTeacher').value = c?.teacher || '';
  $('#fEmail').value = c?.email || '';
  $('#fGrading').value = c?.grading || '';
  $('#fAbs').value = c?.absLimit || 3;
  $('#fMore').open = !!(c && (c.code || c.email || c.grading));
  $('#fType').value = c ? c.type : 'req';
  $('#fNote').value = c ? (S.notes[c.name] || '') : '';
  formColor = COLORS.includes(c?.color) ? c.color : '';

  const snap = t => PT.slice(1).find(p => p[0] >= t)?.[0] || t; // 點到的時間對齊到最近的節次
  const s0 = snap(start), i0 = PT.findIndex(p => p && p[0] === s0);
  const def = { day, s: s0, e: PT[Math.min(8, i0 + 1)]?.[1] || fmt(Math.min(toMin(start) + 110, END)), room: '' };
  $('#fSlots').innerHTML = (group.length ? group : [def]).map(slotRow).join('');
  renderSwatches();
  renderPrev();
  $('#form').showModal();
  $('#fName').focus();
}

// 回傳錯誤訊息；空字串代表通過（與其他課衝突只提醒，見 conflictsOf）
function checkForm(orig, name, slots) {
  if (!name) return '請輸入課程名稱';
  if (name !== orig && S.courses.some(c => c.name === name)) return `已經有「${name}」這門課了，請從課表點進去編輯，或換個名稱`;
  for (let i = 0; i < slots.length; i++) {
    const a = slots[i];
    if (!a.s || !a.e) return `第 ${i + 1} 個時段請選擇開始與結束節次`;
    if (toMin(a.e) <= toMin(a.s)) return `第 ${i + 1} 個時段：結束節次要晚於開始節次`;
    for (let j = i + 1; j < slots.length; j++) if (clash(a, slots[j])) return `第 ${i + 1} 與第 ${j + 1} 個時段時間重疊`;
  }
  return '';
}

/* ========== 事件 ========== */
document.addEventListener('click', e => {
  const t = e.target;
  const open = t.closest('[data-open]');
  if (open) { openDetail(open.dataset.open); return; }

  // 課程表單內的按鈕
  const sw = t.closest('[data-color]');
  if (sw) { formColor = sw.dataset.color; renderSwatches(); renderPrev(); return; }
  if (t.closest('[data-addslot]')) {
    const last = $$('.slot').at(-1);
    const row = last
      ? { day: Math.min(5, +$('.sDay', last).value + 1), s: $('.sS', last).value, e: $('.sE', last).value, room: $('.sRoom', last).value }
      : { day: 1, s: '09:10', e: '11:00' };
    $('#fSlots').insertAdjacentHTML('beforeend', slotRow(row));
    renderPrev(); return;
  }
  const rm = t.closest('[data-rmslot]');
  if (rm) {
    if ($$('.slot').length <= 1) { $('#fErr').textContent = '至少要有一個上課時段'; return; }
    rm.closest('.slot').remove(); $('#fErr').textContent = ''; renderPrev(); return;
  }

  // 詳細頁：編輯／刪除
  const ed = t.closest('[data-edit]');
  if (ed) {
    const c = S.courses.find(x => x.id === ed.dataset.edit);
    if (c) { $('#detail').close(); openForm(c.day, c.s, c.name); }
    return;
  }
  const del = t.closest('[data-delcourse]');
  if (del) {
    const c = S.courses.find(x => x.id === del.dataset.delcourse); if (!c) return;
    const n = S.courses.filter(x => x.name === c.name).length, k = S.tasks.filter(x => x.course === c.name).length;
    if (confirm(`確定要刪除「${c.name}」嗎？\n會一併移除 ${n} 個上課時段${k ? `、${k} 項作業與考試` : ''}和課堂筆記。`)) {
      S.courses = S.courses.filter(x => x.name !== c.name);
      S.tasks = S.tasks.filter(x => x.course !== c.name);
      delete S.notes[c.name]; delete S.absent[c.name];
      save(); $('#detail').close(); renderAll();
    }
    return;
  }

  const ab = t.closest('[data-abs]');
  if (ab) {
    const c = S.courses.find(x => x.id === $('#detail').dataset.id);
    S.absent[c.name] = Math.max(0, (S.absent[c.name] || 0) + +ab.dataset.abs);
    save(); openDetail(c.id); return;
  }
  const at = t.closest('[data-addtask]');
  if (at) { const f = at.parentElement.querySelector('.dtForm'); f.hidden = !f.hidden; if (!f.hidden) f.elements.title.focus(); return; }

  if (t.closest('[data-close]')) { t.closest('dialog').close(); return; }
  if (t.matches('dialog')) { // 只有點到視窗外的遮罩才關閉，避免點到表單邊緣誤關
    const r = t.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) t.close();
    return;
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

// 表單有任何改動就即時更新預覽
['input', 'change'].forEach(ev => $('#courseForm').addEventListener(ev, renderPrev));

$('#courseForm').onsubmit = e => {
  e.preventDefault();
  const orig = $('#fOrig').value, name = $('#fName').value.trim();
  const slots = readSlots().sort((a, b) => a.day - b.day || toMin(a.s || '00:00') - toMin(b.s || '00:00'));
  const err = checkForm(orig, name, slots);
  if (err) { $('#fErr').textContent = err; return; }

  const hits = conflictsOf(slots, orig).map((x, i) => x && `第 ${i + 1} 個時段（週${DAYS[slots[i].day]} ${periodLabel(slots[i].s, slots[i].e)}）：${x.msg.replace('，仍要儲存嗎？', '')}`).filter(Boolean);
  if (hits.length && !confirm(hits.join('\n') + '\n\n仍要儲存嗎？')) return;

  const old = S.courses.filter(c => c.name === orig);
  const base = {
    name, code: $('#fCode').value.trim(), teacher: $('#fTeacher').value.trim(),
    email: $('#fEmail').value.trim(), grading: $('#fGrading').value.trim(),
    absLimit: Math.max(1, +$('#fAbs').value || 3),
    type: $('#fType').value, credits: Math.max(0, +$('#fCredits').value || 0), color: formColor
  };
  S.courses = S.courses.filter(c => c.name !== orig);
  slots.forEach((s, i) => S.courses.push({ id: old[i]?.id || 'c' + Date.now() + '_' + i, ...base, ...s }));

  if (orig && orig !== name) { // 改課名：作業、筆記、缺課紀錄跟著搬過去
    S.tasks.forEach(t => { if (t.course === orig) t.course = name; });
    delete S.notes[orig];
    if (S.absent[orig] != null) { S.absent[name] = S.absent[orig]; delete S.absent[orig]; }
  }
  const note = $('#fNote').value;
  if (note.trim()) S.notes[name] = note; else delete S.notes[name];

  save(); $('#form').close(); renderAll();
  if (orig) openDetail(S.courses.find(c => c.name === name).id); // 編輯完回到詳細頁
};

// 詳細頁內直接新增作業／考試
document.addEventListener('submit', e => {
  const f = e.target; if (!f.matches('.dtForm')) return;
  e.preventDefault();
  const c = S.courses.find(x => x.id === $('#detail').dataset.id); if (!c) return;
  S.tasks.push({ id: 't' + Date.now(), title: f.elements.title.value.trim(), course: c.name, due: +f.elements.due.value, dueDate: isoDate(dueDate(+f.elements.due.value)), kind: f.elements.kind.value, done: false });
  save(); renderAll(); openDetail(c.id);
});

$('#taskForm').onsubmit = e => {
  e.preventDefault();
  S.tasks.push({ id: 't' + Date.now(), title: $('#tTitle').value.trim(), course: $('#tCourse').value, due: +$('#tDue').value, kind:$('#tKind').value, done: false });
  $('#tTitle').value = ''; save(); renderAll();
};

$('#sTerm').oninput = e => { S.term = e.target.value; save(); renderFoot(); };
$('#sStart').onchange = e => { if (e.target.value) { S.start = e.target.value; save(); renderAll(); } };
$('#reset').onclick = () => { if (confirm('要還原成範例資料嗎？你新增的內容會被清除。')) { S = structuredClone(DEFAULTS); save(); renderAll(); } };
$('#taskAdd').onclick = () => { $('#taskForm').classList.toggle('open'); if ($('#taskForm').classList.contains('open')) $('#tTitle').focus(); };
document.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>{document.querySelectorAll('[data-filter]').forEach(x=>x.classList.toggle('on',x===b));renderTasks()});
$('#taskCourseFilter').onchange=renderTasks; $('#showDone').onchange=renderTasks;
const PERIOD_DATA = [["08:10","09:00"],["09:10","10:00"],["10:10","11:00"],["11:10","12:00"],["13:30","14:15"],["14:25","15:10"],["15:20","16:05"],["16:15","17:00"]];
function renderPeriods(){ $('#periodRows').innerHTML=PERIOD_DATA.map((p,i)=>`<div class="periodRow"><b>第 ${i+1} 節</b><input type="time" value="${p[0]}" aria-label="第 ${i+1} 節開始"><input type="time" value="${p[1]}" aria-label="第 ${i+1} 節結束"></div>`).join(''); }
renderPeriods();
$('#addPeriod').onclick=()=>{const n=PERIOD_DATA.length+1;PERIOD_DATA.push(['17:20','18:10']);renderPeriods();$('#addPeriod').textContent=`＋ 加第 ${n+1} 節（晚上）`;};
document.querySelectorAll('.segmented').forEach(group=>group.onclick=e=>{const b=e.target.closest('button');if(b){group.querySelectorAll('button').forEach(x=>x.classList.toggle('selected',x===b));}});
const themeButton = document.querySelector('.switch[data-setting="dark"]');
const themePrefKey = 'schedule-theme';
function applyTheme(mode) {
  const dark = mode === 'dark' || (mode === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  themeButton?.classList.toggle('on', dark);
  themeButton?.setAttribute('aria-pressed', String(dark));
}
const savedTheme = localStorage.getItem(themePrefKey) || 'system';
applyTheme(savedTheme);
themeButton?.addEventListener('click', () => {
  const currentDark = document.documentElement.dataset.theme === 'dark';
  const next = currentDark ? 'light' : 'dark';
  localStorage.setItem(themePrefKey, next);
  applyTheme(next);
});
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => {
  if ((localStorage.getItem(themePrefKey) || 'system') === 'system') applyTheme('system');
});
document.querySelectorAll('.switch:not([data-setting="dark"])').forEach(b=>b.onclick=()=>{b.classList.toggle('on');b.setAttribute('aria-pressed',String(b.classList.contains('on')));});
$('#exportData').onclick=()=>{const blob=new Blob([JSON.stringify(S,null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='schedule.json';a.click();URL.revokeObjectURL(a.href);};
$('#importData').onchange=async e=>{try{const d=JSON.parse(await e.target.files[0].text());if(!d.courses||!Array.isArray(d.tasks))throw 0;S={...structuredClone(DEFAULTS),...d};save();renderAll();alert('匯入完成');}catch{alert('檔案格式不正確，請選擇課表 JSON。')}e.target.value='';};
$('#shareData').onclick=async()=>{const encoded=btoa(unescape(encodeURIComponent(JSON.stringify(S))));const link=location.href.split('#')[0]+'#share='+encoded;try{await navigator.clipboard.writeText(link);alert('課表分享連結已複製');}catch{prompt('複製此分享連結',link)}};

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
