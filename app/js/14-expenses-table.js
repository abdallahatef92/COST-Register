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
const sumIdx = (e, idx, q) => { let a = 0; for (const k of idx) a += q ? e.q[k] : e.p[k]; return a; };
function xpReport() {
  const pg = xpPage(), rep = Math.max(1, R.rep), PC = PER.slice(0, rep).map((x, k) => k), TM = [rep], CU = PER.slice(0, NP - 1).map((x, k) => k), A3 = [rep - 2, rep - 1, rep].filter((k) => k >= 1);
  const S0 = vs();
  if (pg === 'sum') {   // 1. Summary
    const byPkg = ST.xsm === 'pkg', tot = R.toDate || 1;
    const rows = xpLive().map((e) => ({ it: BK[e.b].items[e.ii], e, g: byPkg ? (e.pkg || '(no PKG)') + ' › ' + BK[e.b].id : BK[e.b].id, a: sumIdx(e, CU) }))
      .sort((x, y) => (byPkg ? x.g.localeCompare(y.g) : x.e.b - y.e.b) || Math.abs(y.a) - Math.abs(x.a));
    if (!S0.init) { S0.init = 1; new Set(rows.map((r) => r.g)).forEach((g) => S0.fold.add(g)); }   // compact: groups folded
    const amt = (k, l, idx, o = {}) => numC(k, l, o.w || 118, (r) => sumIdx(r.e, idx), { f: fmt, ...o });
    const cols = [{ k: 'item', l: 'Item', w: 330, fz: 1, v: (r) => itemCode(r.it) + ' ' + itemDesc(r.it), h: (r) => `<td title="${esc(itemDesc(r.it))}"><a class="lk open">${esc(itemCode(r.it))}</a> <span class="help" dir="auto">${esc(itemDesc(r.it))}</span></td>` },
      codeCells('pkg'), codeCells('mnl'), codeCells('ce'),
      numC('qty', 'Qty cumulative', 112, (r) => sumIdx(r.e, CU, 1), { f: fq }),
      amt('pc', 'Previous cumulative', PC), amt('tm', 'This month · ' + PER[rep], TM, { th: 'cut', cls: () => 'cutc' }), amt('cu', 'Cumulative', CU, { th: 'cumh', cls: () => 'cumc', h: (r) => `<td class="num cumc"><b>${fmt(sumIdx(r.e, CU))}</b></td>` }),
      numC('sh', 'Share', 74, (r) => sumIdx(r.e, CU) / tot, { f: (v) => (Math.abs(v) < 0.0005 ? '-' : (100 * v).toFixed(1) + '%') })];
    const foot = (rs) => ({ pc: fmt(rs.reduce((t, r) => t + sumIdx(r.e, PC), 0)), tm: fmt(rs.reduce((t, r) => t + sumIdx(r.e, TM), 0)), cu: fmt(rs.reduce((t, r) => t + sumIdx(r.e, CU), 0)), sh: (100 * rs.reduce((t, r) => t + sumIdx(r.e, CU), 0) / tot).toFixed(1) + '%' });
    const bkOf = (g) => BK.findIndex((b) => b.id === (byPkg ? g.split(' › ').slice(1).join(' › ') : g));
    return { cols, rows, groups: true, sel: false, status: false, foot, gCells: (g, rs) => foot(rs), gSpanK: 'auto',
      gLabel: (g, rs) => `<span class="bkc"><i style="background:${bkColor(bkOf(g))}"></i>${esc(g)}</span><span class="gm">${rs.length.toLocaleString('en-US')} rows</span>`,
      extraTools: xpTitle() + `<span class="seg">${[['', 'Bucket › Item'], ['pkg', 'PKG › Bucket › Item']].map(([k, l]) => `<button data-xsm="${k}" class="${(ST.xsm || '') === k ? 'on' : ''}">${l}</button>`).join('')}</span><span class="help">cumulative to the cut date · rows = item + the codes of its CJI3 lines (✎ = coded by hand)</span>` + xpExport() };
  }
  // 3. Indirect per month: indirect heads › cost elements (PKG = Indirect), amount
  const head = new Map(), ord = new Map(); psCfg().indirect.forEach((g, gi) => g.c.forEach((c) => { head.set(c, g.n); ord.set(g.n, gi); }));
  const agg = new Map(); xpLive().forEach((e) => { if (!isIndPkg(e.pkg)) return; const k = e.ce || '(no cost element)'; let x = agg.get(k); if (!x) agg.set(k, (x = { ce: k, p: new Float64Array(NP), q: new Float64Array(NP), n: 0 })); e.p.forEach((v, j) => { x.p[j] += v; }); x.n++; });
  const rows = [...agg.values()].map((x) => ({ e: x, g: head.get(x.ce) || 'Other indirect', sq: x.ce + ' ' + ceLabel(IND_PKG, x.ce) })).sort((x, y) => (ord.has(x.g) ? ord.get(x.g) : 99) - (ord.has(y.g) ? ord.get(y.g) : 99) || x.e.ce.localeCompare(y.e.ce));
  const slots = slotsOf(), cols = [{ k: 'ce', l: 'Cost element', w: 300, fz: 1, v: (r) => r.e.ce + ' ' + ceLabel(IND_PKG, r.e.ce), h: (r) => `<td><b>${esc(r.e.ce)}</b> <span class="help">${esc(ceLabel(IND_PKG, r.e.ce))}</span>${r.e.n > 1 ? ` <span class="help">· ${r.e.n} items</span>` : ''}</td>` }];
  slots.forEach((sl, si) => cols.push(numC('s' + si, sl.label, 104, (r) => sumIdx(r.e, sl.idx), { f: fmt, slot: si, sub: 'Amount', pl: sl.label, pidx: sl.idx, th: (sl.idx.includes(rep) ? 'cut' : sl.kind === 'pend' ? 'pend' : '') + (sl.kind === 'q' || sl.kind === 'y' ? ' agg' : ''), cls: () => (sl.idx.includes(rep) ? 'cutc' : '') })));
  cols.push(numC('td', 'To date', 116, (r) => sumIdx(r.e, CU), { f: fmt, slot: 'td', sub: 'Amount', pl: 'To date', th: 'cumh', h: (r) => `<td class="num cumc"><b>${fmt(sumIdx(r.e, CU))}</b></td>` }),
    numC('a3', `Avg last 3 months (${PER[A3[0]]} – ${PER[rep]})`, 150, (r) => sumIdx(r.e, A3) / A3.length, { f: fmt }));
  xpBlocks(cols, ['Amount']);
  const foot = (rs) => { const o = {}; cols.forEach((c) => { if (c.num) o[c.k] = fmt(rs.reduce((t, r) => t + c.v(r), 0)); }); return o; };
  return { cols, rows, groups: true, sel: false, status: false, foot, gCells: (g, rs) => foot(rs), gSpanK: 'auto', gLabel: (g, rs) => `<b>${esc(g)}</b><span class="gm">${rs.length} cost element${rs.length === 1 ? '' : 's'}</span>`,
    extraTools: xpTitle() + `<span class="help">PKG = Indirect only · amount</span> <span class="seg">${['Months', 'Quarters', 'Years'].map((v) => `<button data-pv="${v}" class="${(v === 'Months' && !PF.size) || (v === 'Years' && [...PF].some((x) => x[0] === 'Y')) || (v === 'Quarters' && PF.size && ![...PF].some((x) => x[0] === 'Y')) ? 'on' : ''}">${v}</button>`).join('')}</span>` + xpExport() };
}
// 2. Expenses per month: the page definition in 14-table-pages (pm / xpm) ends here
const xpMonthDef = (o) => ({ cols: o.cols, rows: o.rows, bands: o.bands, groups: false, sel: false, status: false, foot: o.footF,
  extraTools: xpTitle() + (o.hasQ ? ` <span class="seg">${[['All', 'Qty · Rate · Amount'], ['Amount', 'Amount']].map(([m, l]) => `<button data-pm="${m}" class="${o.mode === m ? 'on' : ''}">${l}</button>`).join('')}</span>` : '')
    + ` <span class="seg">${['Months', 'Quarters', 'Years'].map((v) => `<button data-pv="${v}" class="${(v === 'Months' && !PF.size) || (v === 'Years' && [...PF].some((x) => x[0] === 'Y')) || (v === 'Quarters' && PF.size && ![...PF].some((x) => x[0] === 'Y')) ? 'on' : ''}">${v}</button>`).join('')}</span>` + xpExport() });
document.addEventListener('click', (e) => { if (ST.tab !== 'xpm') return; const b = e.target.closest('[data-xsm]'); if (b) { ST.xsm = b.dataset.xsm; render(); $('wrap').scrollTop = 0; } });
