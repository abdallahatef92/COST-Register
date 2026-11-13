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
const RUN = (k) => (!ONLY || ONLY.includes(k)) && !(QUICK && (k === '9' || k === '10' || k === '10b' || k === '10c' || k === '10d'));

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
  ok('first coding asks: Keep your work in a data file?', !!(await p.$('#asm')) && /Keep your work in a data file/.test(await p.$eval('#asm', (e) => e.textContent)));
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
    eq('the side list holds the four pages', await p8.$$eval('#side [data-xp]', (x) => x.map((e) => e.dataset.xp)), ['sum', 'month', 'ind', 'lines']);
    const nIt = await p8.evaluate(() => [...R.exp.values()].filter((e) => e.p.some((v) => Math.abs(v) >= 0.005)).length), td8 = await p8.evaluate(() => R.toDate), tm8 = await p8.evaluate(() => R.thisM);
    const ftot = (k) => p8.evaluate((k2) => { const c = R.D.cols.find((x) => x.k === k2); return R.rows.reduce((t, r) => t + c.v(r), 0); }, k);
    // 1 Summary
    ok('1 Summary opens first, compact (every bucket folded)', await p8.evaluate(() => /Summary/.test(document.querySelector('#tools .xpt').textContent) && document.querySelectorAll('#tb tr.it').length === 0 && document.querySelectorAll('#tb tr.grp').length >= 5));
    ok('…Item, PKG, MNL, Cost element, Source, Qty, then the amounts', await p8.$$eval('#th tr:last-child th', (x) => { const t = x.map((e) => e.textContent.replace(/[ⓘ▲▼▾\s]+$/g, '').trim()); return t[0] === 'Item' && t[1] === 'PKG' && t[2] === 'MNL' && t[3] === 'Cost element' && t[4] === 'Source' && /Material group/.test(t[5]) && /^Qty/.test(t[6]) && t.some((v) => /^Previous/.test(v)) && t.some((v) => /^This month/.test(v)) && t.some((v) => /^Cumulative/.test(v)); }));
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
    const nM = await p8.evaluate(() => { const sb = __BK.findIndex((b) => b.id === 'Subcontractor'), live = (e) => e.p.some((v) => Math.abs(v) >= 0.005); return [...R.exp.values()].filter((e) => e.b !== sb && live(e)).length + [...R.expPo.values()].filter(live).length; });
    ok('…every item + code of every bucket, subcontractor one row per PO', nM > nIt && await p8.$eval('#cnt', (e, n) => e.textContent.includes(n.toLocaleString('en-US') + ' rows'), nM), await p8.$eval('#cnt', (e) => e.textContent));
    ok('…bucket, PKG, MNL, Cost element, item, then the months', await p8.$$eval('#th tr:last-child th', (x) => { const t = x.map((e) => e.textContent.replace(/[ⓘ▲▼▾\s]+$/g, '').trim()).filter(Boolean); return t[0] === 'Bucket' && /^PKG/.test(t[1]) && /^MNL/.test(t[2]) && /^Cost element/.test(t[3]) && t[4] === 'Source' && t[5] === 'Item' && t.includes('Qty') && t.includes('Rate'); }));
    ok('it is a report: no code boxes', await p8.$$eval('#tb input[data-f]', (x) => x.length === 0));
    { const tot = await p8.evaluate(() => { const c = [...document.querySelectorAll('#tf td')]; return +c[c.length - 1].textContent.replace(/,/g, ''); }); ok('the To date total is the cost to date', Math.abs(tot - td8) <= 2, String(tot)); }
    { const g = await p8.evaluate(() => { const sb = __BK.findIndex((b) => b.id === 'Subcontractor'), rs = R.rows.filter((r) => r.e.b === sb), c = R.D.cols.find((x) => x.k === 'tdAmount'); return { po: rs.every((r) => r.e.po !== undefined), cols: R.D.cols.some((x) => x.k === 'po') && R.D.cols.some((x) => x.k === 'sup'), sum: rs.reduce((t, r) => t + c.v(r), 0), bk: __BK[sb].items.reduce((t, it) => t + it.td, 0) }; });
      ok('…PO and Subcontractor columns; the PO rows add up to the bucket', g.po && g.cols && Math.abs(g.sum - g.bk) < 1, JSON.stringify(g)); }
    await p8.click('[data-pv="Quarters"]'); await p8.waitForTimeout(700); ok('Quarters fold the months', await p8.$$eval('#th th', (x) => x.some((e) => /^Q\d-\d\d total/.test(e.textContent.trim()))));
    await p8.click('[data-pv="Months"]'); await p8.waitForTimeout(600);
    const [dx] = await Promise.all([p8.waitForEvent('download', { timeout: 120000 }), p8.click('#bXpX')]); const fx = path.join(OUT, 'expenses.xlsx'); await dx.saveAs(fx);
    const XL = require('xlsx'), wx = XL.readFile(fx), ax = XL.utils.sheet_to_json(wx.Sheets[wx.SheetNames[0]], { header: 1, defval: '' });
    { const [dt] = await Promise.all([p8.waitForEvent('download', { timeout: 120000 }), p8.click('#bExport')]); ok('the top-bar button on a report page exports only that report', /^Expenses_per_month_/.test(dt.suggestedFilename()) && /this report/.test(await p8.$eval('#bExport', (e) => e.textContent)), dt.suggestedFilename()); }
    const xh = ax.findIndex((x) => x.includes('Bucket') && x.includes('Item')), xt = ax.findIndex((x) => x[0] === 'TOTAL');
    ok('Export: one sheet, a flat list with every row (no group rows)', wx.SheetNames.length === 1 && xt - xh - 1 === nM, wx.SheetNames.join(',') + ' · ' + ax.length + ' rows');
    { const h = ax[xh], ci = h.lastIndexOf('Amount'), last = ax.slice(xh + 1).filter((r) => r[0] && r[0] !== 'TOTAL').reduce((t, r) => t + (+r[ci] || 0), 0); ok('…its To date amounts add up to the cost to date', Math.abs(last - td8) <= 5, String(last)); }
    // 3 Indirect per month
    await p8.click('#side [data-xp="ind"]'); await p8.waitForTimeout(1000);
    { const g = await p8.evaluate(() => { let ind = 0; for (const e of R.exp.values()) if (String(e.pkg).toLowerCase() === 'indirect') for (let k = 0; k < e.p.length - 1; k++) ind += e.p[k]; const c = R.D.cols.find((x) => x.k === 'td'); return { ind, tot: R.rows.reduce((t, r) => t + c.v(r), 0), heads: new Set(R.rows.map((r) => r.g)).size }; });
      ok('3 Indirect per month: only PKG = Indirect, head › cost element › item', g.heads >= 2 && Math.abs(g.ind - g.tot) < 1 && await p8.evaluate(() => !!R.D.fam && document.querySelectorAll('#tb tr.grp.fam').length >= 2), JSON.stringify(g)); }
    { const a = await p8.evaluate(() => { const c = R.D.cols.find((x) => x.k === 'am'), MO = []; for (let k = 1; k <= R.rep; k++) MO.push(k); const r = R.rows.find((x) => Math.abs(x.a) > 1000); return [c.v(r), MO.reduce((t, k) => t + r.e.p[k], 0) / MO.length]; }); ok('…Avg per month = every month to the cut / the number of months', Math.abs(a[0] - a[1]) < 0.01, a.join(' vs ')); }
    await p8.evaluate(() => { const g = document.querySelector('#tb tr.grp.sub'); if (g) g.click(); }); await p8.waitForTimeout(500);
    { const want = await p8.evaluate(() => { const k = document.querySelector('#tb tr.it').dataset.k, r = R.rows.find((x) => x.it.bi + ':' + x.it.ii === k); return r.e.p.reduce((t, v) => t + v, 0); });   // every period, pending too
      ok('…+ on a cost element shows its items', await p8.$$eval('#tb tr.it a.open', (x) => x.length > 0)); await p8.click('#tb tr.it a.open'); await p8.waitForTimeout(800);
      const got = await p8.evaluate(() => ({ page: __ST.xpPage, sum: R.rows.reduce((t, r) => t + (R.inc[r.i] ? R.amt[r.i] : 0), 0), chip: !!document.querySelector('#tools .xlf') }));
      ok('an item opens 4 SAP CJI3 transactions with only its lines – the same amount', got.page === 'lines' && got.chip && Math.abs(got.sum - want) < 0.01, JSON.stringify(got) + ' vs ' + want);
      await p8.click('[data-xlf]'); await p8.waitForTimeout(800); ok('…✕ shows every CJI3 line again (bucket and codes on each)', await p8.evaluate(() => R.rows.length === __D.N - (__D.L.uns || []).filter(Boolean).length && R.D.cols.some((c) => c.k === 'bk') && R.D.cols.some((c) => c.k === 'pkg'))); await p8.click('#side [data-xp="ind"]'); await p8.waitForTimeout(600); }
    { const [di] = await Promise.all([p8.waitForEvent('download', { timeout: 120000 }), p8.click('#bXpX')]); const fi = path.join(OUT, 'indirect.xlsx'); await di.saveAs(fi); const ai = XL.utils.sheet_to_json(XL.readFile(fi).Sheets[XL.readFile(fi).SheetNames[0]], { header: 1, defval: '' }), n = await p8.evaluate(() => R.rows.length), ng = await p8.evaluate(() => new Set(R.rows.map((r) => r.g)).size + new Set(R.rows.map((r) => R.D.fam(r.g))).size);
      const ih = ai.findIndex((x) => /Head › Cost element/.test(x[0])), it2 = ai.findIndex((x) => x[0] === 'TOTAL');
      ok('Indirect export: heads and cost elements with their items below', it2 - ih - 1 === n + ng && ai.some((x) => x[0] === 'Personnel and Manning' || /Personnel/.test(x[0])), (it2 - ih - 1) + ' rows · expected ' + (n + ng)); }
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
  head('7f. Owner-supplied material: quantity with no amount, valued at your rate');
  { const { ctx: c10, p: p10 } = await open(APP); const n0 = await p10.evaluate(() => { const { L, N } = __D; let n = 0; for (let i = 0; i < N; i++) if (Math.abs(L.amt[i]) < 0.005 && Math.abs(L.qty[i]) > 1e-9) n++; return n; });
    if (!n0) ok('no owner-supplied lines in this project', true);
    else { await p10.$eval('#tabs [data-s="adj"]', (b) => b.click()); await p10.waitForTimeout(300); await p10.click('#side [data-gt="own"]'); await p10.waitForTimeout(700);
      ok('Adjust › Owner-supplied material lists every material with quantity and no amount', await p10.evaluate((n) => R.rows.reduce((t, r) => t + r.o.n, 0) === n, n0));
      ok('…and Check counts the ones still without a rate', await p10.evaluate(() => { document.querySelector('#tabs [data-s="chk"]').click(); return true; }) && (await p10.click('#side [data-gt="chk"]'), await p10.waitForTimeout(400), await p10.evaluate(() => /Owner-supplied material/.test(document.querySelector('#pages .page.on').innerText))));
      await p10.$eval('#tabs [data-s="adj"]', (b) => b.click()); await p10.click('#side [data-gt="own"]'); await p10.waitForTimeout(500);
      const k = await p10.$eval('#tb input.ownr', (x) => x.dataset.k), td0 = await p10.evaluate(() => R.toDate), want = await p10.evaluate((kk) => { const { L, N } = __D; let q = 0; for (let i = 0; i < N; i++) { const it = __BK[L.b[i]].items[L.it[i]]; if (it.k === kk && Math.abs(L.amt[i]) < 0.005 && Math.abs(L.qty[i]) > 1e-9 && R.per[i] < R.per.length && R.inc[i]) q += L.qty[i]; } return q; }, k);
      const i10 = await p10.$('#tb input.ownr'); await i10.fill('10'); await i10.press('Enter'); await p10.waitForTimeout(700); const m10 = await p10.$('#asLater'); if (m10) await m10.click();
      const g = await p10.evaluate(() => ({ own: R.ownIn, td: R.toDate, diff: R.diff }));
      ok('a rate adds qty × rate to the cost (Owner material in)', Math.abs(g.own - want * 10) < 0.01 && g.own > 0, JSON.stringify(g) + ' · qty ' + want);
      eq('…and the difference to CJI3 stays 0', g.diff, 0);
      ok('…shown in the footer', /Owner material in/.test(await p10.$eval('#sbar', (e) => e.textContent)));
      const v1 = await p10.evaluate(() => R.ownIn); await p10.click('#tb [data-ownyn]'); await p10.waitForTimeout(700);
      ok('Owner-supplied? No: the material leaves the cost and the count', await p10.evaluate((v) => R.ownIn === 0 && v > 0 && R.rows.some((r) => !r.o.yes), v1) && await p10.evaluate(() => R.diff === 0));
      await p10.keyboard.press('Control+z'); await p10.waitForTimeout(600);
      const nG = await p10.$$eval('[data-owngl]', (x) => x.length), n1 = await p10.evaluate(() => ownStats().n); await p10.click('[data-owngl]'); await p10.waitForTimeout(700);
      ok('the rule: taking out a SAP cost element takes its materials out', nG >= 1 && await p10.evaluate((n) => ownStats().n < n && ownStats().out > 0 && R.diff === 0, n1)); await p10.keyboard.press('Control+z'); await p10.waitForTimeout(600);
      await p10.keyboard.press('Control+z'); await p10.waitForTimeout(600); ok('Undo takes the rate away', await p10.evaluate((t) => R.ownIn === 0 && Math.abs(R.toDate - t) < 0.01, td0)); }
    await c10.close(); }

  head('8. Save codes and read them back');
  const it1 = await p.$('#tb input[data-f="pkg"]'); await it1.fill('T02'); await it1.press('Enter'); await p.waitForTimeout(400);
  const [dlS] = await Promise.all([p.waitForEvent('download'), p.$eval('#bSave', (b) => b.click())]); const codes = path.join(OUT, 'codes.json'); await dlS.saveAs(codes);
  ok('Save writes a codes file', fs.statSync(codes).size > 100);
  const { ctx: ctx2, p: p2 } = await open(APP); await p2.evaluate(() => { localStorage.clear(); }); await p2.reload(); await p2.waitForFunction(() => document.querySelector('#tabs button')); await p2.waitForTimeout(1500);
  ok('a fresh browser has no T02 yet', await p2.evaluate(() => !__BK[0].items.some((x) => x.pkg === 'T02')));
  await p2.setInputFiles('#file', codes); await p2.waitForTimeout(2500);
  ok('Import brings the code back', await p2.evaluate(() => __BK[0].items.some((x) => x.pkg === 'T02')));
  eq('difference stays 0 after import', await p2.evaluate(() => R.diff), 0); await ctx2.close();
  // the reports of the earlier offline tools (Inventory / Subcontract Cost Report): a 'Coding' sheet, header a few rows down
  { const ExcelJS = require('exceljs'), pick = await p.evaluate(() => { const m = __BK.find((x) => x.id === 'Material'), s2 = __BK.find((x) => x.id === 'Subcontractor'); return { mat: m.items.slice(0, 3).map((i) => [i.vals[2], i.vals[3], i.vals[4]]), sub: s2.items.slice(0, 3).map((i) => [i.vals[0], i.vals[1], i.vals[2]]) }; });
    const mk = async (fn, head, rows) => { const wb = new ExcelJS.Workbook(); wb.addWorksheet('Summary').addRow(['old report']); const ws = wb.addWorksheet('Coding'); ws.addRow(['Materials still to code']); ws.addRow(['0']); ws.addRow(['Live']); ws.addRow(head); rows.forEach((r) => ws.addRow(r)); const f = path.join(OUT, fn); await wb.xlsx.writeFile(f); return f; };
    const fi = await mk('old_inventory_coding.xlsx', ['Family', 'Division', 'Material group (SAP)', 'Material', 'Description', 'Unit', 'CSI', 'MNL', 'Cost element', 'Status'], pick.mat.map(([g, m, d], k) => ['M', 'M03', g, m, d, 'TO', 'S.03' + k, 'MAT', 'MAT-' + k, 'Coded']));
    const fs2 = await mk('old_subcontract_coding.xlsx', ['Type of works (SAP)', 'Service', 'Description', 'Unit', 'DIV', 'PKG', 'MNL', 'Cost element', 'Status'], pick.sub.map(([t, sv, d], k) => [t, sv, d, 'M3', 'DIV 03', 'S.0' + k, 'SUB', 'SUB-' + k, 'Coded']));
    const { ctx: c9, p: p9 } = await open(APP); await p9.evaluate(() => localStorage.clear()); await p9.reload(); await p9.waitForFunction(() => document.querySelector('#tabs button')); await p9.waitForTimeout(1500);
    await p9.setInputFiles('#file', fi); await p9.waitForTimeout(2000);
    eq('earlier Inventory report: CSI → PKG, MNL and cost element read by material', await p9.evaluate((ms) => ms.map((m) => { const it = __BK.find((x) => x.id === 'Material').items.find((i) => i.vals[3] === m); return [it.pkg, it.mnl, it.ce].join('/'); }), pick.mat.map((x) => x[1])), ['S.030/MAT/MAT-0', 'S.031/MAT/MAT-1', 'S.032/MAT/MAT-2']);
    await p9.setInputFiles('#file', fs2); await p9.waitForTimeout(2000);
    eq('earlier Subcontract Cost Report: DIV, PKG, MNL, cost element read by service', await p9.evaluate((ss) => ss.map((sv) => { const it = __BK.find((x) => x.id === 'Subcontractor').items.find((i) => i.vals[1] === sv[1] && i.vals[2] === sv[2]); return [it.div, it.pkg, it.mnl, it.ce].join('/'); }), pick.sub), ['DIV 03/S.00/SUB/SUB-0', 'DIV 03/S.01/SUB/SUB-1', 'DIV 03/S.02/SUB/SUB-2']);
    eq('difference stays 0 after reading them', await p9.evaluate(() => R.diff), 0); await c9.close(); }
  }

  if (RUN('8b')) {
  head('8b. Auto-save to the data file');
  { const ctx4 = await browser.newContext({ viewport: { width: 1600, height: 900 } });
    // a stand-in for the browser's "save file" window, which a test cannot click
    await ctx4.addInitScript(() => { window.__file = { name: 'SUTH_register.db', bytes: null, writes: 0 };
      window.showSaveFilePicker = async () => ({ name: window.__file.name, queryPermission: async () => 'granted', requestPermission: async () => 'granted', getFile: async () => new Blob([window.__file.bytes || new Uint8Array()]),
        createWritable: async () => { const parts = []; return { write: async (d) => { parts.push(d); }, close: async () => { window.__file.bytes = new Uint8Array(await new Blob(parts).arrayBuffer()); window.__file.writes++; } }; } }); });
    const p4 = await ctx4.newPage(); p4.on('pageerror', (e) => errs.push(e.message)); await p4.goto('file://' + APP); await p4.waitForFunction(() => document.querySelector('#tabs button'), null, { timeout: 60000 }); await p4.waitForTimeout(1200);
    await p4.$eval('#tabs [data-s="cod"]', (b) => b.click()); await p4.waitForTimeout(300); const i4 = await p4.$('#tb input[data-f="pkg"]'); await i4.fill('T03'); await i4.press('Enter'); await p4.waitForTimeout(900);
    await p4.click('#asPick'); await p4.waitForFunction(() => DBF.cur > 0 && DBF.st === 'ok' && dbOne('SELECT count(*) AS n FROM codes').n > 0, null, { timeout: 60000 }); await p4.waitForFunction(() => !DBF.busy && !DBF.again); await p4.waitForTimeout(500);
    const SQL = await require('sql.js')(), rd = async () => new SQL.Database(Buffer.from(await p4.evaluate(async () => { const r = new FileReader(); return new Promise((res) => { r.onload = () => res(String(r.result).split(',')[1]); r.readAsDataURL(new Blob([window.__file.bytes])); }); }), 'base64')), cnt = (db, v) => db.exec(`SELECT count(*) FROM codes WHERE pkg = '${v}'`)[0].values[0][0];
    { const db = await rd(); ok('Create data file: the build and the codes are written to it', cnt(db, 'T03') > 0, JSON.stringify(db.exec('SELECT count(*), sum(pkg != \'\') FROM codes')[0].values)); }
    ok('top bar: SUTH_register.db · 1 build · saved', await p4.$eval('#hasv', (e) => /SUTH_register\.db · 1 build/.test(e.textContent)), await p4.$eval('#hasv', (e) => e.textContent.slice(0, 300)));
    const w0 = await p4.evaluate(() => window.__file.writes); const i5 = (await p4.$$('#tb input[data-f="pkg"]'))[1]; await i5.fill('T04'); await i5.press('Enter');
    await p4.waitForFunction((w) => window.__file.writes > w, w0, { timeout: 30000 }).catch(() => {}); await p4.waitForFunction(() => !DBF.busy && !DBF.again); await p4.waitForTimeout(300);
    ok('the next change saves itself', cnt(await rd(), 'T04') > 0);
    ok('no second question once a data file is there', !(await p4.$('#asm')));
    await ctx4.close(); }
  }

  if (RUN('7h')) {
  head('7h. Adjustment lines, Source in Expenses, Summary period, footer links');
  { const { ctx: c12, p: q } = await open(APP); const tot = () => q.evaluate(() => R.D.foot(R.rows));
    // some adjustments: VAT on certificates, owner material at its own paid rate
    await q.evaluate(() => { const v = document.getElementById('vat'); v.value = 'Include VAT'; v.dispatchEvent(new Event('change', { bubbles: true })); }); await q.waitForTimeout(600);
    if (await q.$('#tabs [data-s="adj"]')) { await q.$eval('#tabs [data-s="adj"]', (b) => b.click()); await q.waitForTimeout(300); if (await q.$('#side [data-gt="own"]')) { await q.click('#side [data-gt="own"]'); await q.waitForTimeout(500); const ow = await q.$('#ownAll'); if (ow) { await ow.click(); await q.waitForTimeout(500); } } }
    { const m = await q.$('#asLater'); if (m) await m.click(); }
    await q.$eval('#tabs [data-s="adj"]', (b) => b.click()); await q.waitForTimeout(300); await q.click('#side [data-gt="adjl"]'); await q.waitForTimeout(900);
    const g = await q.evaluate(() => ({ diff: R.diff, sum: R.rows.filter((r) => r.on).reduce((t, r) => t + r.a, 0), want: R.toDate + R.pend - __D.N * 0 - 0, cost: 0, vat: R.rows.filter((r) => r.g === 'VAT in').reduce((t, r) => t + r.a, 0), vatIn: R.vatIn, ties: /✓ ties/.test(document.getElementById('tools').textContent) }));
    const cost = await q.evaluate(() => { let t = 0; return document.querySelector('#sbar').textContent.includes('CJI3') ? 1 : t; });
    ok('Adjust › Adjustment lines: every adjustment line by line, CJI3 + added − taken out = To date + Pending', g.ties && Math.abs(g.diff) < 0.01, JSON.stringify(g));
    eq('…VAT in lines add up to the footer\'s VAT in', r2(g.vat), r2(g.vatIn), 1);
    ok('…grouped by kind (+ / −)', await q.evaluate(() => R.D.groups && new Set(R.rows.map((r) => r.g)).size >= 1));
    { const [d] = await Promise.all([q.waitForEvent('download', { timeout: 120000 }), q.click('#bXpX')]); const f = path.join(OUT, 'adjustment_lines.xlsx'); await d.saveAs(f); ok('…exports to Excel', require('xlsx').readFile(f).SheetNames[0] === 'Adjustment lines'); }
    // footer: an adjustment opens its lines; CJI3 opens the SAP CJI3 transactions
    if (await q.$('#sbar [data-sgo^="adj:VAT"]')) { await q.click('#sbar [data-sgo^="adj:VAT"]'); await q.waitForTimeout(700); ok('footer › VAT in opens Adjustment lines, only VAT in', await q.evaluate(() => __ST.tab === 'adjl' && R.rows.length > 0 && R.rows.every((r) => r.g === 'VAT in'))); }
    await q.click('#sbar [data-sgo="xl"]'); await q.waitForTimeout(1200);
    ok('footer › CJI3 opens Expenses › SAP CJI3 transactions: the pure CJI3 lines at their CJI3 amount', await q.evaluate(() => { if (__ST.tab !== 'xpm' || __ST.xpPage !== 'lines') return false; const { L, N } = __D; let t = 0, n = 0; for (let i = 0; i < N; i++) if (!(L.uns || [])[i]) { t += L.amt[i]; n++; } return R.rows.length === n && Math.abs(+R.D.foot(R.rows).amt.replace(/,/g, '') - t) < 1; }));
    // Expenses › Summary: Source column and filter, period
    await q.$eval('#tabs [data-s="xp"]', (b) => b.click()); await q.waitForTimeout(300); await q.click('#side [data-xp="sum"]'); await q.waitForTimeout(800);
    eq('Summary (To date): the total is To date', +String((await tot()).cu).replace(/,/g, ''), r2(await q.evaluate(() => R.toDate)), 1);
    await q.click('[data-xsrc="adj"]'); await q.waitForTimeout(600);
    ok('Source › Adjustments only: VAT in and owner material rows, no CJI3 rows', await q.evaluate(() => R.rows.length > 0 && R.rows.every((r) => r.e.src !== 'CJI3')));
    eq('…their total = VAT in + owner material in (+ what is included from not yet in CJI3)', +String((await tot()).cu).replace(/,/g, ''), r2(await q.evaluate(() => R.vatIn + R.ownIn + R.unsIn)), 2);
    await q.click('[data-xsrc=""]'); await q.waitForTimeout(400); await q.click('[data-xsq]:nth-child(3)'); await q.waitForTimeout(700);
    eq('period › Cut month: the cumulative is the cut month', +String((await tot()).cu).replace(/,/g, ''), r2(await q.evaluate(() => R.thisM)), 1);
    await q.click('[data-xsm2="-1"]'); await q.waitForTimeout(600); ok('◀ moves the period one month back', await q.evaluate(() => /This month · /.test(document.getElementById('th').textContent) && __ST.xsT === R.rep - 1));
    eq('difference stays 0', await q.evaluate(() => R.diff), 0); await c12.close(); }
  }

  if (RUN('7g')) {
  head('7g. Data log and the data file (SQLite)');
  { const dl = D.META.dlog || {}; const srcs = (dl.files || []).map((f) => f.src);
    ok('the build logs every file it read (source, months, cut type, rows, merge rule)', srcs.includes('cji3') && srcs.includes('zintc1') && dl.files.every((f) => f.name && f.cut && f.merge), srcs.join(','));
    eq('CJI3 coverage by month adds up to the CJI3 cost', r2(Object.values(dl.cov.cji3).reduce((t, c) => t + c.amt, 0)), r2(D.META.cost), 1);
    ok('ZSCPRG01: certificates per month (all POs)', !dl.cov.zscprg01 || Object.values(dl.cov.zscprg01).reduce((t, c) => t + c.n, 0) === dl.certs.length);
    // ZINTC1 merge: order + month, newest file wins – the same file twice is counted once and listed as an overlap
    const ZI = require('../src/zintc1'), zf = [].concat(F.zintc1).map((f) => path.join(DATA, f)), one = ZI.readZint(zf), two = ZI.readZint([...zf, zf[zf.length - 1]]);
    eq('ZINTC1: a file loaded twice is not counted twice', r2(two.rows.reduce((t, r) => t + r.amt, 0)), r2(one.rows.reduce((t, r) => t + r.amt, 0)));
    ok('…and the overlap is listed (newest file kept, rows dropped)', two.overlaps.length > 0 && two.files[two.files.length - 2].dropped === two.files[two.files.length - 2].rows); }
  { const { ctx: c11, p: p11 } = await open(APP);
    await p11.$eval('#tabs [data-s="chk"]', (b) => b.click()); await p11.waitForTimeout(300); await p11.click('#side [data-gt="dlog"]'); await p11.waitForTimeout(700);
    ok('Check › Data log: this build, coverage by month', await p11.evaluate(() => __ST.tab === 'dlog' && document.querySelectorAll('#dlog .dlcard').length >= 3 && /Coverage by month/.test(document.getElementById('dlog').textContent)));
    ok('…without a data file it offers to create one', await p11.$('#dlog [data-asgo="pick"]') !== null);
    // Chrome / Edge: the data file is written directly (a stand-in for the file the user picks)
    await p11.evaluate(() => { window.__file = null; window.showSaveFilePicker = async () => ({ name: 'Test_register.db', queryPermission: async () => 'granted', requestPermission: async () => 'granted', getFile: async () => new Blob([window.__file || new Uint8Array()]), createWritable: async () => { const parts = []; return { write: async (d) => parts.push(d), close: async () => { window.__file = new Uint8Array(await new Blob(parts).arrayBuffer()); } }; } }); });
    await p11.click('#dlog [data-asgo="pick"]'); await p11.waitForFunction(() => window.__file && window.__file.length > 1e5, null, { timeout: 60000 }); await p11.waitForTimeout(1500);
    const s1 = await p11.evaluate(() => ({ st: DBF.st, b: dbBuilds().length, lines: dbOne('SELECT count(*) AS n FROM lines').n, codes: dbOne('SELECT count(*) AS n FROM codes').n, n: __D.N, pill: document.getElementById('hasv').textContent }));
    ok('Create data file: written to the file, this build and its lines inside', s1.st === 'ok' && s1.b === 1 && s1.lines === s1.n && s1.codes > 0, JSON.stringify(s1));
    ok('…the top bar shows the data file', /Test_register\.db/.test(s1.pill), s1.pill);
    const k = await p11.evaluate(() => { const it = __BK[0].items.find((x) => !x.pkg); __ST.tab = 'cod'; return it.k; });
    await p11.evaluate((kk) => { const it = __BK[0].items.find((x) => x.k === kk); it.pkg = 'T99'; return __DL.save(); }, k); await p11.waitForTimeout(500);
    const bytes = await p11.evaluate(() => Array.from(window.__file)); const SQL = await require('sql.js')(), db = new SQL.Database(Uint8Array.from(bytes));
    const q = (sql) => { const r = db.exec(sql); return r.length ? r[0].values : []; };
    ok('the .db opens in any SQLite tool: builds, files, coverage, certificates, lines, codes, view expenses', ['builds', 'files', 'coverage', 'certificates', 'lines', 'codes', 'expenses'].every((t) => q(`SELECT count(*) FROM ${t}`)[0][0] >= 0) && q('SELECT count(*) FROM files')[0][0] === D.META.dlog.files.length);
    eq('…a code typed in the Tool is in the file (view expenses)', q(`SELECT count(*) FROM expenses WHERE item_key = '${k.replace(/'/g, "''")}' AND pkg = 'T99'`)[0][0] > 0, true);
    eq('…the lines in the file add up to the register lines', r2(q('SELECT sum(amount) FROM lines')[0][0]), r2(await p11.evaluate(() => { let t = 0; for (let i = 0; i < __D.N; i++) t += __D.L.amt[i]; return t; })), 1);
    eq('difference stays 0', await p11.evaluate(() => R.diff), 0); await c11.close(); }
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
  if (RUN('10b')) {
    head('10b. Data file: build into it, open it next month, build again');
    const SP = path.join(OUT, 'db'); fs.mkdirSync(SP, { recursive: true });
    const fresh = async () => { const c = await browser.newContext({ viewport: { width: 1600, height: 900 }, acceptDownloads: true }); await c.addInitScript(() => { delete window.showSaveFilePicker; delete window.showOpenFilePicker; }); const q = await c.newPage(); q.on('pageerror', (e) => errs.push(e.message)); q.on('dialog', (d) => d.dismiss()); await q.goto('file://' + TOOL); await q.waitForSelector('#pick', { state: 'attached' }); return { c, q }; };
    const openDb = async (q, f) => { const [fc] = await Promise.all([q.waitForEvent('filechooser'), q.click('#sDbOpen')]); await fc.setFiles(f); };
    const buildInto = async (q, f) => { await q.setInputFiles('#pick', files()); await q.waitForFunction(() => /CJI3 loaded/.test(document.querySelector('.stchk') ? document.querySelector('.stchk').textContent : ''), null, { timeout: 120000 });
      const [d] = await Promise.all([q.waitForEvent('download', { timeout: 240000 }), q.click('#sBuild')]); await d.saveAs(f); };
    // month 1: a new data file, build into it
    let { c, q } = await fresh(); ok('start page asks for a data file (open or create)', await q.$('#sDbNew') !== null && await q.$('#sDbOpen') !== null);
    await q.click('#sDbNew'); await q.waitForFunction(() => /_register\.db/.test(document.querySelector('.dbc').textContent)); const f1 = path.join(SP, 'm1.db'); await buildInto(q, f1); await c.close();
    // open it: the build comes from the file; type a code
    ({ c, q } = await fresh()); await openDb(q, f1); await q.waitForFunction(() => document.querySelector('#tabs button'), null, { timeout: 120000 }); await q.waitForTimeout(1500);
    eq('opened from the data file: difference 0', await q.evaluate(() => R.diff), 0);
    eq('…same to date as the test app', r2(await q.evaluate(() => R.toDate)), r2(R0.toDate));
    const k = await q.evaluate(() => __BK[0].items.find((x) => !x.pkg).k); await q.evaluate((kk) => { __BK[0].items.find((x) => x.k === kk).pkg = 'T77'; return __DL.save(); }, k); await q.waitForFunction(() => !DBF.busy && !DBF.again);
    const f2 = path.join(SP, 'm1b.db'); { const [d] = await Promise.all([q.waitForEvent('download'), q.click('#hasv [data-dbgo="dl"]')]); await d.saveAs(f2); } await c.close();
    // next month: open the data file, build again – no last report dropped, the codes come from the data file
    ({ c, q } = await fresh()); await openDb(q, f2); await q.waitForFunction(() => document.querySelector('#tabs button'), null, { timeout: 120000 }); await q.waitForTimeout(1000);
    await q.evaluate(() => document.getElementById('bNew').click()); await q.waitForTimeout(500); const f3 = path.join(SP, 'm2.db'); await buildInto(q, f3); await c.close();
    ({ c, q } = await fresh()); await openDb(q, f3); await q.waitForFunction(() => document.querySelector('#tabs button'), null, { timeout: 120000 }); await q.waitForTimeout(1500);
    eq('two builds in the data file', await q.evaluate(() => dbBuilds().length), 2);
    eq('…the new build has last month\'s code (from the data file)', await q.evaluate((kk) => __BK[0].items.find((x) => x.k === kk).pkg, k), 'T77');
    await q.$eval('#tabs [data-s="chk"]', (b) => b.click()); await q.click('#side [data-gt="dlog"]'); await q.waitForTimeout(800);
    ok('Data log compares with the last build: closed months unchanged, no certificate revised', await q.evaluate(() => /Against the last build/.test(document.getElementById('dlog').textContent) && !document.querySelector('#dlog .dlt .bad')), await q.$eval('#dlog', (e) => e.textContent.slice(0, 300)));
    eq('difference 0', await q.evaluate(() => R.diff), 0); await c.close();
  }
  const FAKE = () => { const fsDb = () => new Promise((res) => { const r = indexedDB.open('fakefs', 1); r.onupgradeneeded = () => r.result.createObjectStore('f'); r.onsuccess = () => res(r.result); });
      const io = async (mode, fn) => { const d = await fsDb(); return new Promise((res) => { const t = d.transaction('f', mode), q = fn(t.objectStore('f')); t.oncomplete = () => res(q && q.result); }); };
      const H = () => ({ __fake: 1, name: 'Test_register.db', kind: 'file', queryPermission: async () => (sessionStorage.getItem('fakePerm') === 'granted' ? 'granted' : 'prompt'),
        requestPermission: async () => { window.__asked = (window.__asked || 0) + 1; sessionStorage.setItem('fakePerm', 'granted'); return 'granted'; },
        getFile: async () => new Blob([(await io('readonly', (st) => st.get('file'))) || new Uint8Array()]),
        createWritable: async () => { const parts = []; return { write: async (d) => { parts.push(d); }, close: async () => { const u = new Uint8Array(await new Blob(parts).arrayBuffer()); await io('readwrite', (st) => st.put(u, 'file')); window.__writes = (window.__writes || 0) + 1; } }; } });
      const put = IDBObjectStore.prototype.put; IDBObjectStore.prototype.put = function (v, k) { return put.call(this, v && v.__fake ? '__FAKEH__' : v, k); };
      const g = Object.getOwnPropertyDescriptor(IDBRequest.prototype, 'result').get; Object.defineProperty(IDBRequest.prototype, 'result', { get() { const v = g.call(this); return v === '__FAKEH__' ? H() : v; } });
      window.showSaveFilePicker = async () => { sessionStorage.setItem('fakePerm', 'granted'); return H(); }; window.showOpenFilePicker = async () => { sessionStorage.setItem('fakePerm', 'granted'); return [H()]; }; };
  if (RUN('10c')) {
    head('10c. Close the Tool and open it again: it opens at once, the first click reconnects the data file');
    // a stand-in for Chrome's file handles: kept in IndexedDB like the real ones; the permission is forgotten when the browser closes (sessionStorage)
    const dir = path.join(OUT, 'profile'); fs.rmSync(dir, { recursive: true, force: true });
    const launch = async () => { const c = await chromium.launchPersistentContext(dir, { viewport: { width: 1600, height: 900 } }); await c.addInitScript(FAKE); const q = c.pages()[0] || await c.newPage(); q.on('pageerror', (e) => errs.push(e.message)); q.on('dialog', (d) => d.dismiss()); return { c, q }; };
    let { c, q } = await launch(); await q.goto('file://' + TOOL); await q.waitForSelector('#pick', { state: 'attached' });
    await q.click('#sDbNew'); await q.waitForFunction(() => /Test_register\.db/.test(document.querySelector('.dbc').textContent));
    await q.setInputFiles('#pick', files()); await q.waitForFunction(() => /CJI3 loaded/.test(document.querySelector('.stchk') ? document.querySelector('.stchk').textContent : ''), null, { timeout: 120000 });
    await q.click('#sBuild'); await q.waitForFunction(() => document.querySelector('#tabs button') && typeof DBF !== 'undefined' && DBF.db && DBF.st === 'ok', null, { timeout: 240000 }); await q.waitForTimeout(2000);
    ok('after the build the Tool opens from the data file by itself', await q.evaluate(() => DBF.cur === 1 && /Test_register\.db/.test(document.getElementById('hasv').textContent)));
    await q.$eval('#tabs [data-s="cod"]', (b) => b.click()); await q.waitForTimeout(400); { const m = await q.$('#asLater'); if (m) await m.click(); } const iq = await q.$('#tb input[data-f="pkg"]'); await iq.fill('T55'); await iq.press('Enter'); await q.waitForTimeout(800); { const m = await q.$('#asLater'); if (m) await m.click(); }
    const k = await q.evaluate(() => __BK.flatMap((b) => b.items).find((x) => x.pkg === 'T55').k);
    await q.waitForFunction(() => !DBF.busy && !DBF.again); await c.close();
    // close and open again: no choosing, the build is there at once
    ({ c, q } = await launch()); const t1 = Date.now(); await q.goto('file://' + TOOL); await q.waitForFunction(() => document.querySelector('#tabs button'), null, { timeout: 60000 });
    ok('opened again: the register is there at once – nothing to choose', await q.evaluate(() => document.getElementById('start').style.display === 'none' && !!DBF.pendH), `${Date.now() - t1} ms`);
    ok('…with your code', await q.evaluate((kk) => __BK.flatMap((b) => b.items).find((x) => x.k === kk).pkg, k) === 'T55');
    ok('…the top bar says the first click reconnects the data file', /click to reconnect/.test(await q.$eval('#hasv', (e) => e.textContent)), await q.$eval('#hasv', (e) => e.textContent));
    await q.mouse.click(700, 400); await q.waitForFunction(() => DBF.db && DBF.st === 'ok', null, { timeout: 30000 }); await q.waitForTimeout(800);
    ok('first click: the browser asks once, the data file is connected', await q.evaluate(() => window.__asked === 1 && /Test_register\.db · 1 build/.test(document.getElementById('hasv').textContent)), await q.$eval('#hasv', (e) => e.textContent));
    const w = await q.evaluate(() => window.__writes || 0); await q.evaluate((kk) => { __BK.flatMap((b) => b.items).find((x) => x.k === kk).pkg = 'T56'; return __DL.save(); }, k); await q.waitForFunction(() => !DBF.busy && !DBF.again);
    ok('…and changes go to the file again', await q.evaluate((ww) => (window.__writes || 0) > ww && JSON.parse(dbOne('SELECT codes FROM builds WHERE id = 1').codes).at > '', w));
    await q.click('#bDb'); await q.waitForTimeout(300);
    ok('side navigation › Data file: open another, new, download a copy, data log', await q.$$eval('#dbm.on [data-dbm]', (b) => b.map((x) => x.dataset.dbm).join(',')) === 'open,new,copy,log');
    eq('difference 0', await q.evaluate(() => R.diff), 0); await c.close(); fs.rmSync(dir, { recursive: true, force: true });
  }
  if (RUN('10d')) {
    head('10d. Next month from inside the register: drop only the new files, Update');
    // month 1: a CJI3 to the end of August (the September lines taken out) and one ZINTC1 file; month 2: the full CJI3 and the 2026 ZINTC1
    const cAug = path.join(OUT, 'cji3-aug.xlsx'), F1 = path.join(DATA, [].concat(F.cji3)[0]);
    if (!fs.existsSync(cAug)) { const XLm = require('xlsx'), wb = XLm.readFile(F1, { cellDates: true }), ws = wb.Sheets[wb.SheetNames[0]], rows = XLm.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
      const h = rows.findIndex((r) => r && r.includes('Posting Date')), c = rows[h].indexOf('Posting Date'), last = rows.slice(h + 1).map((r) => r && r[c]).filter((d) => d instanceof Date).sort((a, b) => b - a)[0], ym = (d) => d.getFullYear() * 100 + d.getMonth();
      const keep = rows.filter((r, k) => k <= h || !(r && r[c] instanceof Date && ym(r[c]) === ym(last))); const nb = XLm.utils.book_new(); XLm.utils.book_append_sheet(nb, XLm.utils.aoa_to_sheet(keep, { cellDates: true }), wb.SheetNames[0]); XLm.writeFile(nb, cAug); }
    const zf = [].concat(F.zintc1).map((f) => path.join(DATA, f)), first = [cAug, ...files().filter((f) => f !== F1 && (zf.length < 2 || f !== zf[zf.length - 1]))], neu = [F1, ...(zf.length > 1 ? [zf[zf.length - 1]] : [])];
    const dir = path.join(OUT, 'profile2'); fs.rmSync(dir, { recursive: true, force: true });
    const launch = async () => { const c = await chromium.launchPersistentContext(dir, { viewport: { width: 1600, height: 900 } }); await c.addInitScript(FAKE); const q = c.pages()[0] || await c.newPage(); q.on('pageerror', (e) => errs.push(e.message)); q.on('dialog', (d) => d.dismiss()); return { c, q }; };
    let { c, q } = await launch(); await q.goto('file://' + TOOL); await q.waitForSelector('#pick', { state: 'attached' });
    await q.click('#sDbNew'); await q.waitForFunction(() => /Test_register\.db/.test(document.querySelector('.dbc').textContent));
    await q.setInputFiles('#pick', first); await q.waitForFunction(() => /CJI3 loaded/.test(document.querySelector('.stchk') ? document.querySelector('.stchk').textContent : ''), null, { timeout: 120000 });
    await q.click('#sBuild'); await q.waitForFunction(() => document.querySelector('#tabs button') && typeof DBF !== 'undefined' && DBF.db && DBF.st === 'ok', null, { timeout: 240000 }); await q.waitForTimeout(1500);
    const m1 = await q.evaluate(() => ({ cut: __DL.data.META.cut, files: dbBuildFiles(DBF.cur).length }));
    ok('month 1 built into the data file, with its SAP files kept in it', m1.files === first.length, JSON.stringify(m1));
    await q.$eval('#tabs [data-s="cod"]', (b) => b.click()); await q.waitForTimeout(300); { const m = await q.$('#asLater'); if (m) await m.click(); } const iq = await q.$('#tb input[data-f="pkg"]'); await iq.fill('T66'); await iq.press('Enter'); await q.waitForTimeout(600); { const m = await q.$('#asLater'); if (m) await m.click(); }
    const k = await q.evaluate(() => __BK.flatMap((b) => b.items).find((x) => x.pkg === 'T66').k); await q.waitForFunction(() => !DBF.busy && !DBF.again); await q.waitForTimeout(1500);
    // month 2: Add new SAP files…
    const [fc] = await Promise.all([q.waitForEvent('filechooser'), q.click('#bAdd')]); await fc.setFiles(neu);
    await q.waitForFunction(() => document.querySelector('#updm [data-upd="go"]'), null, { timeout: 120000 }); const box = await q.$eval('#updm', (e) => e.textContent);
    ok('one box: what each new file does, what is kept from the data file', /Update the register with/.test(box) && /replaces/.test(box) && /Kept from the data file/.test(box), box.slice(0, 400));
    await q.click('#updm [data-upd="go"]'); await q.waitForFunction(() => typeof DBF !== 'undefined' && DBF.db && DBF.cur === 2 && document.querySelector('#tabs button'), null, { timeout: 300000 }); await q.waitForTimeout(2000);
    const m2 = await q.evaluate(() => ({ cut: __DL.data.META.cut, diff: R.diff, td: R.toDate, b: dbBuilds().length, roles: dbBuildFiles(DBF.cur).map((f) => f.role).sort().join(',') }));
    ok('Update: a new build in the data file, difference 0', m2.b === 2 && m2.cut >= m1.cut && Math.abs(m2.diff) < 0.01, JSON.stringify(m2));
    eq('…the same to date as building from every file', r2(m2.td), r2(R0.toDate));
    ok('…the history: new files, kept files, the replaced one', /new/.test(m2.roles) && /kept/.test(m2.roles) && /replaced/.test(m2.roles), m2.roles);
    eq('…your code came along', await q.evaluate((kk) => __BK.flatMap((b) => b.items).find((x) => x.k === kk).pkg, k), 'T66');
    await q.$eval('#tabs [data-s="chk"]', (b) => b.click()); await q.click('#side [data-gt="dlog"]'); await q.waitForTimeout(800);
    ok('Data log › Builds: both builds with their SAP files', await q.evaluate(() => document.querySelectorAll('#dlog .bfs').length === 2 && /replaced/.test(document.getElementById('dlog').textContent)));
    await c.close(); fs.rmSync(dir, { recursive: true, force: true });
  }
  await browser.close();
  head('Page errors'); ok('no JavaScript errors on any page', errs.length === 0, [...new Set(errs)].slice(0, 5).join(' | '));

  if (UPDATE) { fs.writeFileSync(EXP, JSON.stringify(got, null, 1) + '\n'); console.log('\n' + path.basename(EXP) + ' updated'); }
  const bad = results.filter((r) => !r.pass);
  console.log(`\n${results.length - bad.length} passed · ${bad.length} failed · ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  if (bad.length) { console.log('FAILED:'); bad.forEach((r) => console.log(`  ${r.section} › ${r.name}: ${r.detail}`)); process.exit(1); }
})().catch((e) => { console.error(e); process.exit(1); });
