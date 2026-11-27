// =====================================================================================  Mapping rules: how every CJI3 line gets its bucket (tab 1) and its indirect cost element (tab 2)
// Tab 1 writes the built-in rules of src/rules.js in plain words, grouped by bucket, with the lines each one catches (click → the lines).
// Tab 2 is the GL → indirect cost element list (IND_GL). Tab 3 holds your own rules and the settings (13-rules.js).
// Keep MR_BOOK in the order of classifyOne in src/rules.js – the checks (test/run.js) prove every line lands where the tool put it.
const MR_GA = [
  ['Staff payroll', ['Salaries', 'Wages', 'Bonus']],
  ['Social insurance and levy', ['Contra insurance exp', 'Manpower cost', 'General Expenses']],
  ['Finance charges', ['LG Comm charges', 'Debit interes', 'Debit interest', 'Bank Charges', 'Bank Charges&comm.']],
  ['CAR insurance', ['Insurance Charges']],
  ['Taxes and government fees', ['Stamp Taxes', 'Governmental Charges']],
  [
    'Site running costs',
    [
      'Meals Night Staff',
      'Miscel. allowances',
      'Buffet & hosp allow',
      'Buffet & Cleaning',
      'Consultant fees',
      'Consultant Fees',
      'Tech Consul & Insp',
      'Utilities Wat & Elec',
      'Location service',
      'Location treatment',
      'Donations',
      'Stationary &supplies',
      'Others',
      'Other Expenses',
      'Miscel consultancy',
      'Miscel. consultancy',
      'Cash consultancy',
      'Security expenses',
      'Utilities',
      'Advertising',
    ],
  ],
];
// the client-deduction GLs of the SAP chart (shown with their number even before a line uses them)
const MR_GLNO = {
  'Client-Deductions': '30402000',
  'Liquid Damage LDFD': '30402100',
  'Poor workmanship': '30402200',
  Utilites: '30402300',
  penalty: '30402400',
};
const MR_EQUIP = ['Fuel', 'Diesel', 'Oil and Lubricant', 'Other Equip Exp.', 'Maintenace & repairs', 'Insurance For Equip'],
  MR_ODC = ['Main Material', 'Consumables Material', 'Material Damages'],
  MR_HOUSE = ['Housing Rent', 'Housing expenses', 'Housing Commission', 'HO-Housing Rent'];
// one rule: bucket, G&A group, the parts of "a line goes here when…" ([text, chips] – chips are GL names unless .raw), test on a line x
const MR_BOOK = [
  { b: 'Revenue', w: [['GL number starts with', ['4'], 1]], t: (x) => x.ce.startsWith('4') },
  {
    b: 'Revenue',
    g: 'client deductions',
    w: [
      ['GL number starts with', ['30402'], 1],
      ['', ['Client-Deductions', 'Liquid Damage LDFD', 'Poor workmanship', 'Utilites', 'penalty']],
      ['· or GL name starts with', ['Client-Deduction'], 1],
      ['· or Document type is', ['RV'], 1],
      ['with a positive amount (GL not starting with 4)'],
    ],
    t: (x) => /^Client-?\s*Deduction/i.test(x.cen) || x.ce.startsWith('30402') || (x.ty === 'RV' && x.amt > 0),
  },
  {
    b: 'Subcontractor deductions',
    w: [
      ['Document type is', ['SC'], 1],
      ['and GL name is', ['Other Deduction', 'Main Material']],
    ],
    t: (x) => x.ty === 'SC' && (x.cen === 'Other Deduction' || x.cen === 'Main Material'),
  },
  { b: 'Subcontractor', w: [['Document type is', ['SC'], 1], ['(subcontract) – any GL not listed in # 3']], t: (x) => x.ty === 'SC' },
  { b: 'Subcontractor deductions', w: [['GL name is', ['Other Deduction']]], t: (x) => x.cen === 'Other Deduction' },
  { b: 'Material', w: [['Document type is', ['WA'], 1], ['(goods issue)']], t: (x) => x.ty === 'WA' },
  {
    b: 'Asset depreciation',
    w: [
      ['Document type is', ['AF'], 1],
      ['· or GL name starts with', ['DC-'], 1],
    ],
    t: (x) => x.ty === 'AF' || x.cen.startsWith('DC-'),
  },
  {
    b: 'Equipment / fuel',
    w: [['GL name is', ['Inhouse Charge EQ', 'Inhouse Charge Fuel']]],
    t: (x) => x.cen === 'Inhouse Charge EQ' || x.cen === 'Inhouse Charge Fuel',
  },
  { b: 'Fleet / transportation', w: [['GL name is', ['Inhouse Charge Fleet']]], t: (x) => x.cen === 'Inhouse Charge Fleet' },
  { b: 'House rent', w: [['GL name is', MR_HOUSE]], t: (x) => MR_HOUSE.includes(x.cen) },
  { b: 'Labor', w: [['GL name is', ['Casual Labour']]], t: (x) => x.cen === 'Casual Labour' },
  {
    b: 'Subcontractor',
    w: [['GL name is', ['Subcontractor Cost', 'Equip Rent - Outside']]],
    t: (x) => x.cen === 'Subcontractor Cost' || x.cen === 'Equip Rent - Outside',
  },
  // the material number is not kept per line in the register: a line that reaches this rule and sits in Material had one
  { b: 'Material', w: [['The line has a material number (any document type)']], t: (x) => x.b === 'Material' && x.ty !== '(blank)' },
  { b: 'Equipment / fuel', w: [['GL name is', MR_EQUIP]], t: (x) => MR_EQUIP.includes(x.cen) },
  {
    b: 'Other direct cost',
    w: [['GL name is', ['Spare Parts']], ['– and the line has no material number']],
    t: (x) => x.cen === 'Spare Parts',
  },
  {
    b: 'Fleet / transportation',
    w: [['GL name is', ['Transp & Car Allow', 'Transp.of Material']]],
    t: (x) => x.cen === 'Transp & Car Allow' || x.cen === 'Transp.of Material',
  },
  { b: 'Other direct cost', w: [['GL name is', MR_ODC], ['– and the line has no material number']], t: (x) => MR_ODC.includes(x.cen) },
  {
    b: 'G&A',
    g: 'Other labour / payroll',
    w: [
      ['GL name is', ['Outside Hire manp.']],
      ['· or GL name is', ['Salaries', 'Wages', 'Bonus']],
      ['and the WBS ends with', ['.IN-02-1'], 1],
    ],
    t: (x) =>
      x.cen === 'Outside Hire manp.' || (/^[A-Z]-[A-Z0-9]+\.IN-02-1$/.test(x.wbs) && ['Salaries', 'Wages', 'Bonus'].includes(x.cen)),
  },
  ...MR_GA.map(([g, names]) => ({
    b: 'G&A',
    g,
    w: [['GL name is', names], ...(g === 'Finance charges' ? [['· or GL name starts with', ['Debit inter'], 1]] : [])],
    t: (x) => names.includes(x.cen) || (g === 'Finance charges' && x.cen.startsWith('Debit inter')),
  })),
  { b: 'Unclassified', w: [['None of the conditions above']], t: () => true },
];
const MR_ORDER = [
  'Material',
  'Subcontractor',
  'Subcontractor deductions',
  'Other direct cost',
  'Labor',
  'Equipment / fuel',
  'Fleet / transportation',
  'House rent',
  'Asset depreciation',
  'G&A',
  'Revenue',
  'Unclassified',
];
const MR_COL = {
  Material: '#1F4E9A',
  Subcontractor: '#E07B39',
  'Subcontractor deductions': '#2A9D8F',
  'Other direct cost': '#7D8F3A',
  Labor: '#7CB342',
  'Equipment / fuel': '#E9B949',
  'Fleet / transportation': '#C0504D',
  'House rent': '#8E5EA2',
  'Asset depreciation': '#6D7B8D',
  'G&A': '#3BA3C7',
  Revenue: '#14254A',
  Unclassified: '#B42318',
  zy: '#9CA3AF',
  yours: '#B8860B',
};
// the indirect cost elements, in the groups of the indirect template
const MR_IGRP = [
  ['Personnel and Manning', ['SF-01', 'SF-01-01', 'SF-02', 'SF-03']],
  [
    'Site preliminaries',
    ['SP-01', 'SP-02', 'SP-03', 'SP-09', 'SP-10', 'SP-11', 'SP-14', 'SP-15', 'SP-16', 'SP-17', 'SP-18', 'SP-20', 'SP-19', 'SP-28', 'SP-29'],
  ],
  ['Transportation', ['TR-01', 'TR-02']],
  [
    'Equipment, vehicles, tools',
    ['SE-01', 'SE-03', 'SE-05', 'SE-07', 'SE-08', 'SE-11', 'SE-12', 'SE-13', 'SE-17', 'SE-18', 'SE-19', 'SE-16'],
  ],
  ['Engineering / site support', ['SS-01', 'SS-02', 'SS-03']],
  ['Owner / consultant', ['CO-01', 'CO-02', 'CO-03', 'Sponsorship']],
];
const MR_EQW = {
  'SE-01': 'crane · ونش · كرين',
  'SE-03': 'loader · forklift · لودر · كلارك',
  'SE-05': 'bobcat · بوبكات',
  'SE-07': 'truck · trailer · تريلا · قلاب',
  'SE-08': 'compressor · vibrator · welding',
  'SE-11': 'generator · مولد',
  'SE-17': 'any other equipment',
};
const MRV = { tab: 'g', fold: new Set(['zy']), c: null, add: '', q: '', fb: '', fc: '' };
// every CJI3 line → its rule (index in MR_BOOK, 'zy' or 'yours'), worked out once per build
function mrCalc() {
  if (MRV.c && MRV.c.n === N) return MRV.c;
  const r = new Int16Array(N).fill(-3),
    nums = new Map(), // GL name → GL numbers
    nm = new Map(); // GL number → name
  for (let i = 0; i < N; i++) {
    if (L.uns[i] || L.b[i] < 0) continue; // added by you (not in CJI3)
    const x = { ce: S[L.ce[i]], cen: S[L.cen[i]], ty: S[L.ty[i]], wbs: S[L.wbs[i]], b: BK[L.b[i]].id, amt: L.amt[i] };
    if (!x.ce) continue;
    if (!nm.has(x.ce)) nm.set(x.ce, x.cen);
    const s = nums.get(x.cen) || nums.set(x.cen, new Set()).get(x.cen);
    s.add(x.ce);
    if (x.ty === 'ZY') {
      r[i] = -1;
      continue;
    }
    const k = MR_BOOK.findIndex((q) => q.t(x));
    // -2: one of your rules took it · -4: sorted with older rules – the rules of this version put it in another bucket (rebuild)
    r[i] = MR_BOOK[k].b === x.b ? k : ST.rules.some((u) => u.bucket && ruleMatch(u, i)) ? -2 : -4;
  }
  MRV.c = { n: N, r, nums, nm };
  return MRV.c;
}
function mapUnmapped() {
  return META.unclassified || 0;
}
// lines sorted with older rules: the bucket of this build differs from what the rules of this version give
function mapStale() {
  const C = mrCalc();
  let n = 0;
  for (let i = 0; i < N; i++) if (C.r[i] === -4) n++;
  return n;
}
const mrStaleBar = () => {
  const n = mapStale();
  return n
    ? `<div class="mrstale"><b>${n.toLocaleString('en-US')} line${n === 1 ? ' was' : 's were'} sorted with older rules</b> – this register was built before the rules changed; the rules of __VER__ put ${n === 1 ? 'it' : 'them'} in another bucket. <a class="lk" data-mrl="-4">See ${n === 1 ? 'it' : 'them'}</a><span class="sp"></span><button class="pri" data-mra="rebuild">↻ Rebuild with the current rules</button><span class="help">uses the SAP files in your data file · your codes are kept · about 30 seconds</span></div>`
    : '';
};
// the lines of one rule (and one GL name), as a list in the drawer
function mrLines(rk, cen, ce) {
  const C = mrCalc(),
    idx = [];
  for (let i = 0; i < N; i++) if (String(C.r[i]) === String(rk) && (!cen || S[L.cen[i]] === cen) && (!ce || S[L.ce[i]] === ce)) idx.push(i);
  return idx;
}
function mrShow(title, idx) {
  idx.sort((x, y) => L.d[x] - L.d[y]);
  const tot = idx.reduce((s, i) => s + L.amt[i], 0),
    dt = (d) => (d ? String(d).replace(/(\d{4})(\d\d)(\d\d)/, '$1-$2-$3') : '');
  drill(
    title,
    idx.length.toLocaleString('en-US') + ' CJI3 lines · ' + fmt2(tot),
    `<table class="s"><tr><th style="text-align:left">Date</th><th style="text-align:left">Document</th><th style="text-align:left">Doc. type</th><th style="text-align:left">GL</th><th style="text-align:left">WBS</th><th style="text-align:left">Text</th><th style="text-align:left">Bucket</th><th>Amount</th></tr>${idx
      .slice(0, 800)
      .map(
        (i) =>
          `<tr><td style="text-align:left">${dt(L.d[i])}</td><td style="text-align:left">${esc(S[L.doc[i]])}</td><td style="text-align:left">${esc(S[L.ty[i]])}</td><td style="text-align:left">${esc(S[L.cen[i]])} <span class="help">${esc(S[L.ce[i]])}</span></td><td style="text-align:left">${esc(S[L.wbs[i]])}</td><td style="text-align:left" dir="auto">${esc(S[L.desc[i]] || S[L.name[i]] || '')}</td><td style="text-align:left">${esc(BK[L.b[i]].id)}</td><td>${fmt2(L.amt[i])}</td></tr>`
      )
      .join(
        ''
      )}${idx.length > 800 ? `<tr><td colspan="8" class="help" style="text-align:left">… ${(idx.length - 800).toLocaleString('en-US')} more lines – open Coding › Lines</td></tr>` : ''}</table>`
  );
}
function mrShowRev(title, k, cen) {
  const rows = REV.filter((x) => (x[3] ? 0 : 1) === k && (!cen || S[x[5]] === cen)).sort((x, y) => x[0] - y[0]),
    tot = rows.reduce((s, x) => s + x[2], 0),
    dt = (d) => (d ? String(d).replace(/(\d{4})(\d\d)(\d\d)/, '$1-$2-$3') : '');
  drill(
    title,
    rows.length.toLocaleString('en-US') + ' CJI3 lines · ' + fmt2(tot),
    `<table class="s"><tr><th style="text-align:left">Date</th><th style="text-align:left">GL</th><th style="text-align:left">WBS</th><th>Amount</th></tr>${rows
      .slice(0, 800)
      .map(
        (x) =>
          `<tr><td style="text-align:left">${dt(x[0])}</td><td style="text-align:left">${esc(S[x[5]])} <span class="help">${esc(S[x[4]])}</span></td><td style="text-align:left">${esc(S[x[6]])}</td><td>${fmt2(x[2])}</td></tr>`
      )
      .join('')}</table>`
  );
}
// tab 1: per bucket, its rules with the lines and amount each catches
function mrBucketData() {
  const C = mrCalc(),
    st = new Map(); // rule key → {n, a, by GL name}
  for (let i = 0; i < N; i++) {
    const k = C.r[i];
    if (k === -3) continue;
    const e = st.get(k) || st.set(k, { n: 0, a: 0, gl: new Map() }).get(k);
    e.n++;
    e.a += L.amt[i];
    const g = S[L.cen[i]];
    e.gl.set(g, (e.gl.get(g) || 0) + 1);
  }
  // revenue lines are kept apart in the register (REV): # 1 GL number starts with 4 · # 2 client deductions
  REV.forEach((x) => {
    const k = x[3] ? 0 : 1,
      e = st.get(k) || st.set(k, { n: 0, a: 0, gl: new Map() }).get(k),
      g = S[x[5]];
    e.n++;
    e.a += x[2];
    e.gl.set(g, (e.gl.get(g) || 0) + 1);
    const s = C.nums.get(g) || C.nums.set(g, new Set()).get(g);
    s.add(S[x[4]]);
  });
  const groups = new Map(MR_ORDER.map((b) => [b, []]));
  MR_BOOK.forEach((q, k) => groups.get(q.b).push(k));
  return { C, st, groups };
}
function mrChips(q, k, D) {
  const e = D.st.get(k);
  return q.w
    .map(([txt, chips, raw]) => {
      if (!chips) return `<span class="mrt">${esc(txt)}</span>`;
      return (
        (txt ? `<span class="mrt">${esc(txt)}</span> ` : '') +
        chips
          .map((c) => {
            if (raw) return `<span class="ch raw">${esc(c)}</span>`;
            const ns = D.C.nums.get(c) || (MR_GLNO[c] ? [MR_GLNO[c]] : null),
              n = e && e.gl.get(c);
            return `<span class="ch${n ? ' lk' : ' z'}"${n ? ` data-mrl="${k}" data-mrc="${esc(c)}" title="${n.toLocaleString('en-US')} lines – click to see them"` : ' title="no line in this CJI3"'}>${esc(c)}${ns ? ` <s>${esc([...ns].join(' · '))}</s>` : ''}</span>`;
          })
          .join('')
      );
    })
    .join(' ');
}
function mrTab1() {
  const D = mrBucketData(),
    f = (v) => (Math.abs(v) < 0.5 ? '-' : fmt(v)),
    blk = (key, title, rows, isGA) => {
      const n = rows.reduce((s, r) => s + r.n, 0),
        a = rows.reduce((s, r) => s + r.a, 0),
        op = !MRV.fold.has(key);
      return `<div class="mrb${op ? '' : ' fold'}" style="--c:${MR_COL[key] || '#6D7B8D'}"><div class="mrh" data-mrf="${esc(key)}"><span class="tg">${op ? '−' : '+'}</span><b>${esc(title)}</b><span class="cnt">${rows.length} condition${rows.length === 1 ? '' : 's'}</span><span class="sp"></span><span class="num">${n.toLocaleString('en-US')} lines</span><span class="num w">${f(a)}</span></div>${
        op
          ? `<table class="mrtb"><tr><th style="width:38px">#</th><th>A line goes here when…</th>${isGA ? '<th style="width:200px">G&amp;A group</th>' : ''}<th class="n" style="width:90px">Lines</th><th class="n" style="width:130px">Amount</th></tr>${rows
              .map(
                (r) =>
                  `<tr class="${r.n ? '' : 'zero'}"><td>${r.no}</td><td class="cd">${r.html}</td>${isGA ? `<td><b>${esc(r.g || '')}</b></td>` : ''}<td class="n">${r.n ? `<a class="lk" data-mrl="${r.k}" title="see the lines">${r.n.toLocaleString('en-US')}</a>` : '0'}</td><td class="n">${f(r.a)}</td></tr>`
              )
              .join('')}</table>`
          : ''
      }</div>`;
    };
  const out = [];
  for (const [b, ks] of D.groups) {
    const rows = ks.map((k) => {
      const e = D.st.get(k) || { n: 0, a: 0 };
      return { k, no: k + 1, n: e.n, a: e.a, g: MR_BOOK[k].g, html: mrChips(MR_BOOK[k], k, D) };
    });
    out.push(blk(b, b, rows, b === 'G&A'));
  }
  const zy = D.st.get(-1) || { n: 0, a: 0 },
    yo = D.st.get(-2);
  out.push(
    blk('zy', 'Accrual reversals (ZY) – follow their pair', [
      {
        k: -1,
        no: MR_BOOK.length + 1,
        n: zy.n,
        a: zy.a,
        html: '<span class="mrt">Document type is</span> <span class="ch raw">ZY</span> <span class="mrt">(accrual reversal) → it goes to the bucket of the line it reverses (same GL, same month, opposite amount)</span>',
      },
    ])
  );
  if (yo)
    out.push(
      blk('yours', 'Your own rules – checked first', [
        {
          k: -2,
          no: 0,
          n: yo.n,
          a: yo.a,
          html: `<span class="mrt">${ST.rules.length} rule${ST.rules.length === 1 ? '' : 's'} – see tab 3</span>`,
        },
      ])
    );
  return `<div class="mrlv"><b>CJI3 line → bucket</b><span>each bucket and what puts a line in it · the tool checks the conditions in the order of the # · a line goes to the first one it meets · click a number or a GL to see its lines</span><span class="sp"></span><button data-mra="open">+ Open all</button><button data-mra="fold">− Fold all</button></div>${out.join('')}<div class="mrnote">Your own rules come first (tab 3) · grey = no line meets it in this CJI3 · opening document types UE, ZB, MD, HT keep their bucket and show in the Opening column</div>`;
}
// tab 2: indirect cost element per GL (lines in the indirect buckets)
const MR_IND = ['G&A', 'Equipment / fuel', 'Fleet / transportation', 'House rent', 'Asset depreciation'];
function mrIndData() {
  const C = mrCalc(),
    per = new Map(), // GL → {n, a}
    eq = new Map(); // SE code → {n, a} for Inhouse Charge EQ
  for (let i = 0; i < N; i++) {
    if (C.r[i] === -3 || !MR_IND.includes(BK[L.b[i]].id)) continue;
    const g = S[L.ce[i]],
      e = per.get(g) || per.set(g, { n: 0, a: 0 }).get(g);
    e.n++;
    e.a += L.amt[i];
    if (g === '30103100') {
      const it = BK[L.b[i]].items[L.it[i]],
        c = eqCode(itemDesc(it) + ' ' + itemCode(it)),
        q = eq.get(c) || eq.set(c, { n: 0, a: 0 }).get(c);
      q.n++;
      q.a += L.amt[i];
    }
  }
  const placed = new Set(Object.values(indGl()).flatMap((g) => String(g).split(' ').filter(Boolean)));
  placed.add('30103100');
  const groups = MR_IGRP.map(([g, codes]) => ({
    g,
    ce: codes.map((k) => {
      const gls = String(indGl()[k] || '')
        .split(' ')
        .filter(Boolean)
        .map((x) => ({ g: x, n: C.nm.get(x) || '', c: (per.get(x) || {}).n || 0, a: (per.get(x) || {}).a || 0 }));
      const q = MR_EQW[k] ? eq.get(k) || { n: 0, a: 0 } : null;
      return {
        k,
        name: PS_NAMES[k] || k,
        gls,
        eq: q,
        n: gls.reduce((s, x) => s + x.c, 0) + (q ? q.n : 0),
        a: gls.reduce((s, x) => s + x.a, 0) + (q ? q.a : 0),
      };
    }),
  }));
  const unplaced = [...per]
    .filter(([g]) => !placed.has(g))
    .map(([g, p]) => ({ g, n: C.nm.get(g) || '', c: p.n, a: p.a }))
    .sort((x, y) => Math.abs(y.a) - Math.abs(x.a));
  return { groups, unplaced };
}
function mrTab2() {
  const D = mrIndData(),
    C = mrCalc(),
    f = (v) => (Math.abs(v) < 0.5 ? '-' : fmt(v)),
    chip = (y, ce) =>
      `<span class="ch${y.c ? ' lk' : ' z'}"${y.c ? ` data-mrg="${esc(y.g)}" title="${y.c} lines – click to see them"` : ' title="no line in this CJI3"'}>${y.n ? esc(y.n) + ' ' : ''}<s>${esc(y.g)}${y.c ? ' · ' + y.c.toLocaleString('en-US') : ''}</s>${ce ? `<u data-mrx="${esc(ce)}|${esc(y.g)}" title="take ${esc(y.g)} off ${esc(ce)}">✕</u>` : ''}</span>`,
    add = (ce) =>
      MRV.add === ce
        ? `<input class="mradd" data-mrin="${esc(ce)}" list="dl-mrgl" placeholder="GL number" autofocus>`
        : `<span class="ch add2" data-mrp="${esc(ce)}" title="add a GL to ${esc(ce)}">+ GL</span>`,
    ces = MR_IGRP.flatMap(([, c]) => c),
    mine = !!ST.indgl;
  // the GL numbers to pick from: those with indirect cost first, then every GL in this CJI3
  const ind = new Set(D.unplaced.map((y) => y.g));
  D.groups.forEach((g) => g.ce.forEach((x) => x.gls.forEach((y) => y.c && ind.add(y.g))));
  const dl = `<datalist id="dl-mrgl">${[...ind, ...[...C.nm.keys()].filter((g) => !ind.has(g) && !g.startsWith('4')).sort()]
    .map((g) => `<option value="${esc(g)}">${esc(C.nm.get(g) || '')}</option>`)
    .join('')}</datalist>`;
  return `<div class="mrlv"><b>Indirect line → PKG Indirect + cost element</b><span>for the lines in the buckets G&amp;A · Equipment / fuel · Fleet / transportation · House rent · Asset depreciation</span></div>
  <div class="mrhow"><div><b>PKG</b> = Indirect</div><div><b>MNL</b> = EQU for Equipment / fuel and Fleet · OTHER for the rest</div><div><b>Cost element</b> = by the GL that carries most of the item's cost · <b>Inhouse Charge EQ 30103100</b> by the equipment name</div><div>your own code on an item always wins</div></div>
  <table class="mrtb mr2"><tr><th style="width:96px">Cost element</th><th style="width:290px">Name</th><th>GL (name · number · lines) – ✕ take off · + GL add</th><th class="n" style="width:80px">Lines</th><th class="n" style="width:120px">Amount</th></tr>${D.groups
    .map(
      (g) =>
        `<tr class="gh"><td colspan="5">${esc(g.g)} · ${g.ce.length} cost elements · ${f(g.ce.reduce((s, x) => s + x.a, 0))}</td></tr>` +
        g.ce
          .map(
            (x) =>
              `<tr class="${x.gls.length || x.eq ? '' : 'zero'}"><td><b>${esc(x.k)}</b></td><td>${esc(x.name)}</td><td>${x.gls.map((y) => chip(y, x.k)).join('')}${x.eq ? `<span class="ch eqn${x.eq.n ? ' lk' : ''}"${x.eq.n ? ` data-mre="${x.k}"` : ''}>Inhouse Charge EQ <s>30103100</s> + name <b>${esc(MR_EQW[x.k])}</b>${x.eq.n ? ' <s>· ' + x.eq.n + '</s>' : ''}</span>` : ''}${add(x.k)}</td><td class="n">${x.n ? x.n.toLocaleString('en-US') : '-'}</td><td class="n">${f(x.a)}</td></tr>`
          )
          .join('')
    )
    .join('')}</table>
  ${
    D.unplaced.length
      ? `<div class="mrun"><b>GL with indirect cost not on the list yet: ${D.unplaced.length}</b>${D.unplaced
          .map(
            (y) =>
              `<div class="mrup">${chip(y)} <span class="help">${f(y.a)}</span> → <select data-mrmv="${esc(y.g)}"><option value="">choose a cost element ▾</option>${ces.map((c) => `<option value="${esc(c)}">${esc(c)} · ${esc(PS_NAMES[c] || '')}</option>`).join('')}</select></div>`
          )
          .join('')}<span class="help">until placed, its items get no indirect cost element (or type one on the item)</span></div>`
      : '<div class="mrun ok"><b>Every GL with indirect cost has a cost element ✓</b></div>'
  }
  <div class="mrnote">${mine ? '<b>Your list</b> (changed from the built-in one) · <a class="lk" data-mra="indreset">Reset to built-in</a>' : 'The built-in list'} · a change goes to Undo, the data file and the Changes log · items coded by the list follow it; a code you typed yourself stays · grey = no line on that GL in this CJI3</div>${dl}`;
}
// a new indirect list: the list and the items coded by it, in one undo step
function mrIndSet(next, label) {
  const norm = (m) =>
      JSON.stringify(
        Object.keys(m)
          .sort()
          .map((k) => [k, String(m[k]).split(' ').filter(Boolean).sort().join(' ')])
          .filter((x) => x[1])
      ),
    same = norm(next) === norm(IND_GL),
    nv = same ? null : next,
    its = [];
  BK.forEach((b) => {
    if (MR_IND.includes(b.id)) b.items.forEach((it) => its.push([it, indPreset(it)]));
  });
  const keep = ST.indgl;
  ST.indgl = nv;
  const ch = [{ t: 'indgl', v: JSON.stringify(nv) }];
  its.forEach(([it, p0]) => {
    const p1 = indPreset(it);
    if (p0 && it.ce === p0.ce && (!p1 || p1.ce !== p0.ce)) ch.push({ t: 'item', bi: it.bi, ii: it.ii, f: 'ce', v: p1 ? p1.ce : '' });
    else if (!p0 && p1 && !ST.indOff && !it.ce && (!it.pkg || isIndPkg(it.pkg)))
      ch.push({ t: 'item', bi: it.bi, ii: it.ii, f: 'ce', v: p1.ce });
  });
  ST.indgl = keep;
  MRV.add = '';
  change(ch, label);
}
// the list with a GL moved: off every cost element, then (if ce) onto ce
function mrIndMove(gl, ce) {
  const next = {};
  Object.entries(indGl()).forEach(([c, g]) => {
    const a = String(g)
      .split(' ')
      .filter((x) => x && x !== gl);
    if (c === ce) a.push(gl);
    if (a.length) next[c] = a.join(' ');
  });
  if (ce && !next[ce]) next[ce] = gl;
  return next;
}
// =====================================================================================  v5.17 – the rules as lists: GL list · Document types · WBS rules · Special rules · Indirect
// The GL list shows every GL on one row: its bucket, G&A group and indirect cost element. The bucket and group come from the
// built-in rules (MR_BOOK, tested on the GL alone); a change you make is kept as one of YOUR rules (GL number → bucket), which the
// engine checks first at the next build – so the engine stays as it is. The indirect code changes the indirect list (mrIndSet).
const MR_GLGRP = [...MR_GA.map((x) => x[0]), 'Other labour / payroll'];
const mrGlOwn = (g) => ST.rules.find((r) => r.ce === g && !r.cen && !r.type && !r.wbs && r.bucket);
// the bucket the built-in rules give a GL by itself (no document type, no WBS)
function mrGlRule(g, nm) {
  const x = { ce: g, cen: nm || '', ty: '', wbs: '', b: '', amt: -1 },
    k = MR_BOOK.findIndex((q) => q.t(x)),
    q = MR_BOOK[k];
  return q && q.b !== 'Unclassified' ? { b: q.b === 'Revenue' && q.g ? 'Revenue › Client deductions' : q.b, g: q.g || '', k } : null;
}
function mrGlData() {
  const C = mrCalc(),
    per = new Map(),
    get = (g, nm) => {
      let e = per.get(g);
      if (!e) per.set(g, (e = { g, nm: nm || '', n: 0, a: 0, by: new Map(), wait: 0 }));
      if (!e.nm && nm) e.nm = nm;
      return e;
    },
    own = ST.rules.filter((r) => r.bucket && (r.ce || r.cen || r.type || r.wbs));
  for (let i = 0; i < N; i++) {
    if (C.r[i] === -3) continue;
    const g = S[L.ce[i]];
    if (!g) continue;
    const e = get(g, S[L.cen[i]]),
      b = BK[L.b[i]].id;
    e.n++;
    e.a += L.amt[i];
    e.by.set(b, (e.by.get(b) || 0) + 1);
    if (own.length) {
      const u = own.find((r) => ruleMatch(r, i));
      if (u && u.bucket !== b) e.wait++;
    }
  }
  REV.forEach((x) => {
    const e = get(S[x[4]], S[x[5]]),
      b = x[3] ? 'Revenue' : 'Revenue › Client deductions';
    e.n++;
    e.a += x[2];
    e.by.set(b, (e.by.get(b) || 0) + 1);
  });
  const ce = new Map();
  Object.entries(indGl()).forEach(([c, s]) =>
    String(s)
      .split(' ')
      .filter(Boolean)
      .forEach((g) => {
        ce.set(g, c);
        get(g, C.nm.get(g) || '');
      })
  );
  Object.entries(MR_GLNO).forEach(([nm, g]) => get(g, nm));
  ST.rules.forEach((r) => r.ce && !r.cen && !r.type && !r.wbs && get(r.ce, C.nm.get(r.ce) || ''));
  const rows = [...per.values()].map((e) => {
    const base = mrGlRule(e.g, e.nm),
      u = mrGlOwn(e.g),
      main = [...e.by].sort((p, q) => q[1] - p[1])[0],
      bucket = u ? u.bucket : base ? base.b : main ? main[0] : '',
      // lines in another bucket – except those still waiting for your change (they move at the next build)
      other = [...e.by]
        .filter(([b]) => b !== bucket)
        .map(([b, n]) => [b, u && base && b === base.b ? n - e.wait : n])
        .filter(([, n]) => n > 0);
    return {
      ...e,
      base,
      own: u || null,
      bucket,
      byType: !u && !base && !!main, // no GL rule: the document type (or a special rule) decides
      grp: u ? u.sub || '' : base ? base.g : '',
      ce: e.g === '30103100' ? 'by name' : ce.get(e.g) || '',
      other,
    };
  });
  rows.sort((p, q) => (p.n ? 0 : 1) - (q.n ? 0 : 1) || p.g.localeCompare(q.g));
  return rows;
}
const mrIndB = (b) => MR_IND.includes(b);
function mrTabGl() {
  const rows = mrGlData(),
    BKS = META.bucketIds || BK.map((b) => b.id),
    ces = MR_IGRP.flatMap(([, c]) => c),
    f = (v) => (Math.abs(v) < 0.5 ? '-' : fmt(v)),
    q = (MRV.q || '').toLowerCase(),
    fb = MRV.fb || '',
    fc = MRV.fc || '',
    shown = rows.filter(
      (r) =>
        (!q || (r.g + ' ' + r.nm + ' ' + r.bucket + ' ' + r.grp + ' ' + r.ce + ' ' + (PS_NAMES[r.ce] || '')).toLowerCase().includes(q)) &&
        (!fb || r.bucket === fb) &&
        (!fc || (fc === '(none)' ? mrIndB(r.bucket) && !r.ce : r.ce === fc))
    ),
    wait = rows.reduce((s, r) => s + r.wait, 0),
    mine = rows.filter((r) => r.own).length,
    bOpt = (r) =>
      r.bucket.startsWith('Revenue')
        ? `<span class="mrfix">${esc(r.bucket)}</span>`
        : `<select data-mrgb="${esc(r.g)}" class="${r.own ? 'own' : ''}" title="${r.own ? 'changed by you – built-in: ' + esc(r.base ? r.base.b : 'by document type') : 'built-in'}">${r.byType ? `<option value="">${esc(r.bucket)} (by doc. type)</option>` : ''}${BKS.filter(
            (b) => b !== 'Unclassified'
          )
            .map((b) => `<option${b === r.bucket && !r.byType ? ' selected' : ''}>${esc(b)}</option>`)
            .join('')}</select>`,
    gOpt = (r) =>
      r.bucket === 'G&A'
        ? `<select data-mrgg="${esc(r.g)}" class="${r.own ? 'own' : ''}"><option value=""></option>${MR_GLGRP.map((g) => `<option${g === r.grp ? ' selected' : ''}>${esc(g)}</option>`).join('')}</select>`
        : '',
    cOpt = (r) =>
      r.ce === 'by name'
        ? '<span class="help" title="Inhouse Charge EQ: the cost element by the equipment name (Indirect tab)">by equipment name</span>'
        : mrIndB(r.bucket)
          ? `<select data-mrgc="${esc(r.g)}" class="${r.ce ? '' : 'none'}"><option value="">${r.ce ? '– take off –' : '– choose –'}</option>${ces.map((c) => `<option value="${esc(c)}"${c === r.ce ? ' selected' : ''}>${esc(c)}</option>`).join('')}</select>`
          : '',
    sel = (k, v, list, all) =>
      `<select data-mrfl="${k}"><option value="">${all}</option>${list.map((x) => `<option${x === v ? ' selected' : ''}>${esc(x)}</option>`).join('')}</select>`;
  return `${
    wait
      ? `<div class="mrstale"><b>${wait.toLocaleString('en-US')} line${wait === 1 ? ' waits' : 's wait'} for your GL changes</b> – they move at the next build<span class="sp"></span><button class="pri" data-mra="apply">↻ Rebuild with your rules</button><span class="help">uses the SAP files in your data file · your codes are kept</span></div>`
      : ''
  }<div class="mrlv"><b>GL list</b><span>every GL in this CJI3 and the built-in ones · its bucket, G&amp;A group and indirect cost element · change them here – a bucket you change is kept as your rule</span></div>
  <div class="mrflt"><input data-mrq placeholder="Search GL, name, code…" value="${esc(MRV.q || '')}">${sel('fb', fb, [...new Set(rows.map((r) => r.bucket))].filter(Boolean).sort(), 'Every bucket')}${sel('fc', fc, ['(none)', ...ces.filter((c) => rows.some((r) => r.ce === c))], 'Every indirect code')}<span class="help">${shown.length} of ${rows.length} GL${mine ? ` · <b>${mine} changed by you</b>` : ''}</span></div>
  <table class="mrtb mrgl"><thead><tr><th style="width:96px">GL</th><th>GL name</th><th style="width:220px">Bucket</th><th style="width:200px">G&amp;A group</th><th style="width:110px">Indirect code</th><th>Indirect name</th><th class="n" style="width:72px">Lines</th><th class="n" style="width:120px">Amount</th></tr></thead><tbody>${shown
    .map(
      (r) =>
        `<tr class="${r.n ? '' : 'zero'}${r.own ? ' own' : ''}"><td><b>${esc(r.g)}</b></td><td>${esc(r.nm || '')}${r.other.length ? `<div class="oth" title="lines on this GL that a document type or a special rule puts in another bucket">${r.other.map(([b, n]) => '→ ' + esc(b) + ' ' + n.toLocaleString('en-US')).join(' · ')} <span>by doc. type / special rule</span></div>` : ''}${r.wait ? ` <span class="mrw">${r.wait} wait</span>` : ''}</td><td>${bOpt(r)}</td><td>${gOpt(r)}</td><td>${cOpt(r)}</td><td class="help">${r.ce && r.ce !== 'by name' && mrIndB(r.bucket) ? esc(PS_NAMES[r.ce] || '') : ''}</td><td class="n">${r.n ? `<a class="lk" data-mrgl="${esc(r.g)}">${r.n.toLocaleString('en-US')}</a>` : '0'}</td><td class="n">${f(r.a)}</td></tr>`
    )
    .join(
      ''
    )}</tbody></table><div class="mrnote">Grey = no line on that GL in this CJI3 · amber = changed by you (Your rules) · lines with a document type that decides (SC, WA, AF, RV) or a special rule keep their bucket – shown after the name</div>`;
}
// document types: what each one decides
const MR_DT = {
  SC: ['subcontract certificate', 'Subcontractor (deductions: Subcontractor deductions)'],
  WA: ['goods issue', 'Material'],
  AF: ['depreciation', 'Asset depreciation'],
  RV: ['client invoice', 'a positive amount → Revenue › Client deductions'],
  ZY: ['accrual reversal', 'the bucket of the line it reverses'],
  UE: ['opening balance', 'keeps its bucket · Opening column'],
  ZB: ['opening balance', 'keeps its bucket · Opening column'],
  MD: ['opening balance', 'keeps its bucket · Opening column'],
  HT: ['opening balance', 'keeps its bucket · Opening column'],
};
function mrTabDt() {
  const per = new Map();
  for (let i = 0; i < N; i++) {
    if (L.uns[i] || L.b[i] < 0) continue;
    const t = S[L.ty[i]] || '(blank)',
      e = per.get(t) || per.set(t, { n: 0, a: 0 }).get(t);
    e.n++;
    e.a += L.amt[i];
  }
  REV.forEach((x) => {
    const t = S[x[7]] || '(blank)',
      e = per.get(t) || per.set(t, { n: 0, a: 0 }).get(t);
    e.n++;
    e.a += x[2];
  });
  const f = (v) => (Math.abs(v) < 0.5 ? '-' : fmt(v)),
    rows = [...per].sort((p, q) => (MR_DT[q[0]] ? 1 : 0) - (MR_DT[p[0]] ? 1 : 0) || q[1].n - p[1].n);
  return `<div class="mrlv"><b>Document types</b><span>checked first – a document type below decides the bucket; every other type goes by the GL list</span></div>
  <table class="mrtb mrgl"><thead><tr><th style="width:90px">Type</th><th style="width:220px">Meaning</th><th>Bucket</th><th class="n" style="width:90px">Lines</th><th class="n" style="width:130px">Amount</th></tr></thead><tbody>${rows
    .map(
      ([t, e]) =>
        `<tr class="${MR_DT[t] ? 'dec' : ''}"><td><b>${esc(t)}</b></td><td>${esc(MR_DT[t] ? MR_DT[t][0] : '')}</td><td>${MR_DT[t] ? `<b>${esc(MR_DT[t][1])}</b>` : '<span class="help">→ the GL list decides</span>'}</td><td class="n"><a class="lk" data-mrdt="${esc(t)}">${e.n.toLocaleString('en-US')}</a></td><td class="n">${f(e.a)}</td></tr>`
    )
    .join(
      ''
    )}</tbody></table><div class="mrnote">Bold = the document type decides · a rule of yours with a document type (Your rules) comes before these</div>`;
}
// WBS rules: one WBS per line and what is assigned on it – built-in (… .IN-02-1 payroll) and yours
function mrTabWbs() {
  const f = (v) => (Math.abs(v) < 0.5 ? '-' : fmt(v)),
    pay = new Map(),
    PAY = ['Salaries', 'Wages', 'Bonus'];
  for (let i = 0; i < N; i++) {
    if (L.uns[i] || L.b[i] < 0) continue;
    const w = S[L.wbs[i]];
    if (!/^[A-Z]-[A-Z0-9]+\.IN-02-1$/.test(w)) continue;
    const e = pay.get(w) || pay.set(w, { n: 0, a: 0 }).get(w);
    if (PAY.includes(S[L.cen[i]])) {
      e.n++;
      e.a += L.amt[i];
    }
  }
  const mine = ST.rules.map((r, i) => [r, i]).filter(([r]) => r.wbs),
    cnt = (r) => {
      let n = 0,
        a = 0;
      for (let i = 0; i < N; i++)
        if (ruleMatch(r, i)) {
          n++;
          a += L.amt[i];
        }
      return { n, a };
    },
    BKS = (META.bucketIds || BK.map((b) => b.id)).filter((b) => b !== 'Unclassified');
  const rows = [
    ...[...pay].map(
      ([w, e]) =>
        `<tr><td><b>${esc(w)}</b></td><td>GL name Salaries · Wages · Bonus</td><td><b>G&amp;A</b> · Other labour / payroll</td><td class="help">built-in</td><td class="n">${e.n.toLocaleString('en-US')}</td><td class="n">${f(e.a)}</td><td></td></tr>`
    ),
    ...mine.map(([r, i]) => {
      const c = cnt(r);
      return `<tr class="own"><td><input data-mrwr="${i}" data-f="wbs" value="${esc(r.wbs)}" placeholder="WBS starts with"></td><td>${[r.ce && 'GL ' + esc(r.ce), r.cen && 'GL name ' + esc(r.cen), r.type && 'doc. type ' + esc(r.type)].filter(Boolean).join(' · ') || '<span class="help">every line on it</span>'}</td><td><select data-mrwr="${i}" data-f="bucket"><option value="">– choose –</option>${BKS.map((b) => `<option${b === r.bucket ? ' selected' : ''}>${esc(b)}</option>`).join('')}</select>${r.bucket === 'G&A' ? ` <select data-mrwr="${i}" data-f="sub"><option value=""></option>${MR_GLGRP.map((g) => `<option${g === r.sub ? ' selected' : ''}>${esc(g)}</option>`).join('')}</select>` : ''}</td><td class="help">yours</td><td class="n">${c.n.toLocaleString('en-US')}</td><td class="n">${f(c.a)}</td><td><button data-mrwx="${i}" title="delete this rule">✕</button></td></tr>`;
    }),
  ];
  return `<div class="mrlv"><b>WBS rules</b><span>one WBS per line and what goes to it – checked before the special rules</span></div>
  <table class="mrtb mrgl"><thead><tr><th style="width:230px">WBS</th><th>Lines on it with</th><th style="width:330px">→ Bucket · group</th><th style="width:80px">Rule</th><th class="n" style="width:80px">Lines</th><th class="n" style="width:120px">Amount</th><th style="width:40px"></th></tr></thead><tbody>${rows.join('') || '<tr><td colspan="7" class="help">No WBS rule.</td></tr>'}</tbody></table>
  <div style="margin-top:8px"><button data-mra="wadd">+ Add a WBS rule</button> <span class="help">a WBS rule is one of your rules: it moves every line on that WBS (and below) at the next build</span></div>`;
}
// special rules: the few conditions that need more than a document type, a GL or a WBS
function mrTabSp() {
  const D = mrBucketData(),
    f = (v) => (Math.abs(v) < 0.5 ? '-' : fmt(v)),
    sp = [
      [2, 'Subcontract (SC) lines on GL Other Deduction or Main Material', 'Subcontractor deductions'],
      [MR_BOOK.findIndex((q) => /material number/.test(q.w[0][0])), 'A line with a material number (any document type)', 'Material'],
      [MR_BOOK.findIndex((q) => q.w[0][1] && q.w[0][1][0] === 'Spare Parts'), 'Spare Parts with no material number', 'Other direct cost'],
      [
        MR_BOOK.findIndex((q) => q.w[0][1] && q.w[0][1].includes('Main Material') && q.b === 'Other direct cost'),
        'Main / consumable material with no material number',
        'Other direct cost',
      ],
      [-1, 'Accrual reversal (ZY): the bucket of the line it reverses – same GL, same month, opposite amount', 'its pair'],
    ];
  return `<div class="mrlv"><b>Special rules</b><span>the few conditions that need more than a document type, a GL or a WBS</span><span class="sp"></span><a class="lk" data-mrt="b">Every condition in order ›</a></div>
  <table class="mrtb mrgl"><thead><tr><th>A line goes there when…</th><th style="width:240px">Bucket</th><th class="n" style="width:90px">Lines</th><th class="n" style="width:130px">Amount</th></tr></thead><tbody>${sp
    .filter(([k]) => k !== undefined && k >= -1)
    .map(([k, t, b]) => {
      const e = D.st.get(k) || { n: 0, a: 0 };
      return `<tr class="${e.n ? '' : 'zero'}"><td>${esc(t)}</td><td><b>${esc(b)}</b></td><td class="n">${e.n ? `<a class="lk" data-mrl="${k}">${e.n.toLocaleString('en-US')}</a>` : '0'}</td><td class="n">${f(e.a)}</td></tr>`;
    })
    .join(
      ''
    )}<tr><td>Inhouse Charge EQ (GL 30103100): the indirect cost element by the equipment name</td><td><b>Equipment / fuel</b> · SE by name</td><td class="n"></td><td class="n"></td></tr></tbody></table>`;
}
// Indirect: the final list – each head (filled) and its cost elements underneath, with their GLs and cost
const MR_HCOL = ['#1F4E9A', '#2A9D8F', '#C0504D', '#E9B949', '#8E5EA2', '#6D7B8D'];
function mrTabInd() {
  const D = mrIndData(),
    f = (v) => (Math.abs(v) < 0.5 ? '-' : fmt(v)),
    ces = MR_IGRP.flatMap(([, c]) => c),
    tot = D.groups.reduce((s, g) => s + g.ce.reduce((t, x) => t + x.a, 0), 0);
  return `<div class="mrlv"><b>Indirect</b><span>each head and its cost elements, with the GLs on them and their cost · change a GL in the GL list</span><span class="sp"></span><b>${f(tot)}</b></div>
  <table class="mrtb mrind"><thead><tr><th style="width:110px">Cost element</th><th style="width:330px">Name</th><th>GL on it</th><th class="n" style="width:80px">Lines</th><th class="n" style="width:130px">Amount</th></tr></thead><tbody>${D.groups
    .map((g, gi) => {
      const ga = g.ce.reduce((s, x) => s + x.a, 0),
        gn = g.ce.reduce((s, x) => s + x.n, 0);
      return (
        `<tr class="hd" style="--hc:${MR_HCOL[gi % MR_HCOL.length]}"><td colspan="3">${esc(g.g)} <span>· ${g.ce.filter((x) => x.n).length} of ${g.ce.length} cost elements in use</span></td><td class="n">${gn.toLocaleString('en-US')}</td><td class="n">${f(ga)}</td></tr>` +
        g.ce
          .map(
            (x) =>
              `<tr class="${x.n ? '' : 'zero'}" style="--hc:${MR_HCOL[gi % MR_HCOL.length]}"><td><b>${esc(x.k)}</b></td><td>${esc(x.name)}</td><td>${x.gls.map((y) => `<span class="ch${y.c ? ' lk' : ' z'}"${y.c ? ` data-mrg="${esc(y.g)}"` : ''}>${y.n ? esc(y.n) + ' ' : ''}<s>${esc(y.g)}</s></span>`).join('')}${x.eq ? `<span class="ch eqn${x.eq.n ? ' lk' : ''}"${x.eq.n ? ` data-mre="${x.k}"` : ''}>Inhouse Charge EQ <s>30103100</s> · <b>${esc(MR_EQW[x.k])}</b></span>` : ''}</td><td class="n">${x.n ? x.n.toLocaleString('en-US') : '-'}</td><td class="n">${f(x.a)}</td></tr>`
          )
          .join('')
      );
    })
    .join('')}</tbody></table>
  ${
    D.unplaced.length
      ? `<div class="mrun"><b>GL with indirect cost not on a cost element yet: ${D.unplaced.length}</b>${D.unplaced
          .map(
            (y) =>
              `<div class="mrup"><span class="ch lk" data-mrg="${esc(y.g)}">${esc(y.n || '')} <s>${esc(y.g)}</s></span> <span class="help">${f(y.a)}</span> → <select data-mrmv="${esc(y.g)}"><option value="">choose a cost element ▾</option>${ces.map((c) => `<option value="${esc(c)}">${esc(c)} · ${esc(PS_NAMES[c] || '')}</option>`).join('')}</select></div>`
          )
          .join('')}</div>`
      : '<div class="mrun ok"><b>Every GL with indirect cost has a cost element ✓</b></div>'
  }<div class="mrnote">${ST.indgl ? '<b>Your list</b> (changed from the built-in one) · <a class="lk" data-mra="indreset">Reset to built-in</a>' : 'The built-in list'} · grey = no line in this CJI3</div>`;
}
// a GL to another bucket / G&A group: kept as your rule (GL number → bucket), checked first at the next build
function mrGlSet(g, b, sub) {
  const base = mrGlRule(g, mrCalc().nm.get(g) || '');
  ST.rules = ST.rules.filter((r) => !(r.ce === g && !r.cen && !r.type && !r.wbs));
  if (b && (!base || base.b !== b || (b === 'G&A' && (sub || '') !== (base.g || ''))))
    ST.rules.unshift({ ce: g, cen: '', type: '', wbs: '', bucket: b, sub: b === 'G&A' ? sub || '' : '' });
  persist();
  MRV.c = null;
  renderRules();
  toast(b ? `GL ${g} → ${b}${b === 'G&A' && sub ? ' · ' + sub : ''} – rebuild to move its lines` : `GL ${g}: back to the built-in rule`);
}
const MR_TABS = [
  ['g', 'GL list', 'GL → bucket · group · indirect'],
  ['d', 'Document types', 'checked first'],
  ['w', 'WBS rules', 'one WBS per line'],
  ['s', 'Special rules', 'the few exceptions'],
  ['i', 'Indirect', 'heads and cost elements'],
  ['y', 'Your rules', 'your own rules · settings'],
];
function renderRules() {
  const um = mapUnmapped(),
    t = MRV.tab,
    on = t === 'b' ? 's' : t;
  $('rul').innerHTML =
    `<div class="mrpg"><div class="mrhd"><h2>Mapping rules</h2><span class="mrtabs">${MR_TABS.map(([k, l, d]) => `<button data-mrt="${k}" class="${on === k ? 'on' : ''}">${l}<small>${d}</small></button>`).join('')}</span><span class="sp"></span><span class="mrok ${um ? 'bad' : ''}">${um ? 'Lines without a bucket: ' + um.toLocaleString('en-US') : 'Unmapped lines: 0 ✓'}</span><button data-mra="xl" class="pri">⇩ Export to Excel</button></div>${mrStaleBar()}<div id="rulY"></div></div>`;
  const F = { g: mrTabGl, d: mrTabDt, w: mrTabWbs, s: mrTabSp, b: mrTab1, i: mrTabInd }[t];
  if (F) $('rulY').innerHTML = F();
  else renderYourRules();
}
$('rul').addEventListener('click', (e) => {
  const tb = e.target.closest('[data-mrt]');
  if (tb) {
    MRV.tab = tb.dataset.mrt;
    renderRules();
    return;
  }
  const fd = e.target.closest('[data-mrf]');
  if (fd) {
    const k = fd.dataset.mrf;
    if (MRV.fold.has(k)) MRV.fold.delete(k);
    else MRV.fold.add(k);
    renderRules();
    return;
  }
  const ac = e.target.closest('[data-mra]');
  if (ac) {
    const a = ac.dataset.mra;
    if (a === 'xl') mrExport();
    else if (a === 'apply') {
      if (DBF.db) updRebuild();
      else {
        MRV.tab = 'y';
        renderRules();
        toast('Apply your rules here: Apply rules – rebuild');
      }
    } else if (a === 'wadd') {
      ST.rules.push({ ce: '', cen: '', type: '', wbs: '', bucket: '', sub: '' });
      persist();
      renderRules();
      const w = [...document.querySelectorAll('#rul input[data-mrwr]')].pop();
      if (w) w.focus();
    } else if (a === 'indreset') mrIndSet(JSON.parse(JSON.stringify(IND_GL)), 'Indirect list: back to the built-in one');
    else if (a === 'rebuild') updRebuild();
    else {
      MRV.fold = a === 'open' ? new Set() : new Set([...MR_ORDER, 'zy', 'yours']);
      renderRules();
    }
    return;
  }
  const wx = e.target.closest('[data-mrwx]');
  if (wx) {
    ST.rules.splice(+wx.dataset.mrwx, 1);
    persist();
    MRV.c = null;
    renderRules();
    return;
  }
  const gll = e.target.closest('[data-mrgl]');
  if (gll) {
    const g = gll.dataset.mrgl,
      C = mrCalc(),
      idx = [];
    for (let i = 0; i < N; i++) if (C.r[i] !== -3 && S[L.ce[i]] === g) idx.push(i);
    if (idx.length) mrShow('GL ' + g + ' · ' + (C.nm.get(g) || ''), idx);
    else {
      const rv = REV.find((x) => S[x[4]] === g);
      if (rv) mrShowRev('GL ' + g + ' · ' + S[rv[5]], rv[3] ? 0 : 1, S[rv[5]]);
    }
    return;
  }
  const dt = e.target.closest('[data-mrdt]');
  if (dt) {
    const t = dt.dataset.mrdt,
      idx = [];
    for (let i = 0; i < N; i++) if (!L.uns[i] && L.b[i] >= 0 && (S[L.ty[i]] || '(blank)') === t) idx.push(i);
    mrShow('Document type ' + t, idx);
    return;
  }
  const x = e.target.closest('[data-mrx]');
  if (x) {
    e.stopPropagation();
    const [ce, gl] = x.dataset.mrx.split('|');
    mrIndSet(mrIndMove(gl, ''), `Indirect list: ${gl} taken off ${ce}`);
    return;
  }
  const pl = e.target.closest('[data-mrp]');
  if (pl) {
    MRV.add = pl.dataset.mrp;
    renderRules();
    const i = document.querySelector('#rul [data-mrin]');
    if (i) i.focus();
    return;
  }
  const ln = e.target.closest('[data-mrl]');
  if (ln) {
    const k = ln.dataset.mrl,
      c = ln.dataset.mrc || '',
      q = MR_BOOK[+k],
      lab =
        +k === -1
          ? 'Accrual reversals (ZY)'
          : +k === -2
            ? 'Your own rules'
            : +k === -4
              ? 'Sorted with older rules – rebuild'
              : `# ${+k + 1} → ${q.b}${q.g ? ' · ' + q.g : ''}`;
    if (+k === 0 || +k === 1) mrShowRev(lab + (c ? ' · ' + c : ''), +k, c);
    else mrShow(lab + (c ? ' · ' + c : ''), mrLines(k, c));
    return;
  }
  const gl = e.target.closest('[data-mrg]');
  if (gl) {
    const g = gl.dataset.mrg,
      C = mrCalc(),
      idx = [];
    for (let i = 0; i < N; i++) if (C.r[i] !== -3 && S[L.ce[i]] === g && MR_IND.includes(BK[L.b[i]].id)) idx.push(i);
    mrShow('Indirect · ' + (C.nm.get(g) || '') + ' ' + g, idx);
    return;
  }
  const eqb = e.target.closest('[data-mre]');
  if (eqb) {
    const k = eqb.dataset.mre,
      C = mrCalc(),
      idx = [];
    for (let i = 0; i < N; i++) {
      if (C.r[i] === -3 || S[L.ce[i]] !== '30103100' || !MR_IND.includes(BK[L.b[i]].id)) continue;
      const it = BK[L.b[i]].items[L.it[i]];
      if (eqCode(itemDesc(it) + ' ' + itemCode(it)) === k) idx.push(i);
    }
    mrShow(k + ' · Inhouse Charge EQ 30103100', idx);
  }
});
$('rul').addEventListener('change', (e) => {
  const gb = e.target.closest('[data-mrgb]');
  if (gb) {
    mrGlSet(gb.dataset.mrgb, gb.value, '');
    return;
  }
  const gg = e.target.closest('[data-mrgg]');
  if (gg) {
    mrGlSet(gg.dataset.mrgg, 'G&A', gg.value);
    return;
  }
  const gc = e.target.closest('[data-mrgc]');
  if (gc) {
    const g = gc.dataset.mrgc;
    if (g === '30103100') return;
    mrIndSet(mrIndMove(g, gc.value), gc.value ? `Indirect list: ${g} → ${gc.value}` : `Indirect list: ${g} taken off`);
    return;
  }
  const fl = e.target.closest('[data-mrfl]');
  if (fl) {
    MRV[fl.dataset.mrfl] = fl.value;
    renderRules();
    return;
  }
  const wr = e.target.closest('[data-mrwr]');
  if (wr) {
    ST.rules[+wr.dataset.mrwr][wr.dataset.f] = wr.value.trim();
    persist();
    MRV.c = null;
    renderRules();
    return;
  }
  const mv = e.target.closest('[data-mrmv]');
  if (mv && mv.value) {
    mrIndSet(mrIndMove(mv.dataset.mrmv, mv.value), `Indirect list: ${mv.dataset.mrmv} → ${mv.value}`);
    return;
  }
  const inp = e.target.closest('[data-mrin]');
  if (inp) {
    const gl = (String(inp.value).match(/\d{6,10}/) || [''])[0],
      ce = inp.dataset.mrin;
    if (!gl) {
      toast('Type a GL number (8 digits)');
      return;
    }
    if (gl === '30103100') {
      toast('30103100 Inhouse Charge EQ goes by the equipment name – it stays as it is');
      return;
    }
    mrIndSet(mrIndMove(gl, ce), `Indirect list: ${gl} → ${ce}`);
  }
});
$('rul').addEventListener('input', (e) => {
  const q = e.target.closest('[data-mrq]');
  if (!q) return;
  clearTimeout(MRV.qt);
  MRV.qt = setTimeout(() => {
    MRV.q = q.value;
    renderRules();
    const n = document.querySelector('#rul [data-mrq]');
    if (n) {
      n.focus();
      n.setSelectionRange(n.value.length, n.value.length);
    }
  }, 250);
});
$('rul').addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && e.target.closest('[data-mrin]')) {
    MRV.add = '';
    renderRules();
  }
});
// both tabs as one workbook: bucket › rule › GL (fold with + / −), cost element group › cost element › GL
async function mrExport() {
  const wb = new ExcelJS.Workbook(),
    NAVY = 'FF14254A',
    fill = (c) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: c } }),
    head = (ws, r) => {
      ws.getRow(r).eachCell((c) => {
        c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        c.fill = fill(NAVY);
        c.alignment = { vertical: 'middle', wrapText: true };
      });
      ws.getRow(r).height = 28;
    };
  {
    const wg = wb.addWorksheet('GL list', { properties: { tabColor: { argb: NAVY } }, views: [{ state: 'frozen', ySplit: 3 }] });
    wg.addRow([`Mapping rules · GL list · ${META.project} · cut ${ST.cut}`]).font = { bold: true, size: 14 };
    wg.addRow(['Every GL: bucket, G&A group, indirect cost element · "yours" = changed by you (kept as your rule)']);
    wg.addRow([
      'GL',
      'GL name',
      'Bucket',
      'Yours',
      'G&A group',
      'Indirect code',
      'Indirect name',
      'Lines',
      'Amount',
      'Lines in other buckets',
    ]);
    head(wg, 3);
    mrGlData().forEach((r) =>
      wg.addRow([
        r.g,
        r.nm,
        r.bucket + (r.byType ? ' (by doc. type)' : ''),
        r.own ? 'yours' : '',
        r.grp,
        r.ce,
        r.ce && r.ce !== 'by name' ? PS_NAMES[r.ce] || '' : '',
        r.n,
        r.a,
        r.other.map(([b, n]) => b + ' ' + n).join(' · '),
      ])
    );
    wg.columns = [
      { width: 12 },
      { width: 28 },
      { width: 30 },
      { width: 7 },
      { width: 26 },
      { width: 13 },
      { width: 40 },
      { width: 9 },
      { width: 16 },
      { width: 40 },
    ];
    wg.getColumn(8).numFmt = '#,##0';
    wg.getColumn(9).numFmt = '#,##0;[Red]-#,##0';
    wg.autoFilter = { from: 'A3', to: 'J3' };
  }
  const D = mrBucketData(),
    words = (q) => q.w.map(([t, c]) => [t, c ? c.join(' · ') : ''].filter(Boolean).join(' ')).join(' ');
  const ws = wb.addWorksheet('Bucket rules', {
    properties: { tabColor: { argb: NAVY }, outlineProperties: { summaryBelow: false } },
    views: [{ state: 'frozen', ySplit: 4 }],
  });
  ws.addRow([`Mapping rules · CJI3 line → bucket · ${META.project} · cut ${ST.cut}`]).font = { bold: true, size: 14 };
  ws.addRow([
    'The tool checks the conditions in the order of # · a line goes to the first one it meets · your own rules come first · + / − at the left folds',
  ]);
  ws.addRow([]);
  ws.addRow(['Bucket', '#', 'A line goes here when…', 'GL name', 'GL number', 'G&A group', 'Lines', 'Amount']);
  head(ws, 4);
  const put = (key, title, rows) => {
    const n = rows.reduce((s, r) => s + r.n, 0),
      a = rows.reduce((s, r) => s + r.a, 0),
      br = ws.addRow([title, '', rows.length + ' condition' + (rows.length === 1 ? '' : 's'), '', '', '', n, a]);
    br.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    br.eachCell({ includeEmpty: true }, (c) => (c.fill = fill('FF' + (MR_COL[key] || '#6D7B8D').slice(1))));
    for (const r of rows) {
      const cr = ws.addRow([title, r.no, r.txt, '', '', r.g || '', r.n, r.a]);
      cr.outlineLevel = 1;
      cr.font = { bold: true, color: { argb: r.n ? 'FF14254A' : 'FF9AA4B2' } };
      cr.eachCell({ includeEmpty: true }, (c) => (c.fill = fill('FFF2F5FA')));
      (r.gls || []).forEach((g) => {
        const ns = D.C.nums.get(g) || (MR_GLNO[g] ? [MR_GLNO[g]] : null),
          e = D.st.get(r.k),
          gr = ws.addRow([title, r.no, '', g, ns ? [...ns].join(', ') : '(not in this CJI3)', r.g || '', (e && e.gl.get(g)) || 0, '']);
        gr.outlineLevel = 2;
        if (!ns) gr.font = { color: { argb: 'FF9AA4B2' } };
      });
    }
  };
  for (const [b, ks] of D.groups)
    put(
      b,
      b,
      ks.map((k) => {
        const e = D.st.get(k) || { n: 0, a: 0 },
          q = MR_BOOK[k];
        return { k, no: k + 1, txt: words(q), g: q.g, n: e.n, a: e.a, gls: q.w.filter((w) => w[1] && !w[2]).flatMap((w) => w[1]) };
      })
    );
  {
    const z = D.st.get(-1) || { n: 0, a: 0 };
    put('zy', 'Accrual reversals (ZY)', [
      {
        k: -1,
        no: MR_BOOK.length + 1,
        txt: 'Document type is ZY (accrual reversal) → the bucket of the line it reverses (same GL, same month, opposite amount)',
        n: z.n,
        a: z.a,
      },
    ]);
  }
  if (D.st.get(-2))
    put('yours', 'Your own rules', [
      { k: -2, no: 0, txt: ST.rules.length + ' rules – see the tool, Mapping rules › tab 3', n: D.st.get(-2).n, a: D.st.get(-2).a },
    ]);
  ws.columns = [{ width: 26 }, { width: 5 }, { width: 60 }, { width: 26 }, { width: 22 }, { width: 24 }, { width: 9 }, { width: 16 }];
  ws.getColumn(7).numFmt = '#,##0';
  ws.getColumn(8).numFmt = '#,##0;[Red]-#,##0';
  ws.getColumn(3).alignment = { wrapText: true, vertical: 'top' };
  ws.autoFilter = { from: 'A4', to: 'H4' };
  // indirect
  const I = mrIndData(),
    wi = wb.addWorksheet('Indirect rules', {
      properties: { tabColor: { argb: 'FF6D7B8D' }, outlineProperties: { summaryBelow: false } },
      views: [{ state: 'frozen', ySplit: 5 }],
    });
  wi.addRow([`Mapping rules · indirect line → PKG Indirect + cost element · ${META.project} · cut ${ST.cut}`]).font = {
    bold: true,
    size: 14,
  };
  wi.addRow([
    'For the lines in G&A · Equipment / fuel · Fleet / transportation · House rent · Asset depreciation · PKG = Indirect · MNL = EQU for Equipment / fuel and Fleet, OTHER for the rest',
  ]);
  wi.addRow([
    "Cost element = by the GL that carries most of the item's cost · GL 30103100 Inhouse Charge EQ by the equipment name · your own code on an item always wins",
  ]);
  wi.addRow([]);
  wi.addRow(['Group', 'Cost element', 'Name', 'GL number', 'GL name', 'Lines', 'Amount']);
  head(wi, 5);
  for (const g of I.groups) {
    const gr = wi.addRow([
      g.g,
      '',
      g.ce.length + ' cost elements',
      '',
      '',
      g.ce.reduce((s, x) => s + x.n, 0),
      g.ce.reduce((s, x) => s + x.a, 0),
    ]);
    gr.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    gr.eachCell({ includeEmpty: true }, (c) => (c.fill = fill('FF6D7B8D')));
    for (const x of g.ce) {
      const cr = wi.addRow([g.g, x.k, x.name, x.gls.length ? x.gls.length + ' GL' : x.eq ? '' : '(no GL yet)', '', x.n, x.a]);
      cr.outlineLevel = 1;
      cr.font = { bold: true, color: { argb: x.gls.length || x.eq ? 'FF14254A' : 'FF9AA4B2' } };
      cr.eachCell({ includeEmpty: true }, (c) => (c.fill = fill('FFF2F5FA')));
      x.gls.forEach((y) => (wi.addRow([g.g, x.k, x.name, y.g, y.n || '(not in this CJI3)', y.c, y.a]).outlineLevel = 2));
      if (x.eq) {
        const r = wi.addRow([g.g, x.k, x.name, '30103100', 'Inhouse Charge EQ – name: ' + MR_EQW[x.k], x.eq.n, x.eq.a]);
        r.outlineLevel = 2;
        r.font = { italic: true };
      }
    }
  }
  const un = wi.addRow([
    'Not on the list yet',
    '',
    I.unplaced.length + ' GL with indirect cost – no cost element',
    '',
    '',
    I.unplaced.reduce((s, x) => s + x.c, 0),
    I.unplaced.reduce((s, x) => s + x.a, 0),
  ]);
  un.font = { bold: true };
  un.eachCell({ includeEmpty: true }, (c) => (c.fill = fill('FFFFF3CD')));
  I.unplaced.forEach((y) => (wi.addRow(['Not on the list yet', '', '', y.g, y.n, y.c, y.a]).outlineLevel = 1));
  wi.columns = [{ width: 28 }, { width: 13 }, { width: 46 }, { width: 14 }, { width: 40 }, { width: 9 }, { width: 16 }];
  wi.getColumn(6).numFmt = '#,##0';
  wi.getColumn(7).numFmt = '#,##0;[Red]-#,##0';
  wi.autoFilter = { from: 'A5', to: 'G5' };
  const buf = await wb.xlsx.writeBuffer();
  dl(
    new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    `Mapping_rules_${META.project}_${ST.cut}.xlsx`
  );
  toast('Mapping rules exported');
}
// for the checks (test/run.js): every CJI3 line has a rule of the book whose bucket is the line's bucket (else it is one of your rules)
globalThis.__MR = {
  calc: mrCalc,
  book: MR_BOOK,
  ind: mrIndData,
  bucket: mrBucketData,
  check: () => {
    const C = mrCalc(),
      by = {};
    let n = 0,
      a = 0;
    for (let i = 0; i < N; i++) {
      if (C.r[i] === -3) continue;
      n++;
      a += L.amt[i];
      by[C.r[i]] = (by[C.r[i]] || 0) + 1;
    }
    const cd = REV.filter((x) => !x[3]).reduce((t, x) => t + x[2], 0);
    return {
      n,
      a: Math.round(a * 100) / 100,
      cd: Math.round(cd * 100) / 100,
      rev: REV.length,
      by,
      yours: META.yours || 0,
      unclassified: META.unclassified || 0,
      cost: META.cost,
      N,
    };
  },
};
