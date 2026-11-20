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
    kRQ = ac(/^resource takeoff/i, A2),
    // the rest of the Cost Analysis line (the Cost Analysis tab shows it as the sheet does)
    kIName = ac(/^item name$/i),
    kIUnit = ac(/^unit$/i, A2),
    kIQty = ac(/^quantity$/i, A2),
    kUse = ac(/^res qty/i, A2),
    kWaste = ac(/^waste$/i, A2),
    kTot = ac(/^total re[cs]/i, A2),
    kSC = ac(/^sc unit/i, A2),
    kMat = ac(/^material unit/i, A2),
    kEq = ac(/^equipment unit/i, A2),
    kLab = ac(/^labo/i, A2),
    kOth = ac(/^other$/i, A2),
    kBR = ac(/^budget rate$/i, A2),
    gv = (r, k) => (k >= 0 ? budNum(r[k]) : 0);
  if ([kCode, kCsi, kCe, kTO, kBAC, kRQ].some((c) => c < 0))
    throw new Error('Cost Analysis: missing columns (Cost Code, CSI Code, Cost Element Code, TAKE OFF, BAC, Resource takeoff)');
  const res = [],
    cai = {}; // the BOQ items as Cost Analysis has them (level 3): name, unit, quantity
  for (const r of A.slice(ar + 2)) {
    const ce = budStr(r[kCe]),
      pkg = budStr(r[kCsi]),
      code = budStr(r[kCode]);
    if (code && pkg && !ce && kLvl >= 0 && budNum(r[kLvl]) === 3 && !cai[code])
      cai[code] = { n: budStr(r[kIName >= 0 ? kIName : kName]), u: kIUnit >= 0 ? budStr(r[kIUnit]) : '', q: gv(r, kIQty) };
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
      o: gv(r, kUse),
      w: gv(r, kWaste),
      t: gv(r, kTot),
      rt: [gv(r, kSC), gv(r, kMat), gv(r, kEq), gv(r, kLab), gv(r, kOth)],
      br: gv(r, kBR),
    });
  }
  // PKG names: the Summary sheet (code · name), else the Direct plan division rows
  // and the groups of the direct PKGs as the report has them: Civil work Packages · Arch work Packages · MEP …
  const sm = sh('Summary'),
    groups = [];
  if (sm) {
    let g = null,
      direct = false;
    for (const r of rows(sm)) {
      const c = budStr(r[0]),
        b = budStr(r[1]);
      if (/^direct$/i.test(c)) {
        direct = true;
        continue;
      }
      if (/^indirect/i.test(c)) break;
      if (/^[A-Z]{2,4}-\d+$/.test(c)) {
        if (b) names[c] = b;
        if (direct && g) g.p.push(c);
      } else if (direct && !c && b) groups.push((g = { n: b, p: [] }));
    }
  }
  return { file, at: new Date().toISOString(), bts, items, res, divMap, names, cai, groups: groups.filter((x) => x.p.length) };
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
// filters: a box under every column header – text matches anywhere in the cell; >1000, <0, >=, <=, =5 compare numbers
const bfTxt = (h) => {
  const t = String(h)
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (t) return t;
  const m = /value="([^"]*)"/.exec(String(h));
  return m ? m[1] : '';
};
const bfGet = (pg) => (ST.bflt && ST.bflt[pg]) || {};
function bfPass(pg, cells) {
  const sq = String(ST.bsr || '')
    .trim()
    .toLowerCase();
  if (
    sq &&
    !cells
      .map((c) => bfTxt(c === undefined ? '' : c))
      .join(' ')
      .toLowerCase()
      .includes(sq)
  )
    return false;
  const F = bfGet(pg);
  for (const i in F) {
    const f = String(F[i] || '').trim();
    if (!f) continue;
    const c = bfTxt(cells[i] === undefined ? '' : cells[i]),
      m = /^(>=|<=|>|<|=)\s*(-?[\d,.]+)$/.exec(f);
    if (m) {
      const v = budNum(c.replace(/[^\d.-]/g, '')),
        x = budNum(m[2]);
      const okN = m[1] === '>' ? v > x : m[1] === '<' ? v < x : m[1] === '>=' ? v >= x : m[1] === '<=' ? v <= x : Math.abs(v - x) < 0.005;
      if (!okN) return false;
    } else if (!c.toLowerCase().includes(f.toLowerCase())) return false;
  }
  return true;
}
const bfOn = (pg) => !!String(ST.bsr || '').trim() || Object.values(bfGet(pg)).some((v) => String(v || '').trim());
const bfRow = (pg, n) =>
  `<tr class="bd-flt">${Array.from({ length: n }, (_, i) => `<th><input data-bflt="${pg}|${i}" value="${esc(bfGet(pg)[i] || '')}" placeholder="▾" title="Filter: text, or >1000 · <0 · =5 for numbers"></th>`).join('')}</tr>`;
const bfNote = (pg) =>
  bfOn(pg) ? ` · <b class="bd-w">filter on</b> – sums show the lines you see <button data-bfclr="${pg}">✕ Clear filters</button>` : '';

function renderBudget() {
  const el = $('bud');
  if (!ST.bud) {
    el.innerHTML = `<div class="bd-empty"><h2>Budget</h2><p>Read your <b>cost report</b> (the workbook with <i>Direct plan</i> and <i>Cost Analysis</i>, .xlsb or .xlsx): the budget per PKG and resource, the BOQ items and their progress come from it. Your actuals come from this register's coding (PKG + cost element).</p><button class="pri" data-bud="read">Read the cost report…</button> <span class="bd-sub">or drop it here</span></div>`;
    return;
  }
  const C = budCalc();
  if (ST.tab === 'bprog') return budProgress(el);
  if (ST.tab === 'bca') return budCA(el);
  if (ST.tab === 'bpkg' && ST.bpk && C.pk.has(ST.bpk)) return budPkgPage(el, C, ST.bpk);
  return budSummary(el, C);
}
function budHead(title, sub) {
  return `<div class="bd-hd"><h2>${title}</h2><span class="bd-sub">${sub}</span><span class="bd-sp"></span><input type="search" class="bd-srch" data-bsr="1" value="${esc(ST.bsr || '')}" placeholder="Search…  code, resource, item"><span class="bd-sub">cost report: ${esc(ST.bud.file || '')} · read ${esc(String(ST.bud.at).slice(0, 10))}</span><button data-bud="read">Read again…</button></div>`;
}
// the PKG groups of the report (Civil · Arch · MEP …, from its Summary sheet); PKGs in no group come last
function budGroups(ps) {
  const B = ST.bud,
    seen = new Set(),
    out = [];
  for (const g of B.groups || []) {
    const p = g.p.filter((x) => ps.includes(x) && !seen.has(x));
    p.forEach((x) => seen.add(x));
    if (p.length) out.push({ n: g.n, p });
  }
  const rest = ps.filter((x) => !seen.has(x));
  if (rest.length) out.push({ n: out.length ? 'Other PKGs' : 'Direct PKGs', p: rest });
  return out;
}
const budPkgColor = (p) => {
  const gs = budGroups(budPkgs(budCalc()));
  const i = gs.findIndex((g) => g.p.includes(p));
  return PAL[(i < 0 ? 7 : i) % PAL.length];
};
// All PKGs: one row per PKG, grouped like the report (Civil · Arch · MEP), dashed borders between the groups
function budSummary(el, C) {
  const pg = 'sum',
    ps = budPkgs(C),
    ind = (t) =>
      !t.ac
        ? ''
        : t.cpi >= 1
          ? '<span class="bd-ok">on / under</span>'
          : t.cpi >= 0.85
            ? '<span class="bd-w">over</span>'
            : '<span class="bd-bad">over</span>';
  const cells = (r) => [
    `<b>${esc(r.p)}</b>`,
    esc(budName(r.p)),
    bK(r.bac),
    bK(r.ev),
    r.bac ? bP(r.ev / r.bac) : '-',
    bK(r.aa),
    bK(r.ao),
    bK(r.pv),
    `<b>${bK(r.ac)}</b>`,
    `<span${bCol(r.cv)}>${bK(r.cv)}</span>`,
    r.ac ? r.cpi.toFixed(2) : '-',
    bK(r.etc),
    `<b>${bK(r.eac)}</b>`,
    `<span${bCol(r.vac)}>${bK(r.vac)}</span>`,
    ind(r),
  ];
  const HD = [
    'PKG',
    'Name',
    'BAC',
    'EV',
    '% earned',
    'Actual',
    'Add / omit',
    'Provision',
    'AC',
    'CV',
    'CPI',
    'ETC',
    'EAC',
    'VAC',
    'Status',
  ];
  const tot = (lab, t, cls, bc) =>
    `<tr class="${cls}"${bc ? ` style="--bc:${bc}"` : ''}><td colspan="2">${lab}</td>${[bK(t.bac), bK(t.ev), t.bac ? bP(t.ev / t.bac) : '-', bK(t.aa), bK(t.ao), bK(t.pv), bK(t.ac), bK(t.cv), t.ac ? t.cpi.toFixed(2) : '-', bK(t.etc), bK(t.eac), bK(t.vac)].map((v) => `<td class="n">${v}</td>`).join('')}<td></td></tr>`;
  let body = '',
    all = [];
  budGroups(ps).forEach((g, gi) => {
    const bc = PAL[gi % PAL.length],
      rs = g.p.map((p) => ({ p, ...budSum([...C.pk.get(p).values()]) })).filter((r) => bfPass(pg, cells(r)));
    if (!rs.length) return;
    all = all.concat(rs);
    body +=
      `<tr class="bd-grp" style="--bc:${bc}"><td colspan="${HD.length}">${esc(g.n)} · ${rs.length} PKG${rs.length > 1 ? 's' : ''}</td></tr>` +
      rs
        .map(
          (r) =>
            `<tr class="bd-r bd-go" style="--bc:${bc}" data-bp="${esc(r.p)}">${cells(r)
              .map((v, i) => `<td class="${i < 2 ? 'bd-l' : i === 14 ? '' : 'n'}">${v}</td>`)
              .join('')}</tr>`
        )
        .join('') +
      tot('Sum ' + esc(g.n), budSum(rs), 'bd-sum bd-gend', bc);
  });
  const T = budSum(all);
  el.innerHTML =
    budHead('Budget · All PKGs', 'grouped as in your report · amounts in thousands (EGP 000) · click a PKG for its page' + bfNote(pg)) +
    budKpi(T) +
    `<div class="bd-wrap"><table class="bd-t"><tr>${HD.map((h, i) => `<th class="${i < 2 ? 'bd-l' : ''}">${h}</th>`).join('')}</tr>${bfRow(pg, HD.length)}${body}${tot(`TOTAL direct · ${all.length} PKGs`, T, 'bd-tot')}</table></div>
    <div class="bd-note">Actual = the register's cost coded to a PKG of the cost report (its code, or the Direct plan division code such as S03) · cost coded to other PKGs or not coded: <b>${bK(C.off)}</b> thousand – not on this page · AC = actual + add / omission + provision · EAC = AC + ETC · VAC = BAC − EAC</div>`;
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
  const pg = 'pkg:' + p,
    cols = BUD_COLS.flatMap(([g, cs]) => cs.map((c, i) => ({ g, h: c[0], f: c[1], s: c[2], first: i === 0 })));
  const cellsOf = (r) => [esc(r.ce), r.g, esc(r.n) + (r.nb ? ' no budget' : ''), esc(r.u), ...cols.map((c) => c.f(r))];
  const all = [...C.pk.get(p).values()].filter((r) => bfPass(pg, cellsOf(r))),
    T = budSum(all);
  const head =
    `<tr><th colspan="4"></th>${BUD_COLS.map(([g, cs]) => `<th colspan="${cs.length}" class="bd-gs">${g}</th>`).join('')}</tr>` +
    `<tr><th>Code</th><th>MNL</th><th class="bd-l">Cost element</th><th>Res. unit</th>${cols.map((c) => `<th class="${c.first ? 'bd-gs' : ''}">${c.h}</th>`).join('')}</tr>` +
    bfRow(pg, cols.length + 4);
  const sumRow = (lab, t, cls, bc) =>
    `<tr class="${cls}"${bc ? ` style="--bc:${bc}"` : ''}><td colspan="4">${lab}</td>${cols.map((c) => `<td class="n${c.first ? ' bd-gs' : ''}">${c.s ? bK(t[c.s]) : ''}</td>`).join('')}</tr>`;
  let body = '';
  for (const g of BUD_ORDER) {
    const rs = all.filter((r) => r.g === g).sort((a, b) => b.bac - a.bac || b.aa - a.aa);
    if (!rs.length) continue;
    const bc = BUD_GC[g];
    body +=
      `<tr class="bd-grp" style="--bc:${bc}"><td colspan="${cols.length + 4}">${BUD_GN[g]} · MNL ${g} · ${rs.length} lines</td></tr>` +
      rs
        .map(
          (r) =>
            `<tr class="bd-r${r.nb ? ' bd-nb' : ''}" style="--bc:${bc}"><td>${esc(r.ce)}</td><td><b>${r.g}</b></td><td class="bd-l bd-nm">${esc(r.n)}${r.nb ? ' <span class="bd-tag">no budget</span>' : ''}</td><td>${esc(r.u)}</td>${cols.map((c) => `<td class="n${c.first ? ' bd-gs' : ''}">${c.f(r)}</td>`).join('')}</tr>`
        )
        .join('') +
      sumRow('Sum ' + BUD_GN[g], budSum(rs), 'bd-sum bd-gend', bc);
  }
  el.innerHTML =
    budHead(`${esc(p)} · ${esc(budName(p))}`, 'PKG · resource-wise · amounts in thousands (EGP 000) · yellow = you type it' + bfNote(pg)) +
    budKpi(T) +
    `<div class="bd-wrap"><table class="bd-t bd-pkg">${head}${body}${sumRow('TOTAL ' + esc(p), T, 'bd-tot')}</table></div>
    <div class="bd-note">Budget = take-off qty × UR (Cost Analysis) · EV qty = the BOQ items' done qty (Progress) × the resource qty per item unit · Qty variance = EV qty − actual qty − add/omit qty · Grand total = actual + add/omission + provision · CV = EV − grand total · ETC = qty × rate (qty starts at the remaining resource qty, rate at the UR – type over them) · EAC = grand total + ETC · VAC = total budget − EAC · actual loss = EV qty − used qty · a <span class="bd-tag">no budget</span> line: cost coded to this PKG with a cost element that is not one of its budget resources – fix the cost element in Coding, or give it an ETC</div>`;
}
// Cost Analysis: the budget as the cost report's Cost Analysis sheet – each BOQ item with its resources under it (dashed borders between items)
function budCA(el) {
  const B = ST.bud,
    X = budIndex(),
    ps = [...new Set(B.res.map((x) => x.p))].sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
  const p = ST.bcaP && ps.includes(ST.bcaP) ? ST.bcaP : '*',
    pg = 'ca';
  const f0 = (v) => (Math.abs(v) < 0.5 ? '-' : Math.round(v).toLocaleString('en-US'));
  const HD = [
    'MNL',
    'Cost element',
    'Description',
    'Unit',
    'Usage',
    'Waste',
    'Total res. qty',
    'SC rate',
    'Material rate',
    'Equipment rate',
    'Labor rate',
    'Other rate',
    'Budget rate',
    'Take-off',
    'Total budget (BAC)',
    'Res. take-off qty',
    'EV qty',
    'EV amount',
  ];
  const byItem = new Map();
  for (const x of B.res) {
    if (p !== '*' && x.p !== p) continue;
    let a = byItem.get(x.i);
    if (!a) byItem.set(x.i, (a = []));
    a.push(x);
  }
  let body = '',
    nI = 0,
    nR = 0,
    tB = 0,
    tE = 0;
  for (const [code, rs] of byItem) {
    const it = X.itemOf.get(code),
      ci = (B.cai || {})[code] || {},
      done = it ? budDone(it).reduce((s, v) => s + budNum(v), 0) : 0;
    const rows = rs
      .map((x) => {
        const q = x.tq ? (done * x.rq) / x.tq : 0,
          ev = x.rq ? (q * x.bac) / x.rq : 0,
          rt = x.rt || [0, 0, 0, 0, 0];
        const cells = [
          x.g,
          esc(x.ce),
          esc(x.n),
          esc(x.u),
          bQ(x.o || 0),
          bQ(x.w || 0),
          bQ(x.t || 0),
          ...rt.map((v) => bQ(v)),
          bQ(x.br || (x.tq ? x.bac / x.tq : 0)),
          bQ(x.tq),
          f0(x.bac),
          bQ(x.rq),
          bQ(q),
          f0(ev),
        ];
        return { x, q, ev, cells };
      })
      .filter((r) => bfPass(pg, [...r.cells, code, rs[0].p, ci.n || (it && it.d) || '']));
    if (!rows.length) continue;
    nI++;
    nR += rows.length;
    const sb = rows.reduce((s, r) => s + r.x.bac, 0),
      se = rows.reduce((s, r) => s + r.ev, 0);
    tB += sb;
    tE += se;
    const bc = PAL[(ps.indexOf(rs[0].p) + 0) % PAL.length];
    body +=
      `<tr class="bd-item" style="--bc:${bc}"><td><b>${esc(code)}</b></td><td>${esc(rs[0].p)}</td><td class="bd-l bd-nm">${esc(ci.n || (it && it.d) || '')}</td><td>${esc(ci.u || (it && it.u) || '')}</td><td colspan="9" class="bd-sub">${rows.length} resource${rows.length > 1 ? 's' : ''} · done ${bQ(done)} of ${bQ(rows[0].x.tq)}</td><td class="n">${bQ(rows[0].x.tq)}</td><td class="n b">${f0(sb)}</td><td></td><td></td><td class="n b">${f0(se)}</td></tr>` +
      rows
        .map(
          (r) =>
            `<tr class="bd-r" style="--bc:${BUD_GC[r.x.g] || '#C9D3E3'}">${r.cells.map((v, i) => `<td class="${i === 2 ? 'bd-l bd-nm2' : i > 3 ? 'n' : ''}">${v}</td>`).join('')}</tr>`
        )
        .join('') +
      '<tr class="bd-gap"><td colspan="18"></td></tr>';
  }
  el.innerHTML =
    budHead('Cost Analysis', 'the budget as your Cost Analysis sheet: each BOQ item and its resources · full amounts' + bfNote(pg)) +
    `<div class="bd-bar">PKG <select data-bud="cap"><option value="*" ${p === '*' ? 'selected' : ''}>All PKGs</option>${ps.map((x) => `<option ${x === p ? 'selected' : ''} value="${esc(x)}">${esc(x)} · ${esc(budName(x))}</option>`).join('')}</select> <span class="bd-sub">${nI} BOQ items · ${nR} resource lines · BAC ${f0(tB)} · EV ${f0(tE)}</span></div>
    <div class="bd-wrap"><table class="bd-t bd-ca"><tr>${HD.map((h, i) => `<th class="${i === 2 ? 'bd-l' : ''}">${h}</th>`).join('')}</tr>${bfRow(pg, HD.length)}${body}<tr class="bd-tot"><td colspan="14">TOTAL · ${nI} BOQ items</td><td class="n">${f0(tB)}</td><td></td><td></td><td class="n">${f0(tE)}</td></tr></table></div>
    <div class="bd-note">From Cost Analysis: usage (resource qty per item unit), waste, total resource qty, the unit rates by type, budget rate, take-off, BAC and the resource take-off qty · EV qty = the item's done qty (Progress) × the resource qty per item unit · MNL: MAT material · SUB subcontract · LAB labor · EQU equipment (the EXP code M / S / L / E of Cost Analysis) · the search looks in every column, the BOQ item code and its PKG</div>`;
}
// Progress: done qty per BOQ item and building type (B1) – starts from the Direct plan, you update it each month
function budProgress(el) {
  const B = ST.bud,
    ps = [...new Set(B.items.map((x) => x.p))].sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
  const p = ST.bprogP && ps.includes(ST.bprogP) ? ST.bprogP : ps[0],
    pg = 'prog:' + p;
  const its0 = B.items.filter((x) => x.p === p),
    used = B.bts.map((_, k) => its0.some((x) => x.tq[k] || budDone(x)[k]));
  const ks = used.map((u, k) => (u ? k : -1)).filter((k) => k >= 0);
  const cellsOf = (x) => {
    const d = budDone(x),
      td = x.tq.reduce((s, v) => s + v, 0),
      dd = d.reduce((s, v) => s + budNum(v), 0);
    return [
      x.c,
      x.d,
      x.u,
      ...ks.flatMap((k) => [bQ(x.tq[k]), String(budNum(d[k]) || '')]),
      bQ(dd) + ' / ' + bQ(td),
      td ? bP(dd / td) : '-',
    ];
  };
  const its = its0.filter((x) => bfPass(pg, cellsOf(x)));
  el.innerHTML =
    budHead(
      'Progress',
      'done qty to date per BOQ item and building type (B1) · grey = take-off · yellow = done – type it, or paste a block from Excel' +
        bfNote(pg)
    ) +
    `<div class="bd-bar">PKG <select data-bud="pp">${ps.map((x) => `<option ${x === p ? 'selected' : ''} value="${esc(x)}">${esc(x)} · ${esc(budName(x))}</option>`).join('')}</select></div>
    <div class="bd-wrap"><table class="bd-t bd-prog"><tr><th colspan="3"></th>${ks.map((k) => `<th colspan="2" class="bd-gs">${esc(B.bts[k])}</th>`).join('')}<th colspan="2" class="bd-gs">Item</th></tr>
    <tr><th>BOQ item</th><th class="bd-l">Description</th><th>Unit</th>${ks.map(() => '<th class="bd-gs">Take-off</th><th>Done</th>').join('')}<th class="bd-gs">Done / take-off</th><th>%</th></tr>${bfRow(pg, 3 + ks.length * 2 + 2)}${its
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
    ST.bud ? 'grouped as your report · EAC per PKG' : 'read the cost report',
    '',
    undefined,
    'All',
  ]);
  if (!ST.bud) return;
  items.push([
    'data-gt="bca"',
    ST.tab === 'bca',
    '#3B5BA9',
    'Cost Analysis',
    '',
    'the budget: BOQ items and their resources',
    '',
    undefined,
    'CA',
  ]);
  items.push(['data-gt="bprog"', ST.tab === 'bprog', '#2E7D32', 'Progress', '', 'done qty per BOQ item', '', undefined, 'Prg']);
  const C = budCalc();
  budGroups(budPkgs(C)).forEach((g, gi) =>
    g.p.forEach((p) => {
      const t = budSum([...C.pk.get(p).values()]);
      items.push([
        `data-gt="bpkg" data-bp="${esc(p)}"`,
        ST.tab === 'bpkg' && ST.bpk === p,
        PAL[gi % PAL.length],
        p + ' ' + budName(p),
        t.bac ? `<span${bCol(t.vac)}>${bK(t.vac)}</span>` : '',
        g.n + ' · EAC ' + bK(t.eac),
        '',
        undefined,
        p.replace(/^[A-Z]+-/, ''),
      ]);
    })
  );
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
  if (t.matches('[data-bud="cap"]')) {
    ST.bcaP = t.value;
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
// the filter boxes: the page follows as you type (the box keeps the focus)
let bfT = null;
document.addEventListener('input', (e) => {
  const t = e.target;
  if (!t.matches || !t.matches('input[data-bflt],input[data-bsr]')) return;
  if (t.dataset.bsr) ST.bsr = t.value;
  else {
    const [pg, i] = t.dataset.bflt.split('|');
    if (!ST.bflt) ST.bflt = {};
    ST.bflt[pg] = { ...(ST.bflt[pg] || {}), [i]: t.value };
  }
  clearTimeout(bfT);
  bfT = setTimeout(() => {
    const sel = t.dataset.bsr ? 'input[data-bsr]' : `input[data-bflt="${t.dataset.bflt}"]`,
      pos = t.selectionStart;
    render();
    const n = document.querySelector(sel);
    if (n) {
      n.focus();
      n.setSelectionRange(pos, pos);
    }
  }, 350);
});
document.addEventListener('click', (e) => {
  const c = e.target.closest('[data-bfclr]');
  if (!c) return;
  if (ST.bflt) delete ST.bflt[c.dataset.bfclr];
  ST.bsr = '';
  render();
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
    if (!['bsum', 'bca', 'bprog', 'bpkg'].includes(ST.tab)) return;
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

// ---------------------------------------------------------------- Coding: the cost report's PKGs and resources in the pick list
function budPick() {
  const B = ST.bud;
  if (!B) return null;
  const X = budIndex();
  if (!X.pick) {
    const by = new Map(); // budget PKG → Map(ce → {ce, n, g, bac})
    for (const x of B.res) {
      let m = by.get(x.p);
      if (!m) by.set(x.p, (m = new Map()));
      const o = m.get(x.ce) || m.set(x.ce, { ce: x.ce, n: x.n, g: x.g, bac: 0 }).get(x.ce);
      o.bac += x.bac;
    }
    // the register's PKG codes for them: the Direct plan division codes (S03 → STR-03), named after the budget PKG
    const pk = Object.entries(B.divMap || {}).map(([d, p]) => [d, budName(p) ? budName(p) + ' (' + p + ')' : p]);
    X.pick = { by, pkgs: pk };
  }
  return {
    pkgs: X.pick.pkgs,
    pkgOf: budPkgOf,
    res: (p, mnl) =>
      [...(X.pick.by.get(p) || new Map()).values()].filter((x) => !mnl || !BUD_GN[mnl] || x.g === mnl).sort((a, b) => b.bac - a.bac),
  };
}
