// =====================================================================================  data + helpers
const { META, S, BK, L, REV, SUB } = DATA,
  N = L.b.length;
const PER = ['Opening', ...META.months, 'Pending'],
  NP = PER.length,
  NM = META.months.length;
const $ = (id) => document.getElementById(id),
  esc = (s) =>
    String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
const fmt = (v) => (Math.abs(v) < 0.5 ? '-' : Math.round(v).toLocaleString('en-US')),
  fmt2 = (v) => (Math.abs(v) < 0.005 ? '-' : v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const fmtM = (v) => (Math.abs(v) >= 1e6 ? (v / 1e6).toFixed(1) + 'M' : fmt(v)),
  fq = (v) => (Math.abs(v) < 1e-9 ? '-' : v.toLocaleString('en-US', { maximumFractionDigits: 3 })),
  pct = (a, b) => (b ? ((100 * a) / b).toFixed(1) + '%' : '-');
const r2 = (v) => Math.round(v * 100) / 100;
const isOwn = (i) => Math.abs(L.amt[i]) < 0.005 && Math.abs(L.qty[i]) > 1e-9,
  HASOWN = (() => {
    for (let i = 0; i < L.b.length; i++) if (isOwn(i)) return true;
    return false;
  })(); // owner-supplied material: quantity, no amount
const UNS = L.uns || [],
  HASUNS = UNS.some((v) => v),
  ZI = META.zint || null,
  DEPI = BK.findIndex((b) => b.id === 'Asset depreciation'); // ZINTC1 charges not yet settled in CJI3 (excluded unless included)
const SUBI = BK.findIndex((b) => b.id === 'Subcontractor'),
  MATI = BK.findIndex((b) => b.id === 'Material');
BK.forEach((b, bi) =>
  b.items.forEach((it, ii) => {
    it.bi = bi;
    it.ii = ii;
    it.vals = it.v.map((x) => S[x]);
    it.grp = S[it.g] || '';
  })
);
if (MATI >= 0) {
  const nm = new Map();
  for (let i = 0; i < N; i++) {
    if (L.b[i] !== MATI) continue;
    const n = (S[L.name[i]] || '').trim();
    if (!n) continue;
    const it = BK[MATI].items[L.it[i]];
    let m = nm.get(it);
    if (!m) nm.set(it, (m = new Map()));
    m.set(n, (m.get(n) || 0) + Math.abs(L.amt[i]));
  }
  for (const [it, m] of nm) {
    it.names = [...m].sort((x, y) => y[1] - x[1]);
    it.nameS = it.names.map((x) => x[0]).join(' ');
  }
}
const CTIP = {
  div: 'DIV – the CSI division of the subcontract work',
  pkg: 'PKG – which package pays for it (e.g. S03 Concrete works). Indirect items use “Indirect”',
  mnl: 'MNL – what kind of cost: MAT material · SUB subcontract · LAB labour · EQU equipment · OTHER',
  ce: 'Cost element – what it is inside the package (e.g. STEEL, CONC). Your own short code',
  st: 'Coded = every code of the row filled',
  inc: 'Include = count this item in the cost. No = leave it out (shows in the footer as Excluded)',
};
const isSub = (bi) => bi === SUBI,
  codeF = (bi) => (isSub(bi) ? ['div', 'pkg', 'mnl', 'ce'] : ['pkg', 'mnl', 'ce']),
  FN = { div: 'DIV', pkg: 'PKG', mnl: 'MNL', ce: 'Cost element' };
const itemCode = (it) =>
  it.bi === MATI
    ? it.vals[3]
    : isSub(it.bi)
      ? it.vals[1]
      : it.bi === BK.findIndex((b) => b.id === 'G&A')
        ? it.vals[0] + ' · ' + it.vals[1]
        : it.vals[0];
const itemDesc = (it) =>
  it.bi === MATI
    ? it.vals[4]
    : isSub(it.bi)
      ? it.vals[2]
      : it.vals.length > 1 && it.bi !== BK.findIndex((b) => b.id === 'G&A')
        ? it.vals[1]
        : '';
const itemUnit = (it) =>
  it.bi === MATI
    ? it.vals[5]
    : isSub(it.bi)
      ? it.vals[3]
      : BK[it.bi].cols.indexOf('Unit') >= 0
        ? it.vals[BK[it.bi].cols.indexOf('Unit')]
        : '';
// coding rules: a code typed once for a material group (or a subcontractor service) – new items of that group get it automatically, month after month
const ruleKeyOf = (it) => (it.bi === MATI ? 'm:' + (it.vals[2] || '') : it.bi === SUBI ? 's:' + (it.vals[1] || '') : null);
function setCRule(key, f, v) {
  const r = ST.crules[key] || (ST.crules[key] = {});
  if (v) r[f] = v;
  else delete r[f];
  if (!Object.keys(r).length) delete ST.crules[key];
}
function applyCRules(onlyNew) {
  let n = 0;
  BK.forEach((b) =>
    b.items.forEach((it) => {
      const k = ruleKeyOf(it),
        r = k && ST.crules[k];
      if (!r || (onlyNew && !it.nw)) return;
      let hit = false;
      Object.entries(r).forEach(([f, v]) => {
        if (!it[f] && codeF(it.bi).includes(f)) {
          it[f] = v;
          hit = true;
        }
      });
      if (hit) n++;
    })
  );
  return n;
}
const statusOf = (it) => (codeF(it.bi).every((f) => it[f]) ? 'Coded' : 'Not coded'); // coded = every code filled (no 'partly')
const PAL = [
  '#1F4E9A',
  '#E07B39',
  '#2A9D8F',
  '#7CB342',
  '#E9B949',
  '#C0504D',
  '#8E5EA2',
  '#6D7B8D',
  '#3BA3C7',
  '#D6457A',
  '#4F7CAC',
  '#7D8F3A',
]; // clear, distinct – the same colour for a bucket everywhere   // muted accents (packages, groups, chart series)
const tint = (c, k = 0.86) => {
  const n = parseInt(c.slice(1), 16),
    f = (v) =>
      Math.round(v + (255 - v) * k)
        .toString(16)
        .padStart(2, '0');
  return '#' + f(n >> 16) + f((n >> 8) & 255) + f(n & 255);
};
const SOFT = PAL.map((c) => tint(c, 0.92)); // soft fills of the palette accents (group rows, type-of-works pills)
const grpCols = new Map();
const grpCol = (k) => {
  if (!grpCols.has(k)) grpCols.set(k, SOFT[grpCols.size % SOFT.length]);
  return grpCols.get(k);
};
const UNC = PAL.map((c) => tint(c, 0.84)),
  unitCols = new Map();
const unitCol = (u) => {
  if (!unitCols.has(u)) unitCols.set(u, UNC[unitCols.size % UNC.length]);
  return unitCols.get(u);
};
let tt;
function toast(m) {
  const t = $('toast');
  t.textContent = m;
  t.classList.add('show');
  clearTimeout(tt);
  tt = setTimeout(() => t.classList.remove('show'), 3000);
}
