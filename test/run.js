#!/usr/bin/env node
'use strict';
// Release checks for the Cost Register Tool – run before every release:  npm test   (runs both projects)
//   node test/run.js [--set suth|sbay] [--quick: skip 9 Excel export and 10 start-page build] [--only 7e,8: run only these sections (1–4 always run)]
//                    [--built: the Tool is already built (test/all.js builds it once)] [--update: rewrite that set's expected figures]
//   npm test = test/all.js: both projects at the same time
// Data: test/data (SUTH) and test/data-sbay (SBAY) = MASKED copies of the SAP files (tools/mask-sap.js): names and texts replaced, every number kept.
// Needs Playwright with Chromium (npm i -D playwright && npx playwright install chromium, if it is not on the machine).
const fs = require('fs'),
  path = require('path'),
  { execFileSync } = require('child_process');
const args = process.argv.slice(2),
  UPDATE = args.includes('--update'),
  QUICK = args.includes('--quick'),
  BUILT = args.includes('--built'),
  ONLY = args.includes('--only')
    ? String(args[args.indexOf('--only') + 1] || '')
        .split(',')
        .map((x) => x.trim().toLowerCase())
        .filter(Boolean)
    : null,
  SET = (args[args.indexOf('--set') + 1] && args.includes('--set') ? args[args.indexOf('--set') + 1] : 'suth').toLowerCase();
const SETS = {
  suth: {
    dir: 'data',
    exp: 'expected.json',
    other: 'SBAY',
    F: {
      cji3: 'cji3.xlsx',
      zscprg01: 'zscprg01.xlsx',
      zscsrv1: 'zscsrv1.xlsx',
      zintc1: ['zintc1-2025.xlsx', 'zintc1-2026.xlsx'],
      mb52: 'mb52-other-project.xlsx',
    },
  }, // its MB52 is another project on purpose
  sbay: {
    dir: 'data-sbay',
    exp: 'expected-sbay.json',
    other: '',
    F: { cji3: 'cji3.xlsx', zscprg01: 'zscprg01.xlsx', zscsrv1: 'zscsrv1.xlsx', zintc1: ['zintc1.xlsx'], mb52: 'mb52.xlsx' },
  },
};
if (!SETS[SET]) {
  console.error('Unknown set ' + SET + ' – use ' + Object.keys(SETS).join(' / '));
  process.exit(2);
}
const ROOT = path.join(__dirname, '..'),
  DATA = path.join(__dirname, SETS[SET].dir),
  OUT = path.join(ROOT, 'out', 'test', SET),
  EXP = path.join(__dirname, SETS[SET].exp),
  F = SETS[SET].F;
console.log('Data set: ' + SET.toUpperCase());
const files = () =>
  Object.values(F)
    .flat()
    .map((f) => path.join(DATA, f));
// the nav keeps the data file, import / save codes, VAT and the monthly job under ⋯ More: open it first, as a user does
const more = async (q) => {
  if (await q.evaluate(() => document.getElementById('nmore').hidden)) await q.click('#bMore');
};

// ---------------------------------------------------------------------------------------------- tiny test kit
const results = [];
let section = '';
const ok = (name, pass, detail = '') => {
  results.push({ section, name, pass: !!pass, detail });
  console.log(`  ${pass ? '✓' : '✗'} ${name}${detail && !pass ? '  →  ' + detail : ''}`);
};
const eq = (name, got, want, tol = 0.01) =>
  ok(
    name,
    typeof want === 'number' ? Math.abs(got - want) <= tol : JSON.stringify(got) === JSON.stringify(want),
    `got ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`
  );
const head = (s) => {
  section = s;
  console.log('\n' + s);
};
const r2 = (x) => Math.round(x * 100) / 100;
// which sections run: 1–4 always (they open the register); --only picks sections; --quick leaves out the slow 9 and 10
const RUN = (k) => (!ONLY || ONLY.includes(k)) && !(QUICK && (k === '9' || k === '10' || k === '10b' || k === '10c' || k === '10d'));

(async () => {
  const t0 = Date.now();
  fs.mkdirSync(OUT, { recursive: true });
  const exp = fs.existsSync(EXP) ? JSON.parse(fs.readFileSync(EXP, 'utf8')) : {},
    got = {};
  const want = (k, v) => {
    got[k] = v;
    return UPDATE || exp[k] === undefined ? v : exp[k];
  };
  if (!files().every((f) => fs.existsSync(f))) {
    console.error('Test data missing in test/data – see test/README.md');
    process.exit(2);
  }

  // ---------------------------------------------------------------------------- 1. files are recognised by their content
  head('1. File recognition');
  const { sniffInfo } = require('../src/sniff');
  const kinds = files().map((f) => [path.basename(f), sniffInfo(f)]);
  for (const [n, s] of kinds) eq(`${n} → ${s.kind} · ${s.proj}`, s, want('sniff:' + n, s));

  // ---------------------------------------------------------------------------- 2. engine: CJI3 split into buckets
  head('2. Engine');
  const { prepare } = require('../src/prepare'),
    { toAppData } = require('../src/appdata');
  const o = {
    cji3: path.join(DATA, F.cji3),
    zscprg01: path.join(DATA, F.zscprg01),
    zscsrv1: path.join(DATA, F.zscsrv1),
    zintc1: F.zintc1.map((f) => path.join(DATA, f)),
    mb52: path.join(DATA, F.mb52),
    log: () => {},
  };
  const CACHE = path.join(OUT, 'engine-cache.json'),
    SRC = path.join(ROOT, 'src'),
    stamp = JSON.stringify(
      [...files(), ...fs.readdirSync(SRC).map((x) => path.join(SRC, x))].map((x) => [
        path.basename(x),
        fs.statSync(x).mtimeMs,
        fs.statSync(x).size,
      ])
    );
  let D = null;
  try {
    const c = JSON.parse(fs.readFileSync(CACHE, 'utf8'));
    if (c.stamp === stamp) D = c.D;
  } catch (e) {
    /* no cache yet */
  }
  if (D) console.log('  (engine result reused – no data or engine file changed since the last run)');
  else {
    D = toAppData(prepare(o), o);
    fs.writeFileSync(CACHE, JSON.stringify({ stamp, D }));
  }
  let sum = 0;
  for (const a of D.L.amt) sum += a;
  eq('project from the WBS', D.META.project, want('project', D.META.project));
  eq('CJI3 cost', D.META.cost, want('cost', D.META.cost));
  eq('CJI3 lines', D.L.b.length, want('lines', D.L.b.length), 0);
  eq('sum of all line amounts', r2(sum), want('lineSum', r2(sum)));
  eq(
    'items',
    D.BK.reduce((x, b) => x + b.items.length, 0),
    want(
      'items',
      D.BK.reduce((x, b) => x + b.items.length, 0)
    ),
    0
  );
  eq(
    'items per bucket',
    D.BK.map((b) => b.id + ':' + b.items.length),
    want(
      'bucketItems',
      D.BK.map((b) => b.id + ':' + b.items.length)
    )
  );
  eq('no unclassified lines', D.META.unclassified || 0, 0, 0);
  {
    // client deductions: GL 30402xxx by number, and an RV (billing) line with a positive amount unless the GL is revenue (4…)
    const t = [
      { ce: '30402100', cen: 'Liquid Damage LDFD', type: 'KR', wbs: '', amt: 500 },
      { ce: '30402400', cen: 'penalty', type: 'SA', wbs: '', amt: -20 },
      { ce: '30605100', cen: 'Miscel. allowances', type: 'RV', wbs: '', amt: 75 },
      { ce: '40101100', cen: 'Op contracts Income', type: 'RV', wbs: '', amt: 900 },
      { ce: '30605100', cen: 'Miscel. allowances', type: 'RV', wbs: '', amt: -75 },
    ];
    require('../src/rules').classify(t, []);
    eq(
      'client deductions: 30402xxx and RV with a positive amount (not on 4…)',
      t.map((l) => l.bucket + (l.sub ? ' · ' + l.sub : '')).join(' | '),
      'Revenue · Client deductions | Revenue · Client deductions | Revenue · Client deductions | Revenue | G&A · Site running costs'
    );
  }
  eq('no duplicate line keys', D.META.dupes || 0, 0, 0);

  // ---------------------------------------------------------------------------- 3. build the Tool and a test app with the data inside
  head('3. Build');
  if (!BUILT) execFileSync('node', ['tools/build-app.js'], { cwd: ROOT, stdio: 'pipe' });
  const VER = fs.readFileSync(path.join(ROOT, 'VERSION'), 'utf8').trim(),
    TOOL = path.join(ROOT, 'out', `Cost_Register_Tool_v${VER}.html`),
    APP = path.join(OUT, 'test_app.html');
  ok('Tool built: ' + path.basename(TOOL), fs.existsSync(TOOL));
  ok(
    'Tool has its version, no placeholder',
    fs.readFileSync(TOOL, 'utf8').includes('v' + VER) && !fs.readFileSync(TOOL, 'utf8').includes('__VER__')
  );
  fs.writeFileSync(APP, require('../tools/build-app').page('const DATA0=' + JSON.stringify(D) + ';'));
  ok('test app built', fs.existsSync(APP));

  // ---------------------------------------------------------------------------- 4. the app in a browser
  let chromium;
  try {
    ({ chromium } = require('playwright'));
  } catch (e) {
    console.error('Playwright is not installed – npm i -D playwright');
    process.exit(2);
  }
  const browser = await chromium.launch(),
    errs = [];
  const open = async (url, ctxOpt = {}) => {
    const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, acceptDownloads: true, ...ctxOpt }),
      p = await ctx.newPage();
    p.on('pageerror', (e) => errs.push(e.message));
    p.on('dialog', (d) => (d.type() === 'beforeunload' ? d.accept() : d.dismiss()));
    await p.goto('file://' + url);
    await p.waitForFunction(() => document.querySelector('#tabs button'), null, { timeout: 60000 });
    await p.waitForTimeout(1200);
    return { ctx, p };
  };
  const { ctx, p } = await open(APP);
  head('4. Opening the register');
  eq('opens on the Summary (Reports)', await p.evaluate(() => __SEC()), 'dash');
  eq('the 4 steps of the month', await p.$$eval('#tabs button', (b) => b.map((x) => x.dataset.s)), ['chk', 'cod', 'adj', 'bud']);
  ok(
    'Summary: 4 cards, the 6-month average on the chart, no Reconciliation box',
    await p.evaluate(
      () =>
        document.querySelectorAll('#sum .sks .sk').length === 4 &&
        /month average \d/.test(document.querySelector('#sum svg').textContent) &&
        !/Reconciliation/.test(document.getElementById('sum').textContent)
    )
  );
  {
    const f = await p.evaluate(() => {
      document.querySelector('#sum .sleg [data-sbk]').click();
      const one = new Set([...document.querySelectorAll('#sum svg g.smo rect')].map((r) => r.getAttribute('fill'))),
        hi = !!document.querySelector('#sum tr.son');
      document.querySelector('#sum .sleg [data-sbk=""]').click();
      return { one: one.size === 1, hi, back: !document.querySelector('#sum .slb.on') && !document.querySelector('#sum tr.son') };
    });
    ok(
      'Summary: a bucket picked shows it alone in the chart, its row marked; All buckets brings them back',
      f.one && f.hi && f.back,
      JSON.stringify(f)
    );
  }
  const R0 = await p.evaluate(() => ({ diff: R.diff, toDate: R.toDate, cd: R.cdAll, pend: R.pend, excl: R.excl }));
  eq('difference to CJI3 = 0', R0.diff, 0);
  eq('to date', r2(R0.toDate), want('toDate', r2(R0.toDate)));
  eq('client deductions', r2(R0.cd), want('clientDeductions', r2(R0.cd)));
  ok(
    'footer: "Not saved to a file", no change counted (the automatic indirect fill is not a change of yours)',
    await p.$eval('#hasv', (e) => /Not saved to a file/.test(e.textContent) && !/change/.test(e.textContent)),
    await p.$eval('#hasv', (e) => e.textContent.slice(0, 300))
  );
  ok('no auto-save question before any coding', !(await p.$('#asm')));
  const bkTd = await p.evaluate(() => __BK.map((b) => b.id + ':' + Math.round(b.items.reduce((s, it) => s + it.td, 0))));
  eq('to date per bucket', bkTd, want('bucketToDate', bkTd));

  if (RUN('5')) {
    head('5. Indirect presets and opening balance');
    const ind = await p.evaluate(() => {
      const m = {};
      __BK.forEach((b) =>
        b.items.forEach((it) => {
          if (it.pkg === 'Indirect') m[b.id + ' ' + it.ce] = (m[b.id + ' ' + it.ce] || 0) + 1;
        })
      );
      return m;
    });
    eq(
      'indirect items coded by the presets',
      Object.values(ind).reduce((x, y) => x + y, 0),
      want(
        'presetItems',
        Object.values(ind).reduce((x, y) => x + y, 0)
      ),
      0
    );
    eq('indirect codes per bucket', ind, want('presetCodes', ind));
    const ob = await p.evaluate(() => {
      const { L, S, N } = __D;
      let m = 0;
      for (let i = 0; i < N; i++) if (L.d[i] && (!m || L.d[i] < m)) m = L.d[i];
      let n = 0,
        a = 0;
      for (let i = 0; i < N; i++)
        if (S[L.ty[i]] === 'UE' && (/^OB\b/i.test(S[L.hdr[i]] || '') || L.d[i] === m)) {
          n++;
          a += L.amt[i];
        }
      return [n, Math.round(a)];
    });
    eq('opening-balance lines (UE / OB)', ob, want('openingBalance', ob));
  }

  if (RUN('6')) {
    head('6. Every page opens');
    const pages = await p.evaluate(() => __SECS());
    for (const s of pages) {
      await p.evaluate((x) => __GO(x), s);
      await p.waitForTimeout(300);
      const side = await p.$$eval('#side [data-gt]', (x) => [
        ...new Set(x.map((y) => y.dataset.gt + '|' + (y.dataset.bk || '') + '|' + (y.dataset.uv || '') + '|' + (y.dataset.sv || ''))),
      ]);
      for (const k of side) {
        const [gt, bk, uv, sv] = k.split('|');
        const n0 = errs.length;
        await p.click(
          `#side [data-gt="${gt}"]${bk ? `[data-bk="${bk}"]` : ''}${uv ? `[data-uv="${uv}"]` : ''}${sv ? `[data-sv="${sv}"]` : ''}`
        );
        await p.waitForTimeout(250);
        const filled = await p.evaluate(() => {
          const pg = document.querySelector('#pages .page.on');
          return pg ? pg.innerText.trim().length : 0;
        });
        ok(
          `${s} › ${gt}${bk ? ' · bucket ' + bk : ''}${uv ? ' · ' + uv : ''}${sv ? ' · ' + sv : ''}`,
          errs.length === n0 && filled > 20,
          errs.slice(n0).join(' | ') || 'empty page'
        );
      }
    }
    // Check page: every reconciliation check OK
    await p.evaluate(() => __GO('chk'));
    await p.click('#side [data-gt="chk"]');
    await p.waitForTimeout(300);
    eq('Check › no reconciliation line asks for a look', await p.$$eval('#chk .chk', (x) => x.length), 0, 0);
  }

  if (RUN('7')) {
    head('7. Coding, undo, Lines');
    await p.evaluate(() => __GO('cod'));
    await p.click('#side [data-gt="cod"][data-bk="0"]');
    await p.waitForTimeout(400);
    ok('Start here guide on the Code page', await p.$eval('#guide', (g) => !g.hidden));
    const first = await p.$('#tb input[data-f="pkg"]');
    await first.fill('T01');
    await first.press('Enter');
    await p.waitForTimeout(900);
    ok(
      'first coding asks: Keep your work in a data file?',
      !!(await p.$('#asm')) && /Keep your work in a data file/.test(await p.$eval('#asm', (e) => e.textContent))
    );
    await p.click('#asLater');
    await p.waitForTimeout(200);
    ok('Later closes it', !(await p.$('#asm')));
    const it0 = await p.evaluate(() => (__BK[0].items.find((x) => x.pkg === 'T01') ? 1 : 0));
    ok('typing a PKG codes the item', it0 === 1);
    ok('footer: not saved to a file · 1 change (on hover)', await p.$eval('#hasv .asv.red', (e) => /1 change/.test(e.title)));
    eq('difference stays 0 after coding', await p.evaluate(() => R.diff), 0);
    await p.keyboard.press('Control+z');
    await p.waitForTimeout(400);
    ok('Ctrl+Z takes the code back', await p.evaluate(() => !__BK[0].items.some((x) => x.pkg === 'T01')));
    await p.click('[data-cv="lines"]:visible');
    await p.waitForTimeout(800);
    ok(
      'SAP transaction lines are the lines of the bucket being coded (Material)',
      await p.evaluate(
        () => /Material/.test(document.querySelector('#tools .tt').textContent) && [...document.querySelectorAll('#tb tr.it')].length > 5
      )
    );
    ok(
      'Code › Lines (CJI3) shows the lines with their header text',
      (await p.$$eval('#th th', (x) => x.some((t) => /Document header text/.test(t.textContent)))) &&
        (await p.$$eval('#tb tr', (x) => x.length > 10))
    );
    {
      const n0 = await p.$eval('#tools', (e) => +((e.textContent.match(/([\d,]+) rows/) || [])[1] || '0').replace(/,/g, ''));
      const g = await p.$$eval('#side [data-grpsel] option', (x) => (x.find((y) => y.value) || {}).value || '');
      if (g) {
        await p.selectOption('#side [data-grpsel]', g);
        await p.waitForTimeout(700);
        const n1 = await p.$eval('#tools', (e) => +((e.textContent.match(/([\d,]+) rows/) || [])[1] || '0').replace(/,/g, ''));
        ok('Lines follow the group chosen in the Group pick list', n1 > 0 && n1 < n0, n0 + ' → ' + n1);
        await p.selectOption('#side [data-grpsel]', '');
        await p.waitForTimeout(400);
      }
    }
    await p.evaluate(() => __GO('dash'));
    await p.click('#side [data-rates]'); // Rates (Material first)
    await p.waitForTimeout(800);
    ok('Code › Rate analysis (Material) opens', await p.$eval('#pg-mr', (e) => e.classList.contains('on') && e.innerText.length > 100));
    await p.evaluate(() => __GO('cod'));
    await p.click('[data-cv="cod"]:visible');
    await p.waitForTimeout(300);
  }

  if (RUN('7b')) {
    head('7b. Next to code: biggest first, suggestions, keys');
    {
      const { ctx: c5, p: p5 } = await open(APP);
      await p5.evaluate(() => __GO('cod'));
      await p5.click('#side [data-gt="cod"][data-bk="0"]');
      await p5.waitForTimeout(300);
      await p5.click('[data-cm="all"]:visible');
      await p5.waitForTimeout(400);
      await p5.evaluate(() => {
        const th = [...document.querySelectorAll('#th th')].find((x) => /^Material/.test(x.textContent.trim()));
        if (th) th.click();
      });
      await p5.waitForTimeout(400); // a sort set in All items must not carry over
      await p5.click('[data-cm="todo"]:visible');
      await p5.waitForTimeout(600);
      const tds = await p5.evaluate(() =>
        [...document.querySelectorAll('#tb tr.it')].slice(0, 15).map((tr) => Math.abs(__BK[0].items[+tr.dataset.k.split(':')[1]].td))
      );
      ok('Next to code lists the not-coded items, biggest first', tds.length > 10 && tds.every((v, i) => !i || tds[i - 1] >= v));
      ok('progress: how many items bring the bucket to 80%', /bring you to 80%/.test(await p5.$eval('#nxbar', (e) => e.textContent)));
      const k0 = await p5.$eval('#tb tr.it', (tr) => tr.dataset.k),
        g0 = await p5.evaluate((k) => __BK[0].items[+k.split(':')[1]].vals[2], k0);
      const a = await p5.$('#tb input[data-f="pkg"]');
      await a.fill('T05');
      await a.press('Enter');
      await p5.waitForTimeout(500);
      const m5 = await p5.$('#asLater');
      if (m5) await m5.click();
      const c0 = await p5.$('#tb input[data-f="ce"]');
      await c0.fill('TCE');
      await c0.press('Enter');
      await p5.waitForTimeout(600);
      ok(
        'a coded item stays in the list, marked, until Refresh',
        await p5.$$eval('#tb tr.it.pin', (x, k) => x.some((tr) => tr.dataset.k === k), k0)
      );
      await p5.$eval('[data-pinr]', (b) => b.click());
      await p5.waitForTimeout(400);
      ok('…Refresh: it leaves the list', await p5.$$eval('#tb tr.it', (x, k) => !x.some((tr) => tr.dataset.k === k), k0));
      const sg = await p5.$('#tb tr.it input.sug[data-f="pkg"]');
      ok(
        'an item of the same material group gets the suggestion',
        !!sg && (await sg.getAttribute('data-sug')) === 'T05' && (await sg.evaluate((x, g) => x.closest('tr').textContent.includes(g), g0))
      );
      const ks = await sg.evaluate((x) => x.closest('tr').dataset.k);
      await sg.focus();
      await p5.keyboard.press('Enter');
      await p5.waitForTimeout(600);
      ok(
        'Enter accepts the suggestion (PKG and cost element)',
        await p5.evaluate((k) => {
          const it = __BK[0].items[+k.split(':')[1]];
          return it.pkg === 'T05' && it.ce === 'TCE';
        }, ks)
      );
      const ins = await p5.$$('#tb input[data-f="pkg"]');
      await ins[0].fill('T06');
      await ins[0].press('Tab');
      await p5.waitForTimeout(500);
      const ins2 = await p5.$$('#tb input[data-f="pkg"]');
      await ins2[1].focus();
      await p5.keyboard.press('Control+d');
      await p5.waitForTimeout(500);
      ok('Ctrl+D copies the code from the row above', await p5.evaluate(() => __BK[0].items.filter((x) => x.pkg === 'T06').length === 2));
      // Subcontractor: same PO
      const si = await p5.evaluate(() => __BK.findIndex((b) => b.id === 'Subcontractor'));
      await p5.click(`#side [data-gt="cod"][data-bk="${si}"]`);
      await p5.waitForTimeout(600);
      const sp = await p5.evaluate((si) => {
        const { L, S, N } = __D,
          m = new Map();
        for (let i = 0; i < N; i++)
          if (L.b[i] === si) {
            const po = S[L.po[i]];
            if (po && po[0] !== '(') {
              const s = m.get(po) || m.set(po, new Set()).get(po);
              s.add(L.it[i]);
            }
          }
        const hit = [...m].find(([, s]) => s.size > 1);
        return hit ? [hit[0], [...hit[1]].slice(0, 2)] : null;
      }, si);
      if (sp) {
        await p5.evaluate(
          ([si, ii]) => {
            const it = __BK[si].items[ii];
            it.pkg = 'T07';
            it.ce = 'TSC';
            it.div = it.div || 'DIV 03';
            it.mnl = it.mnl || 'SUB';
          },
          [si, sp[1][0]]
        );
        await p5.click('[data-cm="all"]:visible');
        await p5.click('[data-cm="todo"]:visible');
        await p5.waitForTimeout(600);
        ok(
          'Subcontractor: an item on the same PO gets the suggestion',
          await p5.evaluate(
            ([si, ii]) => {
              const tr = document.querySelector(`#tb tr.it[data-k="${si}:${ii}"]`);
              return !!tr && !!tr.querySelector('input.sug');
            },
            [si, sp[1][1]]
          )
        );
      } else ok('Subcontractor: a PO with two items exists', false);
      eq('difference stays 0', await p5.evaluate(() => R.diff), 0);
      await c5.close();
    }
  }

  if (RUN('7c')) {
    head('7c. Codes in one spelling');
    {
      const { ctx: c6, p: p6 } = await open(APP);
      await p6.evaluate(() => __GO('cod'));
      await p6.click('#side [data-gt="cod"][data-bk="0"]');
      await p6.waitForTimeout(300);
      const ks = await p6.$$eval('#tb tr.it', (x) => x.slice(0, 2).map((tr) => tr.dataset.k));
      const i1 = (await p6.$$('#tb input[data-f="ce"]'))[0];
      await i1.fill('sf-02x');
      await i1.press('Tab');
      await p6.waitForTimeout(400);
      const m6 = await p6.$('#asLater');
      if (m6) await m6.click();
      eq(
        'a typed code is kept in capitals (sf-02x → SF-02X)',
        await p6.evaluate((k) => __BK[0].items[+k.split(':')[1]].ce, ks[0]),
        'SF-02X'
      );
      const i2 = (await p6.$$('#tb input[data-f="pkg"]'))[1];
      await i2.fill('indirect');
      await i2.press('Tab');
      await p6.waitForTimeout(400);
      eq(
        'a known code keeps its own spelling (indirect → Indirect)',
        await p6.evaluate((k) => __BK[0].items[+k.split(':')[1]].pkg, ks[1]),
        'Indirect'
      );
      // an old lowercase code (from before) is fixed when the register opens
      await p6.evaluate((k) => {
        __BK[0].items[+k.split(':')[1]].ce = 'sp-17';
      }, ks[0]);
      const i3 = (await p6.$$('#tb input[data-f="pkg"]'))[2];
      await i3.fill('T09');
      await i3.press('Tab');
      await p6.waitForTimeout(500);
      await p6.reload();
      await p6.waitForFunction(() => document.querySelector('#tabs button'));
      await p6.waitForTimeout(2500);
      eq(
        'an old lowercase code is in capitals after reopening (sp-17 → SP-17)',
        await p6.evaluate((k) => __BK[0].items[+k.split(':')[1]].ce, ks[0]),
        'SP-17'
      );
      await p6.evaluate(() => __GO('chk'));
      await p6.click('#side [data-gt="log"]');
      await p6.waitForTimeout(400);
      ok('…and it is in the Changes log', /Codes in capitals/.test(await p6.$eval('#pages .page.on', (e) => e.innerText)));
      eq('difference stays 0', await p6.evaluate(() => R.diff), 0);
      await c6.close();
    }
  }

  if (RUN('7d')) {
    head('7d. Navigation, Cost flow, coding work list, pick list');
    {
      const { ctx: c7, p: p7 } = await open(APP);
      ok(
        'top bar: logo, project › Reports › page name and the cut date',
        (await p7.$eval('header.top .crumb', (e) => /SBAY|SUTH|[A-Z]{3,}/.test(e.textContent) && /Summary/.test(e.textContent))) &&
          (await p7.$eval('header.top .cut', (e) => /CUT/.test(e.textContent) && !!e.querySelector('#cut').value)) &&
          !!(await p7.$('header.top .brand img'))
      );
      const w0 = await p7.$eval('#nav', (e) => e.getBoundingClientRect().width);
      ok(
        'the menu: open with words – MONTH CLOSE · REPORTS · SETTINGS',
        w0 > 200 &&
          (await p7.$eval(
            '#nav',
            (e) => /MONTH CLOSE/.test(e.textContent) && /REPORTS/.test(e.textContent) && /SETTINGS/.test(e.textContent)
          )),
        String(w0)
      );
      await p7.click('#bNavFold');
      await p7.waitForTimeout(300);
      ok(
        '☰ folds it to a rail (icon + word), the page gets the width',
        (await p7.$eval('#nav', (e) => e.getBoundingClientRect().width)) < 90 &&
          (await p7.$eval('#mainrow', (e) => e.getBoundingClientRect().left)) < 90
      );
      await p7.click('#bNavFold');
      await p7.waitForTimeout(300);
      ok('…and opens it again', (await p7.$eval('#nav', (e) => e.getBoundingClientRect().width)) > 200);
      // Cost flow: the bands (plus the credits that cannot be drawn) are the cost to date
      await p7.click('#side [data-gt="flow"]');
      await p7.waitForTimeout(700);
      const fl = await p7.evaluate(() => {
        const t = document.querySelector('#flow .flh').textContent,
          n = (document.querySelector('#flow .fln') || {}).textContent || '',
          num = (x) => +String(x).replace(/,/g, '');
        const bands = num((t.match(/· ([\d,]+) ·/) || [])[1] || 0),
          cr = num((n.match(/Not drawn: (-[\d,]+)/) || [])[1] || 0);
        return {
          bands,
          cr,
          td: Math.round(R.toDate),
          paths: document.querySelectorAll('#flsvg path.fb').length,
          nodes: document.querySelectorAll('#flsvg g.fn').length,
        };
      });
      ok('Cost flow draws the buckets, Direct / Indirect and the packages', fl.paths > 5 && fl.nodes > 5, JSON.stringify(fl));
      ok('Cost flow ties to the cost to date (bands + credits)', Math.abs(fl.bands + fl.cr - fl.td) <= 2, JSON.stringify(fl));
      const flNum = () =>
        p7.evaluate(() => {
          const t = document.querySelector('#flow .flh').textContent,
            n = (document.querySelector('#flow .fln') || {}).textContent || '',
            num = (x) => +String(x).replace(/,/g, '');
          return num((t.match(/· ([\d,]+) ·/) || [])[1] || 0) + num((n.match(/Not drawn: (-[\d,]+)/) || [])[1] || 0);
        });
      ok(
        'Cost flow: the last layer breaks each package down by bucket',
        await p7.$$eval('#flsvg path.fb', (x) => x.some((e) => /– from /.test(e.textContent)))
      );
      await p7.click('#flow [data-fl="bd:off"]');
      await p7.waitForTimeout(300);
      ok(
        '…and Hide takes the breakdown away',
        await p7.$$eval('#flsvg path.fb', (x) => x.length > 5 && !x.some((e) => /– from /.test(e.textContent)))
      );
      await p7.click('#flow [data-fl="bd:all"]');
      await p7.waitForTimeout(300);
      await p7.click('#flow [data-flp="tm"]');
      await p7.waitForTimeout(400);
      {
        const g = await flNum(),
          w = await p7.evaluate(() => R.thisM);
        ok('Cost flow of the cut month ties to This month', Math.abs(g - w) <= 2, g + ' vs ' + w);
      }
      const tm = await flNum();
      await p7.click('#flow [data-flp="prev"]');
      await p7.waitForTimeout(400);
      const pm = await flNum();
      ok(
        '◀ moves the period one month back (another figure, From and To follow)',
        pm !== tm &&
          (await p7.evaluate(
            () =>
              document.getElementById('flFrom').value === document.getElementById('flTo').value &&
              +document.getElementById('flTo').value === R.rep - 1
          )),
        tm + ' → ' + pm
      );
      await p7.selectOption('#flFrom', '0');
      await p7.waitForTimeout(300);
      await p7.selectOption('#flTo', String(await p7.evaluate(() => R.rep)));
      await p7.waitForTimeout(400);
      ok('a range from Opening to the cut month is the cost to date again', Math.abs((await flNum()) - fl.td) <= 2);
      await p7.hover('#nav');
      await p7.waitForTimeout(400);
      await p7.evaluate(() => __GO('cod'));
      await p7.mouse.move(900, 500);
      await p7.waitForTimeout(600);
      ok(
        'Coding opens on To code, largest cost first',
        (await p7.$eval('#tools [data-cm="todo"]', (b) => b.classList.contains('on'))) &&
          (await p7.evaluate(() => {
            const t = [...document.querySelectorAll('#tb tr.it')].slice(0, 10).map((tr) => {
              const [bi, ii] = tr.dataset.k.split(':');
              return Math.abs(__BK[+bi].items[+ii].td);
            });
            return t.length > 1 && t.every((v, i) => !i || v <= t[i - 1]);
          }))
      );
      const left = await p7.evaluate(() => {
        let n = 0;
        __BK.forEach((b) =>
          b.items.forEach((it) => {
            if (it.inc !== 'No' && !(it.pkg && it.mnl && it.ce && (b.id !== 'Subcontractor' || it.div))) n++;
          })
        );
        return n;
      });
      ok(
        'navigation: Code shows the items left (badge; % coded and items left on hover)',
        await p7.$eval(
          '#tabs [data-s="cod"]',
          (e, n) =>
            /% coded/.test(e.title) &&
            e.title.includes(n.toLocaleString('en-US') + ' item') &&
            /\d|k/.test(e.querySelector('.nb').textContent),
          left
        ),
        (await p7.$eval('#tabs [data-s="cod"]', (e) => e.title)) + ' · expected ' + left
      );
      ok(
        'work list: every bucket with something left shows it',
        await p7.$$eval('#side .rk .rh', (x) => x.length > 0 && x.some((e) => / left/.test(e.textContent)))
      );
      // pick list: code one item, then the next PKG box offers that code; ↓ + Enter takes it
      const k1 = await p7.$eval('#tb tr.it', (tr) => tr.dataset.k);
      const i1 = await p7.$('#tb input[data-f="pkg"]');
      await i1.fill('T11');
      await i1.press('Tab');
      await p7.waitForTimeout(400);
      const m7 = await p7.$('#asLater');
      if (m7) await m7.click();
      const i2 = (await p7.$$('#tb input[data-f="pkg"]'))[1],
        k2 = await i2.evaluate((x) => x.closest('tr').dataset.k);
      await i2.click();
      await i2.fill('t1');
      await p7.waitForTimeout(300);
      ok(
        'the pick list shows your PKG codes, filtered as you type',
        await p7.$eval('#pkl', (e) => !e.hidden && [...e.querySelectorAll('[data-i] b')].some((b) => b.textContent === 'T11')),
        await p7.evaluate(() => (document.getElementById('pkl') || {}).textContent)
      );
      await i2.press('ArrowDown');
      await i2.press('Enter');
      await p7.waitForTimeout(500);
      eq(
        '↓ and Enter take the code from the list',
        await p7.evaluate((k) => {
          const [bi, ii] = k.split(':');
          return __BK[+bi].items[+ii].pkg;
        }, k2),
        'T11'
      );
      ok(
        'the first item kept its code',
        await p7.evaluate((k) => {
          const [bi, ii] = k.split(':');
          return __BK[+bi].items[+ii].pkg === 'T11';
        }, k1)
      );
      eq('difference stays 0', await p7.evaluate(() => R.diff), 0);
      await c7.close();
    }
  }

  if (RUN('7e')) {
    head('7e. Expenses: three report pages, export, hand-coded lines');
    {
      const { ctx: c8, p: p8 } = await open(APP, { acceptDownloads: true });
      await p8.evaluate(() => __GO('cod'));
      await p8.waitForTimeout(400);
      eq(
        'Coding has the views Items and SAP transaction lines',
        (await p8.$$eval('.ctabs button b', (x) => x.map((e) => e.textContent))).slice(0, 2),
        ['Items', 'SAP transaction lines']
      );
      await p8.evaluate(() => __GO('xp'));
      await p8.waitForTimeout(1200);
      eq(
        'the tabs: Per month, Indirect per month, SAP CJI3 lines (no Summary)',
        await p8.$$eval('#side [data-xp]', (x) => x.map((e) => e.dataset.xp)),
        ['month', 'ind', 'lines']
      );
      const nIt = await p8.evaluate(() => [...R.exp.values()].filter((e) => e.p.some((v) => Math.abs(v) >= 0.005)).length),
        td8 = await p8.evaluate(() => R.toDate),
        tm8 = await p8.evaluate(() => R.thisM);
      const ftot = (k) =>
        p8.evaluate((k2) => {
          const c = R.D.cols.find((x) => x.k === k2);
          return R.rows.reduce((t, r) => t + c.v(r), 0);
        }, k);
      // Expenses opens on Per month: the months right after Item and Description, the codes behind To date
      ok(
        'Expenses opens on Per month, folded at first',
        await p8.evaluate(
          () =>
            /Per month/.test(document.getElementById('hpage').textContent) &&
            document.querySelectorAll('#tb tr.it').length === 0 &&
            document.querySelectorAll('#tb tr.grp').length >= 5
        )
      );
      ok(
        '…PKG, MNL, cost element, Item, Description, PO frozen, then the months; Bucket and the rest after To date',
        await p8.evaluate(() => {
          const k = R.D.cols.map((c) => c.k),
            m = k.findIndex((x) => /^s\d/.test(x)),
            td = k.findIndex((x) => /^td/.test(x));
          return (
            k.slice(0, 6).join() === 'pkg,mnl,ce,code,desc,po' &&
            m === 6 &&
            k.indexOf('bk') > td &&
            Object.keys(R.fzL).join() === 'pkg,mnl,ce,code,desc,po' &&
            !!document.querySelector('#tb tr.grp td.fz.fze')
          );
        })
      );
      await p8.click('#bOpen');
      await p8.waitForTimeout(600);
      ok('Expand all opens the items', await p8.$$eval('#tb tr.it', (x) => x.length > 5));
      await p8.click('[data-xsm="pkg"]');
      await p8.waitForTimeout(700);
      ok('PKG › Bucket › Item: groups are PKG › bucket', await p8.evaluate(() => R.rows.every((r) => / › /.test(r.g))));
      await p8.click('[data-xsm=""]');
      await p8.waitForTimeout(500);
      // 2 Expenses per month
      await p8.click('#side [data-xp="month"]');
      await p8.waitForTimeout(1000);
      ok(
        'Per month: grouped by bucket (+ / −)',
        await p8.evaluate(() => new Set(R.rows.map((r) => r.g)).size >= 5 && document.querySelectorAll('#tb tr.grp').length > 0)
      );
      ok(
        '…a Material group / Type of works column',
        (await p8.$$eval('#th th', (x) => x.some((e) => /Material group \/ Type of works/.test(e.textContent)))) &&
          (await p8.evaluate(() => {
            const c = R.D.cols.find((x) => x.k === 'gty');
            return (
              R.rows.some((r) => r.it.bi === __BK.findIndex((b) => b.id === 'Material') && /^M/.test(c.v(r))) &&
              R.rows.some((r) => r.it.bi === __BK.findIndex((b) => b.id === 'Subcontractor') && c.v(r))
            );
          }))
      );
      ok('2 Expenses per month: opens on Qty · Rate · Amount', await p8.$eval('[data-pm="All"]', (b) => b.classList.contains('on')));
      const nM = await p8.evaluate(() => {
        const sb = __BK.findIndex((b) => b.id === 'Subcontractor'),
          live = (e) => e.p.some((v) => Math.abs(v) >= 0.005);
        return [...R.exp.values()].filter((e) => e.b !== sb && live(e)).length + [...R.expPo.values()].filter(live).length;
      });
      ok(
        '…every item + code of every bucket, subcontractor one row per PO',
        nM > nIt && (await p8.$eval('#cnt', (e, n) => e.textContent.includes(n.toLocaleString('en-US') + ' rows'), nM)),
        await p8.$eval('#cnt', (e) => e.textContent)
      );
      ok(
        '…PKG, MNL, cost element, Item, Description, PO, then the months (Qty · Rate · Amount); Bucket and Source after',
        await p8.$$eval('#th tr:last-child th', (x) => {
          const t = x.map((e) => e.textContent.replace(/[ⓘ▲▼▾\s]+$/g, '').trim()).filter(Boolean);
          return (
            /^PKG/.test(t[0]) &&
            /^MNL/.test(t[1]) &&
            t[3] === 'Item' &&
            t[4] === 'Description' &&
            t[5] === 'PO' &&
            t[6] === 'Qty' &&
            t.indexOf('Bucket') > 6 &&
            t.includes('Source') &&
            t.includes('Rate')
          );
        })
      );
      ok('it is a report: no code boxes', await p8.$$eval('#tb input[data-f]', (x) => x.length === 0));
      {
        const tot = await p8.evaluate(() => {
          const c = R.D.cols.find((x) => x.k === 'tdAmount');
          return R.rows.reduce((t, r) => t + c.v(r), 0);
        });
        ok('the To date total is the cost to date', Math.abs(tot - td8) <= 2, String(tot));
      }
      {
        const g = await p8.evaluate(() => {
          const sb = __BK.findIndex((b) => b.id === 'Subcontractor'),
            rs = R.rows.filter((r) => r.e.b === sb),
            c = R.D.cols.find((x) => x.k === 'tdAmount');
          return {
            po: rs.every((r) => r.e.po !== undefined),
            cols: R.D.cols.some((x) => x.k === 'po') && R.D.cols.some((x) => x.k === 'sup'),
            sum: rs.reduce((t, r) => t + c.v(r), 0),
            bk: __BK[sb].items.reduce((t, it) => t + it.td, 0),
          };
        });
        ok(
          '…PO and Subcontractor columns; the PO rows add up to the bucket',
          g.po && g.cols && Math.abs(g.sum - g.bk) < 1,
          JSON.stringify(g)
        );
      }
      await p8.click('[data-pv="Quarters"]');
      await p8.waitForTimeout(700);
      ok('Quarters fold the months', await p8.$$eval('#th th', (x) => x.some((e) => /^Q\d-\d\d total/.test(e.textContent.trim()))));
      await p8.click('[data-pv="Months"]');
      await p8.waitForTimeout(600);
      const [dx] = await Promise.all([p8.waitForEvent('download', { timeout: 120000 }), p8.click('#bExport')]);
      const fx = path.join(OUT, 'expenses.xlsx');
      await dx.saveAs(fx);
      const XL = require('xlsx'),
        wx = XL.readFile(fx),
        ax = XL.utils.sheet_to_json(wx.Sheets[wx.SheetNames[0]], { header: 1, defval: '' });
      {
        const [dt] = await Promise.all([p8.waitForEvent('download', { timeout: 120000 }), p8.click('#bExport')]);
        ok(
          'the top-bar button on a report page exports only that report',
          /^Per_month_/.test(dt.suggestedFilename()) && /Export to Excel/.test(await p8.$eval('#bExport', (e) => e.textContent)),
          dt.suggestedFilename()
        );
      }
      const xh = ax.findIndex((x) => x.includes('Bucket') && x.includes('Item')),
        xt = ax.findIndex((x) => x[0] === 'TOTAL');
      ok(
        'Export: one sheet, a flat list with every row (no group rows)',
        wx.SheetNames.length === 1 && xt - xh - 1 === nM,
        wx.SheetNames.join(',') + ' · ' + ax.length + ' rows'
      );
      {
        const h = ax[xh],
          ci = h.lastIndexOf('Amount'),
          bc = h.indexOf('Bucket'),
          last = ax
            .slice(xh + 1)
            .filter((r) => r[bc] && r[0] !== 'TOTAL')
            .reduce((t, r) => t + (+r[ci] || 0), 0);
        ok('…its To date amounts add up to the cost to date', Math.abs(last - td8) <= 5, String(last));
      }
      // 3 Indirect per month
      await p8.click('#side [data-xp="ind"]');
      await p8.waitForTimeout(1000);
      {
        const g = await p8.evaluate(() => {
          let ind = 0;
          for (const e of R.exp.values())
            if (String(e.pkg).toLowerCase() === 'indirect') for (let k = 0; k < e.p.length - 1; k++) ind += e.p[k];
          const c = R.D.cols.find((x) => x.k === 'td');
          return { ind, tot: R.rows.reduce((t, r) => t + c.v(r), 0), heads: new Set(R.rows.map((r) => r.g)).size };
        });
        ok(
          '3 Indirect per month: only PKG = Indirect, head › cost element › item',
          g.heads >= 2 &&
            Math.abs(g.ind - g.tot) < 1 &&
            (await p8.evaluate(() => !!R.D.fam && document.querySelectorAll('#tb tr.grp.fam').length >= 2)),
          JSON.stringify(g)
        );
      }
      {
        const a = await p8.evaluate(() => {
          const c = R.D.cols.find((x) => x.k === 'am'),
            MO = [];
          for (let k = 1; k <= R.rep; k++) MO.push(k);
          const r = R.rows.find((x) => Math.abs(x.a) > 1000);
          return [c.v(r), MO.reduce((t, k) => t + r.e.p[k], 0) / MO.length];
        });
        ok('…Avg per month = every month to the cut / the number of months', Math.abs(a[0] - a[1]) < 0.01, a.join(' vs '));
      }
      await p8.evaluate(() => {
        const g = document.querySelector('#tb tr.grp.sub');
        if (g) g.click();
      });
      await p8.waitForTimeout(500);
      {
        const want = await p8.evaluate(() => {
          const k = document.querySelector('#tb tr.it').dataset.k,
            r = R.rows.find((x) => x.it.bi + ':' + x.it.ii === k);
          return r.e.p.reduce((t, v) => t + v, 0);
        }); // every period, pending too
        ok('…+ on a cost element shows its items', await p8.$$eval('#tb tr.it a.open', (x) => x.length > 0));
        await p8.click('#tb tr.it a.open');
        await p8.waitForTimeout(800);
        const got = await p8.evaluate(() => ({
          page: __ST.xpPage,
          sum: R.rows.reduce((t, r) => t + (R.inc[r.i] ? R.amt[r.i] : 0), 0),
          chip: !!document.querySelector('#tools .xlf'),
        }));
        ok(
          'an item opens 4 SAP CJI3 transactions with only its lines – the same amount',
          got.page === 'lines' && got.chip && Math.abs(got.sum - want) < 0.01,
          JSON.stringify(got) + ' vs ' + want
        );
        await p8.click('[data-xlf]');
        await p8.waitForTimeout(800);
        ok(
          '…✕ shows every CJI3 line again (bucket and codes on each)',
          await p8.evaluate(
            () =>
              R.rows.length === __D.N - (__D.L.uns || []).filter(Boolean).length &&
              R.D.cols.some((c) => c.k === 'bk') &&
              R.D.cols.some((c) => c.k === 'pkg')
          )
        );
        await p8.click('#side [data-xp="ind"]');
        await p8.waitForTimeout(600);
      }
      {
        const [di] = await Promise.all([p8.waitForEvent('download', { timeout: 120000 }), p8.click('#bExport')]);
        const fi = path.join(OUT, 'indirect.xlsx');
        await di.saveAs(fi);
        const ai = XL.utils.sheet_to_json(XL.readFile(fi).Sheets[XL.readFile(fi).SheetNames[0]], { header: 1, defval: '' }),
          n = await p8.evaluate(() => R.rows.length),
          ng = await p8.evaluate(() => new Set(R.rows.map((r) => r.g)).size + new Set(R.rows.map((r) => R.D.fam(r.g))).size);
        const ih = ai.findIndex((x) => /Head › Cost element/.test(x[0])),
          it2 = ai.findIndex((x) => x[0] === 'TOTAL');
        ok(
          'Indirect export: heads and cost elements with their items below',
          it2 - ih - 1 === n + ng && ai.some((x) => x[0] === 'Personnel and Manning' || /Personnel/.test(x[0])),
          it2 - ih - 1 + ' rows · expected ' + (n + ng)
        );
      }
      ok('…with an "Avg last 3 months" column', await p8.$$eval('#th th', (x) => x.some((e) => /Avg last 3 months/.test(e.textContent))));
      {
        const a = await p8.evaluate(() => {
          const r = R.rows.find((x) => Math.abs(R.D.cols.find((c) => c.k === 'td').v(x)) > 1000),
            c = R.D.cols.find((x) => x.k === 'a3'),
            k = R.rep;
          return [c.v(r), (r.e.p[k] + r.e.p[k - 1] + r.e.p[k - 2]) / 3];
        });
        ok('…= the last three months / 3', Math.abs(a[0] - a[1]) < 0.01, a.join(' vs '));
      }
      // a CJI3 line coded by hand: its own row in Summary and per month, with the line's code
      {
        const it0 = await p8.evaluate(() => {
          const b = __BK.findIndex((x) => x.id === 'Material');
          const it = __BK[b].items.slice().sort((x, y) => Math.abs(y.td) - Math.abs(x.td))[0];
          return { b, ii: it.ii, code: it.vals[3] };
        });
        await p8.evaluate(() => __GO('cod'));
        await p8.waitForTimeout(400);
        await p8.click(`#side [data-gt="cod"][data-bk="${it0.b}"]`);
        await p8.waitForTimeout(400);
        await p8.click('[data-cm="all"]:visible');
        await p8.waitForTimeout(300);
        await p8.fill('#q', it0.code);
        await p8.waitForTimeout(500);
        const ip = await p8.$('#tb tr.it input[data-f="pkg"]');
        await ip.fill('T31');
        await ip.press('Tab');
        await p8.waitForTimeout(400);
        const m9 = await p8.$('#asLater');
        if (m9) await m9.click();
        await p8.click('.ctabs [data-cv="lines"]');
        await p8.waitForTimeout(800);
        await p8.fill('#q', it0.code);
        await p8.waitForTimeout(600);
        const lp = await p8.$('#tb tr.it input[data-f="pkg"]');
        await lp.fill('T32');
        await lp.press('Tab');
        await p8.waitForTimeout(500);
        await p8.evaluate(() => __GO('xp'));
        await p8.click('#side [data-xp="month"]');
        await p8.waitForTimeout(800);
        eq(
          "Per month respects a hand-coded line: its own row with the line's code",
          await p8.evaluate(
            (x) =>
              R.rows
                .filter((r) => r.e.b === x.b && r.e.ii === x.ii)
                .map((r) => r.e.pkg)
                .sort(),
            it0
          ),
          ['T31', 'T32']
        );
        await p8.click('#side [data-xp="month"]');
        await p8.waitForTimeout(800);
        await p8.fill('#q', it0.code);
        await p8.waitForTimeout(700);
        await p8.click('#bOpen');
        await p8.waitForTimeout(500);
        const pk = await p8.evaluate(
          (x) =>
            R.rows
              .filter((r) => r.e.b === x.b && r.e.ii === x.ii)
              .map((r) => r.e.pkg)
              .sort(),
          it0
        );
        eq('Expenses per month: the same two rows', pk, ['T31', 'T32']);
        const t2 = await p8.evaluate((x) => {
            const c = R.D.cols.find((y) => y.k === 'tdAmount');
            return R.rows.filter((r) => r.e.b === x.b && r.e.ii === x.ii).reduce((t, r) => t + c.v(r), 0);
          }, it0),
          w2 = await p8.evaluate((x) => __BK[x.b].items[x.ii].td, it0);
        ok('…and the two rows add up to the item', Math.abs(t2 - w2) <= 1, t2 + ' vs ' + w2);
      }
      await p8.evaluate(() => __GO('xp'));
      await p8.click('#side [data-xp="month"]');
      await p8.waitForTimeout(800);
      await p8.evaluate(() => document.querySelector('#th .fb').click());
      await p8.waitForTimeout(300);
      ok(
        'the column filter opens clear of the side navigation',
        await p8.evaluate(
          () => document.getElementById('pop').getBoundingClientRect().left >= document.getElementById('nav').getBoundingClientRect().right
        )
      );
      await p8.mouse.click(900, 880);
      {
        const si = await p8.evaluate(() => __BK.findIndex((x) => x.id === 'Subcontractor'));
        await p8.evaluate(() => __GO('cod'));
        await p8.waitForTimeout(300);
        await p8.click(`#side .rh[data-bk="${si}"]`);
        await p8.waitForTimeout(400);
        await p8.click('.ctabs [data-cv="subpo"]');
        await p8.waitForTimeout(800);
        ok(
          'Coding › Subcontractor has a POs tab (the PO view)',
          await p8.evaluate(
            () => __ST.tab === 'sub' && __ST.sub === 'po' && document.querySelectorAll('#tb tr.grp').length > 0 && __SEC() === 'cod'
          )
        );
        await p8.evaluate(() => __GO('dash'));
        await p8.click('#side [data-rates]');
        await p8.waitForTimeout(500);
        await p8.click('[data-rt="s"]'); // Rates › Subcontractor
        await p8.waitForTimeout(800);
        ok(
          'Dashboard › Subcontractor rates & coding',
          await p8.evaluate(
            () => __ST.sub === 'pkg' && __ST.pkView === 'rate' && document.getElementById('pg-pkg').classList.contains('on')
          )
        );
        await p8.evaluate(() => __GO('chk'));
        await p8.click('#side [data-sv="bridge"]');
        await p8.waitForTimeout(600);
        ok('Check › Bridge to CJI3', await p8.evaluate(() => __ST.sub === 'bridge' && __SEC() === 'chk'));
        await p8.evaluate(() => __GO('rep'));
        await p8.click('#side [data-sv="reg"]');
        await p8.waitForTimeout(800);
        ok('Reports › PO register', await p8.evaluate(() => __ST.sub === 'reg' && document.querySelectorAll('#tb tr.it').length > 5));
        const [dr] = await Promise.all([p8.waitForEvent('download', { timeout: 120000 }), p8.click('#bExport')]);
        const frg = path.join(OUT, 'po_register.xlsx');
        await dr.saveAs(frg);
        const wr = XL.readFile(frg);
        ok(
          '…and it exports to Excel',
          wr.SheetNames[0] === 'PO register' && XL.utils.sheet_to_json(wr.Sheets['PO register'], { header: 1 }).length > 10
        );
      }
      eq('difference stays 0', await p8.evaluate(() => R.diff), 0);
      await c8.close();
    }
  }

  if (RUN('8')) {
    head('7f. Owner-supplied material: quantity with no amount, valued at your rate');
    {
      const { ctx: c10, p: p10 } = await open(APP);
      const n0 = await p10.evaluate(() => {
        const { L, N } = __D;
        let n = 0;
        for (let i = 0; i < N; i++) if (Math.abs(L.amt[i]) < 0.005 && Math.abs(L.qty[i]) > 1e-9) n++;
        return n;
      });
      if (!n0) ok('no owner-supplied lines in this project', true);
      else {
        await p10.evaluate(() => __GO('adj'));
        await p10.waitForTimeout(300);
        await p10.click('#side [data-gt="own"]');
        await p10.waitForTimeout(700);
        ok(
          'Adjust › Owner-supplied material lists every material with quantity and no amount',
          await p10.evaluate((n) => R.rows.reduce((t, r) => t + r.o.n, 0) === n, n0)
        );
        ok(
          '…and Check counts the ones still without a rate',
          (await p10.evaluate(() => {
            __GO('chk');
            return true;
          })) &&
            (await p10.click('#side [data-gt="chk"]'),
            await p10.waitForTimeout(400),
            await p10.evaluate(() => /Owner-supplied material/.test(document.querySelector('#pages .page.on').innerText)))
        );
        await p10.evaluate(() => __GO('adj'));
        await p10.click('#side [data-gt="own"]');
        await p10.waitForTimeout(500);
        const k = await p10.$eval('#tb input.ownr', (x) => x.dataset.k),
          td0 = await p10.evaluate(() => R.toDate),
          want = await p10.evaluate((kk) => {
            const { L, N } = __D;
            let q = 0;
            for (let i = 0; i < N; i++) {
              const it = __BK[L.b[i]].items[L.it[i]];
              if (it.k === kk && Math.abs(L.amt[i]) < 0.005 && Math.abs(L.qty[i]) > 1e-9 && R.per[i] < R.per.length && R.inc[i])
                q += L.qty[i];
            }
            return q;
          }, k);
        const i10 = await p10.$('#tb input.ownr');
        await i10.fill('10');
        await i10.press('Enter');
        await p10.waitForTimeout(700);
        const m10 = await p10.$('#asLater');
        if (m10) await m10.click();
        const g = await p10.evaluate(() => ({ own: R.ownIn, td: R.toDate, diff: R.diff }));
        ok(
          'a rate adds qty × rate to the cost (Owner material in)',
          Math.abs(g.own - want * 10) < 0.01 && g.own > 0,
          JSON.stringify(g) + ' · qty ' + want
        );
        eq('…and the difference to CJI3 stays 0', g.diff, 0);
        ok('…shown in the footer', /Owner material in/.test(await p10.$eval('#sbar', (e) => e.textContent)));
        const v1 = await p10.evaluate(() => R.ownIn);
        await p10.click('#tb [data-ownyn]');
        await p10.waitForTimeout(700);
        ok(
          'Owner-supplied? No: the material leaves the cost and the count',
          (await p10.evaluate((v) => R.ownIn === 0 && v > 0 && R.rows.some((r) => !r.o.yes), v1)) &&
            (await p10.evaluate(() => R.diff === 0))
        );
        await p10.keyboard.press('Control+z');
        await p10.waitForTimeout(600);
        const nG = await p10.$$eval('[data-owngl]', (x) => x.length),
          n1 = await p10.evaluate(() => ownStats().n);
        await p10.click('[data-owngl]');
        await p10.waitForTimeout(700);
        ok(
          'the rule: taking out a SAP cost element takes its materials out',
          nG >= 1 && (await p10.evaluate((n) => ownStats().n < n && ownStats().out > 0 && R.diff === 0, n1))
        );
        await p10.keyboard.press('Control+z');
        await p10.waitForTimeout(600);
        await p10.keyboard.press('Control+z');
        await p10.waitForTimeout(600);
        ok('Undo takes the rate away', await p10.evaluate((t) => R.ownIn === 0 && Math.abs(R.toDate - t) < 0.01, td0));
      }
      await c10.close();
    }

    head('8. Save codes and read them back');
    const it1 = await p.$('#tb input[data-f="pkg"]');
    await it1.fill('T02');
    await it1.press('Enter');
    await p.waitForTimeout(400);
    const [dlS] = await Promise.all([p.waitForEvent('download'), p.$eval('#bSave', (b) => b.click())]);
    const codes = path.join(OUT, 'codes.json');
    await dlS.saveAs(codes);
    ok('Save writes a codes file', fs.statSync(codes).size > 100);
    const { ctx: ctx2, p: p2 } = await open(APP);
    await p2.evaluate(() => {
      localStorage.clear();
    });
    await p2.reload();
    await p2.waitForFunction(() => document.querySelector('#tabs button'));
    await p2.waitForTimeout(1500);
    ok('a fresh browser has no T02 yet', await p2.evaluate(() => !__BK[0].items.some((x) => x.pkg === 'T02')));
    await p2.setInputFiles('#file', codes);
    await p2.waitForTimeout(2500);
    ok('Import brings the code back', await p2.evaluate(() => __BK[0].items.some((x) => x.pkg === 'T02')));
    eq('difference stays 0 after import', await p2.evaluate(() => R.diff), 0);
    await ctx2.close();
    // the reports of the earlier offline tools (Inventory / Subcontract Cost Report): a 'Coding' sheet, header a few rows down
    {
      const ExcelJS = require('exceljs'),
        pick = await p.evaluate(() => {
          const m = __BK.find((x) => x.id === 'Material'),
            s2 = __BK.find((x) => x.id === 'Subcontractor');
          return {
            mat: m.items.slice(0, 3).map((i) => [i.vals[2], i.vals[3], i.vals[4]]),
            sub: s2.items.slice(0, 3).map((i) => [i.vals[0], i.vals[1], i.vals[2]]),
          };
        });
      const mk = async (fn, head, rows) => {
        const wb = new ExcelJS.Workbook();
        wb.addWorksheet('Summary').addRow(['old report']);
        const ws = wb.addWorksheet('Coding');
        ws.addRow(['Materials still to code']);
        ws.addRow(['0']);
        ws.addRow(['Live']);
        ws.addRow(head);
        rows.forEach((r) => ws.addRow(r));
        const f = path.join(OUT, fn);
        await wb.xlsx.writeFile(f);
        return f;
      };
      const fi = await mk(
        'old_inventory_coding.xlsx',
        ['Family', 'Division', 'Material group (SAP)', 'Material', 'Description', 'Unit', 'CSI', 'MNL', 'Cost element', 'Status'],
        pick.mat.map(([g, m, d], k) => ['M', 'M03', g, m, d, 'TO', 'S.03' + k, 'MAT', 'MAT-' + k, 'Coded'])
      );
      const fs2 = await mk(
        'old_subcontract_coding.xlsx',
        ['Type of works (SAP)', 'Service', 'Description', 'Unit', 'DIV', 'PKG', 'MNL', 'Cost element', 'Status'],
        pick.sub.map(([t, sv, d], k) => [t, sv, d, 'M3', 'DIV 03', 'S.0' + k, 'SUB', 'SUB-' + k, 'Coded'])
      );
      const { ctx: c9, p: p9 } = await open(APP);
      await p9.evaluate(() => localStorage.clear());
      await p9.reload();
      await p9.waitForFunction(() => document.querySelector('#tabs button'));
      await p9.waitForTimeout(1500);
      await p9.setInputFiles('#file', fi);
      await p9.waitForTimeout(2000);
      eq(
        'earlier Inventory report: CSI → PKG, MNL and cost element read by material',
        await p9.evaluate(
          (ms) =>
            ms.map((m) => {
              const it = __BK.find((x) => x.id === 'Material').items.find((i) => i.vals[3] === m);
              return [it.pkg, it.mnl, it.ce].join('/');
            }),
          pick.mat.map((x) => x[1])
        ),
        ['S.030/MAT/MAT-0', 'S.031/MAT/MAT-1', 'S.032/MAT/MAT-2']
      );
      await p9.setInputFiles('#file', fs2);
      await p9.waitForTimeout(2000);
      eq(
        'earlier Subcontract Cost Report: DIV, PKG, MNL, cost element read by service',
        await p9.evaluate(
          (ss) =>
            ss.map((sv) => {
              const it = __BK.find((x) => x.id === 'Subcontractor').items.find((i) => i.vals[1] === sv[1] && i.vals[2] === sv[2]);
              return [it.div, it.pkg, it.mnl, it.ce].join('/');
            }),
          pick.sub
        ),
        ['DIV 03/S.00/SUB/SUB-0', 'DIV 03/S.01/SUB/SUB-1', 'DIV 03/S.02/SUB/SUB-2']
      );
      eq('difference stays 0 after reading them', await p9.evaluate(() => R.diff), 0);
      // the Data sheet of the earlier Material report: one issue line (Material doc. = CJI3 "Ref. document number") coded other than its material
      {
        const one = await p9.evaluate(() => {
          const { L, S, N } = __D,
            mi = __BK.findIndex((x) => x.id === 'Material');
          for (let i = 0; i < N; i++)
            if (L.b[i] === mi && L.ref && S[L.ref[i]]) {
              const it = __BK[mi].items[L.it[i]];
              return { i, ref: S[L.ref[i]], mat: it.vals[3], g: it.vals[2], d: it.vals[4], n: it.lines ? it.lines.length : 0 };
            }
          return null;
        });
        ok('CJI3 lines keep the Ref. document number (the material document)', !!one);
        if (one) {
          const wb = new ExcelJS.Workbook();
          wb.addWorksheet('Summary').addRow(['old report']);
          const ws = wb.addWorksheet('Coding');
          ws.addRow(['Materials still to code']);
          ws.addRow(['0']);
          ws.addRow(['Live']);
          ws.addRow([
            'Family',
            'Division',
            'Material group (SAP)',
            'Material',
            'Description',
            'Unit',
            'PKG',
            'MNL',
            'Cost element',
            'Status',
          ]);
          ws.addRow(['M', 'M03', one.g, one.mat, one.d, 'TO', '', '', '', 'To code']); // blank on the Coding sheet – coded on the Data tab
          const wd = wb.addWorksheet('Data');
          wd.addRow([
            'Family',
            'Division',
            'Material group',
            'Material',
            'Description',
            'Unit',
            'PKG',
            'MNL',
            'Cost element',
            'Period',
            'Posting date',
            'WBS element',
            'Issue type',
            'Material doc.',
            'Qty',
            'Rate',
            'Amount',
          ]);
          wd.addRow(['M', 'M03', one.g, one.mat, one.d, 'TO', 'S.0499', 'MAT', 'MAT-B', '2026-01', '', '', 'Project', one.ref, 1, 1, 1]);
          wd.addRow([
            'M',
            'M03',
            one.g,
            one.mat,
            one.d,
            'TO',
            'S.0400',
            'MAT',
            'MAT-A',
            '2026-01',
            '',
            '',
            'Project',
            'X-OTHER',
            100,
            1,
            100,
          ]); // most of the amount
          const fd = path.join(OUT, 'old_inventory_data.xlsx');
          await wb.xlsx.writeFile(fd);
          await p9.setInputFiles('#file', fd);
          await p9.waitForTimeout(2000);
          const got = await p9.evaluate((o) => {
            const it = __BK.find((x) => x.id === 'Material').items.find((x) => x.vals[3] === o.mat),
              ov = __OVR()[__D.L.id[o.i]] || {};
            return [it.pkg, it.ce, ov.pkg || '', ov.ce || ''].join('/');
          }, one);
          eq(
            'earlier Material report › Data tab: blank on the Coding sheet – the material takes the Data code with most of its amount, the line its own',
            got,
            'S.0400/MAT-A/S.0499/MAT-B'
          );
          ok(
            '…the message counts the line',
            /1 coded from its Data tab.*1 lines with their own code from the Data tab/.test(await p9.$eval('#toast', (e) => e.textContent))
          );
          eq('…difference stays 0', await p9.evaluate(() => R.diff), 0);
        }
      }
      await p9.setInputFiles('#file', [fi, fs2]);
      await p9.waitForTimeout(3000);
      ok(
        'Import codes takes several files at once (Material report + Subcontractor report)',
        /Imported – old_inventory_coding\.xlsx.*old_subcontract_coding\.xlsx/.test(await p9.$eval('#toast', (e) => e.textContent))
      );
      await c9.close();
    }
  }

  if (RUN('8b')) {
    head('8b. Auto-save to the data file');
    {
      const ctx4 = await browser.newContext({ viewport: { width: 1600, height: 900 } });
      // a stand-in for the browser's "save file" window, which a test cannot click
      await ctx4.addInitScript(() => {
        window.__file = { name: 'SUTH_register.db', bytes: null, writes: 0 };
        window.showSaveFilePicker = async () => ({
          name: window.__file.name,
          queryPermission: async () => 'granted',
          requestPermission: async () => 'granted',
          getFile: async () => new Blob([window.__file.bytes || new Uint8Array()]),
          createWritable: async () => {
            const parts = [];
            return {
              write: async (d) => {
                parts.push(d);
              },
              close: async () => {
                window.__file.bytes = new Uint8Array(await new Blob(parts).arrayBuffer());
                window.__file.writes++;
              },
            };
          },
        });
      });
      const p4 = await ctx4.newPage();
      p4.on('pageerror', (e) => errs.push(e.message));
      await p4.goto('file://' + APP);
      await p4.waitForFunction(() => document.querySelector('#tabs button'), null, { timeout: 60000 });
      await p4.waitForTimeout(1200);
      await p4.evaluate(() => __GO('cod'));
      await p4.waitForTimeout(300);
      const i4 = await p4.$('#tb input[data-f="pkg"]');
      await i4.fill('T03');
      await i4.press('Enter');
      await p4.waitForTimeout(900);
      await p4.click('#asPick');
      await p4.waitForFunction(() => DBF.cur > 0 && DBF.st === 'ok' && dbOne('SELECT count(*) AS n FROM codes').n > 0, null, {
        timeout: 60000,
      });
      await p4.waitForFunction(() => !DBF.busy && !DBF.again);
      await p4.waitForTimeout(500);
      const SQL = await require('sql.js')(),
        rd = async () =>
          new SQL.Database(
            Buffer.from(
              await p4.evaluate(async () => {
                const r = new FileReader();
                return new Promise((res) => {
                  r.onload = () => res(String(r.result).split(',')[1]);
                  r.readAsDataURL(new Blob([window.__file.bytes]));
                });
              }),
              'base64'
            )
          ),
        cnt = (db, v) => db.exec(`SELECT count(*) FROM codes WHERE pkg = '${v}'`)[0].values[0][0];
      {
        const db = await rd();
        ok(
          'Create data file: the build and the codes are written to it',
          cnt(db, 'T03') > 0,
          JSON.stringify(db.exec("SELECT count(*), sum(pkg != '') FROM codes")[0].values)
        );
      }
      ok(
        'saved to SUTH_register.db: ✓ Saved in the top bar, the file on the project card',
        (await p4.$eval('#hasv', (e) => /Saved/.test(e.textContent) && /SUTH_register\.db/.test(e.querySelector('[title]').title))) &&
          (await p4.$eval('#nprj', (e) => /SUTH_register\.db/.test(e.textContent))),
        await p4.$eval('#hasv', (e) => e.textContent.slice(0, 300))
      );
      const w0 = await p4.evaluate(() => window.__file.writes);
      const i5 = (await p4.$$('#tb input[data-f="pkg"]'))[1];
      await i5.fill('T04');
      await i5.press('Enter');
      await p4.waitForFunction((w) => window.__file.writes > w, w0, { timeout: 30000 }).catch(() => {});
      await p4.waitForFunction(() => !DBF.busy && !DBF.again);
      await p4.waitForTimeout(300);
      ok('the next change saves itself', cnt(await rd(), 'T04') > 0);
      ok('no second question once a data file is there', !(await p4.$('#asm')));
      await ctx4.close();
    }
  }

  if (RUN('7h')) {
    head('7h. Adjustment lines, Source in Expenses, Summary period, footer links');
    {
      const { ctx: c12, p: q } = await open(APP);
      const tot = () => q.evaluate(() => R.D.foot(R.rows));
      // some adjustments: VAT on certificates, owner material at its own paid rate
      await q.evaluate(() => {
        const v = document.getElementById('vat');
        v.value = 'Include VAT';
        v.dispatchEvent(new Event('change', { bubbles: true }));
      });
      await q.waitForTimeout(600);
      if (await q.evaluate(() => __SECS().includes('adj'))) {
        await q.evaluate(() => __GO('adj'));
        await q.waitForTimeout(300);
        if (await q.$('#side [data-gt="own"]')) {
          await q.click('#side [data-gt="own"]');
          await q.waitForTimeout(500);
          const ow = await q.$('#ownAll');
          if (ow) {
            await ow.click();
            await q.waitForTimeout(500);
          }
        }
      }
      {
        const m = await q.$('#asLater');
        if (m) await m.click();
      }
      await q.evaluate(() => __GO('adj'));
      await q.waitForTimeout(300);
      await q.click('#side [data-gt="adjl"]');
      await q.waitForTimeout(900);
      const g = await q.evaluate(() => ({
        diff: R.diff,
        sum: R.rows.filter((r) => r.on).reduce((t, r) => t + r.a, 0),
        want: R.toDate + R.pend - __D.N * 0 - 0,
        cost: 0,
        vat: R.rows.filter((r) => r.g === 'VAT in').reduce((t, r) => t + r.a, 0),
        vatIn: R.vatIn,
        ties: /✓ ties/.test(document.getElementById('tools').textContent),
      }));
      const cost = await q.evaluate(() => {
        let t = 0;
        return document.querySelector('#sbar').textContent.includes('CJI3') ? 1 : t;
      });
      ok(
        'Adjust › Adjustment lines: every adjustment line by line, CJI3 + added − taken out = To date + Pending',
        g.ties && Math.abs(g.diff) < 0.01,
        JSON.stringify(g)
      );
      eq("…VAT in lines add up to the footer's VAT in", r2(g.vat), r2(g.vatIn), 1);
      ok('…grouped by kind (+ / −)', await q.evaluate(() => R.D.groups && new Set(R.rows.map((r) => r.g)).size >= 1));
      {
        const [d] = await Promise.all([q.waitForEvent('download', { timeout: 120000 }), q.click('#bExport')]);
        const f = path.join(OUT, 'adjustment_lines.xlsx');
        await d.saveAs(f);
        ok('…exports to Excel', require('xlsx').readFile(f).SheetNames[0] === 'Adjustment lines');
      }
      // footer: an adjustment opens its lines; CJI3 opens the SAP CJI3 transactions
      if (await q.$('#sbar [data-sgo^="adj:VAT"]')) {
        await q.click('#sbar [data-sgo^="adj:VAT"]');
        await q.waitForTimeout(700);
        ok(
          'footer › VAT in opens Adjustment lines, only VAT in',
          await q.evaluate(() => __ST.tab === 'adjl' && R.rows.length > 0 && R.rows.every((r) => r.g === 'VAT in'))
        );
      }
      await q.click('#sbar [data-sgo="xl"]');
      await q.waitForTimeout(1200);
      ok(
        'footer › CJI3 opens Expenses › SAP CJI3 transactions: the pure CJI3 lines at their CJI3 amount',
        await q.evaluate(() => {
          if (__ST.tab !== 'xpm' || __ST.xpPage !== 'lines') return false;
          const { L, N } = __D;
          let t = 0,
            n = 0;
          for (let i = 0; i < N; i++)
            if (!(L.uns || [])[i]) {
              t += L.amt[i];
              n++;
            }
          return R.rows.length === n && Math.abs(+R.D.foot(R.rows).amt.replace(/,/g, '') - t) < 1;
        })
      );
      // Expenses › Per month: Source filter
      await q.evaluate(() => __GO('xp'));
      await q.waitForTimeout(300);
      await q.click('#side [data-xp="month"]');
      await q.waitForTimeout(800);
      const tdSum = () =>
        q.evaluate(() => {
          const c = R.D.cols.find((x) => x.k === 'tdAmount');
          return R.rows.reduce((t, r) => t + c.v(r), 0);
        });
      eq('Per month: the To date total is To date', r2(await tdSum()), r2(await q.evaluate(() => R.toDate)), 1);
      await q.selectOption('[data-xsrcs]', 'adj');
      await q.waitForTimeout(600);
      ok(
        'Source › Adjustments only: VAT in and owner material rows, no CJI3 rows',
        await q.evaluate(() => R.rows.length > 0 && R.rows.every((r) => r.e.src !== 'CJI3'))
      );
      eq(
        '…their total = VAT in + owner material in (+ what is included from not yet in CJI3)',
        r2(await tdSum()),
        r2(await q.evaluate(() => R.vatIn + R.ownIn + R.unsIn)),
        2
      );
      await q.selectOption('[data-xsrcs]', '');
      await q.waitForTimeout(400);
      eq('difference stays 0', await q.evaluate(() => R.diff), 0);
      await c12.close();
    }
  }

  if (RUN('7i')) {
    head('7i. Codes › PKG list: a new PKG asks for its name, the footer warns, the list names it');
    const { ctx: c13, p: q } = await open(APP);
    await q.evaluate(() => __GO('cod'));
    await q.waitForTimeout(300);
    const later = async () => {
      const m = await q.$('#asLater');
      if (m) await m.click();
    };
    await later();
    for (const [n, c] of [
      [0, 'T91'],
      [1, 'T92'],
    ]) {
      const i = (await q.$$('#tb input[data-f="pkg"]'))[n];
      await i.fill(c);
      await i.press('Enter');
      await q.waitForTimeout(500);
      await later();
    }
    ok(
      'a new PKG typed while coding: "T92 is a new PKG – name it"',
      await q.evaluate(() => {
        const m = document.getElementById('pkask');
        return !!m && !m.hidden && /T92 is a new PKG/.test(m.textContent);
      })
    );
    ok('the footer warns: PKG without a name 2', /PKG without a name\s*2/.test(await q.$eval('#sbar', (e) => e.textContent)));
    await q.fill('#pkaskN', 'Test package');
    await q.press('#pkaskN', 'Enter');
    await q.waitForTimeout(400);
    ok('naming it there: one left', /PKG without a name\s*1/.test(await q.$eval('#sbar', (e) => e.textContent)));
    await q.click('#sbar [data-sgo="pkl:no"]');
    await q.waitForTimeout(700);
    ok(
      'the footer opens Codes › PKG list – the whole list, no filters; the PKG with no name says so on its row',
      await q.evaluate(
        () =>
          __ST.tab === 'pkl' &&
          !document.querySelector('#psum [data-pkf]') &&
          /Test package/.test(document.getElementById('psum').innerHTML) &&
          [...document.querySelectorAll('#psum input.psin.miss')].some((i) => /T91/.test(i.dataset.psn))
      )
    );
    await q.fill('#psum input[data-psn="direct|T91"]', 'Second package');
    await q.press('#psum input[data-psn="direct|T91"]', 'Tab');
    await q.waitForTimeout(500);
    ok('naming it in the list: the warning is gone', !(await q.$('#sbar [data-sgo="pkl:no"]')));
    eq('difference stays 0', await q.evaluate(() => R.diff), 0);
    await c13.close();
  }

  if (RUN('7j')) {
    head('7j. Monthly job: 5 steps with their status, Go opens the place');
    const { ctx: c14, p: q } = await open(APP);
    ok('the side navigation shows Monthly job n / 5', /Monthly job\s*\d \/ 5/.test(await q.$eval('#bJob', (e) => e.textContent)));
    await more(q).then(() => q.click('#bJob'));
    await q.waitForTimeout(500);
    ok(
      'the panel: 5 steps, Update and Check done (difference 0)',
      await q.evaluate(
        () =>
          document.querySelectorAll('#mjob .st').length === 5 &&
          document.querySelectorAll('#mjob .st.ok').length >= 2 &&
          /difference 0\.00/.test(document.getElementById('mjob').textContent)
      )
    );
    await q.click('#mjob .now .go');
    await q.waitForTimeout(600);
    ok('"Now" step › Go opens it (Coding)', await q.evaluate(() => __ST.tab === 'cod'));
    {
      const g4 = await q.evaluate(() => document.querySelectorAll('#mjob .st')[3].querySelector('.go').dataset.job);
      ok('step 4 › Go points at a place of Adjust (' + g4 + ')', ['uns', 'dep', 'own', 'adjl'].includes(g4));
    }
    // from the Expenses page, where the top Export Excel exports only the page: the panel's button exports the monthly report
    if (await q.evaluate(() => document.getElementById('mjob').hidden)) await more(q).then(() => q.click('#bJob'));
    await q.evaluate(() => document.querySelectorAll('#mjob .st')[4].querySelector('.go').click());
    await q.waitForTimeout(600);
    ok('step 5 › Expenses opens the Expenses page', await q.evaluate(() => __ST.tab === 'xpm'));
    await q.click('#mjob .go.x2');
    await q.waitForTimeout(1500);
    ok(
      'step 5 › Export the monthly report: step 5 is done at once, panel still open',
      await q.evaluate(
        () => !document.getElementById('mjob').hidden && /exported for this cut/.test(document.querySelectorAll('#mjob .st')[4].textContent)
      )
    );
    await c14.close();
  }

  if (RUN('7l')) {
    head('7l. Budget: read a cost report, PKG page (budget · EV · actuals · provision · ETC · EAC), progress, export');
    // a small cost report made here (no real figures): 1 PKG TST-01 (division T91), 1 BOQ item of 100 m3 over 2 building types,
    // done 40 m3; 2 resources: M-100 ready mix 1,000 / m3 and S-50 pouring 50 / m3 → BAC 105,000, EV 40% = 42,000
    const ExcelJS = require('exceljs');
    const cw = new ExcelJS.Workbook();
    const dp = cw.addWorksheet('Direct plan');
    dp.addRow([
      'Item code',
      'PKG',
      'Division',
      'Description',
      'UNIT',
      'Type A',
      'Type B',
      'Contract Quantity',
      'Type A B1',
      'Type B B1',
      'Takeoff B1',
      'Type A B1',
      'Type B B1',
      'EV Q.B1',
    ]);
    dp.addRow(['', 'TST-01', '', 'DIVISION 99 - TEST WORKS']);
    dp.addRow(['R-TST-01-1-01', 'TST-01', 'T91', 'Test concrete', 'M3', 60, 40, 100, 60, 40, 100, 30, 10, 40]);
    const ca = cw.addWorksheet('Cost Analysis');
    ca.addRow(['Cost Code', 'Level', 'CSI Code', 'EXP Code', 'Cost Element Code', 'Description']);
    ca.addRow(['', '', '', '', '', '', 'Res Unit', 'TAKE OFF', 'BAC', 'Resource takeoff Q']);
    ca.addRow(['R-TST-01-1-01', 3, 'TST-01', '', '', 'Test concrete', '', 100, '', '']);
    ca.addRow(['R-TST-01-1-01', 4, 'TST-01', 'M', 'M-100', 'Ready mix test', '/m3', 100, 100000, 100]);
    ca.addRow(['R-TST-01-1-01', 4, 'TST-01', 'S', 'S-50', 'Pouring test', '/m3', 100, 5000, 100]);
    const crf = path.join(OUT, 'cost_report_test.xlsx');
    await cw.xlsx.writeFile(crf);
    const { ctx: c16, p: q } = await open(APP);
    await q.evaluate(() => {
      for (const k of Object.keys(localStorage)) if (k.startsWith('cost-register')) localStorage.removeItem(k);
    });
    await q.reload();
    await q.waitForFunction(() => document.querySelector('#tabs button'));
    await q.waitForTimeout(1200);
    await q.$eval('#tabs [data-s="bud"]', (x) => x.click());
    await q.waitForTimeout(400);
    ok('Budget: before a cost report, the page asks for it', /Read the cost report/.test(await q.$eval('#bud', (e) => e.textContent)));
    {
      const [fc] = await Promise.all([q.waitForEvent('filechooser'), q.$eval('[data-bud="read"]', (b) => b.click())]);
      await fc.setFiles(crf);
    }
    await q.waitForFunction(() => document.querySelector('#bud .bd-t'), null, { timeout: 30000 });
    const T0 = await q.evaluate(() => {
      const C = __BUD.calc(),
        t = __BUD.sum([...C.pk.get('TST-01').values()]);
      return { bac: t.bac, ev: t.ev };
    });
    eq('All PKGs: TST-01 with BAC 105,000 (Cost Analysis)', Math.round(T0.bac), 105000);
    eq('…EV = done 40 of 100 m3 × the resources = 42,000', Math.round(T0.ev), 42000);
    // code two items of the register to the PKG: one on a budget resource (by the division code T91), one on a cost element not in the budget
    const pick = await q.evaluate(() => {
      const mi = __BK.findIndex((b) => b.id === 'Material'),
        its = __BK[mi].items.filter((x) => x.td > 1000).slice(0, 2);
      __BUD.code(mi, its[0].ii, 'T91', 'MAT', 'M-100');
      __BUD.code(mi, its[1].ii, 'TST-01', 'SUB', 'X-9');
      return { a: its[0].td, b: its[1].td };
    });
    await q.waitForTimeout(400);
    const r1 = await q.evaluate(() => {
      const m = __BUD.calc().pk.get('TST-01');
      return { m100: m.get('M-100').aa, x9: m.get('X-9') ? { aa: m.get('X-9').aa, g: m.get('X-9').g, nb: m.get('X-9').nb } : null };
    });
    eq('actuals: the line coded T91 (division) + M-100 lands on the M-100 resource', Math.round(r1.m100), Math.round(pick.a));
    ok(
      '…a cost element not in the budget (X-9) is its own "no budget" line, in its MNL group (SUB)',
      r1.x9 && r1.x9.nb && r1.x9.g === 'SUB' && Math.round(r1.x9.aa) === Math.round(pick.b)
    );
    // the PKG page: type a provision 10 × 1,000 on M-100 and an ETC rate
    await q.evaluate(() => {
      __ST.tab = 'bpkg';
      __ST.bpk = 'TST-01';
    });
    await q.$eval('#side [data-gt="bpkg"]', (x) => x.click());
    await q.waitForTimeout(500);
    ok(
      'PKG page: the groups Material and Subcontractor, the no-budget tag, the TOTAL row',
      await q.evaluate(
        () =>
          /Material · MNL MAT/.test(document.getElementById('bud').textContent) &&
          /no budget/.test(document.getElementById('bud').textContent) &&
          !!document.querySelector('#bud tr.bd-tot')
      )
    );
    for (const [f, v] of [
      ['pq', '10'],
      ['pu', '1000'],
    ]) {
      const inp = q.locator(`#bud input[data-bx="TST-01|M-100"][data-bf="${f}"]`);
      await inp.fill(v);
      await inp.press('Tab');
      await q.waitForTimeout(300);
    }
    const r2 = await q.evaluate(() => {
      const r = __BUD.calc().pk.get('TST-01').get('M-100');
      return { pv: r.pv, ac: r.ac, aa: r.aa, etc: r.etc, eac: r.eac, bac: r.bac, vac: r.vac, eq: r.eq, er: r.er };
    });
    eq('provision qty × UR = 10,000, AC = actual + provision', [Math.round(r2.pv), Math.round(r2.ac)], [10000, Math.round(r2.aa + 10000)]);
    eq(
      'ETC = remaining qty (100 − 40) × the UR (1,000) by default · EAC = AC + ETC · VAC = BAC − EAC',
      [Math.round(r2.eq), Math.round(r2.er), Math.round(r2.eac), Math.round(r2.vac)],
      [60, 1000, Math.round(r2.ac + 60000), Math.round(100000 - r2.ac - 60000)]
    );
    await q.$eval('#bUndo', (b) => b.click()); // the auto-save question may sit on top
    await q.waitForTimeout(300);
    eq('Undo takes the provision UR back', await q.evaluate(() => Math.round(__BUD.calc().pk.get('TST-01').get('M-100').pv)), 0);
    await q.$eval('#bRedo', (b) => b.click());
    await q.waitForTimeout(300);
    // progress per BOQ item: done 80 → EV 80% = 84,000
    await q.$eval('#side [data-gt="bprog"]', (x) => x.click());
    await q.waitForTimeout(400);
    {
      const inp = q.locator('#bud input[data-bd="R-TST-01-1-01"]');
      await inp.fill('80');
      await inp.press('Tab');
      await q.waitForTimeout(300);
    }
    eq(
      'Progress (one done qty per BOQ item): done 80 of 100 → EV 84,000',
      await q.evaluate(() => Math.round(__BUD.sum([...__BUD.calc().pk.get('TST-01').values()]).ev)),
      84000
    );
    eq('…the difference to CJI3 stays 0', await q.evaluate(() => R.diff), 0);
    // a filter on the PKG page: only M-100; the sum follows
    await q.$eval('#side [data-gt="bpkg"]', (x) => x.click());
    await q.waitForTimeout(300);
    await q.locator('#bud input[data-bflt="pkg:TST-01|0"]').fill('M-100');
    await q.waitForTimeout(800);
    eq(
      'PKG page filter (cost element M-100): one line, the TOTAL follows it',
      await q.evaluate(() => [
        document.querySelectorAll('#bud tr.bd-r').length,
        /filter on/.test(document.getElementById('bud').textContent),
      ]),
      [1, true]
    );
    await q.$eval('[data-bfclr]', (b) => b.click());
    await q.waitForTimeout(300);
    // the Cost Analysis tab: the BOQ item and its 2 resources
    await q.$eval('#side [data-gt="bca"]', (x) => x.click());
    await q.waitForTimeout(400);
    eq(
      'Cost Analysis tab: the BOQ item with its 2 resources, BAC 105,000',
      await q.evaluate(() => [
        document.querySelectorAll('#bud tr.bd-item').length,
        document.querySelectorAll('#bud .bd-ca tr.bd-r').length,
        /BAC 105,000/.test(document.getElementById('bud').textContent),
      ]),
      [1, 2, true]
    );
    await q.locator('#bud input[data-bsr]').fill('Pouring');
    await q.waitForTimeout(800);
    eq(
      'Search (Cost Analysis, All PKGs, MNL column): "Pouring" → the S-50 line, MNL SUB',
      await q.evaluate(() =>
        [...document.querySelectorAll('#bud .bd-ca tr.bd-r')].map((r) => r.cells[0].textContent + ' ' + r.cells[1].textContent)
      ),
      ['SUB S-50']
    );
    await q.locator('#bud input[data-bsr]').fill('');
    await q.waitForTimeout(600);
    eq(
      'Coding pick list: the division code T91 is a budget PKG (TST-01, named); its MAT resources = M-100, its SUB resources = S-50',
      await q.evaluate(() => {
        const b = __BUD.pick();
        return [
          b.pkgOf('T91'),
          b.pkgs.some((x) => x[0] === 'T91' && /TEST WORKS|TST-01/.test(x[1])),
          b.res('TST-01', 'MAT').map((x) => x.ce),
          b.res('TST-01', 'SUB').map((x) => x.ce),
        ];
      }),
      ['TST-01', true, ['M-100'], ['S-50']]
    );
    // Excel: a Budget summary tab and a tab per PKG
    eq(
      'Excel export: Budget summary + a tab per PKG',
      await q.evaluate(() => {
        const wb = new ExcelJS.Workbook();
        __BUD.exp(wb);
        return wb.worksheets.map((w) => w.name);
      }),
      ['Budget summary', 'TST-01']
    );
    // it stays: reopen
    await q.reload();
    await q.waitForFunction(() => document.querySelector('#tabs button'));
    await q.waitForTimeout(1500);
    eq(
      'reopened: the cost report, the progress and the provision are still there',
      await q.evaluate(() => {
        const C = __BUD.calc();
        if (!C) return null;
        const t = __BUD.sum([...C.pk.get('TST-01').values()]);
        return [Math.round(t.ev), Math.round(C.pk.get('TST-01').get('M-100').pv)];
      }),
      [84000, 10000]
    );
    await c16.close();
  }

  if (RUN('7m')) {
    head('7m. Simpler screens: 4 steps, Data in, Reports menu, Mapping rules (every line by its rule)');
    const { ctx: c16, p: q } = await open(APP);
    eq(
      'the menu: the 4 steps of the month',
      await q.$$eval('#tabs button', (b) => b.map((x) => x.querySelector('.ni').textContent + ' ' + x.querySelector('.tx').textContent)),
      ['1 Update', '2 Code', '3 Decide', '4 Forecast']
    );
    ok(
      'Data in: CJI3 with the months it covers and the cut line',
      await q.$eval('#din', (e) => /CJI3/.test(e.textContent) && !!e.querySelector('.bar u'))
    );
    await q.evaluate(() => document.body.classList.add('navpin'));
    await q.evaluate(() => __GO('dash'));
    await q.waitForTimeout(400);
    ok(
      'Summary: each client deduction with its GL name and number',
      await q.$$eval('#sum tr.cdg', (x) => x.length > 0 && x.every((e) => /\d{8}/.test(e.textContent)))
    );
    await q.click('#bReports');
    await q.waitForTimeout(200);
    ok(
      'Reports menu: Cost, Budget and the report pages',
      await q.$eval(
        '#repm',
        (e) => !e.hidden && /COST/.test(e.textContent) && /BUDGET/.test(e.textContent) && !!e.querySelector('[data-rgo="xpm"]')
      )
    );
    await q.click('#repm [data-rgo="xpm"]');
    await q.waitForTimeout(400);
    ok(
      '…a report opens from it and the menu closes',
      (await q.evaluate(() => __SEC())) === 'xp' && (await q.$eval('#repm', (e) => e.hidden))
    );
    await q.click('#bRules');
    await q.waitForTimeout(500);
    const C = await q.evaluate(() => __MR.check());
    eq('Mapping rules: every CJI3 line meets a rule of its own bucket (else it is one of your rules)', C.by['-2'] || 0, C.yours);
    eq('…no line sorted with older rules (a fresh build)', C.by['-4'] || 0, 0);
    eq('…lines with no bucket', C.by[String(C.last)] || 0, C.unclassified);
    eq(
      '…rule lines + client deductions = the CJI3 cost (subcontractor rounding lines aside)',
      Math.round((C.a + C.cd) * 100) / 100,
      Math.round(C.cost * 100) / 100,
      1
    );
    ok(
      '…opens on the GL list: one row per GL with its bucket, the indirect GLs with a cost element box',
      (await q.$$eval('#rul .mrgl tbody tr', (x) => x.length > 20)) && (await q.$$eval('#rul [data-mrgc]', (x) => x.length > 3))
    );
    ok('…opens with "only GL with lines" ticked', await q.$eval('#rul [data-mron]', (e) => e.checked));
    await q.click('#rul [data-mron]');
    await q.waitForTimeout(400);
    ok(
      '…the SAP chart of accounts: every cost and revenue GL, grouped by account group (3060 Site / office …)',
      await q.$eval(
        '#rul',
        (e) =>
          e.querySelectorAll('.mrgl tbody tr:not(.gh)').length >= 250 &&
          e.querySelectorAll('.mrgl tr.gh').length >= 10 &&
          /Site \/ office Related cost/.test(e.textContent)
      )
    );
    ok('…the bucket as its colour square', await q.$$eval('#rul .mrbk i', (x) => x.length > 50));
    await q.click('[data-mrt="d"]');
    await q.waitForTimeout(300);
    ok(
      '…Document types: WA → Material, SC → Subcontractor',
      await q.$eval('#rul', (e) => /WA/.test(e.textContent) && /goods issue/.test(e.textContent))
    );
    await q.click('[data-mrt="w"]');
    await q.waitForTimeout(300);
    ok('…WBS rules: one WBS per line', await q.$eval('#rul', (e) => /IN-02-1/.test(e.textContent) && /Other labour/.test(e.textContent)));
    await q.click('[data-mrt="s"]');
    await q.waitForTimeout(300);
    await q.click('#rul a[data-mrt="b"]');
    await q.waitForTimeout(300);
    ok('…Special rules › every condition in order: a block per bucket', await q.$$eval('.mrb', (x) => x.length >= 12));
    const ln = await q.$('.mrb a.lk[data-mrl]');
    await ln.click();
    await q.waitForTimeout(300);
    ok(
      '…a count opens its CJI3 lines in the drawer',
      await q.$eval('#drawer', (e) => e.classList.contains('open') && /CJI3 lines/.test(e.textContent))
    );
    await q.click('#dClose');
    await q.click('[data-mrt="i"]');
    await q.waitForTimeout(300);
    ok(
      '…Indirect: each head filled, its cost elements underneath',
      (await q.$eval('#rul', (e) => /Personnel and Manning/.test(e.textContent) && /SF-01/.test(e.textContent))) &&
        (await q.$$eval('#rul .mrind tr.hd', (x) => x.length >= 5))
    );
    await q.click('[data-mrt="y"]');
    await q.waitForTimeout(300);
    ok('…tab 3: your rules and the settings', await q.$eval('#rul', (e) => /Your rules/.test(e.textContent) && !!e.querySelector('#rAdd')));
    await c16.close();
  }
  if (RUN('7n')) {
    head('7n. Mapping rules › GL list: indirect code off / on / moved, undo · a bucket changed is kept as your rule');
    const { ctx: c17, p: q } = await open(APP);
    await q.click('#bRules');
    await q.waitForTimeout(400);
    // the GL with the most indirect lines and its cost element; the items coded by the list
    const pick = await q.evaluate(() => {
      const I = __MR.ind();
      let best = null;
      I.groups.forEach((g) => g.ce.forEach((x) => x.gls.forEach((y) => (!best || y.c > best.c) && (best = { ce: x.k, g: y.g, c: y.c }))));
      return best;
    });
    ok('a GL of the list has lines', pick && pick.c > 0, JSON.stringify(pick));
    const coded = () => q.evaluate((ce) => __BK.reduce((n, b) => n + b.items.filter((it) => it.ce === ce).length, 0), pick.ce);
    const n0 = await coded();
    await q.selectOption(`[data-mrgc="${pick.g}"]`, '');
    await q.waitForTimeout(500);
    ok(
      '"– take off –" takes the GL off its cost element (your list)',
      await q.evaluate(
        (g) =>
          !Object.values(__ST.indgl || {})
            .join(' ')
            .split(' ')
            .includes(g),
        pick.g
      )
    );
    ok('…items coded by the list follow it (fewer on ' + pick.ce + ')', (await coded()) < n0, (await coded()) + ' vs ' + n0);
    if (await q.$('#asLater')) await q.click('#asLater'); // the first change asks for a data file
    await q.click('[data-mrt="i"]');
    await q.waitForTimeout(400);
    ok('…the Indirect tab lists it as not on a cost element yet', await q.$eval('#rul .mrun', (e, g) => e.textContent.includes(g), pick.g));
    await q.selectOption(`[data-mrmv="${pick.g}"]`, pick.ce);
    await q.waitForTimeout(500);
    eq('placing it back: the items get their cost element again', await coded(), n0, 0);
    eq('…the list is the built-in one again (nothing of yours kept)', await q.evaluate(() => __ST.indgl), null);
    await q.click('[data-mrt="g"]');
    await q.waitForTimeout(400);
    await q.selectOption(`[data-mrgc="${pick.g}"]`, 'SP-01');
    await q.waitForTimeout(500);
    ok('the Indirect code box moves a GL to another cost element', await q.evaluate((g) => (__ST.indgl || {})['SP-01'] === g, pick.g));
    ok(
      '…and the items follow',
      (await q.evaluate(() => __BK.reduce((n, b) => n + b.items.filter((it) => it.ce === 'SP-01').length, 0))) > 0
    );
    ok(
      '…in the Changes log',
      await q.evaluate((g) => __ST.log.some((x) => String(x[1] || x.label || JSON.stringify(x)).includes(g)), pick.g)
    );
    await q.keyboard.press('Control+z');
    await q.waitForTimeout(500);
    eq('Ctrl+Z undoes it: list and items', [await q.evaluate(() => __ST.indgl), await coded()], [null, n0]);
    // a bucket changed in the GL list: kept as your rule (GL number → bucket); its lines wait for the next build
    await q.click('[data-mrt="g"]');
    await q.waitForTimeout(400);
    await q.selectOption(`[data-mrgb="${pick.g}"]`, 'Other direct cost');
    await q.waitForTimeout(500);
    ok(
      'Bucket box: kept as your rule GL → bucket',
      await q.evaluate((g) => __ST.rules.some((r) => r.ce === g && r.bucket === 'Other direct cost' && !r.cen && !r.type && !r.wbs), pick.g)
    );
    ok(
      '…its lines wait for the next build (rebuild bar)',
      await q.$eval('#rul', (e) => /wait for your changes|waits for your changes/.test(e.textContent))
    );
    const base = await q.evaluate((g) => document.querySelector(`[data-mrgb="${g}"]`).title, pick.g);
    const back = (base.match(/built-in: (.*)$/) || [])[1];
    await q.selectOption(`[data-mrgb="${pick.g}"]`, back);
    await q.waitForTimeout(500);
    ok('…back to the built-in bucket: your rule is gone', await q.evaluate((g) => !__ST.rules.some((r) => r.ce === g), pick.g), back);
    await q.click('[data-mrt="d"]');
    await q.waitForTimeout(400);
    const dt = await q.$eval('#rul [data-mrdb]', (e) => e.dataset.mrdb);
    await q.selectOption(`[data-mrdb="${dt}"]`, 'G&A');
    await q.waitForTimeout(500);
    ok(
      'Document types: a bucket box is kept as your rule (document type → bucket), the lines wait',
      (await q.evaluate((t) => __ST.rules.some((r) => r.type === t && r.bucket === 'G&A' && !r.ce), dt)) &&
        (await q.$eval('#rul', (e) => /for your changes/.test(e.textContent))),
      dt
    );
    await q.selectOption(`[data-mrdb="${dt}"]`, '');
    await q.waitForTimeout(500);
    ok('…the first choice brings back the built-in rule', await q.evaluate((t) => !__ST.rules.some((r) => r.type === t), dt));
    await q.click('[data-mrt="w"]');
    await q.waitForTimeout(400);
    const wb = await q.$eval('#rul select[data-mrwb][data-f="bucket"]', (e) => e.dataset.mrwb);
    await q.selectOption(`select[data-mrwb="${wb}"][data-f="bucket"]`, 'Labor');
    await q.waitForTimeout(500);
    ok(
      'WBS rules: the built-in WBS row is editable – Salaries · Wages · Bonus on it → Labor, kept as your rules',
      await q.evaluate(
        (w) => ['Salaries', 'Wages', 'Bonus'].every((c) => __ST.rules.some((r) => r.wbs === w && r.cen === c && r.bucket === 'Labor')),
        wb
      ),
      wb
    );
    await q.click(`[data-mrwbx="${wb}"]`);
    await q.waitForTimeout(500);
    ok('…↺ brings back the built-in', await q.evaluate((w) => !__ST.rules.some((r) => r.wbs === w), wb));
    await c17.close();
  }
  if (RUN('7q')) {
    head('7q. Coding safety: what is still empty, typing replaces a code, one side panel at a time');
    const { ctx: c19, p: q } = await open(APP);
    await q.evaluate(() => document.getElementById('bJob').click());
    await q.waitForTimeout(400);
    await q.keyboard.press('Escape');
    await q.waitForTimeout(300);
    ok('Esc closes the Monthly job panel', await q.evaluate(() => document.getElementById('mjob').hidden));
    await q.click('#tabs button[data-s="cod"]');
    await q.waitForTimeout(1000);
    ok(
      '2 Code: a line says what is still empty in the bucket, with a jump to that column',
      await q.$eval('#codmiss', (e) => !e.hidden && /still/.test(e.textContent) && !!e.querySelector('[data-cmgo]'))
    );
    await q.evaluate(() => document.getElementById('bJob').click());
    await q.waitForTimeout(300);
    await q.click('#tb a.lk.open');
    await q.waitForTimeout(600);
    ok(
      'opening an item closes the Monthly job panel (one side panel at a time)',
      await q.evaluate(() => document.getElementById('mjob').hidden && document.getElementById('drawer').classList.contains('open'))
    );
    await q.evaluate(() => document.getElementById('dClose').click());
    await q.waitForTimeout(300);
    const box = await q.$('#tb input[data-f="pkg"]'),
      bb = await box.boundingBox();
    await q.fill('#tb input[data-f="pkg"]', 'ZZ1');
    await q.keyboard.press('Enter');
    await q.waitForTimeout(600);
    if (await q.$('#asLater')) await q.click('#asLater'); // the first change asks for a data file
    await q.waitForTimeout(300);
    const b2 = (await (await q.$('#tb input[data-f="pkg"]')).boundingBox()) || bb;
    await q.mouse.click(b2.x + 12, b2.y + b2.height / 2);
    await q.waitForTimeout(200);
    ok(
      'clicking a filled code box selects the whole code',
      await q.evaluate(() => {
        const e = document.activeElement;
        return !!e && e.value !== undefined && e.value.length > 0 && e.selectionStart === 0 && e.selectionEnd === e.value.length;
      })
    );
    await q.keyboard.type('S03');
    await q.keyboard.press('Enter');
    await q.waitForTimeout(600);
    eq('…typing replaces it (no mixed code)', await q.evaluate(() => __ST.log.slice(-1)[0].label), 'PKG = S03');
    await c19.close();
  }
  if (RUN('7o')) {
    head('7o. Reports › Client invoices: invoice register by month, WBS × month with cost and margin');
    const { ctx: c18, p: q } = await open(APP);
    await q.evaluate(() => document.body.classList.add('navpin'));
    await q.click('#bReports');
    await q.waitForTimeout(200);
    await q.click('#repm [data-rgo="cinv"]');
    await q.waitForTimeout(500);
    ok(
      'the Reports menu opens Client invoices',
      await q.$eval('#cli', (e) => /Invoice register/.test(e.textContent) && !!e.querySelector('.civc'))
    );
    const X = await q.evaluate(() => {
      const rows = __CIV.rows(),
        inv = __CIV.inv(rows),
        T = __CIV.tree(rows),
        tops = [...T.values()].filter((n) => n.lv === 0);
      return {
        n: inv.length,
        rv: rows.every((r) => r.ty === 'RV' || r.p === 0),
        net: inv.reduce((s, e) => s + e.g - e.dt, 0),
        lines: -rows.reduce((s, r) => s + r.a, 0),
        tree: tops.reduce((s, t) => s + t.inv, 0),
        cost: tops.reduce((s, t) => s + t.cost, 0),
        cji: __CIV.cost(),
      };
    });
    ok('…invoices: billing documents RV and the opening balance only', X.n > 0 && X.rv, JSON.stringify(X));
    eq('…the register net = its lines', X.net, X.lines);
    eq('…the WBS tree net = the register net', X.tree, X.net);
    eq('…cost to date in the tree = the CJI3 cost to the cut', X.cost, X.cji, 1);
    const iv = await q.$('#cli [data-civi]');
    await iv.click();
    await q.waitForTimeout(300);
    ok(
      '…an invoice opens its lines by WBS',
      await q.$eval('#drawer', (e) => e.classList.contains('open') && /Invoice/.test(e.textContent))
    );
    await q.click('#dClose');
    await q.click('[data-civt="w"]');
    await q.waitForTimeout(300);
    ok(
      '…tab 2: WBS × month with cost and margin',
      await q.$eval('#cli', (e) => /Cost to date/.test(e.textContent) && /Margin/.test(e.textContent))
    );
    await c18.close();
  }
  if (RUN('7p')) {
    head('7p. Budget: another layout – item totals only, Match the columns when a column is not found, kept for next time');
    const ExcelJS = require('exceljs'),
      mk = async (doneHdr, file) => {
        const wb = new ExcelJS.Workbook(),
          dp = wb.addWorksheet('Direct plan'),
          ca = wb.addWorksheet('Cost Analysis');
        dp.addRow(['', '', '', '', '', 'Building 04', 'Building 05']);
        dp.addRow([
          'PKG',
          'Item code',
          'Division',
          'Description',
          'UNIT',
          'B04 Q.',
          'B05 Q.',
          'Contract Quantity',
          'B04 Takeoff',
          'B05 Takeoff',
          'Takeoff',
          'B04 EV Q.',
          'B05 EV Q.',
          doneHdr,
        ]);
        dp.addRow(['S03', 'X-01-03', 'S03', 'DIVISION 03 - Concrete']);
        dp.addRow(['', 'X-01-03-0001', 'S03', 'Slab', 'm3', 10, 20, 30, 10, 20, 30, 5, 0, 5]);
        dp.addRow(['', 'X-01-03-0002', 'S03', 'Beam', 'm3', 4, 0, 4, 4, 0, 4, 4, 0, 4]);
        ca.addRow(['', '', '', '', '', '', '', '', '', '', '', '', '', 'BAC']);
        ca.addRow(['', '', '', '', '', '', '', '', '', '', '', '', '', 3350]);
        ca.addRow([
          'Cost Code',
          'Level',
          'CSI Code (PKG)',
          'EXP Code',
          'Cost Element Code\n(= Estimate Res. Code)',
          'Item Name',
          'Description',
          'Unit',
          'Quantity',
          'Res Unit',
          'Waste %',
          'Budget Rate',
          'TAKE OFF',
          'BAC',
          'Resource takeoff Qty',
        ]);
        ca.addRow(['X-01-03-0001', 4, 'S03', '', '', 'Slab', 'Slab', 'm3', 30]);
        ca.addRow(['X-01-03-0001', 5, 'S03', 'M', 'M001', 'Slab', 'Concrete', 'm3', 30, 'm3', 0.05, 100, 30, 3150, 31.5]);
        ca.addRow(['X-01-03-0002', 5, 'S03', 'S', 'S001', 'Beam', 'SC beams', 'm3', 4, 'm3', 0, 50, 4, 200, 4]);
        const f = path.join(OUT, file);
        await wb.xlsx.writeFile(f);
        return f;
      };
    const fA = await mk('EV Q.', 'cost_report_layout2.xlsx'),
      fB = await mk('Done to date', 'cost_report_layout3.xlsx');
    const { ctx: c19, p: q } = await open(APP);
    await q.evaluate(() => __GO('bud'));
    await q.waitForTimeout(400);
    const read = async (f) => {
      const [fc] = await Promise.all([q.waitForEvent('filechooser'), q.$eval('[data-bud="read"]', (b) => b.click())]);
      await fc.setFiles(f);
      await q.waitForTimeout(2500);
    };
    const bud = () =>
      q.evaluate(() => {
        const b = __ST.bud;
        return (
          b && {
            file: b.file,
            items: b.items.map((x) => [x.c, x.p, x.tq, x.dq]),
            bac: b.res.reduce((s, x) => s + x.bac, 0),
            n: b.res.length,
            name: b.names.S03,
            cai: Object.keys(b.cai),
          }
        );
      });
    await read(fA);
    ok(
      'every column found by its header: read at once, no Match the columns',
      !(await q.$('#bmx')) || (await q.$eval('#bmx', (e) => e.style.display === 'none'))
    );
    const B = await bud();
    eq(
      '…the item totals (Takeoff, EV Q.) – no building columns; the PKG from the Cost Analysis; the division row a heading',
      B && B.items,
      [
        ['X-01-03-0001', 'S03', [30], [5]],
        ['X-01-03-0002', 'S03', [4], [4]],
      ]
    );
    eq('…the resources and BAC from one header row, items at level 4, the PKG name', B && [B.n, B.bac, B.name, B.cai], [
      2,
      3350,
      'Concrete',
      ['X-01-03-0001'],
    ]);
    // a done column the tool does not know: the screen opens with the rest found; pick it, read
    await read(fB);
    ok(
      'a column not found (done qty): Match the columns opens',
      await q.$eval(
        '#bmx',
        (e) => e.style.display === 'flex' && /Done qty/.test(e.textContent) && !!e.querySelector('[data-bmx-a="go"][disabled]')
      )
    );
    await q.selectOption('#bmx [data-bmx="dp.c.ev"]', {
      label: (await q.$$eval('#bmx [data-bmx="dp.c.ev"] option', (o) => o.map((x) => x.textContent))).find((t) => /^Done to date/.test(t)),
    });
    await q.waitForTimeout(300);
    ok(
      '…after the pick: BAC and EV checked against the file, Read on',
      await q.$eval(
        '#bmx',
        (e) => /BAC READ/.test(e.textContent) && /= the file ✓/.test(e.textContent) && !e.querySelector('[data-bmx-a="go"]').disabled
      )
    );
    await q.click('#bmx [data-bmx-a="go"]');
    await q.waitForTimeout(800);
    eq('…read with your pick', await q.evaluate(() => __ST.bud.file), 'cost_report_layout3.xlsx');
    await q.evaluate(() => (__ST.bud = null));
    await read(fB);
    ok(
      'the same layout again: read in one click (the matching is kept)',
      (await q.$eval('#bmx', (e) => e.style.display === 'none')) && (await q.evaluate(() => !!__ST.bud && __ST.bud.items.length === 2))
    );
    await c19.close();
  }
  if (RUN('7k')) {
    head('7k. A row coded under a filter stays (marked) until the filter changes or Refresh');
    const { ctx: c15, p: q } = await open(APP);
    await q.$eval('#tabs [data-s="cod"]', (x) => x.click());
    await q.waitForTimeout(600);
    await q.click('[data-cm="todo"]');
    await q.waitForTimeout(500);
    const n0 = await q.evaluate(() => R.rows.length);
    for (const [f, v] of [
      ['pkg', 'T81'],
      ['mnl', 'MAT'],
      ['ce', 'T81-CE'],
    ]) {
      const inp = q.locator('#tb tr.it').first().locator(`input[data-f="${f}"]`);
      await inp.fill(v);
      await inp.press('Tab');
      await q.waitForTimeout(300);
    }
    await q.waitForTimeout(500);
    ok(
      'To code: the row just coded stays, marked, with the note and Refresh',
      await q.evaluate(
        (n) =>
          R.rows.length === n &&
          document.querySelectorAll('#tb tr.pin').length === 1 &&
          /1 coded row no longer match/.test(document.getElementById('cnt').textContent),
        n0
      )
    );
    await q.$eval('[data-pinr]', (b) => b.click()); // the auto-save question may sit on top
    await q.waitForTimeout(500);
    ok('Refresh: it leaves the list', await q.evaluate((n) => R.rows.length === n - 1 && !document.querySelector('#tb tr.pin'), n0));
    // VAT before date: the date box sits inside the side navigation, on its own line
    {
      const later = await q.$('#asLater');
      if (later) await later.click(); // the auto-save question after the first code
    }
    await more(q);
    await q.selectOption('#vat', 'Include VAT before date');
    await q.hover('#vat');
    await q.waitForTimeout(500);
    ok(
      'VAT before date: the date box is inside the side navigation, under the VAT list, the navigation does not slide',
      await q.evaluate(() => {
        const d = document.getElementById('vatFrom').getBoundingClientRect(),
          v = document.getElementById('vat').getBoundingClientRect(),
          n = document.getElementById('nav');
        return d.width > 100 && d.right <= n.getBoundingClientRect().right && d.top >= v.bottom && n.scrollLeft === 0;
      })
    );
    await c15.close();
  }

  if (RUN('7g')) {
    head('7g. Data log and the data file (SQLite)');
    {
      const dl = D.META.dlog || {};
      const srcs = (dl.files || []).map((f) => f.src);
      ok(
        'the build logs every file it read (source, months, cut type, rows, merge rule)',
        srcs.includes('cji3') && srcs.includes('zintc1') && dl.files.every((f) => f.name && f.cut && f.merge),
        srcs.join(',')
      );
      eq(
        'CJI3 coverage by month adds up to the CJI3 cost',
        r2(Object.values(dl.cov.cji3).reduce((t, c) => t + c.amt, 0)),
        r2(D.META.cost),
        1
      );
      ok(
        'ZSCPRG01: certificates per month (all POs)',
        !dl.cov.zscprg01 || Object.values(dl.cov.zscprg01).reduce((t, c) => t + c.n, 0) === dl.certs.length
      );
      // the newer ZSCPRG01 output: unit (BUn) and type of works (SC Type) on every line – it replaces ZSCSRV1; the PO title = its type of works
      {
        const SCm = require('../src/subcontract'),
          XL = require('xlsx'),
          pf = path.join(DATA, [].concat(F.zscprg01)[0]),
          wb0 = XL.readFile(pf),
          ws0 = wb0.Sheets[wb0.SheetNames[0]],
          rows = XL.utils.sheet_to_json(ws0, { header: 1, defval: '' }),
          h = rows.findIndex((r) => r.includes('SC Work Current Cost')),
          ip = rows[h].indexOf('Pur. Doc.');
        // the unit goes in the existing BUn column (the file may already have an empty one), else a new one
        let iu = rows[h].indexOf('BUn');
        if (iu < 0) iu = rows[h].push('BUn') - 1;
        const it = rows[h].push('SC Type') - 1;
        rows.slice(h + 1).forEach((r) => {
          r[iu] = r[ip] ? 'M3' : '';
          r[it] = r[ip] ? 'مقاولين-خرسانه' : '';
        });
        const nwb = XL.utils.book_new();
        XL.utils.book_append_sheet(nwb, XL.utils.aoa_to_sheet(rows), 'Data');
        const nf = path.join(OUT, 'zscprg01_new_output.xlsx');
        XL.writeFile(nwb, nf);
        const a = SCm.readProg([pf]),
          b = SCm.readProg([nf]),
          po = b.lines[0].po;
        ok(
          'new ZSCPRG01 output (BUn, SC Type): read as before – the same lines and amount',
          b.lines.length === a.lines.length && r2(b.lines.reduce((t, l) => t + l.amt, 0)) === r2(a.lines.reduce((t, l) => t + l.amt, 0))
        );
        eq(
          '…and it carries what ZSCSRV1 gave: unit, type of works, PO title = type of works',
          [b.serv.unit.get(b.lines[0].svc), b.serv.poType.get(po), b.serv.poTitle.get(po)],
          ['M3', 'مقاولين-خرسانه', 'مقاولين-خرسانه']
        );
        ok('…the old output gives none of it (ZSCSRV1 still needed there)', !a.serv);
      }
      // ZINTC1 merge: order + month, newest file wins – the same file twice is counted once and listed as an overlap
      const ZI = require('../src/zintc1'),
        zf = [].concat(F.zintc1).map((f) => path.join(DATA, f)),
        one = ZI.readZint(zf),
        two = ZI.readZint([...zf, zf[zf.length - 1]]);
      eq(
        'ZINTC1: a file loaded twice is not counted twice',
        r2(two.rows.reduce((t, r) => t + r.amt, 0)),
        r2(one.rows.reduce((t, r) => t + r.amt, 0))
      );
      ok(
        '…and the overlap is listed (newest file kept, rows dropped)',
        two.overlaps.length > 0 && two.files[two.files.length - 2].dropped === two.files[two.files.length - 2].rows
      );
    }
    {
      const { ctx: c11, p: p11 } = await open(APP);
      await p11.evaluate(() => __GO('chk'));
      await p11.waitForTimeout(300);
      await p11.click('#side [data-gt="dlog"]');
      await p11.waitForTimeout(700);
      ok(
        'Check › Data log: this build, coverage by month',
        await p11.evaluate(
          () =>
            __ST.tab === 'dlog' &&
            document.querySelectorAll('#dlog .dlcard').length >= 3 &&
            /Coverage by month/.test(document.getElementById('dlog').textContent)
        )
      );
      ok('…without a data file it offers to create one', (await p11.$('#dlog [data-asgo="pick"]')) !== null);
      // Chrome / Edge: the data file is written directly (a stand-in for the file the user picks)
      await p11.evaluate(() => {
        window.__file = null;
        window.showSaveFilePicker = async () => ({
          name: 'Test_register.db',
          queryPermission: async () => 'granted',
          requestPermission: async () => 'granted',
          getFile: async () => new Blob([window.__file || new Uint8Array()]),
          createWritable: async () => {
            const parts = [];
            return {
              write: async (d) => parts.push(d),
              close: async () => {
                window.__file = new Uint8Array(await new Blob(parts).arrayBuffer());
              },
            };
          },
        });
      });
      await p11.click('#dlog [data-asgo="pick"]');
      await p11.waitForFunction(() => window.__file && window.__file.length > 1e5, null, { timeout: 60000 });
      await p11.waitForTimeout(1500);
      const s1 = await p11.evaluate(() => ({
        st: DBF.st,
        b: dbBuilds().length,
        lines: dbOne('SELECT count(*) AS n FROM lines').n,
        codes: dbOne('SELECT count(*) AS n FROM codes').n,
        n: __D.N,
        pill: document.getElementById('nprj').textContent,
      }));
      ok(
        'Create data file: written to the file, this build and its lines inside',
        s1.st === 'ok' && s1.b === 1 && s1.lines === s1.n && s1.codes > 0,
        JSON.stringify(s1)
      );
      ok('…the project card in the menu shows the data file', /Test_register\.db/.test(s1.pill), s1.pill);
      const k = await p11.evaluate(() => {
        const it = __BK[0].items.find((x) => !x.pkg);
        __ST.tab = 'cod';
        return it.k;
      });
      await p11.evaluate((kk) => {
        const it = __BK[0].items.find((x) => x.k === kk);
        it.pkg = 'T99';
        return __DL.save();
      }, k);
      await p11.waitForTimeout(500);
      const bytes = await p11.evaluate(() => Array.from(window.__file));
      const SQL = await require('sql.js')(),
        db = new SQL.Database(Uint8Array.from(bytes));
      const q = (sql) => {
        const r = db.exec(sql);
        return r.length ? r[0].values : [];
      };
      ok(
        'the .db opens in any SQLite tool: builds, files, coverage, certificates, lines, codes, view expenses',
        ['builds', 'files', 'coverage', 'certificates', 'lines', 'codes', 'expenses'].every(
          (t) => q(`SELECT count(*) FROM ${t}`)[0][0] >= 0
        ) && q('SELECT count(*) FROM files')[0][0] === D.META.dlog.files.length
      );
      eq(
        '…a code typed in the Tool is in the file (view expenses)',
        q(`SELECT count(*) FROM expenses WHERE item_key = '${k.replace(/'/g, "''")}' AND pkg = 'T99'`)[0][0] > 0,
        true
      );
      eq(
        '…the lines in the file add up to the register lines',
        r2(q('SELECT sum(amount) FROM lines')[0][0]),
        r2(
          await p11.evaluate(() => {
            let t = 0;
            for (let i = 0; i < __D.N; i++) t += __D.L.amt[i];
            return t;
          })
        ),
        1
      );
      eq('difference stays 0', await p11.evaluate(() => R.diff), 0);
      await c11.close();
    }
  }

  if (RUN('9')) {
    head('9. Excel export');
    const [dlX] = await Promise.all([p.waitForEvent('download', { timeout: 180000 }), p.click('#bExport')]);
    const xl = path.join(OUT, 'export.xlsx');
    await dlX.saveAs(xl);
    const ExcelJS = require('exceljs'),
      wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(xl);
    const sheets = wb.worksheets.map((w) => w.name);
    ok('the export opens in Excel format', sheets.length > 5, sheets.join(', '));
    for (const n of ['Summary', 'Expenses', 'PKG summary', 'Lines', 'Checks']) ok(`sheet "${n}"`, sheets.includes(n));
    {
      // Lines: the CJI3 Name next to the description, and the sheet reads back with nothing changed
      const wl = wb.getWorksheet('Lines'),
        h = wl.getRow(4).values,
        cn = h.indexOf('Name (CJI3)'),
        filled = [];
      wl.eachRow((r, n) => n > 4 && r.getCell(cn).value && filled.push(n));
      ok(
        'Lines: a Name (CJI3) column after Description, filled',
        cn === h.indexOf('Description') + 1 && filled.length > 0,
        cn + ' · ' + filled.length
      );
      eq('Lines: Amount is still a number column', typeof wl.getRow(5).getCell(h.indexOf('Amount')).value, 'number');
      const codes = () => p.evaluate(() => JSON.stringify(__BK.map((b) => b.items.map((it) => [it.pkg, it.mnl, it.ce, it.inc]))));
      const c0 = await codes();
      await p.setInputFiles('#file', xl);
      await p.waitForTimeout(2500);
      eq('the export read back: no code changes, difference 0', [(await codes()) === c0, await p.evaluate(() => R.diff)], [true, 0]);
      // a PKG typed on one line of the Lines sheet comes back as that line's code
      const r5 = wl.getRow(5),
        id = String(r5.getCell(h.indexOf('Line ID')).value);
      r5.getCell(h.indexOf('PKG')).value = 'ZZ9';
      const xl2 = path.join(OUT, 'export_edit.xlsx');
      await wb.xlsx.writeFile(xl2);
      await p.setInputFiles('#file', xl2);
      await p.waitForTimeout(2500);
      eq('…a PKG typed on the Lines sheet is read back for that line', await p.evaluate((x) => (__OVR()[x] || {}).pkg, id), 'ZZ9');
      await p.keyboard.press('Control+z');
      await p.waitForTimeout(500);
    }
    {
      const JSZip = require('jszip'),
        z = await JSZip.loadAsync(fs.readFileSync(path.join(OUT, 'export.xlsx'))),
        bad = [],
        ORD = ['tabColor', 'outlinePr', 'pageSetUpPr'];
      for (const n of Object.keys(z.files)) {
        if (!/^xl\/worksheets\/sheet\d+\.xml$/.test(n)) continue;
        const x = await z.files[n].async('string'),
          m = x.match(/<sheetPr>(.*?)<\/sheetPr>/);
        if (/<v>(NaN|-?Infinity|undefined|null)<\/v>/.test(x)) bad.push(n + ': a cell holds a value that is not a number');
        if (m) {
          const tags = [...m[1].matchAll(/<(\w+)/g)].map((t) => ORD.indexOf(t[1]));
          if (tags.some((v, i) => v < 0 || (i && v < tags[i - 1]))) bad.push(n + ': ' + m[0]);
        }
      }
      ok("Excel opens every sheet without repair (sheet settings in Excel's order, no broken numbers)", !bad.length, bad.join(' · '));
    }

    // ---------------------------------------------------------------------------- 10. the empty Tool: drop the files, build
  }
  await ctx.close();
  if (RUN('10')) {
    head('10. Tool start page: drop files and build');
    const ctx3 = await browser.newContext({ viewport: { width: 1600, height: 900 } }),
      p3 = await ctx3.newPage();
    p3.on('pageerror', (e) => errs.push(e.message));
    p3.on('dialog', (d) => d.dismiss());
    await p3.goto('file://' + TOOL);
    await p3.waitForSelector('#pick', { state: 'attached' });
    await p3.setInputFiles('#pick', files());
    await p3.waitForFunction(
      () => /CJI3 loaded/.test(document.querySelector('.stchk') ? document.querySelector('.stchk').textContent : ''),
      null,
      { timeout: 120000 }
    );
    if (SETS[SET].other)
      ok(
        'warns that the MB52 is another project',
        await p3.$eval('.stchk', (e, o) => new RegExp('is project ' + o).test(e.textContent), SETS[SET].other)
      );
    else ok('no wrong-project warning (every file is this project)', await p3.$eval('.stchk', (e) => !/is project/.test(e.textContent)));
    await p3.click('#sBuild');
    await p3.waitForFunction(() => document.querySelector('#tabs button'), null, { timeout: 180000 });
    await p3.waitForTimeout(1500);
    eq('built from the start page: difference 0', await p3.evaluate(() => R.diff), 0);
    eq('same to date as the test app', r2(await p3.evaluate(() => R.toDate)), r2(R0.toDate));
    await ctx3.close();
  }
  const mkAug = () => {
    const cAug = path.join(OUT, 'cji3-aug.xlsx'),
      F1 = path.join(DATA, [].concat(F.cji3)[0]);
    if (!fs.existsSync(cAug)) {
      const XLm = require('xlsx'),
        wb = XLm.readFile(F1, { cellDates: true }),
        ws = wb.Sheets[wb.SheetNames[0]],
        rows = XLm.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
      const h = rows.findIndex((r) => r && r.includes('Posting Date')),
        c = rows[h].indexOf('Posting Date'),
        last = rows
          .slice(h + 1)
          .map((r) => r && r[c])
          .filter((d) => d instanceof Date)
          .sort((a, b) => b - a)[0],
        ym = (d) => d.getFullYear() * 100 + d.getMonth();
      const keep = rows.filter((r, k) => k <= h || !(r && r[c] instanceof Date && ym(r[c]) === ym(last)));
      const nb = XLm.utils.book_new();
      XLm.utils.book_append_sheet(nb, XLm.utils.aoa_to_sheet(keep, { cellDates: true }), wb.SheetNames[0]);
      XLm.writeFile(nb, cAug);
    }
    return { cAug, F1 };
  };
  if (RUN('10b')) {
    head('10b. Data file: create the register, open it next month, update it');
    const SP = path.join(OUT, 'db');
    fs.mkdirSync(SP, { recursive: true });
    const fresh = async () => {
      const c = await browser.newContext({ viewport: { width: 1600, height: 900 }, acceptDownloads: true });
      await c.addInitScript(() => {
        delete window.showSaveFilePicker;
        delete window.showOpenFilePicker;
      });
      const q = await c.newPage();
      q.on('pageerror', (e) => errs.push(e.message));
      q.on('dialog', (d) => d.dismiss());
      await q.goto('file://' + TOOL);
      await q.waitForSelector('#pick', { state: 'attached' });
      return { c, q };
    };
    const openDb = async (q, f) => {
      const [fc] = await Promise.all([q.waitForEvent('filechooser'), q.click('#sDbOpen')]);
      await fc.setFiles(f);
    };
    const buildInto = async (q, f, list) => {
      await q.setInputFiles('#pick', list || files());
      await q.waitForFunction(
        () => /CJI3 loaded/.test(document.querySelector('.stchk') ? document.querySelector('.stchk').textContent : ''),
        null,
        { timeout: 120000 }
      );
      const [d] = await Promise.all([q.waitForEvent('download', { timeout: 240000 }), q.click('#sBuild')]);
      await d.saveAs(f);
      return d.suggestedFilename();
    };
    // month 1: a new data file, build into it
    let { c, q } = await fresh();
    ok('start page asks for a data file (open or create)', (await q.$('#sDbNew')) !== null && (await q.$('#sDbOpen')) !== null);
    const { cAug, F1 } = mkAug(),
      aug = files().map((f) => (f === F1 ? cAug : f));
    await q.click('#sDbNew');
    await q.waitForFunction(() => /_register\.db/.test(document.querySelector('.dbc').textContent));
    const f1 = path.join(SP, 'm1.db');
    ok(
      'the new data file is named after the project (not Project_register.db)',
      /^[A-Z]+_register\.db$/.test(await buildInto(q, f1, aug)) && !/^Project_/.test(await q.evaluate(() => DBF.name))
    );
    await c.close();
    // open it: the build comes from the file; type a code
    ({ c, q } = await fresh());
    await openDb(q, f1);
    await q.waitForFunction(() => document.querySelector('#tabs button'), null, { timeout: 120000 });
    await q.waitForTimeout(1500);
    eq('opened from the data file: difference 0', await q.evaluate(() => R.diff), 0);
    const k = await q.evaluate(() => __BK[0].items.find((x) => !x.pkg).k);
    await q.evaluate((kk) => {
      __BK[0].items.find((x) => x.k === kk).pkg = 'T77';
      return __DL.save();
    }, k);
    await q.waitForFunction(() => !DBF.busy && !DBF.again);
    const f2 = path.join(SP, 'm1b.db');
    {
      const [d] = await Promise.all([q.waitForEvent('download'), q.click('#hasv [data-dbgo="dl"]')]);
      await d.saveAs(f2);
    }
    await c.close();
    // next month: open the data file, build again – no last report dropped, the codes come from the data file
    ({ c, q } = await fresh());
    await openDb(q, f2);
    await q.waitForFunction(() => document.querySelector('#tabs button'), null, { timeout: 120000 });
    await q.waitForTimeout(1000);
    const f3 = path.join(SP, 'm2.db');
    {
      const [fc] = await Promise.all([q.waitForEvent('filechooser'), more(q).then(() => q.click('#bAdd'))]);
      await fc.setFiles(files());
      await q.waitForFunction(
        () => document.querySelector('#updm [data-upd="go"]') && !document.querySelector('#updm [data-upd="go"]').disabled,
        null,
        { timeout: 120000 }
      );
      const [d] = await Promise.all([q.waitForEvent('download', { timeout: 300000 }), q.click('#updm [data-upd="go"]')]);
      await d.saveAs(f3);
    }
    await c.close(); // next month: Update with new SAP files (this browser downloads the data file)
    ({ c, q } = await fresh());
    await q.setInputFiles('#pick', f3);
    /* a .db chosen with the files opens straight away – no CJI3 needed */ await q.waitForFunction(
      () => document.querySelector('#tabs button'),
      null,
      { timeout: 120000 }
    );
    await q.waitForTimeout(1500);
    eq('two updates in the data file', await q.evaluate(() => dbBuilds().length), 2);
    eq('…after the update: the same to date as the test app (every file)', r2(await q.evaluate(() => R.toDate)), r2(R0.toDate));
    eq(
      "…the new build has last month's code (from the data file)",
      await q.evaluate((kk) => __BK[0].items.find((x) => x.k === kk).pkg, k),
      'T77'
    );
    await q.evaluate(() => __GO('chk'));
    await q.click('#side [data-gt="dlog"]');
    await q.waitForTimeout(800);
    ok(
      'Data log compares with the last update: the CJI3 grew by the month the first file did not have',
      await q.evaluate(() => {
        const t = [...document.querySelectorAll('#dlog .dlcard')].find((c) => /Against the last update/.test(c.textContent));
        if (!t) return false;
        const r = [...t.querySelectorAll('tr')].find((x) => /^CJI3/.test(x.textContent.trim()));
        if (!r) return false;
        const n = [...r.children].map((td) => +td.textContent.replace(/[^0-9.-]/g, ''));
        return n[2] > n[1];
      }),
      await q.$eval('#dlog', (e) => e.textContent.slice(0, 300))
    );
    eq('difference 0', await q.evaluate(() => R.diff), 0);
    await c.close();
    // two last reports at the create (the earlier Material and Subcontractor reports, made in section 8): both are read
    const oi = path.join(OUT, 'old_inventory_coding.xlsx'),
      os2 = path.join(OUT, 'old_subcontract_coding.xlsx');
    if (fs.existsSync(oi) && fs.existsSync(os2)) {
      ({ c, q } = await fresh());
      await q.click('#sDbNew');
      await q.waitForFunction(() => /_register\.db/.test(document.querySelector('.dbc').textContent));
      await q.setInputFiles('#pick', [...files(), oi, os2]);
      await q.waitForFunction(
        () => /CJI3 loaded/.test(document.querySelector('.stchk') ? document.querySelector('.stchk').textContent : ''),
        null,
        {
          timeout: 120000,
        }
      );
      ok(
        'two last reports are accepted: "codes come back – from 2 reports"',
        /from 2 reports/.test(await q.$eval('.stchk', (e) => e.textContent))
      );
      await Promise.all([q.waitForEvent('download', { timeout: 240000 }), q.click('#sBuild')]);
      await q.waitForFunction(() => document.querySelector('#tabs button'), null, { timeout: 120000 });
      await q
        .waitForFunction(() => __BK.find((x) => x.id === 'Subcontractor').items.some((i) => i.pkg === 'S.00'), null, { timeout: 30000 })
        .catch(() => {});
      ok(
        '…after the create: the codes of both reports are in (Material S.030, Subcontractor S.00)',
        await q.evaluate(
          () =>
            __BK.find((x) => x.id === 'Material').items.some((i) => i.pkg === 'S.030') &&
            __BK.find((x) => x.id === 'Subcontractor').items.some((i) => i.pkg === 'S.00')
        )
      );
      eq('…difference 0', await q.evaluate(() => R.diff), 0);
      await c.close();
    } else ok('two last reports: the earlier reports of section 8 are there', false);
  }
  const FAKE = () => {
    const fsDb = () =>
      new Promise((res) => {
        const r = indexedDB.open('fakefs', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('f');
        r.onsuccess = () => res(r.result);
      });
    const io = async (mode, fn) => {
      const d = await fsDb();
      return new Promise((res) => {
        const t = d.transaction('f', mode),
          q = fn(t.objectStore('f'));
        t.oncomplete = () => res(q && q.result);
      });
    };
    const H = () => ({
      __fake: 1,
      name: 'Test_register.db',
      kind: 'file',
      queryPermission: async () => (sessionStorage.getItem('fakePerm') === 'granted' ? 'granted' : 'prompt'),
      requestPermission: async () => {
        window.__asked = (window.__asked || 0) + 1;
        sessionStorage.setItem('fakePerm', 'granted');
        return 'granted';
      },
      getFile: async () => new Blob([(await io('readonly', (st) => st.get('file'))) || new Uint8Array()]),
      createWritable: async () => {
        const parts = [];
        return {
          write: async (d) => {
            parts.push(d);
          },
          close: async () => {
            const u = new Uint8Array(await new Blob(parts).arrayBuffer());
            await io('readwrite', (st) => st.put(u, 'file'));
            window.__writes = (window.__writes || 0) + 1;
          },
        };
      },
    });
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (v, k) {
      return put.call(this, v && v.__fake ? '__FAKEH__' : v, k);
    };
    const g = Object.getOwnPropertyDescriptor(IDBRequest.prototype, 'result').get;
    Object.defineProperty(IDBRequest.prototype, 'result', {
      get() {
        const v = g.call(this);
        return v === '__FAKEH__' ? H() : v;
      },
    });
    window.showSaveFilePicker = async () => {
      sessionStorage.setItem('fakePerm', 'granted');
      return H();
    };
    window.showOpenFilePicker = async () => {
      sessionStorage.setItem('fakePerm', 'granted');
      return [H()];
    };
  };
  if (RUN('10c')) {
    head('10c. Close the Tool and open it again: it opens at once, the first click reconnects the data file');
    // a stand-in for Chrome's file handles: kept in IndexedDB like the real ones; the permission is forgotten when the browser closes (sessionStorage)
    const dir = path.join(OUT, 'profile');
    fs.rmSync(dir, { recursive: true, force: true });
    const launch = async () => {
      const c = await chromium.launchPersistentContext(dir, { viewport: { width: 1600, height: 900 } });
      await c.addInitScript(FAKE);
      const q = c.pages()[0] || (await c.newPage());
      q.on('pageerror', (e) => errs.push(e.message));
      q.on('dialog', (d) => d.dismiss());
      return { c, q };
    };
    let { c, q } = await launch();
    await q.goto('file://' + TOOL);
    await q.waitForSelector('#pick', { state: 'attached' });
    await q.click('#sDbNew');
    await q.waitForFunction(() => /Test_register\.db/.test(document.querySelector('.dbc').textContent));
    await q.setInputFiles('#pick', files());
    await q.waitForFunction(
      () => /CJI3 loaded/.test(document.querySelector('.stchk') ? document.querySelector('.stchk').textContent : ''),
      null,
      { timeout: 120000 }
    );
    await q.click('#sBuild');
    await q.waitForFunction(() => document.querySelector('#tabs button') && typeof DBF !== 'undefined' && DBF.db && DBF.st === 'ok', null, {
      timeout: 240000,
    });
    await q.waitForTimeout(2000);
    ok(
      'after the build the Tool opens from the data file by itself',
      await q.evaluate(
        () =>
          DBF.cur === 1 &&
          /Test_register\.db/.test(document.getElementById('nprj').textContent) &&
          /Saved/.test(document.getElementById('hasv').textContent)
      )
    );
    await q.evaluate(() => __GO('cod'));
    await q.waitForTimeout(400);
    {
      const m = await q.$('#asLater');
      if (m) await m.click();
    }
    const iq = await q.$('#tb input[data-f="pkg"]');
    await iq.fill('T55');
    await iq.press('Enter');
    await q.waitForTimeout(800);
    {
      const m = await q.$('#asLater');
      if (m) await m.click();
    }
    const k = await q.evaluate(() => __BK.flatMap((b) => b.items).find((x) => x.pkg === 'T55').k);
    await q.waitForFunction(() => !DBF.busy && !DBF.again);
    await c.close();
    // close and open again: no choosing, the build is there at once
    ({ c, q } = await launch());
    const t1 = Date.now();
    await q.goto('file://' + TOOL);
    await q.waitForFunction(() => document.querySelector('#tabs button'), null, { timeout: 60000 });
    ok(
      'opened again: the register is there at once – nothing to choose',
      await q.evaluate(() => document.getElementById('start').style.display === 'none' && !!DBF.pendH),
      `${Date.now() - t1} ms`
    );
    ok('…with your code', (await q.evaluate((kk) => __BK.flatMap((b) => b.items).find((x) => x.k === kk).pkg, k)) === 'T55');
    ok(
      '…the top bar says the first click reconnects the data file',
      /click to reconnect/.test(await q.$eval('#hasv', (e) => e.textContent)),
      await q.$eval('#hasv', (e) => e.textContent)
    );
    await q.mouse.click(700, 400);
    await q.waitForFunction(() => DBF.db && DBF.st === 'ok', null, { timeout: 30000 });
    await q.waitForTimeout(800);
    ok(
      'first click: the browser asks once, the data file is connected',
      await q.evaluate(
        () =>
          window.__asked === 1 &&
          /Saved/.test(document.getElementById('hasv').textContent) &&
          /Test_register\.db/.test(document.querySelector('#hasv [title]').title)
      ),
      await q.$eval('#hasv', (e) => e.textContent)
    );
    const w = await q.evaluate(() => window.__writes || 0);
    await q.evaluate((kk) => {
      __BK.flatMap((b) => b.items).find((x) => x.k === kk).pkg = 'T56';
      return __DL.save();
    }, k);
    await q.waitForFunction(() => !DBF.busy && !DBF.again);
    ok(
      '…and changes go to the file again',
      await q.evaluate((ww) => (window.__writes || 0) > ww && JSON.parse(dbOne('SELECT codes FROM builds WHERE id = 1').codes).at > '', w)
    );
    await more(q).then(() => q.click('#bDb'));
    await q.waitForTimeout(300);
    ok(
      'side navigation › Data file: open another, new, download a copy, data log',
      (await q.$$eval('#dbm.on [data-dbm]', (b) => b.map((x) => x.dataset.dbm).join(','))) === 'open,new,copy,log'
    );
    eq('difference 0', await q.evaluate(() => R.diff), 0);
    await c.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
  if (RUN('10d')) {
    head('10d. Next month from inside the register: drop only the new files, Update');
    // month 1: a CJI3 to the end of August (the September lines taken out) and one ZINTC1 file; month 2: the full CJI3 and the 2026 ZINTC1
    const { cAug, F1 } = mkAug();
    const zf = [].concat(F.zintc1).map((f) => path.join(DATA, f)),
      first = [cAug, ...files().filter((f) => f !== F1 && (zf.length < 2 || f !== zf[zf.length - 1]))],
      neu = [F1, ...(zf.length > 1 ? [zf[zf.length - 1]] : [])];
    const dir = path.join(OUT, 'profile2');
    fs.rmSync(dir, { recursive: true, force: true });
    const launch = async () => {
      const c = await chromium.launchPersistentContext(dir, { viewport: { width: 1600, height: 900 } });
      await c.addInitScript(FAKE);
      const q = c.pages()[0] || (await c.newPage());
      q.on('pageerror', (e) => errs.push(e.message));
      q.on('dialog', (d) => d.dismiss());
      return { c, q };
    };
    let { c, q } = await launch();
    await q.goto('file://' + TOOL);
    await q.waitForSelector('#pick', { state: 'attached' });
    await q.click('#sDbNew');
    await q.waitForFunction(() => /Test_register\.db/.test(document.querySelector('.dbc').textContent));
    await q.setInputFiles('#pick', first);
    await q.waitForFunction(
      () => /CJI3 loaded/.test(document.querySelector('.stchk') ? document.querySelector('.stchk').textContent : ''),
      null,
      { timeout: 120000 }
    );
    await q.click('#sBuild');
    await q.waitForFunction(() => document.querySelector('#tabs button') && typeof DBF !== 'undefined' && DBF.db && DBF.st === 'ok', null, {
      timeout: 240000,
    });
    await q.waitForTimeout(1500);
    const m1 = await q.evaluate(() => ({ cut: __DL.data.META.cut, files: dbBuildFiles(DBF.cur).length }));
    ok('month 1 built into the data file, with its SAP files kept in it', m1.files === first.length, JSON.stringify(m1));
    await q.evaluate(() => __GO('cod'));
    await q.waitForTimeout(300);
    {
      const m = await q.$('#asLater');
      if (m) await m.click();
    }
    const iq = await q.$('#tb input[data-f="pkg"]');
    await iq.fill('T66');
    await iq.press('Enter');
    await q.waitForTimeout(600);
    {
      const m = await q.$('#asLater');
      if (m) await m.click();
    }
    const k = await q.evaluate(() => __BK.flatMap((b) => b.items).find((x) => x.pkg === 'T66').k);
    await q.waitForFunction(() => !DBF.busy && !DBF.again);
    await q.waitForTimeout(1500);
    // month 2: Add new SAP files…
    const [fc] = await Promise.all([q.waitForEvent('filechooser'), more(q).then(() => q.click('#bAdd'))]);
    await fc.setFiles(neu);
    await q.waitForFunction(() => document.querySelector('#updm [data-upd="go"]'), null, { timeout: 120000 });
    const box = await q.$eval('#updm', (e) => e.textContent);
    ok(
      'one box: what each new file does, what is kept from the data file',
      /Update the register with/.test(box) && /replaces/.test(box) && /Kept from the data file/.test(box),
      box.slice(0, 400)
    );
    await q.click('#updm [data-upd="go"]');
    await q.waitForFunction(() => typeof DBF !== 'undefined' && DBF.db && DBF.cur === 2 && document.querySelector('#tabs button'), null, {
      timeout: 300000,
    });
    await q.waitForTimeout(2000);
    const m2 = await q.evaluate(() => ({
      cut: __DL.data.META.cut,
      diff: R.diff,
      td: R.toDate,
      b: dbBuilds().length,
      roles: dbBuildFiles(DBF.cur)
        .map((f) => f.role)
        .sort()
        .join(','),
    }));
    ok(
      'Update: a new build in the data file, difference 0',
      m2.b === 2 && m2.cut >= m1.cut && Math.abs(m2.diff) < 0.01,
      JSON.stringify(m2)
    );
    eq('…the same to date as building from every file', r2(m2.td), r2(R0.toDate));
    ok(
      '…the history: new files, kept files, the replaced one',
      /new/.test(m2.roles) && /kept/.test(m2.roles) && /replaced/.test(m2.roles),
      m2.roles
    );
    eq('…your code came along', await q.evaluate((kk) => __BK.flatMap((b) => b.items).find((x) => x.k === kk).pkg, k), 'T66');
    await q.evaluate(() => __GO('chk'));
    await q.click('#side [data-gt="dlog"]');
    await q.waitForTimeout(800);
    ok(
      'Data log › Updates: both updates with their SAP files',
      await q.evaluate(
        () => document.querySelectorAll('#dlog .bfs').length === 2 && /replaced/.test(document.getElementById('dlog').textContent)
      )
    );
    {
      const [fc2] = await Promise.all([q.waitForEvent('filechooser'), more(q).then(() => q.click('#bAdd'))]);
      await fc2.setFiles([F1]);
      await q.waitForFunction(
        () => document.querySelector('#updm [data-upd]') && /same file/.test(document.getElementById('updm').textContent),
        null,
        { timeout: 120000 }
      );
      ok(
        'the same file again: "same file as in the data file – no change", nothing to update',
        await q.evaluate(
          () =>
            /Nothing new to update/.test(document.getElementById('updm').textContent) &&
            document.querySelector('#updm [data-upd="go"]').disabled
        )
      );
      await q.click('#updm [data-upd="x"]');
    }
    {
      // a part download: the same months, only some WBS → lower than the register: the old CJI3 is kept too, unless "Replace anyway"
      const cPart = path.join(OUT, 'cji3-part.xlsx');
      if (!fs.existsSync(cPart)) {
        const XLm = require('xlsx'),
          wb = XLm.readFile(F1, { cellDates: true }),
          ws = wb.Sheets[wb.SheetNames[0]],
          rows = XLm.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
        const h = rows.findIndex((r) => r && r.includes('Object')),
          c = h >= 0 ? h : rows.findIndex((r) => r && r.includes('Posting Date')),
          w = rows[c].findIndex((x) => /^(Object|WBS element)$/.test(String(x || '')));
        const keep = rows.filter((r, k) => k <= c || !r || String(r[w] || '').length % 2 === 0);
        const nb = XLm.utils.book_new();
        XLm.utils.book_append_sheet(nb, XLm.utils.aoa_to_sheet(keep, { cellDates: true }), wb.SheetNames[0]);
        XLm.writeFile(nb, cPart);
      }
      const [fc3] = await Promise.all([q.waitForEvent('filechooser'), more(q).then(() => q.click('#bAdd'))]);
      await fc3.setFiles([cPart]);
      await q.waitForFunction(() => document.querySelector('#updm [data-upd="go"]'), null, { timeout: 120000 });
      ok(
        'a part CJI3 (fewer WBS, same months): warned with the missing WBS, the old CJI3 kept too',
        await q.evaluate(
          () =>
            /part download/.test(document.getElementById('updm').textContent) &&
            /missing \d+ WBS/.test(document.getElementById('updm').textContent) &&
            R.upd.kept.some((f) => f.kind === 'cji3')
        ),
        await q.$eval('#updm', (e) => e.textContent.slice(0, 300))
      );
      await q.click('#updm [data-upd="force"]');
      await q.waitForTimeout(300);
      ok(
        '…Replace anyway replaces it',
        await q.evaluate(
          () => !/part download/.test(document.getElementById('updm').textContent) && !R.upd.kept.some((f) => f.kind === 'cji3')
        )
      );
      await q.click('#updm [data-upd="x"]');
    }
    await c.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
  await browser.close();
  head('Page errors');
  ok('no JavaScript errors on any page', errs.length === 0, [...new Set(errs)].slice(0, 5).join(' | '));

  if (UPDATE) {
    fs.writeFileSync(EXP, JSON.stringify(got, null, 1) + '\n');
    console.log('\n' + path.basename(EXP) + ' updated');
  }
  const bad = results.filter((r) => !r.pass);
  console.log(`\n${results.length - bad.length} passed · ${bad.length} failed · ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  if (bad.length) {
    console.log('FAILED:');
    bad.forEach((r) => console.log(`  ${r.section} › ${r.name}: ${r.detail}`));
    process.exit(1);
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
