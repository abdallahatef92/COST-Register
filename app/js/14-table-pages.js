// =====================================================================================  generic table pages (filters like Excel, groups that fold, selection, inline codes)
// Per Month columns: Opening · months (folding into quarters and years) · Pending
const PF = new Set();
const MI = META.months.map((m, k) => { const y = 2000 + +m.slice(4, 6), mo = MON.indexOf(m.slice(0, 3)) + 1; return { idx: k + 1, label: m, y, q: Math.floor((mo - 1) / 3) + 1 }; });
function slotsOf() {
  const out = [{ label: 'Opening', idx: [0], kind: 'open' }];
  for (const y of [...new Set(MI.map((m) => m.y))]) { const ym = MI.filter((m) => m.y === y);
    if (PF.has('Y' + y)) { out.push({ label: y + ' total', idx: ym.map((m) => m.idx), kind: 'y', y }); continue; }
    for (const q of [...new Set(ym.map((m) => m.q))]) { const qm = ym.filter((m) => m.q === q);
      if (PF.has('Q' + y + '-' + q)) out.push({ label: 'Q' + q + '-' + String(y).slice(2) + ' total', idx: qm.map((m) => m.idx), kind: 'q', y, q });
      else qm.forEach((m) => out.push({ label: m.label, idx: [m.idx], kind: 'm', y, q })); } }
  out.push({ label: 'Pending', idx: [NP - 1], kind: 'pend' }); return out;
}
const VS = {}; const vsKey = () => ST.tab + ':' + (ST.tab === 'uns' ? ST.unsView : ST.tab === 'sub' ? ST.sub : ST.tab === 'exp' ? '' : ST.tab === 'xpm' ? 'x' + (ST.xpb ?? -1) : ['gl', 'wbs'].includes(ST.tab) ? ST.xbk + (ST.tab === 'gl' ? ST.glMode : '') + [...XB].join('.') : ST.bk + (ST.tab === 'lines' ? [...XB].join('.') : '') + (ST.tab === 'cod' && ST.next ? ':next' : '')); const vs = () => { const k = vsKey(); return VS[k] || (VS[k] = { q: '', st: 'All', f: {}, sort: null, fold: new Set(), exc: true }); };
const sel = new Set(); let lastClick = null;
const keyOf = (c, v) => (c.num ? (Math.abs(v) < 0.005 ? '-' : (Math.abs(v) < 1000 && v % 1 ? Number(v.toFixed(2)) : Math.round(v)).toLocaleString('en-US')) : String(v ?? ''));
const keyNum = (k) => (k === '-' ? 0 : Number(String(k).replace(/,/g, '')));
function passF(c, r, f) { if (!f || !f.set) return true; const v = c.v(r); return Array.isArray(v) ? v.some((x) => f.set.has(keyOf(c, x))) : f.set.has(keyOf(c, v)); }
// ---- suggested codes: from coded items of the same material group (Material) or the same PO / service (Subcontractor); codes kept from last month count too
const CODED0 = new Set(); BK.forEach((b) => b.items.forEach((it) => { if (it.pkg) CODED0.add(it.bi + ':' + it.ii); }));   // coded when the register opened = last month's codes
let SUBPO = null; const subPo = (it) => { if (!SUBPO) { SUBPO = new Map(); for (let i = 0; i < N; i++) if (L.b[i] === SUBI) { const k = SUBI + ':' + L.it[i], po = S[L.po[i]]; if (po && po[0] !== '(' && !SUBPO.has(k)) SUBPO.set(k, po); } } return SUBPO.get(it.bi + ':' + it.ii) || ''; };
const sugKeys = (it) => (it.bi === MATI ? (it.vals[2] && it.vals[2] !== '–' ? ['G|' + it.vals[2]] : []) : isSub(it.bi) && subPo(it) ? ['S|' + subPo(it) + '|' + it.vals[1], 'P|' + subPo(it)] : []);
let SUG = null;   // key → best code (by amount) among the coded items with that key; rebuilt after every change
function sugIndex() { const m = new Map();
  BK.forEach((b) => b.items.forEach((it) => { if (it.inc === 'No' || statusOf(it) !== 'Coded') return; for (const k of sugKeys(it)) { const e = m.get(k) || m.set(k, new Map()).get(k), c = it.pkg + '|' + it.ce, x = e.get(c) || e.set(c, { pkg: it.pkg, ce: it.ce, a: 0, n: 0, src: it }).get(c); x.a += Math.abs(it.td); x.n++; if (Math.abs(it.td) > Math.abs(x.src.td)) x.src = it; } }));
  const best = new Map(); m.forEach((e, k) => best.set(k, [...e.values()].sort((x, y) => y.a - x.a)[0])); return best; }
function sugOf(it) { if (it.pkg && it.ce) return null; if (!SUG) SUG = sugIndex(); for (const k of sugKeys(it)) { const x = SUG.get(k); if (!x) continue; const s = x.src, by = k[0] === 'G' ? 'material group ' + it.vals[2] : k[0] === 'S' ? 'PO ' + subPo(it) + ' · ' + it.vals[1] : 'PO ' + subPo(it);
    return { pkg: x.pkg, ce: x.ce, why: `like ${itemCode(s)} ${itemDesc(s)}`.slice(0, 60) + ` – same ${by}` + (x.n > 1 ? ` · ${x.n} items coded` : '') + (CODED0.has(s.bi + ':' + s.ii) ? ' · last month' : '') }; } return null; }
const lineStatusOf = (i) => { const it = BK[L.b[i]].items[L.it[i]], o = OVR[L.id[i]]; return codeF(L.b[i]).every((f) => (o && o[f] !== undefined ? o[f] : it[f])) ? 'Coded' : 'Not coded'; };
const codeInput = (it, f, ovrVal) => { const v = ovrVal !== undefined ? ovrVal : it[f], sg = !v && ovrVal === undefined && (f === 'pkg' || f === 'ce') ? sugOf(it) : null, sv = sg ? sg[f] : '';
  return `<td class="c"><input data-f="${f}" value="${esc(v)}" ${f === 'pkg' || f === 'ce' ? 'autocomplete="off"' : `list="dl-${f}"`} class="${v ? '' : 'miss'}${sv ? ' sug' : ''}${ovrVal !== undefined && ovrVal !== it[f] ? ' ovr' : ''}"${sv ? ` placeholder="${esc(sv)} ↵" data-sug="${esc(sv)}" title="Suggested – Enter accepts"` : ''}></td>`; };
const stCell = (it) => { const s = statusOf(it); return `<td><span class="st ${s.split(' ')[0]}">${s}</span></td>`; };
const numC = (k, l, w, get, o = {}) => ({ k, l, w, num: 1, v: get, h: (r) => `<td class="num${o.cls ? ' ' + o.cls(r) : ''}">${o.f ? o.f(get(r)) : fmt(get(r))}</td>`, ...o });
// ---- page definitions: rows, columns, groups
// the three pages of Coding, as tabs: each says what it is
const codTabs = (cur) => `<div class="ctabs">${[['cod', 'Items', 'one row per item – code here'], ['lines', 'SAP transaction lines', 'the CJI3 lines of this bucket, with their codes']].map(([k, l, h]) => `<button data-cv="${k}" class="${cur === k ? 'on' : ''}"><b>${l}</b><small>${h}</small></button>`).join('')}</div>`;
function pageDef() {
  if (ST.tab !== 'lines' && ST.tab !== 'xpm' && ST.bk < 0) ST.bk = Math.max(0, MATI);
  const bi = ST.bk, b = bi >= 0 ? BK[bi] : null, rep = R.rep;
  if (ST.tab === 'cod') {
    const GN = META.grpNames || {}, gName = (g) => (GN[g] ? g + ' · ' + GN[g] : g || ''), grpCol2 = { k: 'c2', l: 'Group', w: 190, v: (r) => gName(r.it.vals[2]), h: (r) => `<td title="${esc(gName(r.it.vals[2]))}">${esc(r.it.vals[2])} <span class="help">${esc(GN[r.it.vals[2]] || '')}</span></td>` };
    const cols = [], nameCol = { k: 'nm', l: 'Name (CJI3)', w: 210, v: (r) => (r.it.names ? r.it.names[0][0] : ''), h: (r) => { const n = r.it.names; if (!n) return '<td></td>';
      return `<td title="${esc(n.slice(0, 12).map((x) => x[0] + ' · ' + fmt(x[1])).join('\n') + (n.length > 12 ? '\n… ' + (n.length - 12) + ' more' : ''))}"><span dir="auto" style="unicode-bidi:isolate">${esc(n[0][0])}</span>${n.length > 1 ? ` <span class="help">+${n.length - 1}</span>` : ''}</td>`; } };
    b.cols.forEach((lab, j) => { if (bi === MATI && j < 2) return; if (bi === MATI && lab === 'Unit') cols.push(nameCol); if (bi === MATI && lab === 'Group') { cols.push(grpCol2); return; } const w = Math.min(320, Math.max(70, lab === 'Description' || /name/i.test(lab) ? 300 : lab === 'Type of works' ? 170 : 96)); cols.push({ k: 'c' + j, l: lab, w: lab === 'Unit' ? 58 : w, v: (r) => r.it.vals[j], h: (r) => (lab === 'Unit' ? `<td>${r.it.vals[j] ? `<span class="u" style="background:${unitCol(r.it.vals[j])}">${esc(r.it.vals[j])}</span>` : ''}</td>` : j === (bi === MATI ? 3 : isSub(bi) ? 1 : 0) ? `<td title="${esc(r.it.vals[j])}"><a class="lk open">${esc(r.it.vals[j])}</a></td>` : `<td dir="auto" title="${esc(r.it.vals[j])}">${esc(r.it.vals[j])}</td>`), fz: j <= (bi === MATI ? 3 : isSub(bi) ? 1 : 0) ? 1 : 0 }); });
    codeF(bi).forEach((f) => cols.push({ k: f, l: f === 'pkg' ? 'PKG – package' : FN[f], tip: CTIP[f], w: (f === 'ce' ? 112 : f === 'div' ? 88 : f === 'mnl' ? 66 : 104) + 18, code: 1, v: (r) => r.it[f] || '(blank)', h: (r) => codeInput(r.it, f) }));
    cols.push({ k: 'st', l: 'Status', tip: CTIP.st, w: 118, v: (r) => statusOf(r.it), h: (r) => stCell(r.it) }, { k: 'inc', l: 'Include', tip: CTIP.inc, w: 92, v: (r) => r.it.inc, h: (r) => `<td><button class="incb ${r.it.inc === 'No' ? 'no' : ''}">${r.it.inc === 'No' ? 'No' : 'Yes'}</button></td>` });
    if (b.qty) cols.push(numC('qty', 'Qty to date', 96, (r) => r.it.qtd, { f: fq }), numC('rate', 'Rate', 84, (r) => (Math.abs(r.it.qtd) > 1e-9 ? r.it.td / r.it.qtd : 0), { f: fmt2 }));
    cols.push(numC('td', 'To date', 112, (r) => r.it.td || (r.it.uns ? r.it.exc : 0), { h: (r) => (r.it.uns && !r.it.td && r.it.exc ? `<td class="num" title="Not yet settled in CJI3 – left out, not counted. Switch its months on in the Unsettled tab.">${fmt(r.it.exc)}</td>` : `<td class="num"><b>${fmt(r.it.td)}</b></td>`) }), numC('tm', R.repLab, 112, (r) => r.it.tm), numC('pe', 'Pending', 92, (r) => r.it.pe), numC('n', 'Lines', 62, (r) => r.it.n), { k: 'nw', l: 'New', w: 56, v: (r) => (r.it.nw ? 'New' : ''), h: (r) => `<td class="help">${r.it.nw ? 'New' : ''}</td>` });
    SUG = null; const gs = ST.grpSel[bi] || '', inG = (it) => !gs || (gs.startsWith('F:') ? famOf(it.grp) === gs.slice(2) : it.grp === gs), inB = b.items.filter(inG);
    const cm = { todo: inB.filter((it) => it.inc !== 'No' && statusOf(it) !== 'Coded').length, coded: inB.filter((it) => statusOf(it) === 'Coded').length, all: inB.length };
    if (ST.next) {   // the not-coded items, biggest first; coding one takes it off the list
      const inc = inB.filter((it) => it.inc !== 'No'), tot = inc.reduce((s, it) => s + Math.abs(it.td), 0) || 1, done = inc.filter((it) => statusOf(it) === 'Coded').reduce((s, it) => s + Math.abs(it.td), 0);
      const todo = inc.filter((it) => statusOf(it) !== 'Coded').sort((x, y) => Math.abs(y.td) - Math.abs(x.td)); let run = done, n80 = 0; const cum = new Map();
      todo.forEach((it, i) => { run += Math.abs(it.td); cum.set(it, run / tot); if (!n80 && run >= 0.8 * tot) n80 = i + 1; });
      const ix = cols.findIndex((c) => c.k === 'st'); cols.splice(ix, 1, { k: 'why', l: 'Suggested because', w: 300, v: (r) => (sugOf(r.it) || {}).why || '', h: (r) => { const s = sugOf(r.it); return `<td class="help" title="${esc(s ? s.why : '')}">${s ? `<span class="ent">↵</span> <span style="color:#2F5597">${esc(s.why)}</span>` : 'no suggestion – type a code'}</td>`; } });
      cols.unshift({ k: 'rk', l: '#', w: 64, num: 1, fixW: 1, v: (r) => r.rk, h: (r) => `<td class="num help">${r.rk}</td>` });
      { const td = cols.splice(cols.findIndex((c) => c.k === 'td'), 1)[0]; td.l = 'Cost to date'; cols.splice(cols.findIndex((c) => c.code), 0, td, numC('cum', 'Cumul.', 86, (r) => cum.get(r.it) || 0, { f: (x) => (100 * x).toFixed(1) + '%' })); }   // the cost sits before the code boxes: you see what you are coding
      const bar = `<span class="nxp" title="Share of this bucket's to-date cost on coded items"><span class="nxb"><i style="width:${(100 * done / tot).toFixed(1)}%"></i><u></u></span><small><b>${(100 * done / tot).toFixed(1)}%</b> coded · ${done / tot >= 0.8 ? 'past <b>80%</b> of the cost' : `the next <b>${n80}</b> item${n80 === 1 ? '' : 's'} bring you to <b>80%</b>`} · ${todo.length.toLocaleString('en-US')} to code</small></span>`;
      const gb = document.getElementById('nxbar'); if (gb) gb.innerHTML = bar;   // the progress sits in the keys strip
      return { cols, rows: todo.map((it, i) => ({ it, g: '', rk: i + 1 })), sel: true, status: true, groups: false, cm, extraTools: '', rowCls: () => '',
        foot: (rs) => ({ td: fmt(rs.reduce((s, r) => s + r.it.td, 0)), tm: fmt(rs.reduce((s, r) => s + r.it.tm, 0)), pe: fmt(rs.reduce((s, r) => s + r.it.pe, 0)) }) };
    }
    const fam = hasFam(b), rows = inB.map((it) => ({ it, g: b.tree ? it.grp : '' }));
    const zoom = zoomSeg(b);
    const sumC = (rs) => ({ td: fmt(rs.reduce((x, r) => x + r.it.td, 0)), tm: fmt(rs.reduce((x, r) => x + r.it.tm, 0)), pe: fmt(rs.reduce((x, r) => x + r.it.pe, 0)), n: rs.reduce((x, r) => x + r.it.n, 0).toLocaleString('en-US') });
    return { cols, rows, sel: true, status: true, cm, groups: b.tree, noGroupBtns: !!b.tree, extraTools: zoom, fam: fam ? famOf : null, gCells: b.tree ? (g, rs) => sumC(rs) : null, gSpanK: 'auto', fLabel: famLabel, rowCls: (r) => (r.it.uns && !r.it.td && r.it.exc ? 'uns exc' : ''), gLabel: (g, rs) => { const its = rs.map((r) => r.it), c = its.filter((x) => statusOf(x) === 'Coded'), td = its.reduce((s, x) => s + x.td, 0), tdc = c.reduce((s, x) => s + x.td, 0), un = its.filter((x) => x.uns), unx = un.reduce((s, x) => s + x.exc, 0); return `<span dir="auto" style="unicode-bidi:isolate">${esc(fam ? grpTail(g) : g)}</span><span class="gm">${its.length} items · coded ${c.length}/${its.length}${b.tree ? '' : ' · to date ' + fmt(td)}${un.length ? ` · not settled, left out ${fmt(unx)}` : ''}</span><span class="gb"><i style="width:${td ? (100 * tdc / td).toFixed(0) : 0}%"></i></span>`; },
      foot: (rs) => { const o = {}; o.td = fmt(rs.reduce((s, r) => s + r.it.td, 0)); o.tm = fmt(rs.reduce((s, r) => s + r.it.tm, 0)); o.pe = fmt(rs.reduce((s, r) => s + r.it.pe, 0)); return o; } };
  }
  if (ST.tab === 'pm' || ST.tab === 'xpm') {
    const X = ST.tab === 'xpm', xb = X ? ((ST.xpb ?? -1) < 0 ? BK.map((x, k) => k) : [ST.xpb]) : null;
    const mode = (X ? xb.some((k) => BK[k].qty) : b.qty) ? (X ? ST.xpMode || 'All' : ST.pmMode) : 'Amount', subs = mode === 'All' ? ['Qty', 'Rate', 'Amount'] : [mode], slots = X ? slotsOf().filter((sl) => sl.idx.some((k) => k >= (ST.xpFrom ?? 0) && k <= (ST.xpTo ?? NP - 1))) : slotsOf(), lead = [], XS = X && ST.xpView === 'sum';
    if (X) { lead.push({ k: 'bk', l: 'Bucket', w: 140, fz: 1, v: (r) => BK[r.it.bi].id, h: (r) => `<td title="${esc(BK[r.it.bi].id)}"><span class="bkc"><i style="background:${bkColor(r.it.bi)}"></i>${esc(BK[r.it.bi].short)}</span></td>` });
      ['pkg', 'mnl', 'ce'].forEach((f) => lead.push({ k: f, l: FN[f], tip: CTIP[f], w: (f === 'ce' ? 112 : f === 'mnl' ? 66 : 96) + 18, code: 1, v: (r) => r.e[f] || '(blank)', h: (r) => (r.e[f] ? `<td${r.e.hand ? ' class="xph" title="Coded on its CJI3 lines (not the item code)"' : ''}><b>${esc(r.e[f])}</b>${r.e.hand && f === 'pkg' ? ' <span class="help">✎</span>' : ''}</td>` : '<td class="help">–</td>') }));
      lead.push({ k: 'code', l: 'Item', w: 130, v: (r) => itemCode(r.it), h: (r) => `<td title="${esc(itemCode(r.it))}"><a class="lk open">${esc(itemCode(r.it))}</a></td>` }, { k: 'desc', l: 'Description', w: 240, v: (r) => itemDesc(r.it), h: (r) => `<td dir="auto" title="${esc(itemDesc(r.it))}">${esc(itemDesc(r.it))}</td>` }); }
    else {
    lead.push({ k: 'code', l: b.cols[bi === MATI ? 3 : isSub(bi) ? 1 : 0], w: 110, fz: 1, v: (r) => itemCode(r.it), h: (r) => `<td><a class="lk open">${esc(itemCode(r.it))}</a></td>` });
    if (itemDesc(b.items[0]) !== '' || bi === MATI || isSub(bi)) lead.push({ k: 'desc', l: 'Description', w: 240, v: (r) => itemDesc(r.it), h: (r) => `<td dir="auto" title="${esc(itemDesc(r.it))}">${esc(itemDesc(r.it))}</td>` });
    ['pkg', 'mnl', 'ce'].forEach((f) => lead.push({ k: f, l: FN[f], w: f === 'ce' ? 96 : 66, code: 1, v: (r) => r.it[f] || '(blank)', h: (r) => `<td><b>${esc(r.it[f])}</b></td>` })); }
    const agg = (it, idx, sub, e) => { const s = e || it; let a = 0, q = 0; for (const p of idx) { a += s.p[p]; q += s.q[p]; } return sub === 'Qty' ? q : sub === 'Rate' ? (Math.abs(q) > 1e-9 ? a / q : 0) : a; };
    const fmtOf = (sub) => (sub === 'Qty' ? fq : sub === 'Rate' ? fmt2 : fmt), tdIdx = PER.slice(0, NP - 1).map((x, k) => k), cols = [...lead];
    if (XS) xpSumCols(cols, subs, mode, agg, fmtOf, tdIdx); else slots.forEach((sl, si) => subs.forEach((sub) => cols.push(numC('s' + si + sub, mode === 'All' ? sub : sl.label, mode === 'All' ? (sub === 'Rate' ? 78 : 90) : 98, (r) => agg(r.it, sl.idx, sub, r.e), { f: fmtOf(sub), pl: sl.label, th: (sl.idx.includes(rep) ? 'cut' : sl.kind === 'pend' ? 'pend' : '') + (sl.kind === 'q' || sl.kind === 'y' ? ' agg' : ''),
      cls: () => (sl.idx.includes(rep) ? 'cutc' : sl.kind !== 'open' && sl.kind !== 'pend' && rep > 0 && Math.min(...sl.idx) > rep ? 'after' : ''), slot: si, sub, pidx: sl.idx }))));
    if (!XS) subs.forEach((sub) => cols.push(numC('td' + sub, mode === 'All' ? sub : sub === 'Amount' ? 'To date' : sub + ' to date', 104, (r) => agg(r.it, tdIdx, sub, r.e), { f: fmtOf(sub), pl: 'To date', h: (r) => `<td class="num"><b>${fmtOf(sub)(agg(r.it, tdIdx, sub, r.e))}</b></td>`, slot: 'td', sub, pidx: tdIdx })));
    // header bands: years › quarters (› month when Qty · Rate · Amount)
    const nL = lead.length, bands = [], yr = [], qr = [], mr = [];
    const spanOf = (pred) => slots.filter(pred).length * subs.length;
    yr.push({ l: '', span: nL, cls: 'blank' }); qr.push({ l: '', span: nL, cls: 'blank' }); mr.push({ l: '', span: nL, cls: 'blank' });
    slots.forEach((sl, si) => { if (sl.kind === 'open' || sl.kind === 'pend') { yr.push({ l: '', span: subs.length, cls: 'blank' }); qr.push({ l: '', span: subs.length, cls: 'blank' }); }
      else { if (si === 0 || slots[si - 1].y !== sl.y || slots[si - 1].kind === 'open') yr.push({ l: `${PF.has('Y' + sl.y) ? '+' : '−'} ${sl.y}`, span: spanOf((x) => x.y === sl.y && x.kind !== 'open' && x.kind !== 'pend'), cls: 'tog y', tog: 'Y' + sl.y });
        if (sl.kind === 'y') qr.push({ l: 'year total', span: subs.length, cls: 'q' }); else if (si === 0 || slots[si - 1].q !== sl.q || slots[si - 1].y !== sl.y) qr.push({ l: `${PF.has('Q' + sl.y + '-' + sl.q) ? '+' : '−'} Q${sl.q}-${String(sl.y).slice(2)}`, span: spanOf((x) => x.y === sl.y && x.q === sl.q && (x.kind === 'm' || x.kind === 'q')), cls: 'tog q', tog: 'Q' + sl.y + '-' + sl.q }); }
      mr.push({ l: sl.label, span: subs.length, cls: sl.idx.includes(rep) ? 'cutb' : '' }); });
    [yr, qr, mr].forEach((row) => row.push({ l: mode === 'All' ? 'To date' : '', span: subs.length, cls: 'blank' }));
    if (X) { bands.length = 0; if (mode === 'All') bands.push(XS ? xpSumBand(nL, subs) : mr); xpBlocks(cols, subs); } else { bands.push(yr, qr); if (mode === 'All') bands.push(mr); }
    const rows = X ? [...R.exp.values()].filter((e) => xb.includes(e.b) && e.p.some((v) => Math.abs(v) >= 0.005)).sort((x, y) => x.b - y.b || x.ii - y.ii).map((e, n) => ({ it: BK[e.b].items[e.ii], e, g: xpGrpOf(e), xk: 'X' + n, stx: e.pkg && e.mnl && e.ce ? 'Coded' : 'Not coded' })) : b.items.map((it) => ({ it, g: b.tree ? it.grp : '' }));
    const footF = (rs) => { const o = {}; cols.forEach((c) => { if (c.slot === undefined) return; const idx = c.pidx || (c.slot === 'td' ? tdIdx : slots[c.slot].idx); let a = 0, q = 0; rs.forEach((r) => { const s = r.e || r.it; idx.forEach((p) => { a += s.p[p]; q += s.q[p]; }); }); o[c.k] = X && c.sub !== 'Amount' ? '' : c.sub === 'Qty' ? fq(q) : c.sub === 'Rate' ? (Math.abs(q) > 1e-9 ? fmt2(a / q) : '') : fmt(a); }); return o; };
    const pmSeg = (q) => (q ? `<span class="seg">${[['All', 'Qty · Rate · Amount'], ['Amount', 'Amount'], ['Qty', 'Qty'], ['Rate', 'Rate']].map(([m, l]) => `<button data-pm="${m}" class="${mode === m ? 'on' : ''}">${l}</button>`).join('')}</span>` : '') + ` <span class="seg">${['Months', 'Quarters', 'Years'].map((v) => `<button data-pv="${v}">${v}</button>`).join('')}</span>`;
    if (X) return xpDef({ cols, rows, bands, footF, mode, slots, hasQ: xb.some((k) => BK[k].qty), pmSeg });
    const fam = hasFam(b);
    return { cols, rows, bands, groups: b.tree, noGroupBtns: !!b.tree, fam: fam ? famOf : null, fLabel: famLabel, gCells: b.tree ? (g, rs) => footF(rs) : null, gSpanK: 'auto', gLabel: (g, rs) => `<span dir="auto" style="unicode-bidi:isolate">${esc(fam ? grpTail(g) : g)}</span><span class="gm">${rs.length} items</span>`,
      foot: footF, extraTools: zoomSeg(b) + ' ' + (b.qty ? `<span class="seg">${[['Amount', 'Amount'], ['Qty', 'Qty'], ['Rate', 'Rate'], ['All', 'Qty · Rate · Amount']].map(([m, l]) => `<button data-pm="${m}" class="${mode === m ? 'on' : ''}">${l}</button>`).join('')}</span>` : '')
        + ` <span class="seg">${['Months', 'Quarters', 'Years'].map((v) => `<button data-pv="${v}">${v}</button>`).join('')}</span>` };
  }
  if (ST.tab === 'lines') {
    // one bucket, or every line of every bucket (bi = -1); grouped by item; tick lines (header ☐ = all lines that pass the filters) and code them
    const all = bi < 0, idx = [], gs = all ? '' : ST.grpSel[bi] || '', gOk = (i) => { if (!gs) return true; const g = BK[bi].items[L.it[i]].grp; return gs.startsWith('F:') ? famOf(g) === gs.slice(2) : g === gs; };   // the side list's group / family, as on Coding
    for (let i = 0; i < N; i++) if ((all && (!XB.size || XB.has(L.b[i]))) || (L.b[i] === bi && gOk(i))) idx.push(i);
    const it = (i) => BK[L.b[i]].items[L.it[i]], ef = (i, f) => { const o = OVR[L.id[i]]; return o && o[f] !== undefined ? o[f] : it(i)[f]; };
    const anyQ = all ? true : b.qty, isMat = !all && bi === MATI, isS = !all && isSub(bi);
    const tx = (k, l, w, arr) => ({ k, l, w, v: (r) => S[arr[r.i]], h: (r) => `<td dir="auto" title="${esc(S[arr[r.i]])}">${esc(S[arr[r.i]])}</td>` });
    // flat, like Coding: one row per CJI3 line – the item's Coding columns first, then the line's codes, status, include, and every line detail
    const GN = META.grpNames || {}, iv = (r, j) => it(r.i).vals[j] || '', cols = [];
    if (all) cols.push({ k: 'bk', l: 'Bucket', w: 130, v: (r) => BK[L.b[r.i]].id, h: (r) => `<td title="${esc(BK[L.b[r.i]].id)}">${isOB(r.i) ? OBTAG + ' ' : ''}<span class="bkc"><i style="background:${bkColor(L.b[r.i])}"></i>${esc(BK[L.b[r.i]].short)}</span></td>` },
      { k: 'item', l: 'Item', w: 120, fz: 1, v: (r) => itemCode(it(r.i)), h: (r) => `<td><a class="lk open2" data-bi="${L.b[r.i]}" data-ii="${L.it[r.i]}">${esc(itemCode(it(r.i)))}</a></td>` },
      { k: 'idesc', l: 'Description', w: 240, v: (r) => itemDesc(it(r.i)), h: (r) => `<td dir="auto" title="${esc(itemDesc(it(r.i)))}">${esc(itemDesc(it(r.i)))}</td>` });
    else b.cols.forEach((lab, j) => { if (isMat && j < 2) return; const code = j === (isMat ? 3 : isS ? 1 : 0);
      if (isMat && lab === 'Unit') cols.push(tx('name', 'Name (CJI3)', 210, L.name));
      cols.push({ k: 'c' + j, l: lab, w: lab === 'Unit' ? 58 : isMat && lab === 'Group' ? 190 : lab === 'Description' || /name/i.test(lab) ? 260 : lab === 'Type of works' ? 170 : 100, ...(code ? { fz: 1 } : {}), v: (r) => (isMat && lab === 'Group' ? iv(r, j) + (GN[iv(r, j)] ? ' · ' + GN[iv(r, j)] : '') : iv(r, j)),
        h: (r) => (lab === 'Unit' ? `<td>${iv(r, j) ? `<span class="u" style="background:${unitCol(iv(r, j))}">${esc(iv(r, j))}</span>` : ''}</td>`
          : isMat && lab === 'Group' ? `<td title="${esc(iv(r, j))} ${esc(GN[iv(r, j)] || '')}">${isOB(r.i) ? OBTAG + ' ' : ''}${esc(iv(r, j))} <span class="help">${esc(GN[iv(r, j)] || '')}</span></td>`
          : code ? `<td>${!isMat && j === 0 && isOB(r.i) ? OBTAG + ' ' : ''}<a class="lk open2" data-bi="${L.b[r.i]}" data-ii="${L.it[r.i]}">${esc(iv(r, j))}</a></td>`
          : `<td dir="auto" title="${esc(iv(r, j))}">${!isMat && j === 0 && isOB(r.i) ? OBTAG + ' ' : ''}${esc(iv(r, j))}</td>`) }); });
    if (all || !isMat) cols.push(tx('name', 'Name (CJI3)', 210, L.name));
    ['pkg', 'mnl', 'ce'].forEach((f) => cols.push({ k: f, l: FN[f], tip: CTIP[f], w: (f === 'ce' ? 104 : 80) + 18, code: 1, v: (r) => ef(r.i, f) || '(blank)', h: (r) => { const o = OVR[L.id[r.i]]; return codeInput(it(r.i), f, o && o[f] !== undefined ? o[f] : undefined); } }));
    cols.push({ k: 'st', l: 'Status', tip: 'Coded = the line has every code (its own or its item\'s)', w: 118, v: (r) => lineStatusOf(r.i), h: (r) => `<td><span class="st ${lineStatusOf(r.i).split(' ')[0]}">${lineStatusOf(r.i)}</span></td>` },
      { k: 'inc', l: 'Include', w: 92, v: (r) => ef(r.i, 'inc'), h: (r) => `<td><button class="incb ${ef(r.i, 'inc') === 'No' ? 'no' : ''}">${ef(r.i, 'inc') === 'No' ? 'No' : 'Yes'}</button>${OVR[L.id[r.i]] ? '<button class="rst" title="Back to the item\'s codes">↺</button>' : ''}</td>` });
    if (anyQ) cols.push(numC('qty', 'Qty', 84, (r) => L.qty[r.i], { f: fq }));
    cols.push(numC('amt', 'Amount', 110, (r) => R.amt[r.i], { f: fmt2 }));
    cols.unshift({ k: 'date', l: 'Posting date', w: 92, v: (r) => (L.d[r.i] ? String(L.d[r.i]).replace(/(\d{4})(\d\d)(\d\d)/, '$1-$2-$3') : ''), h: (r) => `<td>${L.d[r.i] ? String(L.d[r.i]).replace(/(\d{4})(\d\d)(\d\d)/, '$1-$2-$3') : ''}</td>` },
      { k: 'per', l: 'Period', w: 72, v: (r) => PER[R.per[r.i]], h: (r) => `<td><b>${PER[R.per[r.i]]}</b></td>` });   // the posting date and period first
    if (!isMat) cols.push(tx('desc', 'Line text', 220, L.desc));
    if (isS || all) cols.push({ k: 'po', l: 'PO', w: 96, v: (r) => S[L.po[r.i]], h: (r) => `<td>${esc(S[L.po[r.i]])}</td>` }, { k: 'sup', l: 'Subcontractor', w: 160, v: (r) => S[L.sup[r.i]], h: (r) => `<td dir="auto">${esc(S[L.sup[r.i]])}</td>` });
    if (isS || (!all && BK[bi].zint)) cols.push({ k: 'src', l: 'Source', w: 120, v: (r) => SRC[r.i], h: (r) => `<td>${esc(SRC[r.i])}</td>` });
    cols.push({ k: 'wbs', l: 'WBS element', w: 150, v: (r) => S[L.wbs[r.i]], h: (r) => `<td>${esc(S[L.wbs[r.i]])}</td>` },
      // the CJI3 text columns – the allocation information (as on the Excel Data sheets)
      tx('hdr', 'Document header text', 200, L.hdr), tx('off', 'Offsetting account', 180, L.off),
      { k: 'doc', l: 'Document', w: 96, v: (r) => S[L.doc[r.i]], h: (r) => `<td>${esc(S[L.doc[r.i]])}</td>` }, { k: 'ty', l: 'Type', w: 64, v: (r) => S[L.ty[r.i]] + (isOB(r.i) ? ' · OB' : ''), h: (r) => `<td>${esc(S[L.ty[r.i]])}${isOB(r.i) ? ' ' + OBTAG : ''}</td>` },
      { k: 'ce2', l: 'Cost element', w: 90, v: (r) => S[L.ce[r.i]], h: (r) => `<td>${esc(S[L.ce[r.i]])}</td>` }, { k: 'cen', l: 'Cost element name', w: 170, v: (r) => S[L.cen[r.i]], h: (r) => `<td>${esc(S[L.cen[r.i]])}</td>` });
    { const mv = ['wbs', 'hdr'].map((k) => cols.splice(cols.findIndex((c) => c.k === k), 1)[0]); cols.splice(cols.findIndex((c) => c.k === 'name') + 1, 0, ...mv); }   // WBS and document header text right after the name
    return { cols, rows: idx.map((i) => ({ i, it: it(i), g: '' })), lines: true, sel: true, status: true, groups: false, extraTools: '', rowCls: (r) => (isOB(r.i) ? 'obr' : ''),
      foot: (rs) => ({ amt: fmt2(rs.reduce((s0, r) => s0 + (R.inc[r.i] ? R.amt[r.i] : 0), 0)), ...(anyQ ? { qty: fq(rs.reduce((s0, r) => s0 + (R.inc[r.i] ? L.qty[r.i] : 0), 0)) } : {}) }) };
  }
  if (ST.tab === 'gl' || ST.tab === 'wbs') {
    // month columns (Opening · months folding into quarters / years · Pending) + To date, amounts only
    const slots = slotsOf(), tdIdx = PER.slice(0, NP - 1).map((x, k) => k), cols = [], nL = ST.tab === 'gl' ? (ST.glMode === 'bucket' ? 4 : 4) : 3;
    const sumIdx = (p, idx) => { let a = 0; for (const k of idx) a += p[k]; return a; };
    const slotCols = (getP) => { slots.forEach((sl, si) => cols.push(numC('s' + si, sl.label, 98, (r) => sumIdx(getP(r), sl.idx), { th: (sl.idx.includes(rep) ? 'cut' : sl.kind === 'pend' ? 'pend' : ''), cls: () => (sl.idx.includes(rep) ? 'cutc' : sl.kind !== 'open' && sl.kind !== 'pend' && rep > 0 && Math.min(...sl.idx) > rep ? 'after' : '') })));
      cols.push(numC('td', 'To date', 112, (r) => sumIdx(getP(r), tdIdx), { h: (r) => `<td class="num"><b>${fmt(sumIdx(getP(r), tdIdx))}</b></td>` })); };
    const bandsOf = (lead) => { const yr = [{ l: '', span: lead, cls: 'blank' }], qr = [{ l: '', span: lead, cls: 'blank' }];
      slots.forEach((sl, si) => { if (sl.kind === 'open' || sl.kind === 'pend') { yr.push({ l: '', span: 1, cls: 'blank' }); qr.push({ l: '', span: 1, cls: 'blank' }); return; }
        if (si === 0 || slots[si - 1].y !== sl.y || slots[si - 1].kind === 'open') yr.push({ l: `${PF.has('Y' + sl.y) ? '+' : '−'} ${sl.y}`, span: slots.filter((x) => x.y === sl.y && x.kind !== 'open' && x.kind !== 'pend').length, cls: 'tog y', tog: 'Y' + sl.y });
        if (sl.kind === 'y') qr.push({ l: 'year total', span: 1, cls: 'q' }); else if (si === 0 || slots[si - 1].q !== sl.q || slots[si - 1].y !== sl.y) qr.push({ l: `${PF.has('Q' + sl.y + '-' + sl.q) ? '+' : '−'} Q${sl.q}-${String(sl.y).slice(2)}`, span: slots.filter((x) => x.y === sl.y && x.q === sl.q && (x.kind === 'm' || x.kind === 'q')).length, cls: 'tog q', tog: 'Q' + sl.y + '-' + sl.q }); });
      yr.push({ l: '', span: 1, cls: 'blank' }); qr.push({ l: '', span: 1, cls: 'blank' }); return [yr, qr]; };
    const pv = ` <span class="seg">${['Months', 'Quarters', 'Years'].map((v) => `<button data-pv="${v}">${v}</button>`).join('')}</span>`, xb = ST.xbk;
    const agg = (keyFn) => { const m = new Map(); for (let i = 0; i < N; i++) { if (!R.inc[i] || (xb >= 0 && L.b[i] !== xb) || (XB.size && !XB.has(L.b[i])) || xb === -2) continue; const k = keyFn(i); let x = m.get(k); if (!x) m.set(k, (x = { p: new Float64Array(NP), n: 0, bk: new Map(), name: '' })); x.p[R.per[i]] += R.amt[i]; x.n++; x.bk.set(L.b[i], (x.bk.get(L.b[i]) || 0) + R.amt[i]); x.name = x.name || S[L.cen[i]] || (S[L.ce[i]] ? '' : 'adjustment rows (certificate report vs CJI3)'); } return m; };
    const revAgg = (keyFn) => { const m = new Map(); if (xb >= 0 || XB.size) return m; for (const e of REV) { const [d, mo, a] = e, p = mo === 0 ? 0 : mo < 0 || !d || d > R.cutI ? NP - 1 : mo, k = keyFn(e); let x = m.get(k); if (!x) m.set(k, (x = { p: new Float64Array(NP), n: 0, bk: new Map([[-1, 0]]), name: S[e[5]], rev: 1 })); x.p[p] += a; x.n++; x.bk.set(-1, x.bk.get(-1) + a); } return m; };
    if (ST.tab === 'gl') {
      const m = agg((i) => (ST.glMode === 'bucket' ? L.b[i] + '|' : '') + (S[L.ce[i]] || '(no cost element)')), rv = revAgg((e) => (ST.glMode === 'bucket' ? 'R|' : '') + S[e[4]]);
      const rows = [...m].map(([k, x]) => ({ k, ce: k.split('|').pop(), x, g: ST.glMode === 'bucket' ? BK[+k.split('|')[0]].id : '' })).concat([...rv].map(([k, x]) => ({ k, ce: k.split('|').pop(), x, g: ST.glMode === 'bucket' ? 'Revenue' : '' })))
        .sort((a, b) => (a.g < b.g ? -1 : a.g > b.g ? 1 : 0) || (a.x.rev || 0) - (b.x.rev || 0) || (a.ce < b.ce ? -1 : 1));
      cols.push({ k: 'ce', l: 'Cost element', w: 104, fz: 1, v: (r) => r.ce, h: (r) => `<td><a class="lk" data-kind="ce" data-brk="${esc(r.ce)}">${esc(r.ce)}</a></td>` }, { k: 'name', l: 'Cost element name', w: 220, v: (r) => r.x.name, h: (r) => `<td title="${esc(r.x.name)}">${esc(r.x.name)}</td>` },
        { k: 'bk', l: 'Bucket(s)', w: 200, v: (r) => (r.x.rev ? ['Revenue'] : [...r.x.bk.keys()].map((b) => BK[b].id)), h: (r) => `<td class="help" title="${esc(r.x.rev ? 'Revenue' : [...r.x.bk.keys()].map((b) => BK[b].id).join(', '))}">${esc(r.x.rev ? 'Revenue' : [...r.x.bk.keys()].map((b) => BK[b].short).join(', '))}</td>` }, numC('n', 'Lines', 70, (r) => r.x.n));
      slotCols((r) => r.x.p);
      const ft = (rs) => { const o = {}; slots.forEach((sl, si) => { o['s' + si] = fmt(rs.filter((r) => !r.x.rev).reduce((s0, r) => s0 + sumIdx(r.x.p, sl.idx), 0)); }); o.td = fmt(rs.filter((r) => !r.x.rev).reduce((s0, r) => s0 + sumIdx(r.x.p, tdIdx), 0)); o.n = fmt(rs.reduce((s0, r) => s0 + r.x.n, 0)); return o; };
      return { cols, rows, bands: bandsOf(4), groups: ST.glMode === 'bucket', gColor: (g) => (g === 'Revenue' ? '#DCEBDF' : grpCol(g)), gLabel: (g, rs) => `<b>${esc(g)}</b><span class="gm">${rs.length} cost elements · to date ${fmt(rs.reduce((s0, r) => s0 + sumIdx(r.x.p, tdIdx), 0))}</span>`, foot: ft,
        extraTools: `<span class="seg">${[['ce', 'By cost element'], ['bucket', 'By bucket']].map(([k, l]) => `<button data-gm="${k}" class="${ST.glMode === k ? 'on' : ''}">${l}</button>`).join('')}</span>` + pv + ' <span class="help">TOTAL = cost (revenue rows are listed but not added)</span>' };
    }
    // ---- WBS tree: every WBS level of the codes (I-SUTH › .01 › -01 › -1 › -06 › -GRS); a node's amounts include everything below it
    const own = agg((i) => S[L.wbs[i]] || '(no WBS)'), nodes = new Map(), S0 = vs();
    const anc = (code) => { const i = code.indexOf('.'); if (i < 0) return [code]; const out = [code.slice(0, i)], re = /[.\-]/g; re.lastIndex = i + 1; let mm; while ((mm = re.exec(code))) out.push(code.slice(0, mm.index)); out.push(code); return [...new Set(out)]; };
    const node = (code, depth) => nodes.get(code) || nodes.set(code, { code, depth, p: new Float64Array(NP), n: 0, kids: new Set(), own: null, bk: new Map() }).get(code);
    for (const [code, x] of own) { const a = anc(code); a.forEach((c, d) => { const nd = node(c, d + 1); x.p.forEach((v, k) => { nd.p[k] += v; }); nd.n += x.n; for (const [b, v] of x.bk) nd.bk.set(b, (nd.bk.get(b) || 0) + v); if (d) node(a[d - 1], d).kids.add(c); }); node(code, a.length).own = x; }
    const all = [...nodes.values()]; R.treeNodes = all;
    if (!S0.lv) { S0.fold = new Set(all.filter((n) => n.depth >= 3 && n.kids.size).map((n) => n.code)); S0.lv = 1; }
    const q = S0.q.trim().toLowerCase(), nameOf = (c) => META.wbsNames[c] || '', hit = q ? new Set() : null;
    if (q) for (const n of all) if ((n.code + ' ' + nameOf(n.code)).toLowerCase().includes(q)) anc(n.code).forEach((c) => hit.add(c));
    const kidsOf = (n) => [...n.kids].sort().map((c) => nodes.get(c)), roots = all.filter((n) => n.depth === 1).sort((a, b) => (a.code < b.code ? -1 : 1)), rows = [];
    const walk = (n) => { if (hit && !hit.has(n.code)) return; rows.push({ n }); if (!hit && S0.fold.has(n.code)) return; kidsOf(n).forEach(walk); }; roots.forEach(walk);
    cols.push({ k: 'code', l: 'WBS element', w: 300, fz: 1, v: (r) => r.n.code, h: (r) => `<td title="${esc(r.n.code)}" style="padding-left:${6 + (r.n.depth - 1) * 16}px">${r.n.kids.size ? `<span class="tgl" data-node="${esc(r.n.code)}">${S0.fold.has(r.n.code) && !hit ? '+' : '−'}</span>` : '<span class="tgl0"></span>'}<a class="lk" data-kind="wbs" data-brk="${esc(r.n.code)}" style="${r.n.depth <= 2 ? 'font-weight:700' : ''}">${esc(r.n.code)}</a></td>` },
      { k: 'name', l: 'Name', w: 260, v: (r) => nameOf(r.n.code), h: (r) => `<td dir="auto" title="${esc(nameOf(r.n.code))}" style="${r.n.depth <= 2 ? 'font-weight:600' : ''}">${esc(nameOf(r.n.code))}</td>` }, numC('n', 'Lines', 70, (r) => r.n.n));
    slotCols((r) => r.n.p);
    const lv = ` <span class="seg">${[1, 2, 3, 4, 5, 6, 7].map((k) => `<button data-lvl="${k}">L${k}</button>`).join('')}<button data-lvl="99">All</button></span>`;
    return { cols, rows, bands: bandsOf(3), noFilter: true, search: true, tree: true, rowCls: (r) => 'lv' + Math.min(r.n.depth, 4), extraTools: '<span class="help">Levels</span>' + lv + pv,
      foot: () => { const o = {}; const rs = roots; slots.forEach((sl, si) => { o['s' + si] = fmt(rs.reduce((s0, n) => s0 + sumIdx(n.p, sl.idx), 0)); }); o.td = fmt(rs.reduce((s0, n) => s0 + sumIdx(n.p, tdIdx), 0)); o.n = fmt(rs.reduce((s0, n) => s0 + n.n, 0)); return o; } };
  }
  if (ST.tab === 'exp') {
    const pkgs = [...new Set([...R.exp.values()].map((e) => e.pkg))].sort((a, b2) => (a === '') - (b2 === '') || a.localeCompare(b2)), pIx = new Map(pkgs.map((p, k) => [p, k]));
    const rows = [...R.exp.values()].filter((e) => e.p.some((v) => Math.abs(v) > 0.005)).map((e) => ({ e, it: BK[e.b].items[e.ii], g: (e.pkg || '(no PKG yet)'), g2: BK[e.b].id }))
      .sort((x, y) => pIx.get(x.e.pkg) - pIx.get(y.e.pkg) || x.e.b - y.e.b || x.e.ii - y.e.ii);
    const cols = [{ k: 'b', l: 'Bucket', w: 150, fz: 1, v: (r) => r.g2, h: (r) => `<td>${esc(r.g2)}</td>` }, { k: 'code', l: 'Item', w: 120, fz: 1, v: (r) => itemCode(r.it), h: (r) => `<td title="${esc(itemCode(r.it))}">${esc(itemCode(r.it))}</td>` },
      { k: 'desc', l: 'Description', w: 260, v: (r) => itemDesc(r.it), h: (r) => `<td dir="auto" title="${esc(itemDesc(r.it))}">${esc(itemDesc(r.it))}${r.e.hand ? ' <span class="st Partly">hand-coded</span>' : ''}</td>` },
      { k: 'mnl', l: 'MNL', w: 64, code: 1, v: (r) => r.e.mnl || '(blank)', h: (r) => `<td><b>${esc(r.e.mnl)}</b></td>` }, { k: 'ce', l: 'Cost element', w: 100, code: 1, v: (r) => r.e.ce || '(blank)', h: (r) => `<td><b>${esc(r.e.ce)}</b></td>` }];
    PER.forEach((pl, p) => cols.push(numC('p' + p, pl, 96, (r) => r.e.p[p], { th: p === rep ? 'cut' : p === NP - 1 ? 'pend' : '', cls: () => (p === rep ? 'cutc' : p > 0 && p < NP - 1 && rep > 0 && p > rep ? 'after' : '') })));
    cols.push(numC('td', 'To date', 112, (r) => r.e.p.slice(0, NP - 1).reduce((s, v) => s + v, 0), { h: (r) => `<td class="num"><b>${fmt(r.e.p.slice(0, NP - 1).reduce((s, v) => s + v, 0))}</b></td>` }));
    return { cols, rows, groups: true, sub2: true, pkgColor: (g) => (g === '(no PKG yet)' ? '#F6EBC8' : SOFT[pIx.get(g) % SOFT.length]), gLabel: (g, rs) => `<b>${esc(g)}</b><span class="gm">${new Set(rs.map((r) => r.g2)).size} buckets · ${rs.length} items · to date ${fmt(rs.reduce((s, r) => s + r.e.p.slice(0, NP - 1).reduce((a, v) => a + v, 0), 0))}</span>`,
      foot: (rs) => { const o = {}; PER.forEach((pl, p) => { o['p' + p] = fmt(rs.reduce((s, r) => s + r.e.p[p], 0)); }); o.td = fmt(rs.reduce((s, r) => s + r.e.p.slice(0, NP - 1).reduce((a, v) => a + v, 0), 0)); return o; } };
  }
  if (ST.tab === 'sub') return subDef();
  if (ST.tab === 'uns') return unsDef();
  if (ST.tab === 'dep') return depDef();
}
// ---- Subcontractor views
function subDef() {
  const sb = BK[SUBI], tools = subSeg(ST.sub);
  // PO × service from the lines (counted, to the cut date)
  const map = new Map(); for (let i = 0; i < N; i++) { if (L.b[i] !== SUBI || !R.inc[i]) continue; const po = S[L.po[i]], k = po + '|' + L.it[i]; let x = map.get(k); if (!x) map.set(k, (x = { po, ii: L.it[i], td: 0, tm: 0, pe: 0, qty: 0, op: 0, certs: new Set(), d0: 0, d1: 0 }));
    const p = R.per[i]; if (p === NP - 1) x.pe += R.amt[i]; else { x.td += R.amt[i]; x.qty += L.qty[i]; if (p === 0) x.op += R.amt[i]; } if (p === R.rep) x.tm += R.amt[i]; if (S[L.cert[i]]) x.certs.add(S[L.cert[i]]); }
  const poTot = new Map(); for (const x of map.values()) { const t = poTot.get(x.po) || { td: 0, tm: 0, pe: 0, op: 0, n: 0 }; t.td += x.td; t.tm += x.tm; t.pe += x.pe; t.op += x.op; t.n++; poTot.set(x.po, t); }
  if (ST.sub === 'po') {
    const rows = [...map.values()].map((x) => ({ x, it: sb.items[x.ii], g: x.po })).sort((a, b) => poTot.get(b.x.po).td - poTot.get(a.x.po).td || b.x.td - a.x.td);
    const cols = [{ k: 'po', l: 'PO', w: 96, fz: 1, v: (r) => r.x.po, h: (r) => `<td class="help">${esc(r.x.po)}</td>` }, { k: 'sup', l: 'Subcontractor', w: 160, v: (r) => SUB.supn[r.x.po] || '', h: (r) => `<td dir="auto" class="help">${esc(SUB.supn[r.x.po] || '')}</td>` },
      { k: 'svc', l: 'Service', w: 96, v: (r) => r.it.vals[1], h: (r) => `<td><a class="lk open">${esc(r.it.vals[1])}</a></td>` }, { k: 'desc', l: 'Description', w: 260, v: (r) => r.it.vals[2], h: (r) => `<td dir="auto" title="${esc(r.it.vals[2])}">${esc(r.it.vals[2])}</td>` },
      ...['div', 'pkg', 'mnl', 'ce'].map((f) => ({ k: f, l: FN[f], w: f === 'ce' ? 100 : f === 'div' ? 88 : f === 'mnl' ? 66 : 80, code: 1, v: (r) => r.it[f] || '(blank)', h: (r) => codeInput(r.it, f) })),
      { k: 'st', l: 'Status', w: 104, v: (r) => statusOf(r.it), h: (r) => stCell(r.it) }, numC('qty', 'Qty (PO)', 92, (r) => r.x.qty, { f: fq }), numC('td', 'To date (PO)', 112, (r) => r.x.td, { h: (r) => `<td class="num"><b>${fmt(r.x.td)}</b></td>` }), numC('tm', 'This month (PO)', 112, (r) => r.x.tm)];
    return { cols, rows, sel: true, groups: true, poGroup: true, extraTools: tools, gLabel: (g) => `<b>${esc(g)}</b> &nbsp;<span dir="auto" style="unicode-bidi:isolate">${esc(SUB.title[g] || '')}</span><span class="gm" dir="auto" style="unicode-bidi:isolate">${esc(SUB.supn[g] || '')}</span>`,
      gCells: (g, rs) => ({ td: fmt(rs.reduce((s, r) => s + r.x.td, 0)), tm: fmt(rs.reduce((s, r) => s + r.x.tm, 0)), st: (() => { const t = rs.reduce((s, r) => s + r.x.td, 0), c = rs.filter((r) => statusOf(r.it) === 'Coded').reduce((s, r) => s + r.x.td, 0); return `<span class="gb" style="margin:0"><i style="width:${t ? (100 * c / t).toFixed(0) : 0}%"></i></span> ${t ? (100 * c / t).toFixed(0) : 0}%`; })() }),
      gColor: (g) => grpCol(SUB.type[g] || '') };
  }
  if (ST.sub === 'reg') {
    const pos = new Set([...poTot.keys(), ...Object.keys(SUB.unpostedByPo)]);
    const rows = [...pos].map((po) => ({ po, t: poTot.get(po) || { td: 0, tm: 0, pe: 0, op: 0, n: 0 }, c: SUB.po[po] || {} })).sort((a, b) => b.t.td - a.t.td);
    const cols = [{ k: 'po', l: 'PO', w: 100, fz: 1, v: (r) => r.po, h: (r) => `<td><a class="lk gopo" data-po="${esc(r.po)}">${esc(r.po)}</a></td>` }, { k: 'title', l: 'PO title', w: 260, v: (r) => SUB.title[r.po] || '', h: (r) => `<td dir="auto" title="${esc(SUB.title[r.po] || '')}">${esc(SUB.title[r.po] || '')}</td>` },
      { k: 'sup', l: 'Subcontractor', w: 200, v: (r) => SUB.supn[r.po] || '', h: (r) => `<td dir="auto">${esc(SUB.supn[r.po] || '')}</td>` }, { k: 'tow', l: 'Type of works', w: 170, v: (r) => SUB.type[r.po] || '', h: (r) => `<td dir="auto"><span class="u" style="background:${grpCol(SUB.type[r.po] || '')}">${esc(SUB.type[r.po] || '')}</span></td>` },
      { k: 'con', l: 'Contract', w: 110, v: (r) => (r.c.contract === 'A2' ? 'Incl. VAT (A2)' : r.c.contract === 'A1' ? 'Excl. VAT (A1)' : r.c.contract || ''), h: (r) => `<td>${r.c.contract === 'A2' ? 'Incl. VAT (A2)' : r.c.contract === 'A1' ? 'Excl. VAT (A1)' : esc(r.c.contract || '')}</td>` },
      numC('n', 'Certificates', 90, (r) => r.c.n || 0), { k: 'first', l: 'First cert.', w: 90, v: (r) => r.c.first || '', h: (r) => `<td>${esc(r.c.first || '')}</td>` }, { k: 'last', l: 'Last cert.', w: 90, v: (r) => r.c.last || '', h: (r) => `<td>${esc(r.c.last || '')}</td>` },
      numC('op', 'Opening', 104, (r) => r.t.op), numC('pv', 'Previous', 110, (r) => r.t.td - r.t.tm), numC('tm', 'This month', 108, (r) => r.t.tm, { cls: () => 'cutc' }), numC('td', 'To date', 112, (r) => r.t.td, { h: (r) => `<td class="num"><b>${fmt(r.t.td)}</b></td>` }), numC('pe', 'Pending', 96, (r) => r.t.pe), numC('un', 'Approved, not in CJI3', 120, (r) => SUB.unpostedByPo[r.po] || 0)];
    return { cols, rows, extraTools: tools, foot: (rs) => ({ op: fmt(rs.reduce((s, r) => s + r.t.op, 0)), pv: fmt(rs.reduce((s, r) => s + r.t.td - r.t.tm, 0)), tm: fmt(rs.reduce((s, r) => s + r.t.tm, 0)), td: fmt(rs.reduce((s, r) => s + r.t.td, 0)), pe: fmt(rs.reduce((s, r) => s + r.t.pe, 0)), un: fmt(rs.reduce((s, r) => s + (SUB.unpostedByPo[r.po] || 0), 0)) }) };
  }
  // Bridge
  const bySrc = new Map(); for (let i = 0; i < N; i++) if (L.b[i] === SUBI) { const k = SRC[i]; const x = bySrc.get(k) || { n: 0, a: 0 }; x.n++; x.a += R.amt[i]; bySrc.set(k, x); }
  const order = [['Certificate', 'Certificate lines posted in CJI3'], ['Opening certificate', 'Opening certificates (flag X)'], ['Opening difference', '+ Opening difference to CJI3'], ['Document difference', '+ Documents that differ (1 EGP or more)'], ['Rounding', '+ Rounding (under 1 EGP per document)'], ['CJI3 only', '+ CJI3 lines no certificate explains']];
  const rows = order.map(([k, l]) => ({ l, n: (bySrc.get(k) || {}).n || 0, a: (bySrc.get(k) || {}).a || 0 })); const reg = rows.reduce((s, r) => s + r.a, 0), vatC = R.vatIn;
  rows.push({ l: '= Subcontractor bucket (register)', a: reg, n: rows.reduce((s, r) => s + r.n, 0), b: 1 }, { l: '– VAT included in the amounts', a: vatC }, { l: '= Register without VAT', a: reg - vatC, b: 1 }, { l: 'Subcontractor bucket in CJI3 (the file)', a: SUB.cjiTotal }, { l: 'Difference (must be 0)', a: r2(reg - vatC - SUB.cjiTotal), b: 1 },
    { l: 'Approved certificates not yet in CJI3 (information)', a: SUB.unposted, n: SUB.unpostedN }, { l: 'Certificates not approved (information)', a: SUB.notApproved, n: SUB.notApprovedN }, { l: 'VAT on the certificates posted in CJI3', a: SUB.vatOnPosted }, { l: 'VAT on the opening certificates', a: SUB.vatOnOpening }, { l: 'WBS repeats removed', a: SUB.dupAmt, n: SUB.dupRows });
  const cols = [{ k: 'l', l: 'Step', w: 380, v: (r) => r.l, h: (r) => `<td style="${r.b ? 'font-weight:700' : ''}">${esc(r.l)}</td>` }, numC('n', 'Lines', 90, (r) => r.n || 0), numC('a', 'EGP', 150, (r) => r.a, { f: fmt2 })];
  return { cols, rows, extraTools: tools, noFilter: true };
}
// ---- Unsettled: ZINTC1 charges CJI3 has not settled yet, per month; one click includes them (counted as a CJI3 difference on the Summary)
function unsSet(mode, pick, label) { change([{ t: ST.unsView === 'c' ? 'unsc' : 'uns', v: JSON.stringify({ mode, pick: [...(pick || [])].map(String) }) }], label); }
function unsToggle(k) { const v = ST.unsView, keys = [...R.unsMk[v].keys()], cur = new Set(keys.filter((x) => R.keyOnK(v, x))); cur.has(k) ? cur.delete(k) : cur.add(k); unsSet('pick', cur, (cur.has(k) ? 'Added ' : 'Not added ') + unsLab(k)); }
const unsLab = (k) => (k === 'a' ? 'After the CJI3 data' : PER[+k]);
function unsDef() {   // one row per SAP order; its component (equipment type, trip charge, apartment) in a column
  const it = (i) => BK[L.b[i]].items[L.it[i]];
  if (!R.unsMk[ST.unsView].size) ST.unsView = ST.unsView === 'o' ? 'c' : 'o';
  const V = ST.unsView, keys = [...R.unsMk[V].keys()].sort((a, b) => (a === 'a' ? 1 : b === 'a' ? -1 : +a - +b)), on = (k) => R.keyOnK(V, k), ORD = L.ord || [];
  const byO = new Map(); for (let i = 0; i < N; i++) { if (!UNS[i] || (L.b[i] === SUBI) !== (V === 'c')) continue; const sc = L.b[i] === SUBI, o = sc ? S[L.po[i]] : S[ORD[i]] || itemCode(it(i)), g = sc ? it(i).vals[0] || '(no type of works)' : BK[L.b[i]].id, k = g + '|' + o; let r = byO.get(k);
    if (!r) byO.set(k, (r = { o, g, idx: [], comps: new Map(), ua: new Map(), desc: sc ? S[L.sup[i]] : S[L.hdr[i]] || '' })); r.idx.push(i); const c = itemCode(it(i)); r.comps.set(c, itemDesc(it(i))); if (sc) { (r.src || (r.src = new Set())).add(SRC[i]); (r.certs || (r.certs = new Set())).add(S[L.cert[i]]); }
    const mk = L.m[i] > 0 ? String(L.m[i]) : 'a'; r.ua.set(mk, (r.ua.get(mk) || 0) + R.amt[i]); if (!r.uq) { r.uq = new Map(); r.units = new Set(); } r.uq.set(mk, (r.uq.get(mk) || 0) + L.qty[i]); if (L.qty[i]) r.units.add(itemUnit(it(i)) || ''); }
  const top = [...byO.values()]; top.forEach((r) => { r.tot = [...r.ua.values()].reduce((s, v) => s + v, 0); r.compL = r.comps.size === 1 ? [...r.comps].map(([c, d]) => (c === r.o ? '(the order itself)' : c + ' · ' + d))[0] : r.comps.size + ' components: ' + [...r.comps.keys()].join(', ');
    if (r.certs) r.compL = 'cert. ' + [...r.certs].join(', ') + ' · ' + r.comps.size + ' service' + (r.comps.size > 1 ? 's' : ''); r.sq = [r.o, r.desc, r.compL].join(' '); }); top.sort((a, b) => (a.g < b.g ? -1 : a.g > b.g ? 1 : 0) || Math.abs(b.tot) - Math.abs(a.tot));
  const open = ST.unsOpen || (ST.unsOpen = new Set()), rows = [];
  const chMap = new Map();
  for (const r of top) { rows.push(r); if (!open.has(r.g + '|' + r.o)) continue;   // the order's lines (certificates: its services), one level under it
    if (V === 'c') { const bySv = new Map(); for (const i of r.idx) { const k = r.g + '|' + r.o + '|' + itemCode(it(i)); let c = bySv.get(k);
        if (!c) bySv.set(k, (c = { child: 1, agg: 1, key: k, o: r.o, g: r.g, it: it(i), svc: itemCode(it(i)), idx: [], ua: new Map(), tot: 0, qty: 0, certs: new Set(), src: new Set(), dsc: new Map() }));
        c.idx.push(i); c.tot += R.amt[i]; c.qty += L.qty[i]; if (!c.uq) { c.uq = new Map(); c.units = new Set(); } { const mq = L.m[i] > 0 ? String(L.m[i]) : 'a'; c.uq.set(mq, (c.uq.get(mq) || 0) + L.qty[i]); if (L.qty[i]) c.units.add(itemUnit(it(i)) || ''); } c.certs.add(S[L.cert[i]]); c.src.add(SRC[i]); c.dsc.set(itemDesc(it(i)), (c.dsc.get(itemDesc(it(i))) || 0) + Math.abs(R.amt[i])); const mk = L.m[i] > 0 ? String(L.m[i]) : 'a'; c.ua.set(mk, (c.ua.get(mk) || 0) + R.amt[i]); }
      [...bySv.values()].sort((a, b) => Math.abs(b.tot) - Math.abs(a.tot)).forEach((c) => { c.desc = [...c.dsc].sort((x, y) => y[1] - x[1])[0][0]; c.qtyT = c.qty ? fq(c.qty) + ' ' + (itemUnit(c.it) || '') : ''; c.certT = [...c.certs].join(', '); c.compL = 'cert. ' + [...c.certs].join(', '); c.sq = r.sq + ' ' + c.svc + ' ' + c.desc; chMap.set(c.key, c); rows.push(c); });
      continue; }
    r.idx.slice().sort((a, b) => L.m[a] - L.m[b] || L.d[a] - L.d[b]).forEach((i) => { const mk = L.m[i] > 0 ? String(L.m[i]) : 'a';
      rows.push({ child: 1, i, it: it(i), o: r.o, g: r.g, idx: [i], ua: new Map([[mk, R.amt[i]]]), uq: new Map([[mk, L.qty[i]]]), units: new Set(L.qty[i] ? [itemUnit(it(i)) || ''] : []), tot: R.amt[i], desc: L.b[i] === SUBI ? [S[L.desc[i]], L.qty[i] ? fq(L.qty[i]) + ' ' + (itemUnit(it(i)) || '') : ''].filter(Boolean).join(' · ') : [S[L.name[i]], L.qty[i] ? fq(L.qty[i]) + ' ' + (itemUnit(it(i)) || '') : ''].filter(Boolean).join(' · ') || S[L.desc[i]], compL: itemCode(it(i)) === r.o ? S[L.cen[i]] : itemCode(it(i)) + ' · ' + itemDesc(it(i)), sq: r.sq + ' ' + S[L.name[i]] }); }); }
  const st = (r) => { const n = r.idx.filter((i) => (OVR[L.id[i]] || {}).inc === 'No' || it(i).inc === 'No').length; return n === 0 ? 'Yes' : n === r.idx.length ? 'No' : 'Part'; };
  const incOf = (r) => r.idx.reduce((s, i) => s + (R.inc[i] ? R.amt[i] : 0), 0);
  const cols = [{ k: 'o', l: V === 'c' ? 'PO › service' : 'Order', w: V === 'c' ? 140 : 150, fz: 1, v: (r) => r.o, h: (r) => (r.agg ? `<td style="padding-left:26px"><a class="lk">${esc(r.svc)}</a></td>` : r.child ? `<td style="padding-left:26px;color:#6b7280">${esc(PER[L.m[r.i]] || 'after data')}</td>` : `<td><span class="tgl" data-uo="${esc(r.g + '|' + r.o)}">${open.has(r.g + '|' + r.o) ? '−' : '+'}</span> <b>${esc(r.o)}</b>${V === 'c' ? '' : ` <span class="help">${r.idx.length}</span>`}</td>`) },
    { k: 'desc', l: V === 'c' ? 'Subcontractor / service' : 'Description', w: V === 'c' ? 300 : 250, v: (r) => r.desc, h: (r) => (r.agg ? `<td dir="rtl" title="${esc(r.desc)}" style="color:#4b5563">${esc(r.desc)}</td>` : `<td dir="auto" title="${esc(r.desc)}"${r.child ? ' style="color:#4b5563"' : ''}>${esc(r.desc)}</td>`) },
    ...(V === 'c' ? [] : [{ k: 'comp', l: 'Component', w: 190, v: (r) => r.compL, h: (r) => `<td title="${esc(r.compL)}">${esc(r.compL)}</td>` }]),
    ...(V === 'c' ? [{ k: 'qty', l: 'Qty', w: 112, num: 1, v: (r) => (r.agg ? r.qty : 0), h: (r) => `<td class="num" style="color:#4b5563">${r.agg && r.qty ? esc(r.qtyT) : ''}</td>` }] : []),
    ...(V === 'c' ? [{ k: 'apr', l: 'Approval', w: 112, v: (r) => (r.src && r.src.size === 1 ? [...r.src][0] : 'Both'), h: (r) => { const a = r.src && r.src.size === 1 ? [...r.src][0] : 'Both'; if (!r.child && a !== 'Both') return '<td></td>';
      return `<td title="${r.certT ? 'Certificates ' + esc(r.certT) : ''}" style="font-size:11.5px;color:${a === 'Not approved' ? '#C55A11' : a === 'Both' ? '#7f6000' : '#375623'}">${a === 'Approved, not in CJI3' ? 'Approved' : a === 'Both' ? 'Mixed' : 'Not approved'}</td>`; } }] : []),
    { k: 'inc', l: 'Count', w: 78, v: (r) => st(r), h: (r) => { const x = st(r); return r.agg ? `<td title="No = never count this service of this PO"><button class="incb ordb ${x === 'No' ? 'no' : ''}" data-o="${esc(r.key)}">${x}</button></td>` : r.child ? `<td title="No = never count this line"><button class="incb ${x === 'No' ? 'no' : ''}">${x}</button></td>` : `<td title="No = never count this order, whatever the month switch"><button class="incb ordb ${x === 'No' ? 'no' : ''}" data-o="${esc(r.g + '|' + r.o)}">${x}</button></td>`; } }];
  const MIN = ST.unsMin || (ST.unsMin = new Set()), subsOf = (k) => (MIN.has(k) ? ['Amount'] : ['Qty', 'Rate', 'Amount']), nLead = cols.length;   // Qty · Rate · Amount per month; − folds a month to Amount
  const qOK = (r) => r.units && r.units.size === 1, qOf = (r, k) => (qOK(r) ? r.uq.get(k) || 0 : null), unitOf = (r) => (qOK(r) ? [...r.units][0] : '');
  keys.forEach((k) => subsOf(k).forEach((sub) => cols.push(numC('m' + k + sub, MIN.has(k) ? unsLab(k) : sub, MIN.has(k) ? 96 : sub === 'Rate' ? 78 : 90,
    (r) => (sub === 'Amount' ? r.ua.get(k) || 0 : sub === 'Qty' ? qOf(r, k) || 0 : qOf(r, k) ? (r.ua.get(k) || 0) / qOf(r, k) : 0),
    { th: on(k) ? 'uon' : '', cls: (r) => (on(k) && st(r) !== 'No' ? 'uin' : ''), ...(sub === 'Amount' ? {} : { h: (r) => { const q = qOf(r, k), a = r.ua.get(k) || 0; return `<td class="num${on(k) && st(r) !== 'No' ? ' uin' : ''}" style="color:#4b5563">${q === null ? '' : sub === 'Qty' ? (q ? fq(q) : '-') : q ? fmt2(a / q) : '-'}</td>`; } }) }))));
  if (V === 'o') cols.push({ k: 'tq', l: 'Total qty', w: 110, num: 1, v: (r) => (qOK(r) ? [...r.uq.values()].reduce((s, v) => s + v, 0) : 0), h: (r) => `<td class="num">${qOK(r) ? `<b>${fq([...r.uq.values()].reduce((s, v) => s + v, 0))}</b> <span class="help">${esc(unitOf(r))}</span>` : ''}</td>` });
  cols.push(numC('tot', 'Total', 104, (r) => r.tot, { h: (r) => `<td class="num"><b>${fmt(r.tot)}</b></td>` }), numC('in', 'Added', 104, (r) => incOf(r), { h: (r) => `<td class="num" style="color:#375623"><b>${fmt(incOf(r))}</b></td>` }));
  R.unsRows = new Map([...top.map((r) => [r.g + '|' + r.o, r]), ...chMap]);
  const sw = keys.map((k) => ({ l: (on(k) ? '✓ ' : '○ ') + (on(k) ? 'Added' : 'Not added'), span: subsOf(k).length, cls: 'tog ' + (on(k) ? 'umon' : 'umoff'), um: k }));
  const nM = keys.reduce((s, k) => s + subsOf(k).length, 0), allMin = keys.every((k) => MIN.has(k)), tail = cols.length - nLead - nM;
  // timeline header: labels sit right against the first month, the fold-all control at the right end of the dates (above Total)
  const lead = (l) => [{ l: '', span: 1, cls: 'blank' }, { l, span: nLead - 1, cls: 'blank lab' }];
  const bands = [[{ l: '', span: 1, cls: 'blank' }, { l: allMin ? '+ Qty · Rate · Amount ›' : '− Amounts only ›', span: nLead - 1, cls: 'tog umall', attr: 'data-umall="1" title="Fold / unfold every month"' }, ...keys.map((k) => ({ l: (MIN.has(k) ? '+ ' : '− ') + unsLab(k), span: subsOf(k).length, cls: 'tog q', attr: `data-umin="${k}" title="${MIN.has(k) ? 'Show qty · rate · amount' : 'Fold to amount only'}"` })),
      { l: '', span: tail, cls: 'blank' }],
    [...lead('Add to the cost ›'), ...sw, { l: '', span: tail, cls: 'blank' }]];
  const foot = (rs0) => { const rs = rs0.filter((r) => !r.child), o = { o: '' }; keys.forEach((k) => { o['m' + k + 'Amount'] = fmt(rs.reduce((s, r) => s + (r.ua.get(k) || 0), 0)); }); o.tot = fmt(rs.reduce((s, r) => s + r.tot, 0)); o.in = fmt(rs.reduce((s, r) => s + incOf(r), 0)); return o; };
  const m = (V === 'c' ? ST.unsc : ST.uns).mode, inK = R.unsInK[V], allK = R.unsInK[V] + R.unsExcK[V], seg = (list, cur, attr) => `<span class="seg">${list.map(([v, l]) => `<button ${attr}="${v}" class="${cur === v ? 'on' : ''}">${l}</button>`).join('')}</span>`;
  const tools = `<span class="seg"><button class="${m === 'none' ? 'on' : ''}" id="uNone" title="Add nothing – the cost stays as CJI3">Add none</button><button class="${m === 'cut' ? 'on' : ''}" id="uCut" title="Add every month up to the cut date – follows the cut date">Add all to ${esc(R.repLab)}</button>${m === 'pick' ? '<button class="on" disabled>By month</button>' : ''}</span>`
    + ` <span class="seg"><button id="uOpenAll" title="Open every ${V === 'c' ? 'PO' : 'order'}">+ Lines</button><button id="uCloseAll" title="Close every ${V === 'c' ? 'PO' : 'order'}">− Lines</button></span>`
    + ` <span class="help">Added <b style="color:#375623">${fmt(inK)}</b> / ${fmt(allK)}</span>`;
  return { cols, rows, bands, groups: true, noGroupBtns: true, sel: false, extraTools: tools, foot, rowCls: (r) => (r.child ? 'uchild ' : 'uord ') + (st(r) === 'No' ? 'exc' : ''),
    gLabel: (g, rs0) => { const rs = rs0.filter((r) => !r.child); const sc = V === 'c'; return `<span dir="auto" style="unicode-bidi:isolate">${esc(g)}</span><span class="gm">${rs.length} ${sc ? (rs.length === 1 ? 'PO' : 'POs') : rs.length === 1 ? 'order' : 'orders'} · ${fmt(rs.reduce((s, r) => s + r.tot, 0))} · added ${fmt(rs.reduce((s, r) => s + incOf(r), 0))}</span>`; } };
}
// the Order switch: all lines of the order left out (line Include = No) or back to their item
document.addEventListener('click', (e) => { const b = e.target.closest('.ordb'); if (!b || !R.unsRows) return; e.stopPropagation(); const r = R.unsRows.get(b.dataset.o); if (!r) return;
  const out = b.textContent !== 'No'; change(r.idx.map((i) => lineCh(i, 'inc', out ? 'No' : 'Yes')), (out ? 'Left out ' : 'Included ') + (r.agg ? 'service ' + r.svc + ' on PO ' : V0() + ' ') + r.o); }, true);
const V0 = () => (ST.unsView === 'c' ? 'PO' : 'order');
document.addEventListener('click', (e) => { const t = e.target.closest('[data-uo],#uOpenAll,#uCloseAll'); if (!t || ST.tab !== 'uns') return; e.stopPropagation(); const op = ST.unsOpen || (ST.unsOpen = new Set());
  if (t.id === 'uOpenAll') R.unsRows.forEach((r, k) => op.add(k)); else if (t.id === 'uCloseAll') op.clear(); else op.has(t.dataset.uo) ? op.delete(t.dataset.uo) : op.add(t.dataset.uo); render(); }, true);
document.addEventListener('click', (e) => { const q = e.target.closest('#tools [data-uq]'); if (q) { ST.unsQ = q.dataset.uq; render(); return; } const u = e.target.closest('#tools [data-uv]'); if (u) { ST.unsView = u.dataset.uv; render(); return; } const t = e.target.closest('#uNone,#uCut'); if (!t) return; if (t.id === 'uNone') unsSet('none', [], 'Unsettled: all left out'); else unsSet('cut', [], 'Unsettled: included up to the cut date'); });
// ---- Depreciation: the CJI3 depreciation per cost element × month; one click (or month by month) takes it out of the counted cost
const depLab = (k) => (k === 'a' ? 'No month' : PER[+k]);
function depSet(mode, pick, label) { change([{ t: 'depx', v: JSON.stringify({ mode, pick: [...(pick || [])].map(String) }) }], label); }
function depToggle(k) { const keys = [...R.depM.keys()], off = new Set(keys.filter((x) => R.depOff(x))); off.has(k) ? off.delete(k) : off.add(k); depSet(off.size ? 'pick' : 'none', off, (off.has(k) ? 'Excluded depreciation ' : 'Counted depreciation ') + depLab(k)); }
function depDef() {
  const keys = [...R.depM.keys()].sort((a, b) => (a === 'a' ? 1 : b === 'a' ? -1 : +a - +b)), off = (k) => R.depOff(k), b = BK[DEPI];
  const rows = b.items.filter((it) => it.da).map((it) => ({ it, g: '' })), tot = (it) => [...it.da.values()].reduce((s, v) => s + v, 0), cnt = (it) => (it.inc === 'No' ? 0 : keys.reduce((s, k) => s + (off(k) ? 0 : it.da.get(k) || 0), 0));
  const cols = [{ k: 'code', l: 'Cost element name', w: 190, fz: 1, v: (r) => itemCode(r.it), h: (r) => `<td><a class="lk open">${esc(itemCode(r.it))}</a></td>` },
    { k: 'inc', l: 'Item', w: 62, v: (r) => r.it.inc, h: (r) => `<td title="No = never count this cost element"><button class="incb ${r.it.inc === 'No' ? 'no' : ''}">${r.it.inc === 'No' ? 'No' : 'Yes'}</button></td>` }];
  keys.forEach((k) => cols.push(numC('m' + k, depLab(k), 104, (r) => r.it.da.get(k) || 0, { th: off(k) ? 'doff' : '', cls: (r) => (off(k) || r.it.inc === 'No' ? 'dout' : '') })));
  cols.push(numC('tot', 'In CJI3', 112, (r) => tot(r.it), { h: (r) => `<td class="num"><b>${fmt(tot(r.it))}</b></td>` }), numC('cn', 'Counted', 112, (r) => cnt(r.it), { h: (r) => `<td class="num" style="color:#1F3864"><b>${fmt(cnt(r.it))}</b></td>` }));
  const sw = keys.map((k) => ({ l: off(k) ? '✕ excluded' : '✓ counted', span: 1, cls: 'tog ' + (off(k) ? 'dmoff' : 'dmon'), dm: k }));
  const bands = [[{ l: 'click a month to exclude / count it →', span: 2, cls: 'blank' }, ...sw, { l: '', span: 2, cls: 'blank' }]];
  const foot = (rs) => { const o = { code: '' }; keys.forEach((k) => { o['m' + k] = fmt(rs.reduce((s, r) => s + (r.it.da.get(k) || 0), 0)); }); o.tot = fmt(rs.reduce((s, r) => s + tot(r.it), 0)); o.cn = fmt(rs.reduce((s, r) => s + cnt(r.it), 0)); return o; };
  const m = ST.depx.mode, all = [...R.depM.values()].reduce((s, e) => s + e.all, 0), tools = `<span class="seg"><button class="${m === 'none' ? 'on' : ''}" id="dNone">Count all depreciation</button><button class="${m === 'all' ? 'on' : ''}" id="dAll">Exclude all depreciation</button><button class="${m === 'pick' ? 'on' : ''}" disabled>Month by month</button></span>
    <span class="help">Excluded <b style="color:#C00000">${fmt2(R.depExc)}</b> of ${fmt2(all)} in CJI3 · shown on the Summary as "Depreciation excluded by you"</span>`;
  return { cols, rows, bands, groups: false, sel: false, extraTools: tools, foot };
}
document.addEventListener('click', (e) => { const t = e.target.closest('#dNone,#dAll'); if (!t) return; if (t.id === 'dNone') depSet('none', [], 'Depreciation: all counted'); else depSet('all', [], 'Depreciation: all excluded'); });
