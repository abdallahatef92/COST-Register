// =====================================================================================  Adjust › Owner-supplied material
// CJI3 lines with a quantity and no amount (material given by the owner): give each material a rate; qty × rate is added to the cost in the month of each line
function ownStats() { const m = new Map(); let lines = 0;
  for (let i = 0; i < N; i++) { if (!isOwn(i)) continue; lines++; const it = BK[L.b[i]].items[L.it[i]]; let x = m.get(it); if (!x) m.set(it, (x = { it, q: 0, n: 0, d0: 9e9, d1: 0 })); x.q += L.qty[i]; x.n++; if (L.d[i]) { x.d0 = Math.min(x.d0, L.d[i]); x.d1 = Math.max(x.d1, L.d[i]); } }
  const pd = new Map(); for (let i = 0; i < N; i++) { if (isOwn(i) || Math.abs(L.qty[i]) < 1e-9) continue; const it = BK[L.b[i]].items[L.it[i]]; if (!m.has(it)) continue; const x = pd.get(it) || { a: 0, q: 0 }; x.a += L.amt[i]; x.q += L.qty[i]; pd.set(it, x); }   // the material's own paid lines
  m.forEach((x, it) => { const p = pd.get(it); x.sug = p && Math.abs(p.q) > 1e-9 && p.a / p.q > 0 ? Math.round(p.a / p.q * 100) / 100 : 0; x.rate = ST.own[it.k] || 0; });
  const list = [...m.values()]; return { list, n: list.length, lines, noRate: list.filter((x) => !x.rate).length, withRate: list.filter((x) => x.rate).length }; }
const ymd = (d) => (d ? MON[+String(d).slice(4, 6) - 1] + '-' + String(d).slice(2, 4) : '');
function ownDef() {
  const O = ownStats(), rows = O.list.sort((a, b) => (!a.rate - !b.rate) || b.q * (b.rate || b.sug) - a.q * (a.rate || a.sug) || b.q - a.q).map((x) => ({ it: x.it, o: x, g: '' }));
  const cols = [{ k: 'bk', l: 'Bucket', w: 120, v: (r) => BK[r.it.bi].short, h: (r) => `<td><span class="bkc"><i style="background:${bkColor(r.it.bi)}"></i>${esc(BK[r.it.bi].short)}</span></td>` },
    { k: 'code', l: 'Material', w: 104, fz: 1, v: (r) => itemCode(r.it), h: (r) => `<td><a class="lk open">${esc(itemCode(r.it))}</a></td>` },
    { k: 'desc', l: 'Description', w: 280, v: (r) => itemDesc(r.it), h: (r) => `<td dir="auto" title="${esc(itemDesc(r.it))}">${esc(itemDesc(r.it))}</td>` },
    { k: 'unit', l: 'Unit', w: 58, v: (r) => r.it.vals[5] || '', h: (r) => `<td>${r.it.vals[5] ? `<span class="u">${esc(r.it.vals[5])}</span>` : ''}</td>` },
    numC('q', 'Qty (owner)', 110, (r) => r.o.q, { f: fq }), numC('n', 'Lines', 64, (r) => r.o.n),
    { k: 'when', l: 'Issued', w: 130, v: (r) => ymd(r.o.d0) + ' – ' + ymd(r.o.d1), h: (r) => `<td>${ymd(r.o.d0)} – ${ymd(r.o.d1)}</td>` },
    { k: 'rate', l: 'Rate (yours)', w: 120, code: 1, num: 1, v: (r) => r.o.rate, h: (r) => `<td class="c"><input class="ownr${r.o.rate ? '' : ' miss'}" data-k="${esc(r.it.k)}" value="${r.o.rate || ''}" inputmode="decimal" placeholder="${r.o.sug ? r.o.sug : ''}"></td>` },
    { k: 'sug', l: 'Suggested', w: 190, v: (r) => r.o.sug, h: (r) => `<td class="help">${r.o.sug ? `own paid rate ${fmt2(r.o.sug)} <a class="lk" data-ownuse="${esc(r.it.k)}" data-r="${r.o.sug}">use</a>` : '<span style="color:#B0B6C0">no paid line</span>'}</td>` },
    numC('val', 'Value (qty × rate)', 130, (r) => r.o.q * r.o.rate, { h: (r) => `<td class="num"><b>${r.o.rate ? fmt(r.o.q * r.o.rate) : '–'}</b></td>` }),
    { k: 'st', l: 'Status', w: 112, v: (r) => (r.o.rate ? 'In the cost' : 'Rate missing'), h: (r) => `<td><span class="st ${r.o.rate ? 'Coded' : 'Not'}">${r.o.rate ? 'In the cost' : 'Rate missing'}</span></td>` }];
  const sugN = O.list.filter((x) => !x.rate && x.sug).length;
  return { cols, rows, groups: false, sel: false, status: false, foot: (rs) => ({ val: fmt(rs.reduce((t, r) => t + r.o.q * r.o.rate, 0)) }),
    rpt: { title: '<b class="xpt">Owner-supplied material</b>', lead: sugN ? `<button id="ownAll" title="Give every material without a rate its own paid rate">Use the suggested rate for ${sugN}</button>` : '', hint: `CJI3 lines with a quantity and no amount · ${O.n} materials · ${O.lines} lines · ${O.withRate} with a rate · valued ${fmt(R.ownIn)} – added to the cost, each line in its own month` } };
}
document.addEventListener('change', (e) => { const t = e.target; if (!t.matches || !t.matches('#tb input.ownr')) return; const v = String(t.value).replace(/,/g, '').trim(); if (v && !(+v >= 0)) { toast('A rate is a number'); return; } change([{ t: 'own', k: t.dataset.k, v: v === '' || +v === 0 ? undefined : +v }], 'Owner material rate'); });
document.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches && e.target.matches('#tb input.ownr')) { e.preventDefault(); e.target.blur(); } });
document.addEventListener('click', (e) => { const u = e.target.closest('[data-ownuse]'); if (u) { change([{ t: 'own', k: u.dataset.ownuse, v: +u.dataset.r }], 'Owner material rate (suggested)'); return; }
  if (e.target.id === 'ownAll') { const ch = ownStats().list.filter((x) => !x.rate && x.sug).map((x) => ({ t: 'own', k: x.it.k, v: x.sug })); change(ch, 'Owner material: suggested rates'); } });
