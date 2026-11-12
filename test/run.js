#!/usr/bin/env node
'use strict';
// Release checks for the Cost Register Tool – run before every release:  npm test   (runs both projects)
//   node test/run.js [--set suth|sbay] [--quick: skip 9 Excel export and 10 start-page build] [--only 7e,8: run only these sections (1–4 always run)]
//                    [--built: the Tool is already built (test/all.js builds it once)] [--update: rewrite that set's expected figures]
//   npm test = test/all.js: both projects at the same time
// Data: test/data (SUTH) and test/data-sbay (SBAY) = MASKED copies of the SAP files (tools/mask-sap.js): names and texts replaced, every number kept.
// Needs Playwright with Chromium (npm i -D playwright && npx playwright install chromium, if it is not on the machine).
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const args = process.argv.slice(2), UPDATE = args.includes('--update'), QUICK = args.includes('--quick'), BUILT = args.includes('--built'), ONLY = args.includes('--only') ? String(args[args.indexOf('--only') + 1] || '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean) : null, SET = (args[args.indexOf('--set') + 1] && args.includes('--set') ? args[args.indexOf('--set') + 1] : 'suth').toLowerCase();
const SETS = {
  suth: { dir: 'data', exp: 'expected.json', other: 'SBAY', F: { cji3: 'cji3.xlsx', zscprg01: 'zscprg01.xlsx', zscsrv1: 'zscsrv1.xlsx', zintc1: ['zintc1-2025.xlsx', 'zintc1-2026.xlsx'], mb52: 'mb52-other-project.xlsx' } },   // its MB52 is another project on purpose
  sbay: { dir: 'data-sbay', exp: 'expected-sbay.json', other: '', F: { cji3: 'cji3.xlsx', zscprg01: 'zscprg01.xlsx', zscsrv1: 'zscsrv1.xlsx', zintc1: ['zintc1.xlsx'], mb52: 'mb52.xlsx' } },
};
if (!SETS[SET]) { console.error('Unknown set ' + SET + ' – use ' + Object.keys(SETS).join(' / ')); process.exit(2); }
const ROOT = path.join(__dirname, '..'), DATA = path.join(__dirname, SETS[SET].dir), OUT = path.join(ROOT, 'out', 'test', SET), EXP = path.join(__dirname, SETS[SET].exp), F = SETS[SET].F;
console.log('Data set: ' + SET.toUpperCase());
const files = () => Object.values(F).flat().map((f) => path.join(DATA, f));

// ---------------------------------------------------------------------------------------------- tiny test kit
const results = []; let section = '';
const ok = (name, pass, detail = '') => { results.push({ section, name, pass: !!pass, detail }); console.log(`  ${pass ? '✓' : '✗'} ${name}${detail && !pass ? '  →  ' + detail : ''}`); };
const eq = (name, got, want, tol = 0.01) => ok(name, typeof want === 'number' ? Math.abs(got - want) <= tol : JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`);
const head = (s) => { section = s; console.log('\n' + s); };
const r2 = (x) => Math.round(x * 100) / 100;
// which sections run: 1–4 always (they open the register); --only picks sections; --quick leaves out the slow 9 and 10
const RUN = (k) => (!ONLY || ONLY.includes(k)) && !(QUICK && (k === '9' || k === '10'));

(async () => {
  const t0 = Date.now(); fs.mkdirSync(OUT, { recursive: true });
  const exp = fs.existsSync(EXP) ? JSON.parse(fs.readFileSync(EXP, 'utf8')) : {}, got = {};
  const want = (k, v) => { got[k] = v; return UPDATE || exp[k] === undefined ? v : exp[k]; };
  if (!files().every((f) => fs.existsSync(f))) { console.error('Test data missing in test/data – see test/README.md'); process.exit(2); }

  // ---------------------------------------------------------------------------- 1. files are recognised by their content
  head('1. File recognition');
  const { sniffInfo } = require('../src/sniff');
  const kinds = files().map((f) => [path.basename(f), sniffInfo(f)]);
  for (const [n, s] of kinds) eq(`${n} → ${s.kind} · ${s.proj}`, s, want('sniff:' + n, s));

  // ---------------------------------------------------------------------------- 2. engine: CJI3 split into buckets
  head('2. Engine');
  const { prepare } = require('../src/prepare'), { toAppData } = require('../src/appdata');
  const o = { cji3: path.join(DATA, F.cji3), zscprg01: path.join(DATA, F.zscprg01), zscsrv1: path.join(DATA, F.zscsrv1), zintc1: F.zintc1.map((f) => path.join(DATA, f)), mb52: path.join(DATA, F.mb52), log: () => {} };
  const CACHE = path.join(OUT, 'engine-cache.json'), SRC = path.join(ROOT, 'src'), stamp = JSON.stringify([...files(), ...fs.readdirSync(SRC).map((x) => path.join(SRC, x))].map((x) => [path.basename(x), fs.statSync(x).mtimeMs, fs.statSync(x).size]));
  let D = null; try { const c = JSON.parse(fs.readFileSync(CACHE, 'utf8')); if (c.stamp === stamp) D = c.D; } catch (e) { /* no cache yet */ }
  if (D) console.log('  (engine result reused – no data or engine file changed since the last run)'); else { D = toAppData(prepare(o), o); fs.writeFileSync(CACHE, JSON.stringify({ stamp, D })); }
  let sum = 0; for (const a of D.L.amt) sum += a;
  eq('project from the WBS', D.META.project, want('project', D.META.project));
  eq('CJI3 cost', D.META.cost, want('cost', D.META.cost));
  eq('CJI3 lines', D.L.b.length, want('lines', D.L.b.length), 0);
  eq('sum of all line amounts', r2(sum), want('lineSum', r2(sum)));
  eq('items', D.BK.reduce((x, b) => x + b.items.length, 0), want('items', D.BK.reduce((x, b) => x + b.items.length, 0)), 0);
  eq('items per bucket', D.BK.map((b) => b.id + ':' + b.items.length), want('bucketItems', D.BK.map((b) => b.id + ':' + b.items.length)));
  eq('no unclassified lines', D.META.unclassified || 0, 0, 0);
  eq('no duplicate line keys', D.META.dupes || 0, 0, 0);

  // ---------------------------------------------------------------------------- 3. build the Tool and a test app with the data inside
  head('3. Build');
  if (!BUILT) execFileSync('node', ['tools/build-app.js'], { cwd: ROOT, stdio: 'pipe' });
  const VER = fs.readFileSync(path.join(ROOT, 'VERSION'), 'utf8').trim(), TOOL = path.join(ROOT, 'out', `Cost_Register_Tool_v${VER}.html`), APP = path.join(OUT, 'test_app.html');
  ok('Tool built: ' + path.basename(TOOL), fs.existsSync(TOOL));
  ok('Tool has its version, no placeholder', fs.readFileSync(TOOL, 'utf8').includes('v' + VER) && !fs.readFileSync(TOOL, 'utf8').includes('__VER__'));
  fs.writeFileSync(APP, require('../tools/build-app').page('const DATA0=' + JSON.stringify(D) + ';'));
  ok('test app built', fs.existsSync(APP));

  // ---------------------------------------------------------------------------- 4. the app in a browser
  let chromium; try { ({ chromium } = require('playwright')); } catch (e) { console.error('Playwright is not installed – npm i -D playwright'); process.exit(2); }
  const browser = await chromium.launch(), errs = [];
  const open = async (url, ctxOpt = {}) => { const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, acceptDownloads: true, ...ctxOpt }), p = await ctx.newPage(); p.on('pageerror', (e) => errs.push(e.message)); p.on('dialog', (d) => (d.type() === 'beforeunload' ? d.accept() : d.dismiss())); await p.goto('file://' + url); await p.waitForFunction(() => document.querySelector('#tabs button'), null, { timeout: 60000 }); await p.waitForTimeout(1200); return { ctx, p }; };
  const { ctx, p } = await open(APP);
  head('4. Opening the register');
  eq('opens on the Dashboard', await p.$eval('#tabs button.on', (b) => b.dataset.s), 'dash');
  eq('tabs', await p.$$eval('#tabs button', (b) => b.map((x) => x.dataset.s)), ['dash', 'cod', 'xp', 'adj', 'chk', 'rep']);
  const R0 = await p.evaluate(() => ({ diff: R.diff, toDate: R.toDate, cd: R.cdAll, pend: R.pend, excl: R.excl }));
  eq('difference to CJI3 = 0', R0.diff, 0);
  eq('to date', r2(R0.toDate), want('toDate', r2(R0.toDate)));
  eq('client deductions', r2(R0.cd), want('clientDeductions', r2(R0.cd)));
  ok('footer: "Not saved to a file", no change counted (the automatic indirect fill is not a change of yours)', await p.$eval('#hasv', (e) => /Not saved to a file/.test(e.textContent) && !/change/.test(e.textContent)), await p.$eval('#hasv', (e) => e.textContent.slice(0, 300)));
  ok('no auto-save question before any coding', !(await p.$('#asm')));
  const bkTd = await p.evaluate(() => __BK.map((b) => b.id + ':' + Math.round(b.items.reduce((s, it) => s + it.td, 0))));
  eq('to date per bucket', bkTd, want('bucketToDate', bkTd));

  if (RUN('5')) {
  head('5. Indirect presets and opening balance');
  const ind = await p.evaluate(() => { const m = {}; __BK.forEach((b) => b.items.forEach((it) => { if (it.pkg === 'Indirect') m[b.id + ' ' + it.ce] = (m[b.id + ' ' + it.ce] || 0) + 1; })); return m; });
  eq('indirect items coded by the presets', Object.values(ind).reduce((x, y) => x + y, 0), want('presetItems', Object.values(ind).reduce((x, y) => x + y, 0)), 0);
  eq('indirect codes per bucket', ind, want('presetCodes', ind));
  const ob = await p.evaluate(() => { const { L, S, N } = __D; let m = 0; for (let i = 0; i < N; i++) if (L.d[i] && (!m || L.d[i] < m)) m = L.d[i]; let n = 0, a = 0; for (let i = 0; i < N; i++) if (S[L.ty[i]] === 'UE' && (/^OB\b/i.test(S[L.hdr[i]] || '') || L.d[i] === m)) { n++; a += L.amt[i]; } return [n, Math.round(a)]; });
  eq('opening-balance lines (UE / OB)', ob, want('openingBalance', ob));
  }

  if (RUN('6')) {
  head('6. Every page opens');
  const pages = await p.$$eval('#tabs button', (b) => b.map((x) => x.dataset.s));
  for (const s of pages) {
    await p.$eval(`#tabs [data-s="${s}"]`, (b) => b.click()); await p.waitForTimeout(300);
    const side = await p.$$eval('#side [data-gt]', (x) => [...new Set(x.map((y) => y.dataset.gt + '|' + (y.dataset.bk || '') + '|' + (y.dataset.uv || '') + '|' + (y.dataset.sv || '')))]);
    for (const k of side) { const [gt, bk, uv, sv] = k.split('|'); const n0 = errs.length;
      await p.click(`#side [data-gt="${gt}"]${bk ? `[data-bk="${bk}"]` : ''}${uv ? `[data-uv="${uv}"]` : ''}${sv ? `[data-sv="${sv}"]` : ''}`); await p.waitForTimeout(250);
      const filled = await p.evaluate(() => { const pg = document.querySelector('#pages .page.on'); return pg ? pg.innerText.trim().length : 0; });
      ok(`${s} › ${gt}${bk ? ' · bucket ' + bk : ''}${uv ? ' · ' + uv : ''}${sv ? ' · ' + sv : ''}`, errs.length === n0 && filled > 20, errs.slice(n0).join(' | ') || 'empty page'); }
  }
  // Check page: every reconciliation check OK
  await p.$eval('#tabs [data-s=\"chk\"]', (b) => b.click()); await p.click('#side [data-gt="chk"]'); await p.waitForTimeout(300);
  eq('Check › no reconciliation line asks for a look', await p.$$eval('#chk .chk', (x) => x.length), 0, 0);
  }

  if (RUN('7')) {
  head('7. Coding, undo, Lines');
  await p.$eval('#tabs [data-s=\"cod\"]', (b) => b.click()); await p.click('#side [data-gt="cod"][data-bk="0"]'); await p.waitForTimeout(400);
  ok('Start here guide on the Code page', await p.$eval('#guide', (g) => !g.hidden));
  const first = await p.$('#tb input[data-f="pkg"]'); await first.fill('T01'); await first.press('Enter'); await p.waitForTimeout(900);
  ok('first coding asks: Save your codes automatically?', !!(await p.$('#asm')) && /Save your codes automatically/.test(await p.$eval('#asm', (e) => e.textContent)));
  await p.click('#asLater'); await p.waitForTimeout(200); ok('Later closes it', !(await p.$('#asm')));
  const it0 = await p.evaluate(() => __BK[0].items.find((x) => x.pkg === 'T01') ? 1 : 0);
  ok('typing a PKG codes the item', it0 === 1);
  ok('footer: not saved to a file · 1 change (on hover)', await p.$eval('#hasv .asv.red', (e) => /1 change/.test(e.title)));
  eq('difference stays 0 after coding', await p.evaluate(() => R.diff), 0);
  await p.keyboard.press('Control+z'); await p.waitForTimeout(400);
  ok('Ctrl+Z takes the code back', await p.evaluate(() => !__BK[0].items.some((x) => x.pkg === 'T01')));
  await p.click('[data-cv="lines"]:visible'); await p.waitForTimeout(800);
  ok('SAP transaction lines are the lines of the bucket being coded (Material)', await p.evaluate(() => /Material/.test(document.querySelector('#tools .tt').textContent) && [...document.querySelectorAll('#tb tr.it')].length > 5));
  ok('Code › Lines (CJI3) shows the lines with their header text', await p.$$eval('#th th', (x) => x.some((t) => /Document header text/.test(t.textContent))) && await p.$$eval('#tb tr', (x) => x.length > 10));
  { const n0 = await p.$eval('#tools', (e) => +((e.textContent.match(/([\d,]+) rows/) || [])[1] || '0').replace(/,/g, '')); const g = await p.$$eval('#side [data-grp]', (x) => (x.find((y) => y.dataset.grp) || {}).dataset?.grp || '');
    if (g) { await p.click(`#side [data-grp="${g}"]`); await p.waitForTimeout(700); const n1 = await p.$eval('#tools', (e) => +((e.textContent.match(/([\d,]+) rows/) || [])[1] || '0').replace(/,/g, ''));
      ok('Lines follow the group chosen in the side list', n1 > 0 && n1 < n0, n0 + ' → ' + n1); await p.click('#side [data-grp=""]'); await p.waitForTimeout(400); } }
  await p.$eval('#tabs [data-s="dash"]', (b) => b.click()); await p.click('#side [data-gt="mrate"]'); await p.waitForTimeout(800);
  ok('Code › Rate analysis (Material) opens', await p.$eval('#pg-mr', (e) => e.classList.contains('on') && e.innerText.length > 100));
  await p.$eval('#tabs [data-s="cod"]', (b) => b.click()); await p.click('[data-cv="cod"]:visible'); await p.waitForTimeout(300);
  }

  if (RUN('7b')) {
  head('7b. Next to code: biggest first, suggestions, keys');
  { const { ctx: c5, p: p5 } = await open(APP); await p5.$eval('#tabs [data-s=\"cod\"]', (b) => b.click()); await p5.click('#side [data-gt="cod"][data-bk="0"]'); await p5.waitForTimeout(300);
    await p5.click('[data-cm="all"]:visible'); await p5.waitForTimeout(400); await p5.evaluate(() => { const th = [...document.querySelectorAll('#th th')].find((x) => /^Material/.test(x.textContent.trim())); if (th) th.click(); }); await p5.waitForTimeout(400);   // a sort set in All items must not carry over
    await p5.click('[data-cm="todo"]:visible'); await p5.waitForTimeout(600);
    const tds = await p5.evaluate(() => [...document.querySelectorAll('#tb tr.it')].slice(0, 15).map((tr) => Math.abs(__BK[0].items[+tr.dataset.k.split(':')[1]].td)));
    ok('Next to code lists the not-coded items, biggest first', tds.length > 10 && tds.every((v, i) => !i || tds[i - 1] >= v));
    ok('progress: how many items bring the bucket to 80%', /bring you to 80%/.test(await p5.$eval('#nxbar', (e) => e.textContent)));
    const k0 = await p5.$eval('#tb tr.it', (tr) => tr.dataset.k), g0 = await p5.evaluate((k) => __BK[0].items[+k.split(':')[1]].vals[2], k0);
    const a = await p5.$('#tb input[data-f="pkg"]'); await a.fill('T05'); await a.press('Enter'); await p5.waitForTimeout(500); const m5 = await p5.$('#asLater'); if (m5) await m5.click();
    const c0 = await p5.$('#tb input[data-f="ce"]'); await c0.fill('TCE'); await c0.press('Enter'); await p5.waitForTimeout(600);
    ok('a coded item leaves the list', await p5.$$eval('#tb tr.it', (x, k) => !x.some((tr) => tr.dataset.k === k), k0));
    const sg = await p5.$('#tb tr.it input.sug[data-f="pkg"]'); ok('an item of the same material group gets the suggestion', !!sg && (await sg.getAttribute('data-sug')) === 'T05' && (await sg.evaluate((x, g) => x.closest('tr').textContent.includes(g), g0)));
    const ks = await sg.evaluate((x) => x.closest('tr').dataset.k); await sg.focus(); await p5.keyboard.press('Enter'); await p5.waitForTimeout(600);
    ok('Enter accepts the suggestion (PKG and cost element)', await p5.evaluate((k) => { const it = __BK[0].items[+k.split(':')[1]]; return it.pkg === 'T05' && it.ce === 'TCE'; }, ks));
    const ins = await p5.$$('#tb input[data-f="pkg"]'); await ins[0].fill('T06'); await ins[0].press('Tab'); await p5.waitForTimeout(500);
    const ins2 = await p5.$$('#tb input[data-f="pkg"]'); await ins2[1].focus(); await p5.keyboard.press('Control+d'); await p5.waitForTimeout(500);
    ok('Ctrl+D copies the code from the row above', await p5.evaluate(() => __BK[0].items.filter((x) => x.pkg === 'T06').length === 2));
    // Subcontractor: same PO
    const si = await p5.evaluate(() => __BK.findIndex((b) => b.id === 'Subcontractor')); await p5.click(`#side [data-gt="cod"][data-bk="${si}"]`); await p5.waitForTimeout(600);
    const sp = await p5.evaluate((si) => { const { L, S, N } = __D, m = new Map(); for (let i = 0; i < N; i++) if (L.b[i] === si) { const po = S[L.po[i]]; if (po && po[0] !== '(') { const s = m.get(po) || m.set(po, new Set()).get(po); s.add(L.it[i]); } } const hit = [...m].find(([, s]) => s.size > 1); return hit ? [hit[0], [...hit[1]].slice(0, 2)] : null; }, si);
    if (sp) { await p5.evaluate(([si, ii]) => { const it = __BK[si].items[ii]; it.pkg = 'T07'; it.ce = 'TSC'; it.div = it.div || 'DIV 03'; it.mnl = it.mnl || 'SUB'; }, [si, sp[1][0]]); await p5.click('[data-cm="all"]:visible'); await p5.click('[data-cm="todo"]:visible'); await p5.waitForTimeout(600);
      ok('Subcontractor: an item on the same PO gets the suggestion', await p5.evaluate(([si, ii]) => { const tr = document.querySelector(`#tb tr.it[data-k="${si}:${ii}"]`); return !!tr && !!tr.querySelector('input.sug'); }, [si, sp[1][1]]) );
    } else ok('Subcontractor: a PO with two items exists', false);
    eq('difference stays 0', await p5.evaluate(() => R.diff), 0); await c5.close(); }
  }

  if (RUN('7c')) {
  head('7c. Codes in one spelling');
  { const { ctx: c6, p: p6 } = await open(APP); await p6.$eval('#tabs [data-s=\"cod\"]', (b) => b.click()); await p6.click('#side [data-gt="cod"][data-bk="0"]'); await p6.waitForTimeout(300);
    const ks = await p6.$$eval('#tb tr.it', (x) => x.slice(0, 2).map((tr) => tr.dataset.k));
    const i1 = (await p6.$$('#tb input[data-f="ce"]'))[0]; await i1.fill('sf-02x'); await i1.press('Tab'); await p6.waitForTimeout(400); const m6 = await p6.$('#asLater'); if (m6) await m6.click();
    eq('a typed code is kept in capitals (sf-02x → SF-02X)', await p6.evaluate((k) => __BK[0].items[+k.split(':')[1]].ce, ks[0]), 'SF-02X');
    const i2 = (await p6.$$('#tb input[data-f="pkg"]'))[1]; await i2.fill('indirect'); await i2.press('Tab'); await p6.waitForTimeout(400);
    eq('a known code keeps its own spelling (indirect → Indirect)', await p6.evaluate((k) => __BK[0].items[+k.split(':')[1]].pkg, ks[1]), 'Indirect');
    // an old lowercase code (from before) is fixed when the register opens
    await p6.evaluate((k) => { __BK[0].items[+k.split(':')[1]].ce = 'sp-17'; }, ks[0]); const i3 = (await p6.$$('#tb input[data-f="pkg"]'))[2]; await i3.fill('T09'); await i3.press('Tab'); await p6.waitForTimeout(500);
    await p6.reload(); await p6.waitForFunction(() => document.querySelector('#tabs button')); await p6.waitForTimeout(2500);
    eq('an old lowercase code is in capitals after reopening (sp-17 → SP-17)', await p6.evaluate((k) => __BK[0].items[+k.split(':')[1]].ce, ks[0]), 'SP-17');
    await p6.$eval('#tabs [data-s=\"chk\"]', (b) => b.click()); await p6.click('#side [data-gt="log"]'); await p6.waitForTimeout(400);
    ok('…and it is in the Changes log', /Codes in capitals/.test(await p6.$eval('#pages .page.on', (e) => e.innerText)));
    eq('difference stays 0', await p6.evaluate(() => R.diff), 0); await c6.close(); }
  }

  if (RUN('7d')) {
  head('7d. Navigation, Cost flow, coding work list, pick list');
  { const { ctx: c7, p: p7 } = await open(APP);
    ok('top bar: project › page name and the cut date', await p7.$eval('header.top .crumb', (e) => /Dashboard/.test(e.textContent)) && await p7.$eval('header.top .cut', (e) => /CUT DATE/.test(e.textContent) && !!e.querySelector('#cut').value));
    const w0 = await p7.$eval('#nav', (e) => e.getBoundingClientRect().width); await p7.hover('#nav'); await p7.waitForTimeout(500); const w1 = await p7.$eval('#nav', (e) => e.getBoundingClientRect().width);
    ok('the side navigation hides to a strip and opens under the mouse', w0 < 70 && w1 > 200, w0 + ' → ' + w1);
    await p7.click('#bPin'); await p7.mouse.move(900, 500); await p7.waitForTimeout(500);
    ok('pin keeps it open (and the page moves aside)', await p7.$eval('#nav', (e) => e.getBoundingClientRect().width) > 200 && await p7.$eval('#mainrow', (e) => e.getBoundingClientRect().left) > 200);
    await p7.click('#bPin'); await p7.mouse.move(900, 500); await p7.waitForTimeout(500); ok('unpinned, it hides again', await p7.$eval('#nav', (e) => e.getBoundingClientRect().width) < 70);
    // Cost flow: the bands (plus the credits that cannot be drawn) are the cost to date
    await p7.click('#side [data-gt="flow"]'); await p7.waitForTimeout(700);
    const fl = await p7.evaluate(() => { const t = document.querySelector('#flow .flh').textContent, n = (document.querySelector('#flow .fln') || {}).textContent || '', num = (x) => +String(x).replace(/,/g, ''); const bands = num((t.match(/· ([\d,]+) ·/) || [])[1] || 0), cr = num((n.match(/Not drawn: (-[\d,]+)/) || [])[1] || 0); return { bands, cr, td: Math.round(R.toDate), paths: document.querySelectorAll('#flsvg path.fb').length, nodes: document.querySelectorAll('#flsvg g.fn').length }; });
    ok('Cost flow draws the buckets, Direct / Indirect and the packages', fl.paths > 5 && fl.nodes > 5, JSON.stringify(fl));
    ok('Cost flow ties to the cost to date (bands + credits)', Math.abs(fl.bands + fl.cr - fl.td) <= 2, JSON.stringify(fl));
    const flNum = () => p7.evaluate(() => { const t = document.querySelector('#flow .flh').textContent, n = (document.querySelector('#flow .fln') || {}).textContent || '', num = (x) => +String(x).replace(/,/g, ''); return num((t.match(/· ([\d,]+) ·/) || [])[1] || 0) + num((n.match(/Not drawn: (-[\d,]+)/) || [])[1] || 0); });
    ok('Cost flow: the last layer breaks each package down by bucket', await p7.$$eval('#flsvg path.fb', (x) => x.some((e) => /– from /.test(e.textContent))));
    await p7.click('#flow [data-fl="bd:off"]'); await p7.waitForTimeout(300); ok('…and Hide takes the breakdown away', await p7.$$eval('#flsvg path.fb', (x) => x.length > 5 && !x.some((e) => /– from /.test(e.textContent)))); await p7.click('#flow [data-fl="bd:all"]'); await p7.waitForTimeout(300);
    await p7.click('#flow [data-flp="tm"]'); await p7.waitForTimeout(400); { const g = await flNum(), w = await p7.evaluate(() => R.thisM); ok('Cost flow of the cut month ties to This month', Math.abs(g - w) <= 2, g + ' vs ' + w); }
    const tm = await flNum(); await p7.click('#flow [data-flp="prev"]'); await p7.waitForTimeout(400); const pm = await flNum();
    ok('◀ moves the period one month back (another figure, From and To follow)', pm !== tm && await p7.evaluate(() => document.getElementById('flFrom').value === document.getElementById('flTo').value && +document.getElementById('flTo').value === R.rep - 1), tm + ' → ' + pm);
    await p7.selectOption('#flFrom', '0'); await p7.waitForTimeout(300); await p7.selectOption('#flTo', String(await p7.evaluate(() => R.rep))); await p7.waitForTimeout(400);
    ok('a range from Opening to the cut month is the cost to date again', Math.abs(await flNum() - fl.td) <= 2);
    await p7.hover('#nav'); await p7.waitForTimeout(400); await p7.click('#tabs [data-s="cod"]'); await p7.mouse.move(900, 500); await p7.waitForTimeout(600);
    ok('Coding opens on To code, largest cost first', await p7.$eval('#tools [data-cm="todo"]', (b) => b.classList.contains('on')) && await p7.evaluate(() => { const t = [...document.querySelectorAll('#tb tr.it')].slice(0, 10).map((tr) => { const [bi, ii] = tr.dataset.k.split(':'); return Math.abs(__BK[+bi].items[+ii].td); }); return t.length > 1 && t.every((v, i) => !i || v <= t[i - 1]); }));
    const left = await p7.evaluate(() => { let n = 0; __BK.forEach((b) => b.items.forEach((it) => { if (it.inc !== 'No' && !(it.pkg && it.mnl && it.ce && (b.id !== 'Subcontractor' || it.div))) n++; })); return n; });
    ok('navigation: Coding shows the % coded and the items left', await p7.$eval('#tabs [data-s="cod"]', (e, n) => /%/.test(e.querySelector('.nb').textContent) && e.querySelector('small').textContent.includes(n.toLocaleString('en-US') + ' item'), left), await p7.$eval('#tabs [data-s="cod"]', (e) => e.textContent) + ' · expected ' + left);
    ok('work list: every bucket with something left shows it', await p7.$$eval('#side .rk .r1', (x) => x.length > 0 && x.some((e) => / left/.test(e.textContent))));
    // pick list: code one item, then the next PKG box offers that code; ↓ + Enter takes it
    const k1 = await p7.$eval('#tb tr.it', (tr) => tr.dataset.k); const i1 = await p7.$('#tb input[data-f="pkg"]'); await i1.fill('T11'); await i1.press('Tab'); await p7.waitForTimeout(400); const m7 = await p7.$('#asLater'); if (m7) await m7.click();
    const i2 = (await p7.$$('#tb input[data-f="pkg"]'))[1], k2 = await i2.evaluate((x) => x.closest('tr').dataset.k); await i2.click(); await i2.fill('t1'); await p7.waitForTimeout(300);
    ok('the pick list shows your PKG codes, filtered as you type', await p7.$eval('#pkl', (e) => !e.hidden && [...e.querySelectorAll('[data-i] b')].some((b) => b.textContent === 'T11')), await p7.evaluate(() => (document.getElementById('pkl') || {}).textContent));
    await i2.press('ArrowDown'); await i2.press('Enter'); await p7.waitForTimeout(500);
    eq('↓ and Enter take the code from the list', await p7.evaluate((k) => { const [bi, ii] = k.split(':'); return __BK[+bi].items[+ii].pkg; }, k2), 'T11');
    ok('the first item kept its code', await p7.evaluate((k) => { const [bi, ii] = k.split(':'); return __BK[+bi].items[+ii].pkg === 'T11'; }, k1));
    eq('difference stays 0', await p7.evaluate(() => R.diff), 0); await c7.close(); }
  }

  if (RUN('7e')) {
  head('7e. Expenses: three report pages, export, hand-coded lines');
  { const { ctx: c8, p: p8 } = await open(APP, { acceptDownloads: true }); await p8.$eval('#tabs [data-s="cod"]', (b) => b.click()); await p8.waitForTimeout(400);
    eq('Coding has two tabs', await p8.$$eval('.ctabs button b', (x) => x.map((e) => e.textContent)), ['Items', 'SAP transaction lines']);
    await p8.$eval('#tabs [data-s="xp"]', (b) => b.click()); await p8.waitForTimeout(1200);
    eq('the side list holds the three pages', await p8.$$eval('#side [data-xp]', (x) => x.map((e) => e.dataset.xp)), ['sum', 'month', 'ind']);
    const nIt = await p8.evaluate(() => [...R.exp.values()].filter((e) => e.p.some((v) => Math.abs(v) >= 0.005)).length), td8 = await p8.evaluate(() => R.toDate), tm8 = await p8.evaluate(() => R.thisM);
    const ftot = (k) => p8.evaluate((k2) => { const c = R.D.cols.find((x) => x.k === k2); return R.rows.reduce((t, r) => t + c.v(r), 0); }, k);
    // 1 Summary
    ok('1 Summary opens first, compact (every bucket folded)', await p8.evaluate(() => /Summary/.test(document.querySelector('#tools .xpt').textContent) && document.querySelectorAll('#tb tr.it').length === 0 && document.querySelectorAll('#tb tr.grp').length >= 5));
    ok('…Item, PKG, MNL, Cost element, Qty, then the amounts', await p8.$$eval('#th tr:last-child th', (x) => { const t = x.map((e) => e.textContent.replace(/[ⓘ▲▼▾\s]+$/g, '').trim()); return t[0] === 'Item' && t[1] === 'PKG' && t[2] === 'MNL' && t[3] === 'Cost element' && /Material group/.test(t[4]) && /^Qty/.test(t[5]) && t.some((v) => /^Previous cumulative/.test(v)) && t.some((v) => /^This month/.test(v)) && t.some((v) => /^Cumulative/.test(v)); }));
    { const pc = await ftot('pc'), tm = await ftot('tm'), cu = await ftot('cu'); ok('previous cumulative + this month = cumulative = cost to date', Math.abs(pc + tm - cu) < 1 && Math.abs(cu - td8) < 2 && Math.abs(tm - tm8) < 2, [pc, tm, cu, td8, tm8].join(' · ')); }
    eq('every item + code combination is a row', await p8.evaluate(() => R.rows.length), nIt, 0);
    await p8.click('#bOpen'); await p8.waitForTimeout(600); ok('Expand all opens the items', await p8.$$eval('#tb tr.it', (x) => x.length > 5));
    await p8.click('[data-xsm="pkg"]'); await p8.waitForTimeout(700); ok('PKG › Bucket › Item: groups are PKG › bucket', await p8.evaluate(() => R.rows.every((r) => / › /.test(r.g))));
    await p8.click('[data-xsm=""]'); await p8.waitForTimeout(500);
    // 2 Expenses per month
    await p8.click('#side [data-xp="month"]'); await p8.waitForTimeout(1000);
    ok('2 Expenses per month: grouped by bucket like Summary (+ / −), folded at first', await p8.evaluate(() => document.querySelectorAll('#tb tr.grp').length >= 5 && document.querySelectorAll('#tb tr.it').length === 0));
    ok('…a Material group / Type of works column', await p8.$$eval('#th th', (x) => x.some((e) => /Material group \/ Type of works/.test(e.textContent))) && await p8.evaluate(() => { const c = R.D.cols.find((x) => x.k === 'gty'); return R.rows.some((r) => r.it.bi === __BK.findIndex((b) => b.id === 'Material') && /^M/.test(c.v(r))) && R.rows.some((r) => r.it.bi === __BK.findIndex((b) => b.id === 'Subcontractor') && c.v(r)); }));
    ok('2 Expenses per month: opens on Qty · Rate · Amount', await p8.$eval('[data-pm="All"]', (b) => b.classList.contains('on')));
    ok('…every item + code of every bucket', await p8.$eval('#cnt', (e, n) => e.textContent.includes(n.toLocaleString('en-US') + ' rows'), nIt), await p8.$eval('#cnt', (e) => e.textContent));
    ok('…bucket, PKG, MNL, Cost element, item, then the months', await p8.$$eval('#th tr:last-child th', (x) => { const t = x.map((e) => e.textContent.replace(/[ⓘ▲▼▾\s]+$/g, '').trim()).filter(Boolean); return t[0] === 'Bucket' && /^PKG/.test(t[1]) && /^MNL/.test(t[2]) && /^Cost element/.test(t[3]) && t[4] === 'Item' && t.includes('Qty') && t.includes('Rate'); }));
    ok('it is a report: no code boxes', await p8.$$eval('#tb input[data-f]', (x) => x.length === 0));
    { const tot = await p8.evaluate(() => { const c = [...document.querySelectorAll('#tf td')]; return +c[c.length - 1].textContent.replace(/,/g, ''); }); ok('the To date total is the cost to date', Math.abs(tot - td8) <= 2, String(tot)); }
    await p8.click('[data-pv="Quarters"]'); await p8.waitForTimeout(700); ok('Quarters fold the months', await p8.$$eval('#th th', (x) => x.some((e) => /^Q\d-\d\d total/.test(e.textContent.trim()))));
    await p8.click('[data-pv="Months"]'); await p8.waitForTimeout(600);
    const [dx] = await Promise.all([p8.waitForEvent('download', { timeout: 120000 }), p8.click('#bXpX')]); const fx = path.join(OUT, 'expenses.xlsx'); await dx.saveAs(fx);
    const XL = require('xlsx'), wx = XL.readFile(fx), ax = XL.utils.sheet_to_json(wx.Sheets[wx.SheetNames[0]], { header: 1, defval: '' });
    ok('Export: one sheet, a flat list with every row (no group rows)', wx.SheetNames.length === 1 && ax.length === nIt + 5, wx.SheetNames.join(',') + ' · ' + ax.length + ' rows');
    { const h = ax[3], ci = h.lastIndexOf('Amount'), last = ax.slice(4).filter((r) => r[0] && r[0] !== 'TOTAL').reduce((t, r) => t + (+r[ci] || 0), 0); ok('…its To date amounts add up to the cost to date', Math.abs(last - td8) <= 5, String(last)); }
    // 3 Indirect per month
    await p8.click('#side [data-xp="ind"]'); await p8.waitForTimeout(1000);
    { const g = await p8.evaluate(() => { let ind = 0; for (const e of R.exp.values()) if (String(e.pkg).toLowerCase() === 'indirect') for (let k = 0; k < e.p.length - 1; k++) ind += e.p[k]; const c = R.D.cols.find((x) => x.k === 'td'); return { ind, tot: R.rows.reduce((t, r) => t + c.v(r), 0), heads: new Set(R.rows.map((r) => r.g)).size }; });
      ok('3 Indirect per month: only PKG = Indirect, head › cost element › item', g.heads >= 2 && Math.abs(g.ind - g.tot) < 1 && await p8.evaluate(() => !!R.D.fam && document.querySelectorAll('#tb tr.grp.fam').length >= 2), JSON.stringify(g)); }
    { const a = await p8.evaluate(() => { const c = R.D.cols.find((x) => x.k === 'am'), MO = []; for (let k = 1; k <= R.rep; k++) MO.push(k); const r = R.rows.find((x) => Math.abs(x.a) > 1000); return [c.v(r), MO.reduce((t, k) => t + r.e.p[k], 0) / MO.length]; }); ok('…Avg per month = every month to the cut / the number of months', Math.abs(a[0] - a[1]) < 0.01, a.join(' vs ')); }
    await p8.evaluate(() => { const g = document.querySelector('#tb tr.grp.sub'); if (g) g.click(); }); await p8.waitForTimeout(500);
    ok('…+ on a cost element shows its items; an item opens its CJI3 lines', await p8.$$eval('#tb tr.it a.open', (x) => x.length > 0) && (await p8.click('#tb tr.it a.open'), await p8.waitForTimeout(500), await p8.evaluate(() => document.getElementById('drawer').classList.contains('show') || getComputedStyle(document.getElementById('drawer')).display !== 'none')));
    await p8.evaluate(() => { const d = document.getElementById('dClose'); if (d) d.click(); }); await p8.waitForTimeout(300);
    { const [di] = await Promise.all([p8.waitForEvent('download', { timeout: 120000 }), p8.click('#bXpX')]); const fi = path.join(OUT, 'indirect.xlsx'); await di.saveAs(fi); const ai = XL.utils.sheet_to_json(XL.readFile(fi).Sheets[XL.readFile(fi).SheetNames[0]], { header: 1, defval: '' }), n = await p8.evaluate(() => R.rows.length), ng = await p8.evaluate(() => new Set(R.rows.map((r) => r.g)).size + new Set(R.rows.map((r) => R.D.fam(r.g))).size);
      ok('Indirect export: heads and cost elements with their items below', ai.length === n + ng + 5 && ai.some((x) => x[0] === 'Personnel and Manning' || /Personnel/.test(x[0])), ai.length + ' rows · expected ' + (n + ng + 5)); }
    ok('…with an "Avg last 3 months" column', await p8.$$eval('#th th', (x) => x.some((e) => /Avg last 3 months/.test(e.textContent))));
    { const a = await p8.evaluate(() => { const r = R.rows.find((x) => Math.abs(R.D.cols.find((c) => c.k === 'td').v(x)) > 1000), c = R.D.cols.find((x) => x.k === 'a3'), k = R.rep; return [c.v(r), (r.e.p[k] + r.e.p[k - 1] + r.e.p[k - 2]) / 3]; }); ok('…= the last three months / 3', Math.abs(a[0] - a[1]) < 0.01, a.join(' vs ')); }
    // a CJI3 line coded by hand: its own row in Summary and per month, with the line's code
    { const it0 = await p8.evaluate(() => { const b = __BK.findIndex((x) => x.id === 'Material'); const it = __BK[b].items.slice().sort((x, y) => Math.abs(y.td) - Math.abs(x.td))[0]; return { b, ii: it.ii, code: it.vals[3] }; });
      await p8.$eval('#tabs [data-s="cod"]', (b) => b.click()); await p8.waitForTimeout(400); await p8.click(`#side [data-gt="cod"][data-bk="${it0.b}"]`); await p8.waitForTimeout(400); await p8.click('[data-cm="all"]:visible'); await p8.waitForTimeout(300);
      await p8.fill('#q', it0.code); await p8.waitForTimeout(500); const ip = await p8.$('#tb tr.it input[data-f="pkg"]'); await ip.fill('T31'); await ip.press('Tab'); await p8.waitForTimeout(400); const m9 = await p8.$('#asLater'); if (m9) await m9.click();
      await p8.click('.ctabs [data-cv="lines"]'); await p8.waitForTimeout(800); await p8.fill('#q', it0.code); await p8.waitForTimeout(600); const lp = await p8.$('#tb tr.it input[data-f="pkg"]'); await lp.fill('T32'); await lp.press('Tab'); await p8.waitForTimeout(500);
      await p8.$eval('#tabs [data-s="xp"]', (b) => b.click()); await p8.click('#side [data-xp="sum"]'); await p8.waitForTimeout(800);
      eq('Summary respects a hand-coded line: its own row with the line\'s code', await p8.evaluate((x) => R.rows.filter((r) => r.e.b === x.b && r.e.ii === x.ii).map((r) => r.e.pkg).sort(), it0), ['T31', 'T32']);
      await p8.click('#side [data-xp="month"]'); await p8.waitForTimeout(800); await p8.fill('#q', it0.code); await p8.waitForTimeout(700); await p8.click('#bOpen'); await p8.waitForTimeout(500);
      const pk = await p8.$$eval('#tb tr.it', (x) => x.map((tr) => tr.cells[1].textContent.replace(/[✎\s]/g, '')).sort());
      eq('Expenses per month: the same two rows', pk, ['T31', 'T32']);
      const t2 = await p8.evaluate(() => { const c = [...document.querySelectorAll('#tf td')]; return +c[c.length - 1].textContent.replace(/,/g, ''); }), w2 = await p8.evaluate((x) => __BK[x.b].items[x.ii].td, it0);
      ok('…and the two rows add up to the item', Math.abs(t2 - w2) <= 1, t2 + ' vs ' + w2); }
    await p8.$eval('#tabs [data-s="xp"]', (b) => b.click()); await p8.click('#side [data-xp="month"]'); await p8.waitForTimeout(800); await p8.evaluate(() => document.querySelector('#th .fb').click()); await p8.waitForTimeout(300);
    ok('the column filter opens clear of the side navigation', await p8.evaluate(() => document.getElementById('pop').getBoundingClientRect().left >= document.getElementById('nav').getBoundingClientRect().right)); await p8.mouse.click(900, 880);
    { const si = await p8.evaluate(() => __BK.findIndex((x) => x.id === 'Subcontractor')); await p8.$eval('#tabs [data-s="cod"]', (b) => b.click()); await p8.waitForTimeout(300); await p8.click(`#side .rh[data-bk="${si}"]`); await p8.waitForTimeout(400);
      await p8.click('.ctabs [data-cv="subpo"]'); await p8.waitForTimeout(800); ok('Coding › Subcontractor has a POs tab (the PO view)', await p8.evaluate(() => __ST.tab === 'sub' && __ST.sub === 'po' && document.querySelectorAll('#tb tr.grp').length > 0 && document.querySelector('#tabs button.on').dataset.s === 'cod'));
      await p8.$eval('#tabs [data-s="dash"]', (b) => b.click()); await p8.click('#side [data-sv="rate"]'); await p8.waitForTimeout(800); ok('Dashboard › Subcontractor rates & coding', await p8.evaluate(() => __ST.sub === 'pkg' && __ST.pkView === 'rate' && document.getElementById('pg-pkg').classList.contains('on')));
      await p8.$eval('#tabs [data-s="chk"]', (b) => b.click()); await p8.click('#side [data-sv="bridge"]'); await p8.waitForTimeout(600); ok('Check › Bridge to CJI3', await p8.evaluate(() => __ST.sub === 'bridge' && document.querySelector('#tabs button.on').dataset.s === 'chk'));
      await p8.$eval('#tabs [data-s="rep"]', (b) => b.click()); await p8.click('#side [data-sv="reg"]'); await p8.waitForTimeout(800); ok('Reports › PO register', await p8.evaluate(() => __ST.sub === 'reg' && document.querySelectorAll('#tb tr.it').length > 5));
      const [dr] = await Promise.all([p8.waitForEvent('download', { timeout: 120000 }), p8.click('#bXpX')]); const frg = path.join(OUT, 'po_register.xlsx'); await dr.saveAs(frg); const wr = XL.readFile(frg);
      ok('…and it exports to Excel', wr.SheetNames[0] === 'PO register' && XL.utils.sheet_to_json(wr.Sheets['PO register'], { header: 1 }).length > 10); }
    eq('difference stays 0', await p8.evaluate(() => R.diff), 0); await c8.close(); }
  }

  if (RUN('8')) {
  head('8. Save codes and read them back');
  const it1 = await p.$('#tb input[data-f="pkg"]'); await it1.fill('T02'); await it1.press('Enter'); await p.waitForTimeout(400);
  const [dlS] = await Promise.all([p.waitForEvent('download'), p.$eval('#bSave', (b) => b.click())]); const codes = path.join(OUT, 'codes.json'); await dlS.saveAs(codes);
  ok('Save writes a codes file', fs.statSync(codes).size > 100);
  const { ctx: ctx2, p: p2 } = await open(APP); await p2.evaluate(() => { localStorage.clear(); }); await p2.reload(); await p2.waitForFunction(() => document.querySelector('#tabs button')); await p2.waitForTimeout(1500);
  ok('a fresh browser has no T02 yet', await p2.evaluate(() => !__BK[0].items.some((x) => x.pkg === 'T02')));
  await p2.setInputFiles('#file', codes); await p2.waitForTimeout(2500);
  ok('Import brings the code back', await p2.evaluate(() => __BK[0].items.some((x) => x.pkg === 'T02')));
  eq('difference stays 0 after import', await p2.evaluate(() => R.diff), 0); await ctx2.close();
  }

  if (RUN('8b')) {
  head('8b. Auto-save to a chosen file');
  { const ctx4 = await browser.newContext({ viewport: { width: 1600, height: 900 } });
    // a stand-in for the browser's "choose file" window, which a test cannot click
    await ctx4.addInitScript(() => { window.__file = { name: 'SUTH_codes.json', text: '', writes: 0 };
      window.showSaveFilePicker = async () => ({ name: window.__file.name, queryPermission: async () => 'granted', requestPermission: async () => 'granted', getFile: async () => ({ text: async () => window.__file.text }),
        createWritable: async () => { let buf = ''; return { write: async (t) => { buf += t; }, close: async () => { window.__file.text = buf; window.__file.writes++; } }; } }); });
    const p4 = await ctx4.newPage(); p4.on('pageerror', (e) => errs.push(e.message)); await p4.goto('file://' + APP); await p4.waitForFunction(() => document.querySelector('#tabs button'), null, { timeout: 60000 }); await p4.waitForTimeout(1200);
    await p4.$eval('#tabs [data-s=\"cod\"]', (b) => b.click()); await p4.waitForTimeout(300); const i4 = await p4.$('#tb input[data-f="pkg"]'); await i4.fill('T03'); await i4.press('Enter'); await p4.waitForTimeout(900);
    await p4.click('#asPick'); await p4.waitForTimeout(1200);
    ok('Choose file → the codes are written to it', await p4.evaluate(() => window.__file.writes > 0 && JSON.stringify(JSON.parse(window.__file.text).codes).includes('"T03"')));
    ok('footer: ✓ Auto-saved · SUTH_codes.json', await p4.$eval('#hasv', (e) => /Auto-saved · SUTH_codes\.json/.test(e.textContent)), await p4.$eval('#hasv', (e) => e.textContent.slice(0, 300)));
    const w0 = await p4.evaluate(() => window.__file.writes); const i5 = (await p4.$$('#tb input[data-f="pkg"]'))[1]; await i5.fill('T04'); await i5.press('Enter'); await p4.waitForTimeout(1500);
    ok('the next change saves itself', await p4.evaluate((w) => window.__file.writes > w && window.__file.text.includes('"T04"'), w0));
    ok('no second question once a file is chosen', !(await p4.$('#asm')));
    await ctx4.close(); }
  }

  if (RUN('9')) {
  head('9. Excel export');
  const [dlX] = await Promise.all([p.waitForEvent('download', { timeout: 180000 }), p.click('#bExport')]); const xl = path.join(OUT, 'export.xlsx'); await dlX.saveAs(xl);
  const ExcelJS = require('exceljs'), wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(xl); const sheets = wb.worksheets.map((w) => w.name);
  ok('the export opens in Excel format', sheets.length > 5, sheets.join(', '));
  for (const n of ['Summary', 'Expenses', 'PKG summary', 'Lines', 'Checks']) ok(`sheet "${n}"`, sheets.includes(n));
  { const JSZip = require('jszip'), z = await JSZip.loadAsync(fs.readFileSync(path.join(OUT, 'export.xlsx'))), bad = [], ORD = ['tabColor', 'outlinePr', 'pageSetUpPr'];
    for (const n of Object.keys(z.files)) { if (!/^xl\/worksheets\/sheet\d+\.xml$/.test(n)) continue; const x = await z.files[n].async('string'), m = x.match(/<sheetPr>(.*?)<\/sheetPr>/); if (/<v>(NaN|-?Infinity|undefined|null)<\/v>/.test(x)) bad.push(n + ': a cell holds a value that is not a number');
      if (m) { const tags = [...m[1].matchAll(/<(\w+)/g)].map((t) => ORD.indexOf(t[1])); if (tags.some((v, i) => v < 0 || (i && v < tags[i - 1]))) bad.push(n + ': ' + m[0]); } }
    ok('Excel opens every sheet without repair (sheet settings in Excel\'s order, no broken numbers)', !bad.length, bad.join(' · ')); }

  // ---------------------------------------------------------------------------- 10. the empty Tool: drop the files, build
  }
  await ctx.close();
  if (RUN('10')) {
    head('10. Tool start page: drop files and build');
    const ctx3 = await browser.newContext({ viewport: { width: 1600, height: 900 } }), p3 = await ctx3.newPage(); p3.on('pageerror', (e) => errs.push(e.message)); p3.on('dialog', (d) => d.dismiss());
    await p3.goto('file://' + TOOL); await p3.waitForSelector('#pick', { state: 'attached' });
    await p3.setInputFiles('#pick', files()); await p3.waitForFunction(() => /CJI3 loaded/.test(document.querySelector('.stchk') ? document.querySelector('.stchk').textContent : ''), null, { timeout: 120000 });
    if (SETS[SET].other) ok('warns that the MB52 is another project', await p3.$eval('.stchk', (e, o) => new RegExp('is project ' + o).test(e.textContent), SETS[SET].other));
    else ok('no wrong-project warning (every file is this project)', await p3.$eval('.stchk', (e) => !/is project/.test(e.textContent)));
    await p3.click('#sBuild'); await p3.waitForFunction(() => document.querySelector('#tabs button'), null, { timeout: 180000 }); await p3.waitForTimeout(1500);
    eq('built from the start page: difference 0', await p3.evaluate(() => R.diff), 0);
    eq('same to date as the test app', r2(await p3.evaluate(() => R.toDate)), r2(R0.toDate));
    await ctx3.close();
  }
  await browser.close();
  head('Page errors'); ok('no JavaScript errors on any page', errs.length === 0, [...new Set(errs)].slice(0, 5).join(' | '));

  if (UPDATE) { fs.writeFileSync(EXP, JSON.stringify(got, null, 1) + '\n'); console.log('\n' + path.basename(EXP) + ' updated'); }
  const bad = results.filter((r) => !r.pass);
  console.log(`\n${results.length - bad.length} passed · ${bad.length} failed · ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  if (bad.length) { console.log('FAILED:'); bad.forEach((r) => console.log(`  ${r.section} › ${r.name}: ${r.detail}`)); process.exit(1); }
})().catch((e) => { console.error(e); process.exit(1); });
