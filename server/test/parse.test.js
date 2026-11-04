'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { parseSchedule, toAppCourses, periodNo } = require('../parse');
const { readForm } = require('../ntub');

const html = fs.readFileSync(path.join(__dirname, 'fixture_sel_student.html'), 'utf8');

test('節次中文數字', () => {
  assert.deepStrictEqual(['第一節', '第十節', '第十一節', '第十四節', '第二十節'].map(periodNo), [1, 10, 11, 14, 20]);
});

test('解析北商課表', () => {
  const d = parseSchedule(html);
  assert.strictEqual(d.year, 115);
  assert.strictEqual(d.term, 1);
  assert.strictEqual(d.periods.length, 14);
  assert.deepStrictEqual(d.periods[4], { period: 5, label: '第五節', start: '13:30', end: '14:20' });
  assert.strictEqual(d.periods[9].start, null); // 第十節沒有時間
  assert.strictEqual(d.courses.length, 8);

  const db = d.courses.find(c => c.name === '資料庫管理');
  assert.strictEqual(db.teacher, '李文毅');
  assert.deepStrictEqual(db.times, [{ day: 4, startPeriod: 5, endPeriod: 7, room: '電708(承曦樓)' }]);

  const net = d.courses.find(c => c.name === '資訊網路');
  assert.deepStrictEqual(net.times, [{ day: 1, startPeriod: 2, endPeriod: 4, room: '電606(承曦樓)' }]);
});

test('轉成前端格式', () => {
  const list = toAppCourses(parseSchedule(html));
  assert.strictEqual(list.length, 8);
  const pe = list.find(c => c.name === '健身運動(上)');
  assert.deepStrictEqual({ day: pe.day, s: pe.s, e: pe.e, type: pe.type, room: pe.room }, { day: 3, s: '13:30', e: '15:15', type: 'pe', room: '重量訓練室' });
  const db = list.find(c => c.name === '資料庫管理');
  assert.strictEqual(db.e, '16:15');
});

test('找不到課表會丟錯', () => {
  assert.throws(() => parseSchedule('<html>請重新登入</html>'), /bgBase/);
});

test('自動偵測 ASP.NET 登入表單', () => {
  const f = readForm(`<form method="post" action="./login.aspx" id="form1">
    <input type="hidden" name="__VIEWSTATE" value="abc" /><input type="hidden" name="__EVENTVALIDATION" value="x" />
    <input name="txtUserID" type="text" id="txtUserID" /><input name="txtPassword" type="password" />
    <input name="txtCheckCode" type="text" id="txtCheckCode" /><img id="imgCode" src="ValidateCode.aspx?x=1&amp;y=2" />
    <input type="submit" name="btnLogin" value="登入" /></form>`);
  assert.strictEqual(f.account, 'txtUserID');
  assert.strictEqual(f.password, 'txtPassword');
  assert.strictEqual(f.captcha, 'txtCheckCode');
  assert.deepStrictEqual(f.submit, { name: 'btnLogin', value: '登入', image: false });
  assert.strictEqual(f.captchaSrc, 'ValidateCode.aspx?x=1&y=2');
  assert.deepStrictEqual(Object.keys(f.hidden), ['__VIEWSTATE', '__EVENTVALIDATION']);
});
