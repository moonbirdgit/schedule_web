'use strict';
/**
 * 除錯用：看程式從北商登入頁偵測到哪些欄位。
 *   npm run probe
 * 偵測錯了，就把正確的名稱寫進 server/ntub.config.json。
 */
require('./ntub').probe()
  .then(r => console.log(JSON.stringify(r, (k, v) => (k === 'hidden' ? Object.keys(v) : v), 2)))
  .catch(e => { console.error('失敗：', e.message); process.exit(1); });
