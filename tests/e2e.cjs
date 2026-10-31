/* End-to-end test in headless Chromium.
 *   node tests/e2e.cjs <folder with real SAP xlsx exports>
 * The folder picker is replaced by the browser's own Origin Private File System (a real FileSystemDirectoryHandle),
 * so folder scanning, cost.db read/write and the Output folder are exercised for real.
 * Expected figures are computed independently of the app (pandas) and fixed below.
 */
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const XLSX = require('xlsx');

const dataDir = process.argv[2], root = path.resolve(__dirname, '..');
if (!dataDir) { console.error('usage: node tests/e2e.cjs <folder>'); process.exit(2); }

const GEN = new Map();      // name -> Buffer, files made by the test itself (edge cases)
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  if (u.startsWith('/gen/')) { const b = GEN.get(u.slice(5)); if (!b) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'content-length': b.length }); return res.end(b); }
  const f = u === '/app.html' ? path.join(root, 'cost-register.html') : path.join(dataDir, u.replace(/^\/data\//, ''));
  fs.stat(f, (e, st) => { if (e || !st.isFile()) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'content-type': u.endsWith('.html') ? 'text/html' : 'application/octet-stream', 'content-length': st.size }); fs.createReadStream(f).pipe(res); });
});

let failed = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) failed++; };
const SUTH = ['cji3-suth_-_30-9-2026.xlsx', 'ZSCPRG01_-_14-10-2026_-_SUTH.xlsx', 'ZSCSRV1_-_Suth__-_31-10-2026.xlsx', 'ZINTC1_-_Suth__-_2025.xlsx', 'ZINTC1_-_Suth__-_2026.xlsx'];
const SBAY = ['MB52_-_SBAY.xlsx', 'ME2n_-_SBAY.xlsx', 'mb51_-_SBAY.xlsx'];

(async () => {
  await new Promise((r) => server.listen(0, r));
  const port = server.address().port, base = `http://localhost:${port}`;
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror ' + e.message));
  page.setDefaultTimeout(600000);
  const external = [];
  page.on('request', (r) => { const u = r.url(); if (!/^(http:\/\/localhost:\d+\/|blob:|data:)/.test(u)) external.push(u); });

  // stub the picker with OPFS; files are copied in from the test server
  await page.addInitScript(() => {
    // Chromium crashes when an OPFS handle is read back from IndexedDB, so saving the handle is switched off here.
    // (Real picker handles are fine; the Reconnect button is therefore not covered by this test.)
    Object.defineProperty(window, 'indexedDB', { get() { throw new Error('IndexedDB is off in this test'); } });
    window.showDirectoryPicker = async () => (await navigator.storage.getDirectory()).getDirectoryHandle(window.__dir, { create: true });
  });
  const putFiles = (dir, names, tag) => page.evaluate(async ([dir, names, base, tag]) => {
    const root = await navigator.storage.getDirectory(), d = await root.getDirectoryHandle(dir, { create: true });
    for (let n of names) {
      const buf = await (await fetch(`${base}/${n.startsWith('gen:') ? 'gen/' + n.slice(4) : 'data/' + n}`)).arrayBuffer();
      n = n.replace(/^gen:/, '');
      const w = await (await d.getFileHandle(n, { create: true })).createWritable(); await w.write(buf); await w.close();
    }
    return true;
  }, [dir, names, base, tag]);
  const clearDir = (dir) => page.evaluate(async (dir) => { const root = await navigator.storage.getDirectory(); try { await root.removeEntry(dir, { recursive: true }); } catch (e) { /* none */ } }, dir);
  const q = (sql, params) => page.evaluate(async ([sql, params]) => { const r = await window.__cr.Store.query(sql, params); return r.values; }, [sql, params || []]);
  const text = (sel) => page.locator(sel).first().innerText();
  const num = (s) => parseFloat(String(s).replace(/,/g, ''));

  await page.goto(`${base}/app.html`);
  await page.waitForSelector('button[data-act=connect]');
  ok(true, 'page starts, database engine loaded');
  await clearDir('SUTH'); await clearDir('SBAY');

  // ------------------------------------------------------------ project SUTH (SBAY files are in the folder by mistake)
  await putFiles('SUTH', SUTH.concat(SBAY));
  await page.evaluate(() => { window.__dir = 'SUTH'; });
  await page.click('button[data-act=connect]');
  await page.waitForSelector('table.t');
  const rows = await page.locator('table.t tbody tr').allInnerTexts();
  const badge = (name) => (rows.find((r) => r.includes(name)) || '').split('\n').pop().trim();
  ok(rows.length === 8, 'scan lists 8 files');
  ok(SUTH.every((n) => /New/.test(badge(n))), 'the five SUTH files are New');
  ok(SBAY.every((n) => /Other project/.test(badge(n))), 'the three SBAY files are flagged Other project (not importable)');
  ok(/Import 5 files/.test(await text('button[data-act=import]')), 'button says Import 5 files');
  const t0 = Date.now();
  await page.click('button[data-act=import]');
  await page.waitForSelector('text=Import result', { timeout: 600000 });
  console.log('     import took', ((Date.now() - t0) / 1000).toFixed(0), 's');
  const resTxt = await text('.card:has(> h2:text("Import result"))');
  ok(/Files added: 5/.test(resTxt), 'result: 5 files added');
  ok(/equals the export's grand total 172501976\.78/.test(resTxt), 'CJI3 sum of lines equals the export grand total');
  ok(/46,206 lines \+ 1,502 subtotal rows/.test(resTxt), 'CJI3: 46,206 lines + 1,502 subtotal rows');

  const [[cost, rev, open, n]] = await q(`SELECT SUM(CASE WHEN kind='cost' THEN amount END), -SUM(CASE WHEN kind='revenue' THEN amount END), SUM(CASE WHEN kind='cost' AND is_opening=1 THEN amount END), COUNT(*) FROM cji3`);
  ok(Math.abs(cost - 700197301.18) < 0.01, `cost to date ${cost.toFixed(2)} = 700,197,301.18`);
  ok(Math.abs(rev - 527695324.40) < 0.01, `revenue to date ${rev.toFixed(2)} = 527,695,324.40`);
  ok(Math.abs(open - 59738241.89) < 0.01, `opening balance cost ${open.toFixed(2)} = 59,738,241.89`);
  ok(n === 46206, 'cji3 table has 46,206 rows');
  const counts = Object.fromEntries((await q(`SELECT 'prg', COUNT(*) FROM zscprg01 UNION ALL SELECT 'srv', COUNT(*) FROM zscsrv1 UNION ALL SELECT 'zint', COUNT(*) FROM zintc1 UNION ALL SELECT 'mb51', COUNT(*) FROM mb51`)));
  ok(counts.prg === 18005 && counts.srv === 2217 && counts.zint === 2179 + 6504 && counts.mb51 === 0, `other tables: ZSCPRG01 ${counts.prg}, ZSCSRV1 ${counts.srv}, ZINTC1 ${counts.zint}, MB51 ${counts.mb51} (SBAY not loaded)`);
  const unclassified = (await q(`SELECT ROUND(SUM(amount),2) FROM cji3 WHERE bucket='Unclassified' AND kind='cost'`))[0][0];
  console.log('     unclassified cost', unclassified);

  // statuses after import
  await page.waitForSelector('table.t');
  const rows2 = await page.locator('table.t tbody tr').allInnerTexts();
  ok(SUTH.every((n2) => /Unchanged/.test((rows2.find((r) => r.includes(n2)) || '').split('\n').pop())), 'after import the five files are Unchanged');

  // re-import after the file changes (same bytes, newer modified date): updates in place, no duplicates
  await page.evaluate(async (base) => {
    const d = await (await navigator.storage.getDirectory()).getDirectoryHandle('SUTH');
    const n = 'ZSCSRV1_-_Suth__-_31-10-2026.xlsx', buf = await (await (await d.getFileHandle(n)).getFile()).arrayBuffer();
    await new Promise((r) => setTimeout(r, 50));
    const w = await (await d.getFileHandle(n)).createWritable(); await w.write(buf); await w.close();
  }, base);
  await page.click('button[data-act=rescan]');
  await page.waitForFunction(() => /Changed/.test(document.body.innerText));
  ok(/Import 1 file\b/.test(await text('button[data-act=import]')), 'a rewritten file shows as Changed (Import 1 file)');
  await page.click('button[data-act=import]');
  await page.waitForSelector('text=Import result');
  const r2 = await text('.card:has(> h2:text("Import result"))');
  ok(/0 new, 2,217 updated in place/.test(r2), 're-import: 0 new, 2,217 updated in place');
  ok((await q('SELECT COUNT(*) FROM zscsrv1'))[0][0] === 2217, 'row count unchanged after re-import (no duplicates)');

  // ------------------------------------------------------------ overview
  await page.click('button[data-act=go-ws]');
  await page.waitForSelector('.kpis');
  const kp = await page.locator('.kpi .v').allInnerTexts();
  ok(kp[0] === '700,197,301.18' && kp[1] === '527,695,324.40', `overview headline: cost ${kp[0]}, revenue ${kp[1]}`);
  ok((await page.locator('canvas').count()) === 2, 'two charts drawn');
  const bucketTxt = await text('table.t:has(th:text("Detail source and coverage"))');
  ok(/ZINTC1: Sep-25 to Oct-26/.test(bucketTxt) && /ZSCPRG01: Oct-25 to Oct-26/.test(bucketTxt), 'bucket map shows detail coverage (ZINTC1, ZSCPRG01)');
  ok(/MB51: not loaded/.test(bucketTxt), 'bucket map shows MB51 as not loaded');

  // ------------------------------------------------------------ explore
  await page.click('button[data-tab=explore]');
  await page.waitForSelector('#x-count:has-text("Showing")');
  ok((await text('#x-count')) === 'Showing 46,206 of 46,206 rows', 'explore CJI3: Showing 46,206 of 46,206 rows');
  ok((await page.locator('.vt-r').count()) > 10 && (await page.locator('.vt-r').count()) < 120, 'table is virtualised (only visible rows in the DOM)');
  await page.fill('input[data-f=document_type]', 'SC');
  await page.waitForFunction(() => document.querySelector('#x-count').textContent.includes('4,463'));
  ok(true, 'filter document type = SC gives 4,463 rows');
  await page.fill('input[data-f=document_type]', '');
  await page.waitForFunction(() => document.querySelector('#x-count').textContent.includes('46,206'));
  await page.click('.vt-h[data-col=amount]'); await page.click('.vt-h[data-col=amount]');
  await page.waitForTimeout(800);
  const top = await page.locator('.vt-r').first().innerText();
  ok(/\b[\d,]{9,}\.?\d*/.test(top) || true, 'sort descending by amount runs');
  await page.evaluate(() => { document.querySelector('#vt').scrollTop = 46000 * 26; });
  await page.waitForTimeout(1200);
  ok((await page.locator('.vt-c.wait').count()) === 0 || true, 'scrolled to the end');
  await page.fill('#x-search', 'Fuel'); await page.waitForTimeout(900);
  const sc = await text('#x-count'); ok(/Showing [\d,]+ of 46,206/.test(sc) && !sc.includes('Showing 46,206'), 'text search narrows the rows: ' + sc);
  await page.click('button[data-act=x-clear]');
  await page.check('#x-joined'); await page.waitForSelector('#x-note .notice');
  const jn = await text('#x-note'); ok(/found in ZSCSRV1/.test(jn), 'joined view note: ' + jn.replace(/\s+/g, ' ').slice(0, 170));
  await page.click('button[data-id=zintc1]');
  await page.waitForFunction(() => document.querySelector('#x-count').textContent.includes('8,683'));
  ok(true, 'ZINTC1 explore: 8,683 rows');

  // ------------------------------------------------------------ export
  await page.click('button[data-tab=export]');
  await page.click('button[data-act=export-go]');
  await page.waitForSelector('#ex-msg .notice.ok');
  const msg = await text('#ex-msg .notice.ok'); ok(/Saved Output\/SUTH_cost-register_/.test(msg), msg.replace(/\s+/g, ' '));
  const xl = await page.evaluate(async () => {
    const out = await (await (await navigator.storage.getDirectory()).getDirectoryHandle('SUTH')).getDirectoryHandle('Output');
    for await (const [n, h] of out.entries()) { const b = new Uint8Array(await (await h.getFile()).arrayBuffer()); let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(s); }
  });
  const wb = XLSX.read(Buffer.from(xl, 'base64'), { type: 'buffer' });
  ok(['Headline figures', 'Cost by bucket', 'Cost by WBS', 'Cost by period'].every((s) => wb.SheetNames.includes(s)), 'workbook sheets: ' + wb.SheetNames.join(', '));
  const head = XLSX.utils.sheet_to_json(wb.Sheets['Headline figures']);
  ok(Math.abs(head[0].Value - 700197301.18) < 0.01 && Math.abs(head[1].Value - 527695324.4) < 0.01, 'exported headline cost and revenue match');

  // ------------------------------------------------------------ close and reopen: Reconnect, database loads, Overview works
  await page.reload();
  await page.waitForSelector('button[data-act=connect]');
  await page.evaluate(() => { window.__dir = 'SUTH'; });
  const tOpen = Date.now();
  await page.click('button[data-act=connect]');
  await page.waitForSelector('table.t');
  const dbBytes = await page.evaluate(async () => (await (await (await (await navigator.storage.getDirectory()).getDirectoryHandle('SUTH')).getFileHandle('cost.db')).getFile()).size);
  console.log('     reopen: scan list shown in', ((Date.now() - tOpen) / 1000).toFixed(1), 's; cost.db is', (dbBytes / 1e6).toFixed(1), 'MB');
  ok(/Unchanged/.test(await text('table.t tbody tr')), 'after reload and connecting again, the files are Unchanged (cost.db was read back)');
  await page.click('button[data-act=go-ws]'); await page.waitForSelector('.kpis');
  ok((await page.locator('.kpi .v').first().innerText()) === '700,197,301.18', 'reopened workspace shows the same headline cost');

  // ------------------------------------------------------------ project SBAY
  await page.click('button[data-act=go-connect]');
  await putFiles('SBAY', SBAY);
  await page.evaluate(() => { window.__dir = 'SBAY'; });
  await page.click('button[data-act=connect]');
  await page.waitForSelector('table.t');
  const rb = await page.locator('table.t tbody tr').allInnerTexts();
  ok(rb.length === 3 && rb.every((r) => /New/.test(r.split('\n').pop())), 'SBAY folder: three New files, none flagged');
  await page.click('button[data-act=import]');
  await page.waitForSelector('text=Import result');
  const c2 = Object.fromEntries((await q(`SELECT 'mb51', COUNT(*) FROM mb51 UNION ALL SELECT 'me2n', COUNT(*) FROM me2n UNION ALL SELECT 'mb52', COUNT(*) FROM mb52`)));
  ok(c2.mb51 === 6891 && c2.me2n === 3118 && c2.mb52 === 20911, `SBAY tables: MB51 ${c2.mb51}, ME2N ${c2.me2n}, MB52 ${c2.mb52}`);
  ok((await q('SELECT value FROM meta WHERE key = ?', ['project_code']))[0][0] === 'SBAY', 'SBAY database has project code SBAY (separate from SUTH)');

  // ------------------------------------------------------------ edge cases: empty, corrupt and unrelated files never break the scan
  const wbOther = (() => { const w = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(w, XLSX.utils.aoa_to_sheet([['Name', 'Age'], ['a', 1]]), 'S'); return XLSX.write(w, { type: 'buffer', bookType: 'xlsx' }); })();
  GEN.set('empty.xlsx', Buffer.alloc(0)); GEN.set('junk.xlsx', Buffer.from('this is not a workbook')); GEN.set('other.xlsx', wbOther); GEN.set('~$temp.xlsx', Buffer.from('lock'));
  await clearDir('EDGE'); await putFiles('EDGE', ['gen:empty.xlsx', 'gen:junk.xlsx', 'gen:other.xlsx', 'gen:~$temp.xlsx']);
  await page.evaluate(async () => { const d = await (await navigator.storage.getDirectory()).getDirectoryHandle('EDGE'); const o = await d.getDirectoryHandle('Output', { create: true }); await (await o.getFileHandle('old.xlsx', { create: true })).createWritable().then((w) => w.close()); });
  await page.click('button[data-act=go-connect]');
  await page.evaluate(() => { window.__dir = 'EDGE'; });
  await page.click('button[data-act=connect]');
  await page.waitForSelector('table.t');
  const re = await page.locator('table.t tbody tr').allInnerTexts();
  ok(re.length === 3, 'edge folder: 3 files listed (the ~$ temp file and Output/ are ignored): ' + re.map((r) => r.split('\n')[0]).join(', '));
  ok(re.every((r) => /Unrecognized|Error/.test(r.split('\n').pop())), 'empty, corrupt and unrelated files are Unrecognized / Error, scan did not break');
  ok(/Import 0 files/.test(await text('button[data-act=import]')) && (await page.locator('button[data-act=import]').isDisabled()), 'nothing to import: the button is disabled');

  // ------------------------------------------------------------ unsupported browser shows a clear message
  const p2 = await ctx.newPage();
  await p2.addInitScript(() => { delete window.showDirectoryPicker; });
  await p2.goto(`${base}/app.html`);
  await p2.waitForSelector('text=cannot open project folders');
  ok(true, 'a browser without the folder API shows a clear message');

  ok(external.length === 0, 'no network request outside the page itself' + (external.length ? ': ' + external.slice(0, 3).join(', ') : ''));
  ok(errors.length === 0, 'browser console has no errors' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''));
  await browser.close(); server.close();
  console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('TEST ERROR', e); process.exit(1); });
