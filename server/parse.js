'use strict';
/**
 * 把北商「我的課表」頁面（STDWEB/Sel_Student.aspx）的 HTML 轉成統一 JSON。
 * 只用正規表示式，不需要額外套件。
 */

const CN_NUM = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };

/** 「第十一節」→ 11 */
function periodNo(label) {
  const s = label.replace(/[第節\s]/g, '');
  if (/^\d+$/.test(s)) return +s;
  if (s.startsWith('十')) return 10 + (CN_NUM[s[1]] || 0);
  if (s.includes('十')) return CN_NUM[s[0]] * 10 + (CN_NUM[s[2]] || 0);
  return CN_NUM[s] || 0;
}

const decode = s => s
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));
const strip = s => decode(s.replace(/<[^>]*>/g, '')).trim();

/** 讀 <select> 的選項和目前選中的值 */
function readSelect(html, name) {
  const m = html.match(new RegExp(`<select[^>]*name="${name}"[^>]*>([\\s\\S]*?)</select>`, 'i'));
  if (!m) return { options: [], selected: null };
  const options = [...m[1].matchAll(/<option([^>]*)value="([^"]*)"[^>]*>([\s\S]*?)<\/option>/gi)]
    .map(o => ({ value: o[2], label: strip(o[3]), selected: /selected/i.test(o[1]) }));
  const sel = options.find(o => o.selected) || options[0] || null;
  return { options: options.map(({ value, label }) => ({ value, label })), selected: sel && sel.value };
}

/**
 * @returns {{school:string, year:number|null, term:number|null,
 *   years:{value:string,label:string}[], terms:{value:string,label:string}[],
 *   periods:{period:number,label:string,start:string|null,end:string|null}[],
 *   courses:{id:string,name:string,teacher:string,code:string,times:{day:number,startPeriod:number,endPeriod:number,room:string}[]}[]}}
 */
function parseSchedule(html) {
  const at = html.search(/id=['"]bgBase['"]/);
  if (at < 0) throw new Error('找不到課表表格（bgBase），可能沒登入成功或頁面改版了');
  const end = html.indexOf('</table>', at);
  const table = html.slice(at, end < 0 ? undefined : end);

  const years = readSelect(html, 'ThisYear');
  const terms = readSelect(html, 'ThisTeam');

  const rows = [...table.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map(r => r[1]);
  const periods = [];
  const byCourse = new Map(); // key → { course, cells: Map(`${day}|${room}` → [period]) }

  for (const row of rows) {
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(c => c[1]);
    if (cells.length < 2) continue;
    const head = cells[0].split(/<br\s*\/?>/i).map(strip);
    const p = periodNo(head[0]);
    if (!p) continue; // 表頭那一列（節次 / 一 / 二 …）
    periods.push({ period: p, label: head[0], start: head[1] || null, end: head[2] || null });

    cells.slice(1).forEach((cell, i) => {
      const day = i + 1; // 1 = 週一 … 7 = 週日
      const link = cell.match(/ConnectCos_Short\('([^']*)','([^']*)','([^']*)','([^']*)'/);
      const parts = cell.split(/<br\s*\/?>/i).map(strip);
      const name = parts[0];
      if (!name) return;
      const teacher = parts[1] || '';
      const room = parts.slice(2).join(' ').trim();
      const [y, t, opClass, serial] = link ? link.slice(1) : ['', '', '', ''];
      const key = link ? `${opClass}-${serial}` : `${name}-${teacher}`;
      if (!byCourse.has(key)) {
        byCourse.set(key, {
          course: { id: link ? `${y}-${t}-${opClass}-${serial}` : key, name, teacher, code: opClass, times: [] },
          cells: new Map()
        });
      }
      const slot = byCourse.get(key).cells;
      const k = `${day}|${room}`;
      if (!slot.has(k)) slot.set(k, []);
      slot.get(k).push(p);
    });
  }

  // 連續的節次合併成一段：[2,3,4] → 2–4；[2,3,6] → 2–3、6–6
  const courses = [];
  for (const { course, cells } of byCourse.values()) {
    for (const [k, ps] of cells) {
      const [day, room] = [+k.split('|')[0], k.slice(k.indexOf('|') + 1)];
      ps.sort((a, b) => a - b);
      let s = ps[0], prev = ps[0];
      for (const x of [...ps.slice(1), null]) {
        if (x === prev + 1) { prev = x; continue; }
        course.times.push({ day, startPeriod: s, endPeriod: prev, room });
        s = prev = x;
      }
    }
    course.times.sort((a, b) => a.day - b.day || a.startPeriod - b.startPeriod);
    courses.push(course);
  }

  return {
    school: 'NTUB',
    year: years.selected ? +years.selected : null,
    term: terms.selected ? +terms.selected : null,
    years: years.options,
    terms: terms.options,
    periods,
    courses
  };
}

/** 依課名猜類別（前端的 TYPES：req 必修 / elec 選修 / gen 通識 / lab 實作 / pe 體育） */
function guessType(name) {
  if (/體育|健身|運動|球|游泳|舞/.test(name)) return 'pe';
  if (/通識|語言與人生|人生|藝術|哲學|歷史/.test(name)) return 'gen';
  if (/實作|實習|專題|程式設計|實驗/.test(name)) return 'lab';
  return 'req';
}

/**
 * 統一 JSON → 目前 script.js 用的課程格式（一個時段一筆）
 * { id, name, room, teacher, day, s, e, type, credits }
 */
function toAppCourses(semester) {
  const time = new Map(semester.periods.map(p => [p.period, p]));
  const out = [];
  for (const c of semester.courses) {
    c.times.forEach((t, i) => {
      const s = time.get(t.startPeriod) && time.get(t.startPeriod).start;
      const e = time.get(t.endPeriod) && time.get(t.endPeriod).end;
      if (!s || !e) return; // 沒有時間的節次（例如北商第十節）就跳過
      out.push({
        id: `ntub-${c.id}-${i}`, name: c.name, room: t.room, teacher: c.teacher,
        day: t.day, s, e, type: guessType(c.name), credits: 0
      });
    });
  }
  return out;
}

module.exports = { parseSchedule, toAppCourses, periodNo, guessType };
