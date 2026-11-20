// =====================================================================================  Budget: the cost report's budget (Direct plan + Cost Analysis), progress, PKG pages (EVM, ETC, EAC)
// Read once from the owner's cost report workbook (.xlsb / .xlsx), kept in the register (ST.bud) and in the data file.
// PKG page = the cost report's PKG sheet, resource-wise: budget (Cost Analysis) · earned value (progress × resource qty) ·
// actuals (the register's coding: PKG + cost element) · add / omission · provision · ETC (qty × rate, typed) · EAC · VAC · actual losses.
const BUD_GRP = { M: 'MAT', S: 'SUB', L: 'LAB', E: 'EQU' };
const BUD_GN = { MAT: 'Material', SUB: 'Subcontractor', LAB: 'Labor', EQU: 'Equipment', OTHER: 'Other', ACC: 'Accruals' };
const BUD_GC = { MAT: '#1F4E9A', SUB: '#E07B39', LAB: '#7CB342', EQU: '#E9B949', OTHER: '#6D7B8D', ACC: '#8E5EA2' };
const BUD_ORDER = ['MAT', 'SUB', 'LAB', 'EQU', 'OTHER', 'ACC'];
const budNum = (v) => (typeof v === 'number' ? v : +String(v || '').replace(/,/g, '') || 0);
const budStr = (v) => (v === undefined || v === null ? '' : String(v).trim());

// ---------------------------------------------------------------- read the cost report workbook
function budRead(wb, file) {
  const sh = (n) => wb.Sheets[wb.SheetNames.find((x) => x.trim().toLowerCase() === n.toLowerCase())];
  const dp = sh('Direct plan'),
    ca = sh('Cost Analysis');
  if (!dp || !ca) throw new Error('no "Direct plan" and "Cost Analysis" sheets – is this the cost report?');
  const rows = (ws) => XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });
  const D = rows(dp),
    A = rows(ca);
  // Direct plan: the header row has "Item code"; building types before "Contract Quantity"; take-off before "Takeoff B1"; done before "EV Q.B1"
  const hr = D.findIndex((r) => r.some((x) => /^item code$/i.test(budStr(x))));
  if (hr < 0) throw new Error('Direct plan: no "Item code" header');
  const H = D[hr].map((x) => budStr(x).replace(/\s+/g, ' ')),
    col = (re, from = 0) => H.findIndex((x, i) => i >= from && re.test(x));
  const cItem = col(/^item code$/i),
    cPkg = col(/^pkg$/i),
    // two "Division" columns: 02 / 03 … and S02 / S03 … – the register's PKG codes are the S-codes
    cDiv = (() => {
      const cs = H.map((x, i) => (/^division$/i.test(x) ? i : -1)).filter((i) => i >= 0),
        sample = D.slice(hr + 1, hr + 80).filter((r) => budStr(r[cItem]));
      return cs.find((c) => sample.some((r) => /^[A-Z]+\d/.test(budStr(r[c])))) ?? -1;
    })(),
    cDesc = col(/^description$/i),
    cUnit = col(/^unit$/i),
    cCQ = col(/contract quantity/i),
    cTO = col(/^takeoff b1$/i),
    cEV = col(/^ev q\.?\s*b1$/i);
  if ([cItem, cPkg, cTO, cEV].some((c) => c < 0)) throw new Error('Direct plan: missing columns (Item code, PKG, Takeoff B1, EV Q.B1)');
  const firstBT = cUnit >= 0 ? cUnit + 1 : cCQ - 13,
    bts = H.slice(firstBT, cCQ).filter(Boolean);
  const nb = bts.length,
    to0 = cTO - nb,
    ev0 = cEV - nb;
  const items = [],
    divMap = {},
    names = {};
  for (const r of D.slice(hr + 1)) {
    const code = budStr(r[cItem]),
      pkg = budStr(r[cPkg]);
    if (!pkg) continue;
    if (!code) {
      if (!names[pkg] && cDesc >= 0 && budStr(r[cDesc])) names[pkg] = budStr(r[cDesc]).replace(/^DIVISION\s+\d+\s*-\s*/i, '');
      continue;
    }
    const div = cDiv >= 0 ? budStr(r[cDiv]) : '';
    if (div && !divMap[div]) divMap[div] = pkg;
    items.push({
      c: code,
      p: pkg,
      d: cDesc >= 0 ? budStr(r[cDesc]) : '',
      u: cUnit >= 0 ? budStr(r[cUnit]) : '',
      tq: Array.from({ length: nb }, (_, k) => budNum(r[to0 + k])),
      dq: Array.from({ length: nb }, (_, k) => budNum(r[ev0 + k])),
    });
  }
  // Cost Analysis: header "Cost Code" (row 3), sub-headers one row below (Res Unit, Budget Rate, TAKE OFF, BAC, Resource takeoff …)
  const ar = A.findIndex((r) => r.some((x) => /^cost code$/i.test(budStr(x))));
  if (ar < 0) throw new Error('Cost Analysis: no "Cost Code" header');
  const A1 = A[ar].map(budStr),
    A2 = (A[ar + 1] || []).map((x) => budStr(x).replace(/\s+/g, ' ')),
    ac = (re, h = A1) => h.findIndex((x) => re.test(x));
  const kCode = ac(/^cost code$/i),
    kLvl = ac(/^level$/i),
    kCsi = ac(/^csi code$/i),
    kExp = ac(/^exp code$/i),
    kCe = ac(/^cost element code$/i),
    kName = ac(/^description$/i),
    kUnit = ac(/^res unit/i, A2),
    kTO = ac(/^take ?off$/i, A2),
    kBAC = ac(/^bac$/i, A2),
    kRQ = ac(/^resource takeoff/i, A2);
  if ([kCode, kCsi, kCe, kTO, kBAC, kRQ].some((c) => c < 0))
    throw new Error('Cost Analysis: missing columns (Cost Code, CSI Code, Cost Element Code, TAKE OFF, BAC, Resource takeoff)');
  const res = [];
  for (const r of A.slice(ar + 2)) {
    const ce = budStr(r[kCe]),
      pkg = budStr(r[kCsi]),
      code = budStr(r[kCode]);
    if (!ce || !pkg || !code || (kLvl >= 0 && budNum(r[kLvl]) < 4)) continue;
    const bac = budNum(r[kBAC]),
      rq = budNum(r[kRQ]);
    if (!bac && !rq) continue;
    res.push({
      p: pkg,
      g: BUD_GRP[budStr(r[kExp]).toUpperCase()] || 'OTHER',
      ce,
      n: kName >= 0 ? budStr(r[kName]) : '',
      u: kUnit >= 0 ? budStr(r[kUnit]) : '',
      i: code,
      tq: budNum(r[kTO]),
      rq,
      bac,
    });
  }
  // PKG names: the Summary sheet (code · name), else the Direct plan division rows
  const sm = sh('Summary');
  if (sm)
    for (const r of rows(sm)) {
      const c = budStr(r[0]);
      if (/^[A-Z]{2,4}-\d+$/.test(c) && budStr(r[1])) names[c] = budStr(r[1]);
    }
  return { file, at: new Date().toISOString(), bts, items, res, divMap, names };
}

// ---------------------------------------------------------------- the figures of one PKG, or all of them
const budKey = (p, ce) => p + '|' + ce;
const budX = (k) => (ST.bx || {})[k] || {};
const budDone = (it) => (ST.bdone && ST.bdone[it.c]) || it.dq;
// a register PKG code (S03, or STR-03 itself) → the cost report PKG
let BIX = null; // lookups of the budget read (not saved)
function budIndex() {
  const B = ST.bud;
  if (!BIX || BIX.b !== B)
    BIX = { b: B, pk: new Set(B.res.map((r) => r.p).concat(B.items.map((x) => x.p))), itemOf: new Map(B.items.map((x) => [x.c, x])) };
  return BIX;
}
const budPkgOf = (pkg) => {
  const B = ST.bud;
  if (!B || !pkg) return '';
  if (budIndex().pk.has(pkg)) return pkg;
  return B.divMap[pkg] || '';
};
function budCalc() {
  const B = ST.bud;
  if (!B) return null;
  const X = budIndex();
  const pk = new Map(); // pkg → Map(ce → row)
  const rowOf = (p, ce, g) => {
    let m = pk.get(p);
    if (!m) pk.set(p, (m = new Map()));
    let r = m.get(ce);
    if (!r) m.set(ce, (r = { p, ce, g, n: '', u: '', rq: 0, bac: 0, evq: 0, ev: 0, aq: 0, aa: 0, nb: true }));
    return r;
  };
  // budget and earned value: per resource of each BOQ item – EV qty = the item's done qty × the resource qty per item unit
  for (const x of B.res) {
    const r = rowOf(x.p, x.ce, x.g);
    r.nb = false;
    r.g = x.g;
    if (!r.n) r.n = x.n;
    if (!r.u) r.u = x.u;
    r.rq += x.rq;
    r.bac += x.bac;
    const it = X.itemOf.get(x.i);
    if (it && x.tq) {
      const done = budDone(it).reduce((s, v) => s + budNum(v), 0),
        q = (done * x.rq) / x.tq;
      r.evq += q;
      r.ev += x.rq ? (q * x.bac) / x.rq : 0;
    }
  }
  // actuals: the register's to-date cost, by its PKG and cost element (a cost element not in the budget is its own line, in its MNL group)
  let off = 0;
  if (R.exp)
    for (const e of R.exp.values()) {
      let a = 0,
        q = 0;
      for (let p = 0; p < e.p.length - 1; p++) {
        a += e.p[p];
        q += e.q[p];
      }
      if (!a && !q) continue;
      const p = budPkgOf(e.pkg);
      if (!p) {
        off += a;
        continue;
      }
      const ce = e.ce || '(no cost element)',
        has = pk.get(p) && pk.get(p).get(ce),
        r = has || rowOf(p, ce, BUD_GN[e.mnl] ? e.mnl : 'OTHER');
      if (!has) r.n = e.ce ? '' : 'coded to this PKG without a cost element';
      r.aq += q;
      r.aa += a;
    }
  // the typed figures and the rest of the row
  for (const m of pk.values())
    for (const r of m.values()) {
      const x = budX(budKey(r.p, r.ce));
      r.ur = r.rq ? r.bac / r.rq : 0;
      r.aur = r.aq ? r.aa / r.aq : 0;
      r.aoq = budNum(x.aq);
      r.aou = budNum(x.au);
      r.ao = r.aoq * r.aou;
      r.pq = budNum(x.pq);
      r.pu = budNum(x.pu);
      r.pv = r.pq * r.pu;
      r.qv = r.evq - r.aq - r.aoq;
      r.ac = r.aa + r.ao + r.pv;
      r.cv = r.ev - r.ac;
      r.eq = x.eq !== undefined && x.eq !== '' ? budNum(x.eq) : r.nb ? 0 : Math.max(0, r.rq - r.evq);
      r.er = x.er !== undefined && x.er !== '' ? budNum(x.er) : r.nb ? r.aur : r.ur;
      r.etc = r.eq * r.er;
      r.eac = r.ac + r.etc;
      r.vac = r.bac - r.eac;
      r.used = r.aq + r.aoq + r.pq;
      r.loss = r.evq - r.used;
      r.lossp = r.rq ? r.loss / r.rq : 0;
    }
  return { pk, off };
}
const BUD_SUM = ['bac', 'ev', 'aa', 'ao', 'pv', 'ac', 'cv', 'etc', 'eac', 'vac'];
const budSum = (rows) => {
  const t = Object.fromEntries(BUD_SUM.map((k) => [k, 0]));
  rows.forEach((r) => BUD_SUM.forEach((k) => (t[k] += r[k] || 0)));
  t.cpi = t.ac ? t.ev / t.ac : 0;
  return t;
};
const budPkgs = (C) => [...C.pk.keys()].sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
const budName = (p) => (ST.bud && ST.bud.names[p]) || '';

// ---------------------------------------------------------------- formatting (amounts in thousands on screen)
const bK = (v) => (Math.abs(v) < 50 ? '-' : (v / 1000).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 }));
const bQ = (v) => (Math.abs(v) < 0.005 ? '-' : v.toLocaleString('en-US', { maximumFractionDigits: Math.abs(v) >= 100 ? 0 : 2 }));
const bP = (v) => (Math.abs(v) < 0.005 ? '-' : Math.round(100 * v) + '%');
const bCol = (v) => (Math.abs(v) < 50 ? '' : v < 0 ? ' style="color:#B42318"' : ' style="color:#1E7B34"');
const bIn = (k, f, v, ph) =>
  `<input class="bd-in" data-bx="${esc(k)}" data-bf="${f}" value="${v === undefined || v === '' ? '' : esc(String(v))}" placeholder="${ph || ''}">`;

// ---------------------------------------------------------------- pages
function renderBudget() {
  const el = $('bud');
  if (!ST.bud) {
    el.innerHTML = `<div class="bd-empty"><h2>Budget</h2><p>Read your <b>cost report</b> (the workbook with <i>Direct plan</i> and <i>Cost Analysis</i>, .xlsb or .xlsx): the budget per PKG and resource, the BOQ items and their progress come from it. Your actuals come from this register's coding (PKG + cost element).</p><button class="pri" data-bud="read">Read the cost report…</button> <span class="bd-sub">or drop it here</span></div>`;
    return;
  }
  const C = budCalc();
  if (ST.tab === 'bprog') return budProgress(el);
  if (ST.tab === 'bpkg' && ST.bpk && C.pk.has(ST.bpk)) return budPkgPage(el, C, ST.bpk);
  return budSummary(el, C);
}
function budHead(title, sub) {
  return `<div class="bd-hd"><h2>${title}</h2><span class="bd-sub">${sub}</span><span class="bd-sp"></span><span class="bd-sub">cost report: ${esc(ST.bud.file || '')} · read ${esc(String(ST.bud.at).slice(0, 10))}</span><button data-bud="read">Read again…</button></div>`;
}
// All PKGs: one row per PKG, like the cost report's Summary
function budSummary(el, C) {
  const ps = budPkgs(C),
    rs = ps.map((p) => ({ p, ...budSum([...C.pk.get(p).values()]) })),
    T = budSum(rs),
    ind = (t) =>
      !t.ac
        ? ''
        : t.cpi >= 1
          ? '<span class="bd-ok">on / under</span>'
          : t.cpi >= 0.85
            ? '<span class="bd-w">over</span>'
            : '<span class="bd-bad">over</span>';
  el.innerHTML =
    budHead('Budget · All PKGs', 'amounts in thousands (EGP 000) · click a PKG for its page') +
    budKpi(T) +
    `<div class="bd-wrap"><table class="bd-t"><tr><th>PKG</th><th class="bd-l">Name</th><th>BAC</th><th>EV</th><th>% earned</th><th>Actual</th><th>Add / omit</th><th>Provision</th><th>AC</th><th>CV</th><th>CPI</th><th>ETC</th><th>EAC</th><th>VAC</th><th>Status</th></tr>${rs
      .map(
        (r) =>
          `<tr class="bd-r bd-go" data-bp="${esc(r.p)}"><td><b>${esc(r.p)}</b></td><td class="bd-l">${esc(budName(r.p))}</td><td class="n">${bK(r.bac)}</td><td class="n">${bK(r.ev)}</td><td class="n">${r.bac ? bP(r.ev / r.bac) : '-'}</td><td class="n">${bK(r.aa)}</td><td class="n">${bK(r.ao)}</td><td class="n">${bK(r.pv)}</td><td class="n b">${bK(r.ac)}</td><td class="n"${bCol(r.cv)}>${bK(r.cv)}</td><td class="n">${r.ac ? r.cpi.toFixed(2) : '-'}</td><td class="n">${bK(r.etc)}</td><td class="n b">${bK(r.eac)}</td><td class="n"${bCol(r.vac)}>${bK(r.vac)}</td><td>${ind(r)}</td></tr>`
      )
      .join(
        ''
      )}<tr class="bd-tot"><td colspan="2">TOTAL direct · ${ps.length} PKGs</td><td class="n">${bK(T.bac)}</td><td class="n">${bK(T.ev)}</td><td class="n">${T.bac ? bP(T.ev / T.bac) : '-'}</td><td class="n">${bK(T.aa)}</td><td class="n">${bK(T.ao)}</td><td class="n">${bK(T.pv)}</td><td class="n">${bK(T.ac)}</td><td class="n">${bK(T.cv)}</td><td class="n">${T.ac ? T.cpi.toFixed(2) : '-'}</td><td class="n">${bK(T.etc)}</td><td class="n">${bK(T.eac)}</td><td class="n">${bK(T.vac)}</td><td></td></tr></table></div>
    <div class="bd-note">Actual = the register's cost coded to a PKG of the cost report (its code, or the Direct plan division code such as S03) · cost coded to other PKGs or not coded: <b>${bK(C.off)}</b> thousand – not in this page · AC = actual + add / omission + provision · EAC = AC + ETC · VAC = BAC − EAC</div>`;
}
function budKpi(T) {
  const k = (l, v, c) => `<div class="bd-k"><i>${l}</i><b${c || ''}>${v}</b></div>`;
  return `<div class="bd-kp">${k('BAC', bK(T.bac))}${k('EV', bK(T.ev))}${k('AC', bK(T.ac))}${k('CV', bK(T.cv), bCol(T.cv))}${k('CPI', T.ac ? T.cpi.toFixed(2) : '-')}${k('ETC', bK(T.etc))}${k('EAC', bK(T.eac))}${k('VAC', bK(T.vac), bCol(T.vac))}</div>`;
}
// the PKG page: the PKG sheet, resource-wise, grouped by MNL with the bucket colours
const BUD_COLS = [
  [
    'Budget',
    [
      ['Take-off qty', (r) => bQ(r.rq)],
      ['UR', (r) => bQ(r.ur)],
      ['Total budget', (r) => bK(r.bac), 'bac'],
    ],
  ],
  [
    'Earned Value',
    [
      ['Qty', (r) => bQ(r.evq)],
      ['Fluctuation', () => '-'],
      ['Amount', (r) => bK(r.ev), 'ev'],
    ],
  ],
  ['Qty variance', [['EV − actual qty', (r) => bQ(r.qv)]]],
  [
    'Actuals (register)',
    [
      ['QTY', (r) => bQ(r.aq)],
      ['UR', (r) => bQ(r.aur)],
      ['Amount', (r) => bK(r.aa), 'aa'],
    ],
  ],
  [
    'Add / Omission',
    [
      ['QTY', (r) => bIn(budKey(r.p, r.ce), 'aq', budX(budKey(r.p, r.ce)).aq)],
      ['UR', (r) => bIn(budKey(r.p, r.ce), 'au', budX(budKey(r.p, r.ce)).au)],
      ['Amount', (r) => bK(r.ao), 'ao'],
    ],
  ],
  [
    'Provision',
    [
      ['QTY', (r) => bIn(budKey(r.p, r.ce), 'pq', budX(budKey(r.p, r.ce)).pq)],
      ['UR', (r) => bIn(budKey(r.p, r.ce), 'pu', budX(budKey(r.p, r.ce)).pu)],
      ['Amount', (r) => bK(r.pv), 'pv'],
    ],
  ],
  [
    'Current Cost Variance',
    [
      ['Grand total', (r) => `<b>${bK(r.ac)}</b>`, 'ac'],
      ['CV', (r) => `<span${bCol(r.cv)}>${bK(r.cv)}</span>`, 'cv'],
    ],
  ],
  [
    'ETC',
    [
      ['Qty', (r) => bIn(budKey(r.p, r.ce), 'eq', budX(budKey(r.p, r.ce)).eq, bQ(r.eq))],
      ['Rate', (r) => bIn(budKey(r.p, r.ce), 'er', budX(budKey(r.p, r.ce)).er, bQ(r.er))],
      ['Amount (ETC)', (r) => bK(r.etc), 'etc'],
    ],
  ],
  [
    'At completion',
    [
      ['EAC', (r) => `<b>${bK(r.eac)}</b>`, 'eac'],
      ['VAC', (r) => `<span${bCol(r.vac)}>${bK(r.vac)}</span>`, 'vac'],
    ],
  ],
  [
    'Actual losses',
    [
      ['Used qty', (r) => bQ(r.used)],
      ['Actual loss', (r) => bQ(r.loss)],
      ['Actual loss %', (r) => bP(r.lossp)],
    ],
  ],
];
function budPkgPage(el, C, p) {
  const m = C.pk.get(p),
    all = [...m.values()],
    T = budSum(all);
  const cols = BUD_COLS.flatMap(([g, cs]) => cs.map((c, i) => ({ g, h: c[0], f: c[1], s: c[2], first: i === 0 })));
  const head =
    `<tr><th colspan="3"></th>${BUD_COLS.map(([g, cs]) => `<th colspan="${cs.length}" class="bd-gs">${g}</th>`).join('')}</tr>` +
    `<tr><th>Code</th><th class="bd-l">Cost element</th><th>Res. unit</th>${cols.map((c) => `<th class="${c.first ? 'bd-gs' : ''}">${c.h}</th>`).join('')}</tr>`;
  const sumRow = (lab, t, cls, bc) =>
    `<tr class="${cls}"${bc ? ` style="--bc:${bc}"` : ''}><td colspan="3">${lab}</td>${cols.map((c) => `<td class="n${c.first ? ' bd-gs' : ''}">${c.s ? bK(t[c.s]) : ''}</td>`).join('')}</tr>`;
  let body = '';
  for (const g of BUD_ORDER) {
    const rs = all.filter((r) => r.g === g).sort((a, b) => b.bac - a.bac || b.aa - a.aa);
    if (!rs.length) continue;
    const bc = BUD_GC[g];
    body +=
      `<tr class="bd-grp" style="--bc:${bc}"><td colspan="${cols.length + 3}">${BUD_GN[g]} · MNL ${g} · ${rs.length} lines</td></tr>` +
      rs
        .map(
          (r) =>
            `<tr class="bd-r${r.nb ? ' bd-nb' : ''}" style="--bc:${bc}"><td>${esc(r.ce)}</td><td class="bd-l bd-nm">${esc(r.n)}${r.nb ? ' <span class="bd-tag">no budget</span>' : ''}</td><td>${esc(r.u)}</td>${cols.map((c) => `<td class="n${c.first ? ' bd-gs' : ''}">${c.f(r)}</td>`).join('')}</tr>`
        )
        .join('') +
      sumRow('Sum ' + BUD_GN[g], budSum(rs), 'bd-sum', bc);
  }
  el.innerHTML =
    budHead(`${esc(p)} · ${esc(budName(p))}`, 'PKG · resource-wise · amounts in thousands (EGP 000) · yellow = you type it') +
    budKpi(T) +
    `<div class="bd-wrap"><table class="bd-t bd-pkg">${head}${body}${sumRow('TOTAL ' + esc(p), T, 'bd-tot')}</table></div>
    <div class="bd-note">Budget = take-off qty × UR (Cost Analysis) · EV qty = the BOQ items' done qty (Progress) × the resource qty per item unit · Qty variance = EV qty − actual qty − add/omit qty · Grand total = actual + add/omission + provision · CV = EV − grand total · ETC = qty × rate (qty starts at the remaining resource qty, rate at the UR – type over them) · EAC = grand total + ETC · VAC = total budget − EAC · actual loss = EV qty − used qty · a <span class="bd-tag">no budget</span> line: cost coded to this PKG with a cost element that is not one of its budget resources – fix the cost element in Coding, or give it an ETC</div>`;
}
// Progress: done qty per BOQ item and building type (B1) – starts from the Direct plan, you update it each month
function budProgress(el) {
  const B = ST.bud,
    ps = [...new Set(B.items.map((x) => x.p))].sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
  const p = ST.bprogP && ps.includes(ST.bprogP) ? ST.bprogP : ps[0];
  const its = B.items.filter((x) => x.p === p),
    used = B.bts.map((_, k) => its.some((x) => x.tq[k] || budDone(x)[k]));
  const ks = used.map((u, k) => (u ? k : -1)).filter((k) => k >= 0);
  el.innerHTML =
    budHead(
      'Progress',
      'done qty to date per BOQ item and building type (B1) · grey = take-off · yellow = done – type it, or paste a block from Excel'
    ) +
    `<div class="bd-bar">PKG <select data-bud="pp">${ps.map((x) => `<option ${x === p ? 'selected' : ''} value="${esc(x)}">${esc(x)} · ${esc(budName(x))}</option>`).join('')}</select></div>
    <div class="bd-wrap"><table class="bd-t bd-prog"><tr><th colspan="3"></th>${ks.map((k) => `<th colspan="2" class="bd-gs">${esc(B.bts[k])}</th>`).join('')}<th colspan="2" class="bd-gs">Item</th></tr>
    <tr><th>BOQ item</th><th class="bd-l">Description</th><th>Unit</th>${ks.map(() => '<th class="bd-gs">Take-off</th><th>Done</th>').join('')}<th class="bd-gs">Done / take-off</th><th>%</th></tr>${its
      .map((x) => {
        const d = budDone(x),
          td = x.tq.reduce((s, v) => s + v, 0),
          dd = d.reduce((s, v) => s + budNum(v), 0);
        return `<tr class="bd-r"><td>${esc(x.c)}</td><td class="bd-l">${esc(x.d)}</td><td>${esc(x.u)}</td>${ks.map((k) => `<td class="n bd-gs bd-to">${bQ(x.tq[k])}</td><td class="n">${x.tq[k] || budNum(d[k]) ? `<input class="bd-in" data-bd="${esc(x.c)}" data-bk="${k}" value="${budNum(d[k]) ? budNum(d[k]) : ''}">` : ''}</td>`).join('')}<td class="n bd-gs"><b>${bQ(dd)}</b> / ${bQ(td)}</td><td class="n">${td ? bP(dd / td) : '-'}</td></tr>`;
      })
      .join('')}</table></div>
    <div class="bd-note">Started from the Direct plan's EV quantities · the PKG pages follow at once · each change goes to Undo and to the data file</div>`;
}

// ---------------------------------------------------------------- the side navigation of Budget
function budSide(items) {
  items.push([
    'data-gt="bsum"',
    ST.tab === 'bsum',
    '#14254A',
    'All PKGs',
    '',
    ST.bud ? 'BAC · EV · AC · EAC per PKG' : 'read the cost report',
    '',
    undefined,
    'All',
  ]);
  if (!ST.bud) return;
  items.push(['data-gt="bprog"', ST.tab === 'bprog', '#2E7D32', 'Progress', '', 'done qty per BOQ item', '', undefined, 'Prg']);
  const C = budCalc();
  budPkgs(C).forEach((p, n) => {
    const t = budSum([...C.pk.get(p).values()]);
    items.push([
      `data-gt="bpkg" data-bp="${esc(p)}"`,
      ST.tab === 'bpkg' && ST.bpk === p,
      PAL[n % PAL.length],
      p + ' ' + budName(p),
      t.bac ? `<span${bCol(t.vac)}>${bK(t.vac)}</span>` : '',
      'VAC · EAC ' + bK(t.eac),
      '',
      undefined,
      p.replace(/^[A-Z]+-/, ''),
    ]);
  });
}

// ---------------------------------------------------------------- reading the file, typing, pasting
async function budFile(f) {
  toast('Reading the cost report… (a big workbook takes a few seconds)');
  await new Promise((r) => setTimeout(r, 30));
  try {
    const wb = XLSX.read(await f.arrayBuffer(), { type: 'array', sheets: ['Direct plan', 'Cost Analysis', 'Summary'] });
    const b = budRead(wb, f.name);
    const was = ST.bud;
    ST.bud = b;
    if (!ST.bdone) ST.bdone = {};
    persist();
    logIt(
      'Cost report read: ' +
        f.name +
        ' – ' +
        b.items.length +
        ' BOQ items, ' +
        b.res.length +
        ' resource lines' +
        (was ? ' (replaces ' + was.file + ')' : ''),
      1
    );
    if (ST.tab !== 'bpkg' && ST.tab !== 'bprog') ST.tab = 'bsum';
    render();
    toast(`Cost report read: ${b.items.length} BOQ items · ${b.res.length} resource lines · ${new Set(b.res.map((x) => x.p)).size} PKGs`);
  } catch (e) {
    toast('Could not read ' + f.name + ': ' + e.message);
  }
}
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-bud="read"]');
  if (b) {
    const i = document.createElement('input');
    i.type = 'file';
    i.accept = '.xlsb,.xlsx,.xlsm';
    i.onchange = () => i.files[0] && budFile(i.files[0]);
    i.click();
    return;
  }
  const g = e.target.closest('.bd-go[data-bp]');
  if (g && !e.target.closest('input')) {
    ST.tab = 'bpkg';
    ST.bpk = g.dataset.bp;
    render();
  }
});
document.addEventListener('change', (e) => {
  const t = e.target;
  if (t.matches('[data-bud="pp"]')) {
    ST.bprogP = t.value;
    render();
    return;
  }
  if (t.matches('input[data-bx]')) {
    const v = t.value.trim().replace(/,/g, '');
    change(
      [{ t: 'bx', k: t.dataset.bx, f: t.dataset.bf, v: v === '' ? undefined : v }],
      'Budget ' + t.dataset.bx.replace('|', ' · ') + ' · ' + t.dataset.bf
    );
    return;
  }
  if (t.matches('input[data-bd]')) {
    const v = t.value.trim().replace(/,/g, '');
    change([{ t: 'bd', k: t.dataset.bd, i: +t.dataset.bk, v: v === '' ? 0 : +v }], 'Progress ' + t.dataset.bd);
  }
});
// paste a block from Excel into the progress grid: it fills from the cell you are in, right and down
document.addEventListener('paste', (e) => {
  const t = e.target;
  if (!t.matches || !t.matches('input[data-bd]')) return;
  const txt = (e.clipboardData || window.clipboardData).getData('text');
  if (!/[\t\n]/.test(txt)) return;
  e.preventDefault();
  const grid = txt
    .replace(/\r/g, '')
    .replace(/\n$/, '')
    .split('\n')
    .map((l) => l.split('\t'));
  const rows = [...document.querySelectorAll('.bd-prog tr.bd-r')],
    r0 = rows.indexOf(t.closest('tr')),
    cells = (tr) => [...tr.querySelectorAll('input[data-bd]')],
    c0 = cells(rows[r0]).indexOf(t);
  const ch = [];
  grid.forEach((line, dr) => {
    const tr = rows[r0 + dr];
    if (!tr) return;
    line.forEach((v, dc) => {
      const inp = cells(tr)[c0 + dc];
      if (inp) ch.push({ t: 'bd', k: inp.dataset.bd, i: +inp.dataset.bk, v: budNum(v) });
    });
  });
  if (ch.length) change(ch, 'Progress pasted · ' + ch.length + ' cells');
});
// drop a cost report on the Budget page
document.addEventListener(
  'drop',
  (e) => {
    if (!['bsum', 'bprog', 'bpkg'].includes(ST.tab)) return;
    const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (!f || !/\.xls[bxm]$/i.test(f.name) || !e.target.closest('#bud')) return;
    e.preventDefault();
    e.stopPropagation();
    budFile(f);
  },
  true
);
// undo / redo of the typed budget figures and the progress
function budGet(c) {
  if (c.t === 'bx') return budX(c.k)[c.f];
  const it = ST.bud && ST.bud.items.find((x) => x.c === c.k);
  return it ? budNum(budDone(it)[c.i]) : 0;
}
function budSet(c, v) {
  if (c.t === 'bx') {
    if (!ST.bx) ST.bx = {};
    const o = { ...(ST.bx[c.k] || {}) };
    if (v === undefined || v === '') delete o[c.f];
    else o[c.f] = v;
    if (Object.keys(o).length) ST.bx[c.k] = o;
    else delete ST.bx[c.k];
    return;
  }
  const it = ST.bud && ST.bud.items.find((x) => x.c === c.k);
  if (!it) return;
  if (!ST.bdone) ST.bdone = {};
  const d = [...budDone(it)];
  d[c.i] = v;
  ST.bdone[c.k] = d;
}

// ---------------------------------------------------------------- Excel: a tab per PKG (the full figures) and a Budget summary
function budExport(wb) {
  if (!ST.bud) return;
  const C = budCalc(),
    ps = budPkgs(C),
    NAVYb = 'FF14254A';
  const hdr = (ws, r) => {
    ws.getRow(r).eachCell((c) => {
      c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVYb } };
      c.alignment = { wrapText: true, vertical: 'middle', horizontal: 'center' };
    });
  };
  const ws = wb.addWorksheet('Budget summary', { properties: { tabColor: { argb: NAVYb } } });
  ws.addRow([`Budget · ${META.project} · cut ${ST.cut} · cost report ${ST.bud.file}`]).font = { bold: true, size: 13 };
  ws.addRow([]);
  ws.addRow(['PKG', 'Name', 'BAC', 'EV', '% earned', 'Actual', 'Add / omit', 'Provision', 'AC', 'CV', 'CPI', 'ETC', 'EAC', 'VAC']);
  hdr(ws, 3);
  ps.forEach((p) => {
    const t = budSum([...C.pk.get(p).values()]);
    ws.addRow([p, budName(p), t.bac, t.ev, t.bac ? t.ev / t.bac : 0, t.aa, t.ao, t.pv, t.ac, t.cv, t.ac ? t.cpi : 0, t.etc, t.eac, t.vac]);
  });
  const T = budSum(ps.flatMap((p) => [...C.pk.get(p).values()]));
  const tr = ws.addRow([
    'TOTAL',
    '',
    T.bac,
    T.ev,
    T.bac ? T.ev / T.bac : 0,
    T.aa,
    T.ao,
    T.pv,
    T.ac,
    T.cv,
    T.ac ? T.cpi : 0,
    T.etc,
    T.eac,
    T.vac,
  ]);
  tr.font = { bold: true };
  ws.columns.forEach((c, i) => {
    c.width = i === 1 ? 34 : 15;
    if (i >= 2) c.numFmt = i === 4 ? '0%' : i === 10 ? '0.00' : '#,##0';
  });
  const HD = [
    'Cost element code',
    'Cost element',
    'Res. unit',
    'MNL',
    'Take-off qty',
    'UR',
    'Total budget',
    'EV qty',
    'Fluctuation',
    'EV amount',
    'EV − actual qty',
    'Actual qty',
    'Actual UR',
    'Actual amount',
    'Add/omit qty',
    'Add/omit UR',
    'Add/omit amount',
    'Provision qty',
    'Provision UR',
    'Provision amount',
    'Grand total',
    'CV',
    'ETC qty',
    'ETC rate',
    'ETC',
    'EAC',
    'VAC',
    'Used qty',
    'Actual loss',
    'Actual loss %',
  ];
  for (const p of ps) {
    const w = wb.addWorksheet(p.slice(0, 31), { properties: { tabColor: { argb: 'FF2F5597' } } });
    w.addRow([p, budName(p)]).font = { bold: true, size: 13 };
    w.addRow([]);
    w.addRow(HD);
    hdr(w, 3);
    const all = [...C.pk.get(p).values()];
    for (const g of BUD_ORDER) {
      const rs = all.filter((r) => r.g === g).sort((a, b) => b.bac - a.bac || b.aa - a.aa);
      if (!rs.length) continue;
      const gr = w.addRow([BUD_GN[g] + ' · MNL ' + g]);
      gr.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      gr.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + BUD_GC[g].slice(1) } };
      rs.forEach((r) =>
        w.addRow([
          r.ce,
          r.n + (r.nb ? ' (no budget)' : ''),
          r.u,
          g,
          r.rq,
          r.ur,
          r.bac,
          r.evq,
          0,
          r.ev,
          r.qv,
          r.aq,
          r.aur,
          r.aa,
          r.aoq,
          r.aou,
          r.ao,
          r.pq,
          r.pu,
          r.pv,
          r.ac,
          r.cv,
          r.eq,
          r.er,
          r.etc,
          r.eac,
          r.vac,
          r.used,
          r.loss,
          r.lossp,
        ])
      );
      const t = budSum(rs);
      w.addRow([
        'Sum ' + BUD_GN[g],
        '',
        '',
        '',
        '',
        '',
        t.bac,
        '',
        '',
        t.ev,
        '',
        '',
        '',
        t.aa,
        '',
        '',
        t.ao,
        '',
        '',
        t.pv,
        t.ac,
        t.cv,
        '',
        '',
        t.etc,
        t.eac,
        t.vac,
      ]).font = { bold: true };
    }
    const t = budSum(all);
    w.addRow([
      'TOTAL ' + p,
      '',
      '',
      '',
      '',
      '',
      t.bac,
      '',
      '',
      t.ev,
      '',
      '',
      '',
      t.aa,
      '',
      '',
      t.ao,
      '',
      '',
      t.pv,
      t.ac,
      t.cv,
      '',
      '',
      t.etc,
      t.eac,
      t.vac,
    ]).font = { bold: true };
    w.columns.forEach((c, i) => {
      c.width = i === 1 ? 34 : i < 4 ? 11 : 13;
      if (i >= 4) c.numFmt = i === 29 ? '0%' : '#,##0.00';
    });
    w.views = [{ state: 'frozen', xSplit: 2, ySplit: 3 }];
  }
}
globalThis.__BUD = {
  calc: budCalc,
  sum: budSum,
  exp: budExport,
  // tests: code an item the way Coding does (undo, log, data file)
  code: (bi, ii, pkg, mnl, ce) =>
    change(
      [
        { t: 'item', bi, ii, f: 'pkg', v: pkg },
        { t: 'item', bi, ii, f: 'mnl', v: mnl },
        { t: 'item', bi, ii, f: 'ce', v: ce },
      ],
      'test coding'
    ),
};
