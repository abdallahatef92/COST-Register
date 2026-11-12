// ---- the table renderer
let VROW = 27;
// ---- column widths: fitted to what the column holds (header and values), or the width you dragged (kept in this browser)
let CW = {}; try { CW = JSON.parse(localStorage.getItem('cr-cw') || '{}') || {}; } catch (e) { CW = {}; }
const cwSave = () => { try { localStorage.setItem('cr-cw', JSON.stringify(CW)); } catch (e) { /* none */ } }, cwK = (k) => vsKey().replace(/:-?\d+$/, (m) => ':' + (BK[+m.slice(1)] ? BK[+m.slice(1)].id : m.slice(1))) + '|' + k;
const MCV = document.createElement('canvas').getContext('2d'), tw = (t, f) => { MCV.font = f; return MCV.measureText(t).width; };
// ---- one table standard for the custom tables (Cost drivers, Rate analysis, Packages, Checks, Changes): columns fitted to their content,
//      drag a header edge to resize (double-click = fit again, kept in this browser), click a header to sort (rows stay inside their group)
const FXS = {};   // sort per table: { col, dir }
function fxScan(root) { (root || document).querySelectorAll('table.fxt').forEach(fxTable); }
function fxTable(t) {
  const key = 'fx:' + t.dataset.fx, hr = [...t.querySelectorAll('tr')].find((r) => r.querySelector('th')); if (!hr) return;
  const ths = [...hr.children], nc = ths.reduce((x, c) => x + (c.colSpan || 1), 0); let cg = t.querySelector('colgroup'); if (!cg) { cg = document.createElement('colgroup'); t.prepend(cg); }
  while (cg.children.length < nc) cg.appendChild(document.createElement('col'));
  const cols = [...cg.children].slice(0, nc), rows = [...t.querySelectorAll('tr')].filter((r) => r !== hr && !r.querySelector('th') && r.children.length === nc);
  const st = Math.max(1, Math.floor(rows.length / 300)), w = new Array(nc).fill(0), r0 = rows[0], pads = r0 ? [...r0.children].map((td) => { const cs = getComputedStyle(td); return (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0) + (parseFloat(cs.borderLeftWidth) || 0) + 2; }) : [];
  ths.forEach((th, j) => { const cs = getComputedStyle(th); w[j] = tw(th.textContent.trim(), '600 12px "Segoe UI",Arial,sans-serif') + (parseFloat(cs.paddingLeft) || 8) + (parseFloat(cs.paddingRight) || 8) + 16; });
  for (let i = 0; i < rows.length; i += st) [...rows[i].children].forEach((td, j) => { let x; const svg = td.querySelector('svg,.rng,.cbar,.scb,.sdv'), inp = td.querySelector('input,select');
    if (svg) x = svg.classList.contains('rng') ? 240 : (svg.getAttribute && +svg.getAttribute('width')) || svg.offsetWidth || 90; else if (inp) x = 96; else { const txt = td.textContent.trim(); if (!txt) return; x = tw(txt, (td.querySelector('b') || +getComputedStyle(td).fontWeight >= 600 ? '700 ' : '') + (parseFloat(getComputedStyle(td).fontSize) || 13) + 'px "Segoe UI",Arial,sans-serif') * 13 / (parseFloat(getComputedStyle(td).fontSize) || 13) + (td.querySelector('.u,.tag,.st,.pktag,.pktag2,.sel,.pksel,button') ? 16 : 0) + td.querySelectorAll('.tg,.mn').length * 14; }
    const fs = parseFloat(getComputedStyle(td).fontSize) || 13; x *= fs / 13; const tcs = getComputedStyle(td), cs = (parseFloat(tcs.paddingLeft) || 0) + (parseFloat(tcs.paddingRight) || 0) + 2; if (x * 1.04 + cs + 6 > w[j]) w[j] = Math.ceil(x * 1.04 + cs + 6); });
  const pe = t.parentElement, pcs = getComputedStyle(pe), avail = (pe.clientWidth || 1500) - (parseFloat(pcs.paddingLeft) || 0) - (parseFloat(pcs.paddingRight) || 0) - 2, wide = () => w.map((v, j) => (v > 200 ? j : -1)).filter((j) => j >= 0);
  let tot = w.reduce((x, v) => x + v, 0); if (tot > avail) { const ws = wide(), room = ws.reduce((x, j) => x + w[j] - 200, 0), k = Math.min(1, (tot - avail) / (room || 1)); ws.forEach((j) => { w[j] = Math.round(w[j] - (w[j] - 200) * k); }); tot = w.reduce((x, v) => x + v, 0); }
  const cap = t.dataset.maxw ? Math.min(avail, +t.dataset.maxw) : avail; if (tot < cap && (!t.dataset.nofill || t.dataset.maxw)) { const j = t.dataset.growcol !== undefined ? +t.dataset.growcol : w.indexOf(Math.max(...w)); w[j] += cap - tot; }   // the widest (usually the name) column takes the spare room
  w.forEach((v, j) => { const u = CW[key + '|' + j]; cols[j].style.width = (u || Math.round(Math.min(v, 900))) + 'px'; });
  t.style.tableLayout = 'fixed'; t.style.width = cols.reduce((x, c) => x + parseFloat(c.style.width), 0) + 'px'; t.style.minWidth = '';
  let ci = 0; ths.forEach((th) => { const j = ci; ci += th.colSpan || 1; th.style.position = th.style.position || 'sticky'; if (!th.querySelector('.rz')) { const g = document.createElement('span'); g.className = 'rz'; g.dataset.fxk = key; g.dataset.fxj = j + (th.colSpan > 1 ? th.colSpan - 1 : 0); g.title = 'Drag to change the width · double-click to fit'; th.appendChild(g); }
    if (!t.dataset.nosort && !th.dataset.fxs && th.colSpan === 1 && th.textContent.trim()) { th.dataset.fxs = j; th.classList.add('fxs'); } });
  const so = FXS[key]; if (so) fxSort(t, so.col, so.dir, true);
  ths.forEach((th) => { th.classList.toggle('fxa', !!so && +th.dataset.fxs === so.col); th.classList.toggle('fxd', !!so && +th.dataset.fxs === so.col && so.dir < 0); });
}
// sort the rows of each block between group rows; detail rows (class pkex) move with the row above them
function fxSort(t, col, dir, keepState) {
  const tb = t.tBodies[0] || t, all = [...tb.children], num = (s) => { const m = String(s).replace(/,/g, '').match(/[-−]?\d+(\.\d+)?/); if (!m) return null; let v = parseFloat(m[0].replace('−', '-')); if (/▼/.test(s) || /^−/.test(s.trim())) v = -Math.abs(v); if (/M\b/.test(s) && !/[A-Za-z]{2}/.test(s.replace(/M\b/, ''))) v *= 1e6; if (/^×/.test(s.trim())) v = (v - 1) * 100; return v; };
  const isHead = (r) => r.querySelector('th') || r.classList.contains('gh') || r.classList.contains('gh2') || r.classList.contains('t') || r.classList.contains('grp');
  let blk = [], out = []; const flush = () => { const units = []; blk.forEach((r) => { if (r.classList.contains('pkex') && units.length) units[units.length - 1].push(r); else units.push([r]); });
    const val = (u) => { const c = u[0].children[col]; return c ? c.textContent.trim() : ''; }, numeric = units.filter((u) => num(val(u)) !== null).length > units.length / 2;
    units.sort((a, b) => { const x = val(a), y = val(b); if (numeric) { const p = num(x), q = num(y); return ((p === null ? -Infinity : p) - (q === null ? -Infinity : q)) * dir; } return x.localeCompare(y) * dir; }); units.forEach((u) => out.push(...u)); blk = []; };
  all.forEach((r) => { if (isHead(r)) { flush(); out.push(r); } else blk.push(r); }); flush(); out.forEach((r) => tb.appendChild(r));
}
document.addEventListener('click', (e) => { const th = e.target.closest('table.fxt th.fxs'); if (!th || e.target.closest('.rz,button,input,select,a')) return; const t = th.closest('table'), key = 'fx:' + t.dataset.fx, col = +th.dataset.fxs, so = FXS[key];
  FXS[key] = so && so.col === col ? (so.dir === -1 ? { col, dir: 1 } : null) : { col, dir: -1 }; if (!FXS[key]) { delete FXS[key]; render(); return; } fxSort(t, col, FXS[key].dir); t.querySelectorAll('th.fxs').forEach((h) => { h.classList.toggle('fxa', +h.dataset.fxs === col); h.classList.toggle('fxd', +h.dataset.fxs === col && FXS[key].dir < 0); }); });
document.addEventListener('mousedown', (e) => { const g = e.target.closest('table.fxt th .rz'); if (!g) return; e.preventDefault(); e.stopPropagation(); const t = g.closest('table'), j = +g.dataset.fxj, col = t.querySelector('colgroup').children[j], x0 = e.clientX, w0 = parseFloat(col.style.width) || col.offsetWidth, t0 = parseFloat(t.style.width) || t.offsetWidth; let w = w0; g.classList.add('on'); document.body.classList.add('rzing');
  const mv = (ev) => { w = Math.max(36, Math.round(w0 + ev.clientX - x0)); col.style.width = w + 'px'; t.style.width = (t0 + w - w0) + 'px'; };
  const up = () => { document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up); document.body.classList.remove('rzing'); g.classList.remove('on'); if (w !== w0) { CW[g.dataset.fxk + '|' + j] = w; cwSave(); } };
  document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up); }, true);
document.addEventListener('dblclick', (e) => { const g = e.target.closest('table.fxt th .rz'); if (!g) return; delete CW[g.dataset.fxk + '|' + g.dataset.fxj]; cwSave(); render(); });
function fxFit(key) { Object.keys(CW).forEach((k) => { if (k.startsWith('fx:' + key + '|')) delete CW[k]; }); cwSave(); render(); toast('Columns fitted to their content'); }
document.addEventListener('click', (e) => { const b = e.target.closest('[data-fxfit]'); if (b) fxFit(b.dataset.fxfit); });
let HID = {}; try { HID = JSON.parse(localStorage.getItem('cr-hide') || '{}') || {}; } catch (e) { HID = {}; }
const HID0 = { cod: ['pe', 'n', 'nw'] }, hidSet = () => new Set(HID[cwK('')] || HID0[ST.tab] || []);
document.addEventListener('click', (e) => { const b = e.target.closest('#bCols'); const cp = $('cpop');
  if (b) { const D = R.D, h = hidSet(), r = b.getBoundingClientRect(); cp.innerHTML = '<div class="h">Show columns · drag a header edge to change its width</div>' + D.allCols.map((c, i) => `<label><input type="checkbox" data-ck="${esc(c.k)}" ${h.has(c.k) ? '' : 'checked'} ${i === 0 || c.code ? 'disabled' : ''}>${esc(c.l)}</label>`).join('');
    cp.classList.add('show'); cp.style.left = Math.max(4, Math.min(innerWidth - 240, r.left)) + 'px'; cp.style.top = r.bottom + 4 + 'px'; return; }
  if (!e.target.closest('#cpop')) cp.classList.remove('show'); });
document.addEventListener('change', (e) => { const x = e.target.closest('#cpop [data-ck]'); if (!x) return; const h = hidSet(); x.checked ? h.delete(x.dataset.ck) : h.add(x.dataset.ck); HID[cwK('')] = [...h]; try { localStorage.setItem('cr-hide', JSON.stringify(HID)); } catch (er) { /* none */ } render(); });
function fitCols(D) {
  const rs = D.rows, n = rs.length, step = Math.max(1, Math.floor(n / 400)), samp = []; for (let i = 0; i < n; i += step) samp.push(rs[i]);
  let ft = null; try { ft = D.foot ? D.foot(rs) : null; } catch (e) { ft = null; }
  for (const c of D.cols) { const u = CW[cwK(c.k)]; if (u) { c.w = u; continue; } const hw = tw(c.l, '600 12px "Segoe UI",Arial,sans-serif') + 38 + (c.tip ? 16 : 0); if (c.code) { c.w = Math.max(c.w, Math.min(hw, 150)); continue; } if (c.fixW || c.slot !== undefined && !c.num) continue;
    let mx = ft && ft[c.k] ? tw(String(ft[c.k]), '700 13px "Segoe UI",Arial,sans-serif') : 0;
    for (const r of samp) { let h; try { h = c.h(r); } catch (e) { continue; } if (h.includes('<input')) continue;   // measure what the cell shows (text of its html), bold where it is bold
      const t = h.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').trim(); if (!t) continue; const box = (h.match(/<(button|a |span class="(u|st|tgl|pk)[^"]*")/g) || []).length * 12;
      const w = tw(t, /<b>|font-weight:7|<td class="num"><b/.test(h) ? '700 13px "Segoe UI",Arial,sans-serif' : '13px "Segoe UI",Arial,sans-serif') + box; if (w > mx) mx = w; }
    const pad = 22, cap = c.num ? 220 : 420;
    c.w = Math.round(Math.max(c.num ? 64 : 56, Math.min(cap, Math.max(mx + pad, Math.min(hw, c.num ? 150 : 170))))); c.fit = 1; }
  { const avail = ($('wrap').clientWidth || 1500) - (D.sel ? 34 : 0) - 4, tot = D.cols.reduce((t, c) => t + c.w, 0), wide = D.cols.filter((c) => c.fit && !c.num && c.w > 170);   // too wide for the screen: long text columns give way first
    if (tot > avail && wide.length) { const over = tot - avail, room = wide.reduce((t, c) => t + c.w - 170, 0), k = Math.min(1, over / room); wide.forEach((c) => { c.w = Math.round(c.w - (c.w - 170) * k); }); } }
  const sl = D.cols.filter((c) => c.fit && c.slot !== undefined && c.slot !== 'td'), bySub = new Map(); sl.forEach((c) => bySub.set(c.sub || '', Math.max(bySub.get(c.sub || '') || 0, c.w))); sl.forEach((c) => { c.w = bySub.get(c.sub || ''); });   // months: one width
}
document.addEventListener('mousedown', (e) => { const g = e.target.closest('#th .rz'); if (!g) return; e.preventDefault(); e.stopPropagation();
  const k = g.dataset.rk, col = $('cg').querySelector(`col[data-k="${CSS.escape(k)}"]`), c = R.D.cols.find((x) => x.k === k); if (!col || !c) return;
  const x0 = e.clientX, w0 = c.w, t0 = $('tbl').offsetWidth; let w = w0; g.classList.add('on'); document.body.classList.add('rzing');
  const mv = (ev) => { w = Math.max(40, Math.round(w0 + ev.clientX - x0)); col.style.width = w + 'px'; $('tbl').style.width = (t0 + w - w0) + 'px'; };
  const up = () => { document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up); document.body.classList.remove('rzing'); if (w !== w0) { CW[cwK(k)] = w; cwSave(); } render(); };
  document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up); }, true);
document.addEventListener('dblclick', (e) => { const g = e.target.closest('#th .rz'); if (!g) return; delete CW[cwK(g.dataset.rk)]; cwSave(); render(); });
document.addEventListener('click', (e) => { if (e.target.closest('#th .rz')) e.stopPropagation(); if (e.target.id === 'bFit') { const p = cwK(''); Object.keys(CW).forEach((k) => { if (k.startsWith(p)) delete CW[k]; }); cwSave(); render(); toast('Columns fitted to their content'); } }, true);
// bucket chips – the same everywhere: colour, name, a small figure; click = one bucket, Ctrl+click = add (pages that can show several), All buckets = reset
const XB = new Set();   // GL / WBS / Lines: the buckets shown when more than one is picked
function bkChips(o) { const multi = !!o.all, on = (bi) => (multi && XB.size ? XB.has(bi) : o.cur === bi);
  return (multi ? `<button class="dvc ${o.cur === -1 && !XB.size ? 'on' : ''}" data-bkc="all">All buckets</button>` : '') + BK.map((b, bi) => `<button class="dvc ${on(bi) ? 'on' : ''}" data-bkc="${bi}" style="--bc:${bkColor(bi)}"${multi ? ' title="Ctrl+click to add more buckets"' : ''}><i style="background:${bkColor(bi)}"></i>${esc(b.short)}${o.fig ? `<small>${o.fig(bi)}</small>` : ''}</button>`).join('') + (o.extra || ''); }
const codedOf = (bi) => { const inc = BK[bi].items.filter((it) => it.inc !== 'No'), t = inc.reduce((x, it) => x + Math.abs(it.td), 0), f = inc.filter((it) => statusOf(it) === 'Coded').reduce((x, it) => x + Math.abs(it.td), 0); return (t ? Math.round(100 * f / t) : 0) + '% coded'; };
// a tick box on a group row: ticks every item (or line) of that group / family that passes the filters
const gRows = (rows, k) => rows.filter((r) => (k.startsWith('F:') ? famOf(r.g) === k.slice(2) : r.g === k));
function gck(D, rows, k) { if (!D.sel) return ''; const rs = gRows(rows, k), on = rs.length && rs.every((r) => sel.has(selKey(r))), some = !on && rs.some((r) => sel.has(selKey(r)));
  return `<input type="checkbox" class="gck" data-gk="${esc(k)}" ${on ? 'checked' : ''} ${some ? 'data-some="1"' : ''} title="Tick all ${rs.length} in this group">`; }
function renderTable() {
  const D = pageDef(), S0 = vs(); R.D = D; const CODM = ST.tab === 'cod' || ST.tab === 'lines'; VROW = CODM ? 32 : 27; $('pg-tbl').classList.toggle('codm', CODM); { const h = hidSet(); D.allCols = D.cols; if (h.size && !D.bands) D.cols = D.cols.filter((c, i) => i === 0 || c.code || !h.has(c.k));
    if (D.lines && D.rows.length) { const st2 = Math.max(1, Math.floor(D.rows.length / 300)), sm = []; for (let i = 0; i < D.rows.length; i += st2) sm.push(D.rows[i]); D.cols = D.cols.filter((c, i) => i === 0 || c.num || c.code || sm.some((r) => { try { return c.h(r).replace(/<[^>]+>/g, '').trim() !== ''; } catch (e) { return true; } })); } }   // Lines: no empty columns
  // bucket bar (not for Expenses / Subcontractor)
  if (['gl', 'wbs'].includes(ST.tab)) { $('bkbar').style.display = ''; $('bkbar').innerHTML = bkChips({ all: 1, cur: ST.xbk, fig: (bi) => fmtM(BK[bi].items.reduce((x, it) => x + it.td, 0)), extra: ST.tab === 'gl' ? `<button class="dvc ${ST.xbk === -2 ? 'on' : ''}" data-bkc="rev" style="--bc:#5F6B7A"><i style="background:#5F6B7A"></i>Revenue</button>` : '' }); }
  else if (ST.tab === 'pm') { $('bkbar').style.display = ''; $('bkbar').innerHTML = bkChips({ all: false, cur: ST.bk, fig: codedOf }); } else if (CODM) { $('bkbar').style.display = ''; $('bkbar').innerHTML = codTabs(ST.tab); } else $('bkbar').style.display = 'none';
  $('bkbar').classList.toggle('tabbar', CODM); $('bkbar').classList.toggle('xpchips', !!D.chips); if (D.chips) { $('bkbar').style.display = ''; $('bkbar').innerHTML = D.chips(S0); }
  if (D.fiori) $('tools').innerHTML = D.fiori(S0);
  else if (CODM) {   // the coding desk: bucket · To code / Coded / All · Items / Lines · search
    const ln = ST.tab !== 'cod', cm = D.cm || (() => { let t = 0; D.rows.forEach((r) => { if ((r.i !== undefined ? lineStatusOf(r.i) : statusOf(r.it)) !== 'Coded') t++; }); return { todo: t, coded: D.rows.length - t, all: D.rows.length }; })();
    const cur = ln ? (S0.st === 'Not coded' ? 'todo' : S0.st === 'Coded' ? 'coded' : 'all') : ST.next ? 'todo' : S0.st === 'Coded' ? 'coded' : 'all', nf = (n) => n.toLocaleString('en-US'), nNew = !ln && !ST.next ? D.rows.filter((r) => r.it && r.it.nw).length : 0;
    $('tools').innerHTML = `<b class="tt">${esc(ST.bk < 0 ? 'All buckets' : BK[ST.bk].id)}</b><span class="help ts">${ST.tab === 'lines' ? 'every CJI3 line' : ST.tab === 'xpm' ? 'every item, by month' : ST.next ? 'largest cost first' : ''}</span>
      <span class="seg big" title="To code: what is still without codes · Coded: what is done · All: everything">${[['todo', 'To code'], ['coded', 'Coded'], ['all', 'All']].map(([k, l]) => `<button data-cm="${k}" class="${cur === k ? 'on' : ''}">${l}<em>${nf(cm[k])}</em></button>`).join('')}</span>
      ${nNew ? `<button class="chip new ${S0.st === 'New' ? 'on' : ''}" data-st="New" title="Items that first appear this month – code them first">New this month · ${nNew}</button>` : ''} ${D.extraTools || ''}<span class="sp"></span>
      <input type="search" id="q" placeholder="Search…  ( / )" value="${esc(S0.q)}"> <button id="bClr" class="clr">✕ Clear filters</button> <button id="bCols" title="Show or hide columns">Columns ▾</button><button id="bFit" title="Fit every column to its content (drops the widths you dragged)">↔ Fit</button> <span class="help" id="cnt"></span>`; }
  else $('tools').innerHTML = `${D.noFilter && !D.search ? '' : `<input type="search" id="q" placeholder="Search…  ( / )" value="${esc(S0.q)}">`} ${D.status ? ['All', 'Not coded', 'Coded'].map((s) => `<button class="chip ${S0.st === s ? 'on' : ''}" data-st="${s}">${s}</button>`).join(' ') + ((n) => (n ? ` <button class="chip new ${S0.st === 'New' ? 'on' : ''}" data-st="New" title="Items that first appear this month – code them first">New this month · ${n}</button>` : ''))(D.rows.filter((r) => r.it && r.it.nw).length) : ''}
    ${D.extraTools || ''} ${D.groups && !D.noGroupBtns ? '<button id="bFold">− Collapse all</button><button id="bOpen">+ Expand all</button>' : ''} ${D.noFilter ? '' : `<button id="bClr" class="clr">✕ Clear filters</button>`} ${D.bands ? '' : '<button id="bCols" title="Show or hide columns">Columns ▾</button>'}<button id="bFit" title="Fit every column to its content (drops the widths you dragged)">↔ Fit</button> <span class="help" id="cnt"></span>`;
  const cols = D.cols, q = S0.q.trim().toLowerCase();
  let rows = D.rows.filter((r) => { if (D.status && S0.st !== 'All' && (S0.st === 'New' ? !r.it.nw : (r.stx !== undefined ? r.stx : r.i !== undefined ? lineStatusOf(r.i) : statusOf(r.it)) !== S0.st)) return false; for (const c of cols) if (!passF(c, r, S0.f[c.k])) return false;
    if (q && !D.tree) { const t = r.sq !== undefined ? r.sq : D.lines ? [S[L.desc[r.i]], itemCode(r.it), S[L.po[r.i]], S[L.sup[r.i]], S[L.doc[r.i]], S[L.wbs[r.i]]].join(' ') : r.e ? [itemCode(r.it), itemDesc(r.it), r.g, r.g2, r.e.ce].join(' ') : r.x ? [r.x.po, r.it.vals[1], r.it.vals[2], SUB.supn[r.x.po] || '', SUB.title[r.x.po] || ''].join(' ') : r.po ? [r.po, SUB.title[r.po] || '', SUB.supn[r.po] || ''].join(' ') : r.l ? r.l : r.ce ? [r.ce, r.x.name].join(' ') : r.it ? r.it.vals.join(' ') + ' ' + [r.it.pkg, r.it.ce, r.it.nameS || '', (META.grpNames || {})[r.it.vals[2]] || ''].join(' ') : ''; if (!t.toLowerCase().includes(q)) return false; }
    return true; });
  { const keys = [S0.sort, S0.sort2].filter(Boolean).map((s) => ({ c: cols.find((x) => x.k === s.k), d: s.d })).filter((x) => x.c);   // sort, then by
    if (keys.length) rows = rows.slice().sort((a, b) => { for (const { c, d } of keys) { const x = c.v(a), y = c.v(b), o = (c.num ? x - y : String(x).localeCompare(String(y))) * d; if (o) return o; } return 0; }); }
  R.rows = rows; fitCols(D); { const ch = $('xpch'); if (ch && !D.after) ch.style.display = 'none'; if (!D.after) { $('wrap').style.display = ''; $('pg-tbl').classList.remove('xpmode'); } } if (D.after) D.after(rows);
  $('cg').innerHTML = (D.sel ? '<col style="width:34px">' : '') + cols.map((c) => `<col data-k="${esc(c.k)}" style="width:${c.w}px">`).join('');
  $('tbl').style.width = (D.sel ? 34 : 0) + cols.reduce((t, c) => t + c.w, 0) + 'px';   // exact width: keeps the fixed layout, so columns never move and frozen columns line up
  // frozen columns: left offsets
  let left = D.sel ? 34 : 0; const fzL = {}; cols.forEach((c) => { if (c.fz) { fzL[c.k] = left; left += c.w; } }); R.fzL = fzL;
  const fz = (c) => (fzL[c.k] !== undefined ? ` fz" style="left:${fzL[c.k]}px` : ''), HH = 27, nb = (D.bands || []).length;
  const bandH = (D.bands || []).map((row, ri) => '<tr class="band">' + (D.sel && ri === 0 ? `<th rowspan="${nb}" class="blank fz" style="left:0;top:0"></th>` : '') + (() => { let ci = 0; return row.flatMap((x) => { let nf = 0; while (nf < x.span && cols[ci + nf] && fzL[cols[ci + nf].k] !== undefined) nf++; ci += x.span; return nf && nf < x.span ? [{ ...x, span: nf, fzc: cols[ci - x.span] }, { ...x, span: x.span - nf, l: '', tog: '' }] : [{ ...x, fzc: nf ? cols[ci - x.span] : null }]; }).map((x) => { const c0 = x.fzc, st = !!c0; return `<th colspan="${x.span}" class="${x.cls || ''}${st ? ' fz' : ''}" style="top:${ri * HH}px${st ? `;left:${fzL[c0.k]}px` : ''}" ${x.tog ? `data-tog="${x.tog}"` : ''}${x.um !== undefined ? ` data-um="${x.um}" title="Click to include / leave out this month"` : ''}${x.dm !== undefined ? ` data-dm="${x.dm}" title="Click to count / exclude this month"` : ''}${x.attr ? ' ' + x.attr : ''}>${esc(x.l)}</th>`; }).join(''); })() + '</tr>').join('');
  $('th').innerHTML = bandH + '<tr>' + (D.sel ? `<th class="fz" style="left:0;top:${nb * HH}px;padding-right:6px"><input type="checkbox" id="all"></th>` : '') + cols.map((c) => `<th class="${c.code ? 'code' : ''} ${c.num ? 'num' : ''} ${c.th || ''} ${fzL[c.k] !== undefined ? 'fz' : ''}"${fzL[c.k] !== undefined ? ` data-fz="1"` : ''} style="top:${nb * HH}px;${fzL[c.k] !== undefined ? `left:${fzL[c.k]}px;` : ''}" title="${esc(c.tip || c.l)}">${esc(c.l)}${c.tip ? '<span class="tip">ⓘ</span>' : ''}${S0.sort && S0.sort.k === c.k ? `<span class="sa"> ${S0.sort.d > 0 ? '▲' : '▼'}</span>` : ''}${D.noFilter ? '' : `<button class="fb ${S0.f[c.k] && S0.f[c.k].set ? 'act' : ''}" data-k="${c.k}">▾</button>`}<span class="rz" data-rk="${esc(c.k)}" title="Drag to change the width · double-click to fit"></span></th>`).join('') + '</tr>';
  const nc = cols.length + (D.sel ? 1 : 0), ft = D.foot ? D.foot(rows) : null;
  $('tf').innerHTML = ft ? `<tr class="tot">${D.sel ? '<td class="fz" style="left:0"></td>' : ''}${cols.map((c, j) => `<td class="${c.num ? 'num' : ''}${fzL[c.k] !== undefined ? ' fz' : ''}" ${fzL[c.k] !== undefined ? `style="left:${fzL[c.k]}px"` : ''}>${j === 0 ? 'TOTAL' : ft[c.k] ?? ''}</td>`).join('')}</tr>` : '';
  { const tb = [];
    if (D.groups) {
      let groups = new Map(); for (const r of rows) (groups.get(r.g) || groups.set(r.g, []).get(r.g)).push(r);
      const spanOf = () => { if (D.gSpanK === 'auto') { const fn = cols.findIndex((x) => x.num); return (fn < 0 ? cols.length : fn) + (D.sel ? 1 : 0); } return cols.findIndex((x) => x.k === (D.gSpanK || 'ce')) + (D.sel ? 1 : 0) + 1; };
      if (D.fam) { const fo = []; for (const g of groups.keys()) { const f = D.fam(g); if (!fo.includes(f)) fo.push(f); } groups = new Map([...groups].sort((a, b) => fo.indexOf(D.fam(a[0])) - fo.indexOf(D.fam(b[0])))); }
      let lastF = null;
      for (const [g, rs] of groups) {
        if (D.fam) { const f = D.fam(g); if (f !== lastF) { lastF = f; const frs = rows.filter((r) => D.fam(r.g) === f), ff = S0.fold.has('F:' + f), cells = D.gCells(f, frs), span = spanOf(), lab = D.fLabel(f, frs);
            tb.push(() => `<tr class="grp fam" data-g="F:${esc(f)}"><td colspan="${span}" dir="ltr"><span class="gl">${gck(D, rows, 'F:' + f)}<span class="tg">${ff ? '+' : '−'}</span>${lab}</span></td>${cols.slice(span - (D.sel ? 1 : 0)).map((c) => `<td class="${c.num ? 'num' : ''}">${cells[c.k] ?? ''}</td>`).join('')}</tr>`); }
          if (S0.fold.has('F:' + f)) continue; }
        const folded = S0.fold.has(g), gc = D.pkgColor ? D.pkgColor(g) : D.gColor ? D.gColor(g) : grpCol(g);
        if (D.gCells) { const cells = D.gCells(g, rs), span = spanOf(), lab = D.gLabel(g, rs);
          tb.push(() => `<tr class="grp${D.fam ? ' sub' : ''}" data-g="${esc(g)}" style="--gc:${gc}"><td colspan="${span}" dir="ltr"><span class="gl">${gck(D, rows, g)}<span class="tg">${folded ? '+' : '−'}</span>${lab}</span></td>${cols.slice(span - (D.sel ? 1 : 0)).map((c) => `<td class="${c.num ? 'num' : ''}">${cells[c.k] ?? ''}</td>`).join('')}</tr>`); }
        else { const lab = D.gLabel(g, rs); tb.push(() => `<tr class="grp" data-g="${esc(g)}" style="--gc:${gc}"><td colspan="${nc}" dir="ltr"><span class="gl">${gck(D, rows, g)}<span class="tg">${folded ? '+' : '−'}</span>${lab}</span></td></tr>`); }
        if (folded) continue;
        let lastB = null;
        for (const r of rs) { if (D.sub2 && r.g2 !== lastB) { const bs = rs.filter((x) => x.g2 === r.g2), t2 = fmt(bs.reduce((s, x) => s + x.e.p.slice(0, NP - 1).reduce((a, v) => a + v, 0), 0)), g2 = r.g2; tb.push(() => `<tr class="grp" style="--gc:${gc}"><td colspan="${nc}" style="padding-left:30px;border-top:1px solid #9fb3d1;font-weight:600">${esc(g2)} <span class="gm">${bs.length} items · to date ${t2}</span></td></tr>`); lastB = r.g2; }
          tb.push(() => rowHtml(D, r, gc)); }
      }
    } else for (const r of rows) tb.push(() => rowHtml(D, r, '#fff'));
    R.disp = tb; R.nc = nc; renderVirtual();
  }
  $('cnt').textContent = `${rows.length.toLocaleString('en-US')} rows`;
  { const S1 = vs(), on = !!S1.q || (!CODM && S1.st && S1.st !== 'All') || (CODM && !!S1.sort && !ST.next) || Object.values(S1.f).some((f) => f && (f.set || f.q)); $('bClr') && $('bClr').classList.toggle('on', on); }
  $('bulk').classList.toggle('show', !!D.sel && sel.size > 0); $('bdiv').style.display = (ST.tab === 'cod' && isSub(ST.bk)) || ST.tab === 'sub' ? '' : 'none'; $('bInc').textContent = ST.tab === 'lines' ? 'Include' : 'Include'; $('bClear').textContent = ST.tab === 'lines' ? 'Back to item codes' : 'Clear codes';
  $('bsel').textContent = (selLines().length ? selLines().length.toLocaleString('en-US') + ' lines selected · ' + fmt2(selLines().reduce((s0, i) => s0 + R.amt[i], 0)) : sel.size + ' selected');
  const a = $('all'); if (a) a.checked = rows.length > 0 && rows.every((r) => sel.has(selKey(r)));
}
const selKey = (r) => (r.xk ? r.xk : r.i !== undefined ? 'L' + r.i : r.it ? r.it.bi + ':' + r.it.ii : '');
function rowHtml(D, r, gc) { const it = r.it, exc = r.i !== undefined ? !R.inc[r.i] : it && it.inc === 'No', k = it ? selKey(r) : '';
  return `<tr class="it${sel.has(k) ? ' sel' : ''}${exc ? ' exc' : ''}${D.rowCls ? ' ' + D.rowCls(r) : ''}" data-k="${k}" style="--gc:${gc}">${D.sel ? `<td class="fz" style="left:0"><input type="checkbox" class="ck" ${sel.has(k) ? 'checked' : ''}></td>` : ''}${D.cols.map((c) => (R.fzL[c.k] !== undefined ? c.h(r).replace(/^<td( class="([^"]*)")?/, (m0, a1, cl) => `<td class="${cl || ''} fz" style="left:${R.fzL[c.k]}px"`) : c.h(r))).join('')}</tr>`; }
function renderVirtual() {   // only the rows on screen are drawn (fast with thousands of rows)
  const d = R.disp || [], nc = R.nc, w = $('wrap'), top = w.scrollTop, h = w.clientHeight || 600, a = Math.max(0, Math.floor(top / VROW) - 15), z = Math.min(d.length, a + Math.ceil(h / VROW) + 30);
  if (!d.length) { $('tb').innerHTML = `<tr><td colspan="${nc}" style="padding:20px;color:#6b7280">Nothing matches.</td></tr>`; return; }
  let html = `<tr class="sp" style="height:${a * VROW}px"><td colspan="${nc}" style="border:0;padding:0;height:${a * VROW}px"></td></tr>`; for (let k = a; k < z; k++) html += d[k]();
  $('tb').innerHTML = html + `<tr class="sp" style="height:${(d.length - z) * VROW}px"><td colspan="${nc}" style="border:0;padding:0;height:${(d.length - z) * VROW}px"></td></tr>`;
  $('tb').querySelectorAll('input.gck[data-some]').forEach((x) => { x.indeterminate = true; });
}
let vt = 0, lastTop = -1; $('wrap').addEventListener('scroll', () => { if (vt || $('wrap').scrollTop === lastTop) return; lastTop = $('wrap').scrollTop; vt = requestAnimationFrame(() => { vt = 0; renderVirtual(); }); });
// ---- events on the table pages
const rowOf = (tr) => { const k = tr.dataset.k; if (!k) return null; if (k[0] === 'X') return (R.xpRow && R.xpRow.get(k)) || null; if (k[0] === 'L') return { i: +k.slice(1), it: BK[L.b[+k.slice(1)]].items[L.it[+k.slice(1)]] }; const [bi, ii] = k.split(':').map(Number); return { it: BK[bi].items[ii] }; };
$('tb').addEventListener('change', (e) => { const tr = e.target.closest('tr.it'); if (!tr) return; const r = rowOf(tr);
  if (e.target.matches('input[data-f]')) { const f = e.target.dataset.f, v = e.target.value.trim();
    if (r.i !== undefined) { const tg = sel.has('L' + r.i) && selLines().length > 1 ? selLines() : [r.i]; change(tg.map((i) => lineCh(i, f, v)), (tg.length > 1 ? tg.length + ' lines ' : 'Line ') + FN[f] + ' = ' + (v || '(blank)')); }
    else { const k = selKey(r), tg = sel.has(k) && sel.size > 1 ? [...sel].filter((x) => x[0] !== 'L').map((x) => x.split(':').map(Number)) : [[r.it.bi, r.it.ii]]; change(tg.map(([bi, ii]) => ({ t: 'item', bi, ii, f, v })), FN[f] + ' = ' + (v || '(blank)')); } }
  if (e.target.matches('.ck')) { const k = tr.dataset.k; e.target.checked ? sel.add(k) : sel.delete(k); render(); } });
$('tb').addEventListener('click', (e) => { const nt = e.target.closest('[data-node]'); if (nt) { e.stopPropagation(); const S1 = vs(), k = nt.dataset.node; S1.fold.has(k) ? S1.fold.delete(k) : S1.fold.add(k); render(); return; }
  const ob = e.target.closest('[data-brk]'); if (ob) { e.preventDefault(); openBreak(ob.dataset.kind, ob.dataset.brk); return; }
  const o2 = e.target.closest('.open2'); if (o2) { e.preventDefault(); e.stopPropagation(); openDrawer(BK[o2.dataset.bi !== undefined ? +o2.dataset.bi : ST.bk].items[+o2.dataset.ii]); return; } const gc0 = e.target.closest('input.gck'); if (gc0) { e.stopPropagation(); const rs = gRows(R.rows, gc0.dataset.gk), on = gc0.checked; rs.forEach((r) => (on ? sel.add(selKey(r)) : sel.delete(selKey(r)))); render(); return; } const g = e.target.closest('tr.grp[data-g]'); if (g && !e.target.closest('td.num')) { const S0 = vs(); S0.fold.has(g.dataset.g) ? S0.fold.delete(g.dataset.g) : S0.fold.add(g.dataset.g); render(); return; }
  const tr = e.target.closest('tr.it'); if (!tr) return; const r = rowOf(tr); if (!r) return;
  if (e.target.matches('.incb')) { if (r.i !== undefined) { const cur = (OVR[L.id[r.i]] || {}).inc ?? r.it.inc, nv = cur === 'No' ? 'Yes' : 'No'; change([{ t: 'line', i: r.i, f: 'inc', v: nv === r.it.inc ? undefined : nv }], 'Line include'); } else change([{ t: 'item', bi: r.it.bi, ii: r.it.ii, f: 'inc', v: r.it.inc === 'No' ? 'Yes' : 'No' }], 'Include'); return; }
  if (e.target.matches('.rst')) { change(['pkg', 'mnl', 'ce', 'inc'].map((f) => ({ t: 'line', i: r.i, f, v: undefined })), 'Line back to item codes'); return; }
  if (e.target.matches('a.open')) { e.preventDefault(); openDrawer(r.it); return; }
  if (e.target.matches('.ck') && e.shiftKey && lastClick) { const ks = R.rows.map(selKey), a = ks.indexOf(lastClick), b = ks.indexOf(tr.dataset.k); ks.slice(Math.min(a, b), Math.max(a, b) + 1).forEach((k) => sel.add(k)); render(); }
  if (e.target.matches('.ck')) lastClick = tr.dataset.k; });
$('tb').addEventListener('keydown', (e) => { if (!e.target.matches('input[data-f]')) return;
  const t = e.target, f = t.dataset.f, list = () => [...document.querySelectorAll(`#tb input[data-f="${f}"]`)], k = list().indexOf(t), tr = t.closest('tr.it'), r = tr && rowOf(tr);
  const goTo = (n) => setTimeout(() => { const x = list()[n]; if (x) { x.focus(); x.select(); } }, 0);
  if (e.key === 'Enter' && r && r.i === undefined && !t.value.trim() && t.dataset.sug) {   // accept the suggestion of the row (PKG and cost element)
    e.preventDefault(); const s = sugOf(r.it); if (!s) return; const ch = []; if (!r.it.pkg && s.pkg) ch.push({ t: 'item', bi: r.it.bi, ii: r.it.ii, f: 'pkg', v: s.pkg }); if (!r.it.ce && s.ce) ch.push({ t: 'item', bi: r.it.bi, ii: r.it.ii, f: 'ce', v: s.ce });
    change(ch, 'Suggested codes accepted · ' + itemCode(r.it)); goTo(ST.next && statusOf(r.it) === 'Coded' ? k : k + 1); return; }
  if (e.key === 'd' && (e.ctrlKey || e.metaKey) && k > 0) { e.preventDefault(); t.value = list()[k - 1].value; t.dispatchEvent(new Event('change', { bubbles: true })); goTo(ST.next && r && r.i === undefined && statusOf(r.it) === 'Coded' ? k : k + 1); return; }
  if (e.key === 'Escape') { e.preventDefault(); goTo(k + 1); return; }
  if (e.key === 'Enter') { e.preventDefault(); const was = r && r.i === undefined ? r.it : null; t.blur(); setTimeout(() => { const n = ST.next && was && statusOf(was) === 'Coded' ? k : k + 1, x = list()[n]; if (x) { x.focus(); x.select(); } }, 0); } });
// To code · Coded · All (Items: To code = the work list, largest cost first; Lines: a status filter)
document.addEventListener('click', (e) => { const b = e.target.closest('[data-cm]'); if (!b) return; const m = b.dataset.cm; if (ST.tab === 'cod') { ST.next = m === 'todo'; if (!ST.next) vs().st = m === 'coded' ? 'Coded' : 'All'; } else vs().st = m === 'todo' ? 'Not coded' : m === 'coded' ? 'Coded' : 'All'; sel.clear(); render(); $('wrap').scrollTop = 0; });
$('th').addEventListener('click', (e) => { const b = e.target.closest('.fb'); if (b) { e.stopPropagation(); openPop(b.dataset.k, b); return; } const um = e.target.closest('[data-um]'); if (um) { unsToggle(um.dataset.um); return; } const dm = e.target.closest('[data-dm]'); if (dm) { depToggle(dm.dataset.dm); return; } const mn = e.target.closest('[data-umin],[data-umall]'); if (mn) { const M = ST.unsMin || (ST.unsMin = new Set()); if (mn.dataset.umall) { const ks = [...R.unsMk[ST.unsView].keys()]; if (ks.every((k) => M.has(k))) M.clear(); else ks.forEach((k) => M.add(k)); } else M.has(mn.dataset.umin) ? M.delete(mn.dataset.umin) : M.add(mn.dataset.umin); render(); return; } const t = e.target.closest('[data-tog]'); if (t) { const k = t.dataset.tog; PF.has(k) ? PF.delete(k) : PF.add(k); render(); } });
$('th').addEventListener('change', (e) => { if (e.target.id === 'all') { R.rows.forEach((r) => (e.target.checked ? sel.add(selKey(r)) : sel.delete(selKey(r)))); render(); } });
$('bkbar').addEventListener('click', (e) => { const c = e.target.closest('[data-bkc]'); if (!c) return; const v = c.dataset.bkc, gl = ['gl', 'wbs'].includes(ST.tab), multi = gl || ST.tab === 'lines', set = (k) => { if (gl) ST.xbk = k; else ST.bk = k; }, cur = gl ? ST.xbk : ST.bk;
  if (v === 'all') { XB.clear(); set(-1); } else if (v === 'rev') { XB.clear(); ST.xbk = -2; }
  else { const bi = +v; if (multi && (e.ctrlKey || e.metaKey)) { if (!XB.size && cur >= 0) XB.add(cur); XB.has(bi) ? XB.delete(bi) : XB.add(bi); if (XB.size === 1) { set([...XB][0]); XB.clear(); } else set(-1); } else { XB.clear(); set(bi); } }
  sel.clear(); render(); $('wrap').scrollTop = 0; });
$('tools').addEventListener('click', (e) => { const S0 = vs(), t = e.target;
  if (t.dataset.st) { S0.st = t.dataset.st; render(); } if (t.dataset.pm) { if (ST.tab === 'xpm') ST.xpMode = t.dataset.pm; else ST.pmMode = t.dataset.pm; render(); }
  if (t.dataset.lvl) { const S1 = vs(); S1.fold = new Set(R.treeNodes.filter((n) => n.depth >= +t.dataset.lvl && n.kids.size).map((n) => n.code)); S1.lv = 1; render(); }
  if (t.dataset.gm) { ST.glMode = t.dataset.gm; render(); }
  if (t.dataset.pv) { PF.clear(); if (t.dataset.pv !== 'Months') MI.forEach((m) => PF.add(t.dataset.pv === 'Years' ? 'Y' + m.y : 'Q' + m.y + '-' + m.q)); render(); } if (t.dataset.sv) { goSub(t.dataset.sv); }
  if (t.dataset.zm) { const D = R.D, z = t.dataset.zm; S0.fold.clear(); if (z === 'fam') new Set(D.rows.map((r) => D.fam(r.g))).forEach((f) => S0.fold.add('F:' + f)); if (z === 'grp') D.rows.forEach((r) => S0.fold.add(r.g)); render(); return; }
  if (t.id === 'bFold') { R.rows.forEach((r) => S0.fold.add(r.g)); render(); } if (t.id === 'bOpen') { S0.fold.clear(); render(); } if (t.id === 'bClr') { S0.f = {}; S0.sort = null; S0.q = ''; S0.st = 'All'; render(); } });
$('tools').addEventListener('input', (e) => { if (e.target.id === 'q') { vs().q = e.target.value; render(); const q = $('q'); q.focus(); q.setSelectionRange(q.value.length, q.value.length); } });
$('tb').addEventListener('click', (e) => { const a = e.target.closest('.gopo'); if (a) { e.preventDefault(); ST.sub = 'po'; const S0 = vs(); S0.q = a.dataset.po; S0.fold.clear(); render(); } });
// bulk coding
const selItems = () => [...sel].filter((x) => x[0] !== 'L' && x[0] !== 'X').map((x) => x.split(':').map(Number));
const selLines = () => [...sel].flatMap((x) => (x[0] === 'L' ? [+x.slice(1)] : x[0] === 'X' ? xpLinesOf(x) : []));   // an Expenses row = the CJI3 lines of its item that carry its codes
const lineCh = (i, f, v) => ({ t: 'line', i, f, v: v === BK[L.b[i]].items[L.it[i]][f] ? undefined : v });
$('bApply').onclick = () => { if (selLines().length) { const ch = []; [['pkg', 'bPKG'], ['mnl', 'bMNL'], ['ce', 'bCE']].forEach(([f, id]) => { const v = $(id).value.trim(); if (v) selLines().forEach((i) => ch.push(lineCh(i, f, v))); }); if (!ch.length) return toast('Type at least one code in the bar'); return change(ch, 'Lines coded'); }
  const ch = []; [['div', 'bDIV'], ['pkg', 'bPKG'], ['mnl', 'bMNL'], ['ce', 'bCE']].forEach(([f, id]) => { const v = $(id).value.trim(); if (v) selItems().forEach(([bi, ii]) => { if (f !== 'div' || isSub(bi)) ch.push({ t: 'item', bi, ii, f, v }); }); }); if (!ch.length) return toast('Type at least one code in the bar'); change(ch, 'Bulk coding'); };
$('bClear').onclick = () => { if (selLines().length) { if (confirm('Put ' + selLines().length + ' lines back on their item\'s codes?')) change(selLines().flatMap((i) => ['pkg', 'mnl', 'ce', 'inc'].map((f) => ({ t: 'line', i, f, v: undefined }))), 'Lines back to item codes'); return; } if (confirm('Clear the codes of ' + sel.size + ' items?')) change(selItems().flatMap(([bi, ii]) => codeF(bi).map((f) => ({ t: 'item', bi, ii, f, v: '' }))), 'Clear codes'); };
$('bInc').onclick = () => (selLines().length ? change(selLines().map((i) => lineCh(i, 'inc', 'Yes')), 'Lines included') : change(selItems().map(([bi, ii]) => ({ t: 'item', bi, ii, f: 'inc', v: 'Yes' })), 'Include')); $('bExc').onclick = () => (selLines().length ? change(selLines().map((i) => lineCh(i, 'inc', 'No')), 'Lines excluded') : change(selItems().map(([bi, ii]) => ({ t: 'item', bi, ii, f: 'inc', v: 'No' })), 'Exclude'));
$('bNone').onclick = () => { sel.clear(); render(); };
