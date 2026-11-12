// =====================================================================================  Expenses: three report pages (the side list picks the page)
// 1 Summary – cumulative, compact: bucket › item (or PKG › bucket › item)   2 Expenses per month   3 Indirect per month
// every row is an item + the codes of its CJI3 lines, so a hand-coded line makes its own row (as in the Expenses sheet)
const XPAGES = [['sum', 'Summary', 'cumulative · bucket › item or PKG › bucket › item'], ['month', 'Expenses per month', 'every item · qty · rate · amount · quarters, years'], ['ind', 'Indirect per month', 'indirect heads › cost elements, month by month']];
const xpPage = () => ST.xpPage || 'sum';
// kept for the table code: an Expenses row is never a CJI3 line selection
const xpLinesOf = () => [];
const xpExport = () => ' <button id="bXpX" class="hp" title="This page as it is on screen (filters and folds apply), as an Excel file">⇩ Export</button>';
const xpTitle = () => `<b class="xpt">${esc((XPAGES.find((x) => x[0] === xpPage()) || XPAGES[0])[1])}</b>`;
const xpLive = () => [...R.exp.values()].filter((e) => e.p.some((v) => Math.abs(v) >= 0.005));
// a border on the left of every month block (and of To date)
function xpBlocks(cols, subs) { cols.forEach((c) => { if (c.slot === undefined || c.sub !== subs[0]) return; c.th = (c.th || '') + ' mb'; const h0 = c.h; c.h = (r) => h0(r).replace(/^<td( class=")?/, (m0, a) => (a ? '<td class="mb ' : '<td class="mb"')); }); }
const codeCells = (f) => ({ k: f, l: FN[f], w: f === 'ce' ? 112 : f === 'mnl' ? 66 : 92, v: (r) => r.e[f] || '(blank)', h: (r) => (r.e[f] ? `<td${r.e.hand ? ' class="xph" title="Coded on its CJI3 lines (not the item code)"' : ''}><b>${esc(r.e[f])}</b>${r.e.hand && f === 'pkg' ? ' <span class="help">✎</span>' : ''}</td>` : '<td class="help">–</td>') });
const gtyOf = (it) => (it.bi === MATI ? it.vals[2] + ((META.grpNames || {})[it.vals[2]] ? ' · ' + META.grpNames[it.vals[2]] : '') : isSub(it.bi) ? it.vals[0] || '' : '');
const gtyCol = { k: 'gty', l: 'Material group / Type of works', w: 210, v: (r) => gtyOf(r.it), h: (r) => `<td dir="auto" title="${esc(gtyOf(r.it))}">${esc(gtyOf(r.it))}</td>` };
const xpGrp = (e) => (ST.xsm === 'pkg' ? (e.pkg || '(no PKG)') + ' › ' + BK[e.b].id : BK[e.b].id);
const xpBkOf = (g) => BK.findIndex((b) => b.id === (ST.xsm === 'pkg' ? g.split(' › ').slice(1).join(' › ') : g));
const xpGLabel = (g, rs) => `<span class="bkc"><i style="background:${bkColor(xpBkOf(g))}"></i>${esc(g)}</span><span class="gm">${rs.length.toLocaleString('en-US')} rows</span>`;
const xpGrpSeg = () => `<span class="seg">${[['', 'Bucket › Item'], ['pkg', 'PKG › Bucket › Item']].map(([k, l]) => `<button data-xsm="${k}" class="${(ST.xsm || '') === k ? 'on' : ''}">${l}</button>`).join('')}</span>`;
const xpFoldInit = (rows) => { const S0 = vs(); if (!S0.init) { S0.init = 1; new Set(rows.map((x) => x.g)).forEach((g) => S0.fold.add(g)); } };   // compact: groups folded at first
const sumIdx = (e, idx, q) => { let a = 0; for (const k of idx) a += q ? e.q[k] : e.p[k]; return a; };
function xpReport() {
  const pg = xpPage(), rep = Math.max(1, R.rep), PC = PER.slice(0, rep).map((x, k) => k), TM = [rep], CU = PER.slice(0, NP - 1).map((x, k) => k), A3 = [rep - 2, rep - 1, rep].filter((k) => k >= 1);
  const S0 = vs();
  if (pg === 'sum') {   // 1. Summary
    const byPkg = ST.xsm === 'pkg', tot = R.toDate || 1;   // eslint-disable-line no-unused-vars
    const rows = xpLive().map((e) => ({ it: BK[e.b].items[e.ii], e, g: xpGrp(e), a: sumIdx(e, CU) }))
      .sort((x, y) => (byPkg ? x.g.localeCompare(y.g) : x.e.b - y.e.b) || Math.abs(y.a) - Math.abs(x.a));
    xpFoldInit(rows);
    const amt = (k, l, idx, o = {}) => numC(k, l, o.w || 118, (r) => sumIdx(r.e, idx), { f: fmt, ...o });
    const cols = [{ k: 'item', l: 'Item', w: 330, fz: 1, v: (r) => itemCode(r.it) + ' ' + itemDesc(r.it), h: (r) => `<td title="${esc(itemDesc(r.it))}"><a class="lk open">${esc(itemCode(r.it))}</a> <span class="help" dir="auto">${esc(itemDesc(r.it))}</span></td>` },
      codeCells('pkg'), codeCells('mnl'), codeCells('ce'), gtyCol,
      numC('qty', 'Qty cumulative', 112, (r) => sumIdx(r.e, CU, 1), { f: fq }),
      amt('pc', 'Previous cumulative', PC), amt('tm', 'This month · ' + PER[rep], TM, { th: 'cut', cls: () => 'cutc' }), amt('cu', 'Cumulative', CU, { th: 'cumh', cls: () => 'cumc', h: (r) => `<td class="num cumc"><b>${fmt(sumIdx(r.e, CU))}</b></td>` }),
      numC('sh', 'Share', 74, (r) => sumIdx(r.e, CU) / tot, { f: (v) => (Math.abs(v) < 0.0005 ? '-' : (100 * v).toFixed(1) + '%') })];
    const foot = (rs) => ({ pc: fmt(rs.reduce((t, r) => t + sumIdx(r.e, PC), 0)), tm: fmt(rs.reduce((t, r) => t + sumIdx(r.e, TM), 0)), cu: fmt(rs.reduce((t, r) => t + sumIdx(r.e, CU), 0)), sh: (100 * rs.reduce((t, r) => t + sumIdx(r.e, CU), 0) / tot).toFixed(1) + '%' });
    return { cols, rows, groups: true, sel: false, status: false, foot, gCells: (g, rs) => foot(rs), gSpanK: 'auto',
      gLabel: xpGLabel,
      extraTools: xpTitle() + xpGrpSeg() + `<span class="help">cumulative to the cut date · rows = item + the codes of its CJI3 lines (✎ = coded by hand)</span>` + xpExport() };
  }
  // 3. Indirect per month: indirect head › cost element › item (PKG = Indirect), amount; an item opens its CJI3 lines
  const head = new Map(), ord = new Map(); psCfg().indirect.forEach((g, gi) => g.c.forEach((c) => { head.set(c, g.n); ord.set(g.n, gi); }));
  const famOfCe = (ce) => head.get(ce) || 'Other indirect', MO = MI.filter((m) => m.idx <= rep).map((m) => m.idx);
  const rows = xpLive().filter((e) => isIndPkg(e.pkg)).map((e) => { const it = BK[e.b].items[e.ii], ce = e.ce || '(no cost element)'; return { it, e, g: ce, a: sumIdx(e, CU), sq: [ce, ceLabel(IND_PKG, ce), itemCode(it), itemDesc(it), BK[e.b].id].join(' ') }; })
    .sort((x, y) => (ord.has(famOfCe(x.g)) ? ord.get(famOfCe(x.g)) : 99) - (ord.has(famOfCe(y.g)) ? ord.get(famOfCe(y.g)) : 99) || x.g.localeCompare(y.g) || Math.abs(y.a) - Math.abs(x.a));
  xpFoldInit(rows);
  const slots = slotsOf(), cols = [{ k: 'item', l: 'Head › Cost element › Item', w: 430, fixW: 1, fz: 1, v: (r) => itemCode(r.it) + ' ' + itemDesc(r.it), h: (r) => `<td class="xi" title="${esc(BK[r.it.bi].id + ' · ' + itemDesc(r.it))}"><a class="lk open" title="Open its CJI3 lines">${esc(itemCode(r.it))}</a> <span class="help" dir="auto">${esc(itemDesc(r.it))}</span></td>` }];
  slots.forEach((sl, si) => cols.push(numC('s' + si, sl.label, 104, (r) => sumIdx(r.e, sl.idx), { f: fmt, slot: si, sub: 'Amount', pl: sl.label, pidx: sl.idx, th: (sl.idx.includes(rep) ? 'cut' : sl.kind === 'pend' ? 'pend' : '') + (sl.kind === 'q' || sl.kind === 'y' ? ' agg' : ''), cls: () => (sl.idx.includes(rep) ? 'cutc' : '') })));
  cols.push(numC('td', 'To date', 116, (r) => sumIdx(r.e, CU), { f: fmt, slot: 'td', sub: 'Amount', pl: 'To date', pidx: CU, th: 'cumh', h: (r) => `<td class="num cumc"><b>${fmt(sumIdx(r.e, CU))}</b></td>` }),
    numC('am', `Avg per month (${PER[MO[0]]} – ${PER[rep]}, ${MO.length} months)`, 170, (r) => sumIdx(r.e, MO) / MO.length, { f: fmt }),
    numC('a3', `Avg last 3 months (${PER[A3[0]]} – ${PER[rep]})`, 150, (r) => sumIdx(r.e, A3) / A3.length, { f: fmt }));
  xpBlocks(cols, ['Amount']);
  const foot = (rs) => { const o = {}; cols.forEach((c) => { if (c.num) o[c.k] = fmt(rs.reduce((t, r) => t + c.v(r), 0)); }); return o; };
  return { cols, rows, groups: true, sel: false, status: false, foot, gCells: (g, rs) => foot(rs), gSpanK: 'auto', fam: famOfCe, fLabel: (f, rs) => `<b>${esc(f)}</b><span class="gm">${new Set(rs.map((x) => x.g)).size} cost element${new Set(rs.map((x) => x.g)).size === 1 ? '' : 's'}</span>`,
    gLabel: (g, rs) => `<b>${esc(g)}</b>&nbsp;<span class="help">${esc(ceLabel(IND_PKG, g))}${rs.length > 1 ? ' · ' + rs.length + ' items' : ''}</span>`,
    extraTools: xpTitle() + `<span class="help">PKG = Indirect only · amount · + opens a cost element, the item opens its CJI3 lines</span> <span class="seg">${['Months', 'Quarters', 'Years'].map((v) => `<button data-pv="${v}" class="${(v === 'Months' && !PF.size) || (v === 'Years' && [...PF].some((x) => x[0] === 'Y')) || (v === 'Quarters' && PF.size && ![...PF].some((x) => x[0] === 'Y')) ? 'on' : ''}">${v}</button>`).join('')}</span>` + xpExport() };
}
// 2. Expenses per month: the page definition in 14-table-pages (pm / xpm) ends here
const xpMonthDef = (o) => { xpFoldInit(o.rows); return { cols: o.cols, rows: o.rows, bands: o.bands, groups: true, sel: false, status: false, foot: o.footF, gCells: (g, rs) => o.footF(rs), gSpanK: 'auto', gLabel: xpGLabel,
  extraTools: xpTitle() + xpGrpSeg() + (o.hasQ ? ` <span class="seg">${[['All', 'Qty · Rate · Amount'], ['Amount', 'Amount']].map(([m, l]) => `<button data-pm="${m}" class="${o.mode === m ? 'on' : ''}">${l}</button>`).join('')}</span>` : '')
    + ` <span class="seg">${['Months', 'Quarters', 'Years'].map((v) => `<button data-pv="${v}" class="${(v === 'Months' && !PF.size) || (v === 'Years' && [...PF].some((x) => x[0] === 'Y')) || (v === 'Quarters' && PF.size && ![...PF].some((x) => x[0] === 'Y')) ? 'on' : ''}">${v}</button>`).join('')}</span>` + xpExport() }; };
document.addEventListener('click', (e) => { if (ST.tab !== 'xpm') return; const b = e.target.closest('[data-xsm]'); if (b) { ST.xsm = b.dataset.xsm; render(); $('wrap').scrollTop = 0; } });
