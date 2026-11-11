// =====================================================================================  Dashboard › Cost flow: a Sankey of the actual cost
// SAP bucket → Direct / Indirect → package (PKG) or indirect group → for the direct packages, what each is made of (MNL: MAT / SUB / LAB / EQU). Built from the same coded lines as the PKG summary, so it follows the cut date and every code.
const FLOW = { per: 'td', lvl: 'pkg' };
function flowData() {
  const cfg = psCfg(), indG = new Map(), dirG = new Map(); cfg.indirect.forEach((g) => g.c.forEach((c) => indG.set(c, g.n))); cfg.direct.forEach((g) => g.c.forEach((c) => dirG.set(c, g.n)));
  const tri = new Map(); let neg = 0; const negBy = new Map();
  for (const e of R.exp.values()) { let a = 0; if (FLOW.per === 'tm') a = R.rep > 0 ? e.p[R.rep] : 0; else for (let p = 0; p < NP - 1; p++) a += e.p[p]; if (Math.abs(a) < 0.005) continue;
    const ind = e.pkg ? isIndPkg(e.pkg) : IND_BK.includes(BK[e.b].id), mid = ind ? 'I' : 'D';
    const right = !e.pkg ? 'N|' + mid : ind ? 'G|' + (indG.get(e.ce) || 'Other indirect') : FLOW.lvl === 'grp' ? 'G|' + (dirG.get(e.pkg) || 'PKGs not in a group') : 'P|' + e.pkg;
    const k = e.b + '\u0001' + mid + '\u0001' + right + '\u0001' + (!ind && e.pkg ? e.mnl || '(no MNL)' : ''); tri.set(k, (tri.get(k) || 0) + a); }
  const T = []; tri.forEach((a, k) => { const [b, mid, right, mnl] = k.split('\u0001'); if (a > 0.5) T.push({ b: +b, mid, right, mnl, a }); else if (a < -0.5) { neg += a; negBy.set(+b, (negBy.get(+b) || 0) + a); } });
  // keep the picture readable: the 12 largest packages, the rest as one band
  const pk = new Map(); T.forEach((t) => { if (t.right[0] === 'P') pk.set(t.right, (pk.get(t.right) || 0) + t.a); }); const keep = new Set([...pk].sort((x, y) => y[1] - x[1]).slice(0, 12).map((x) => x[0])), nOther = pk.size - keep.size;
  T.forEach((t) => { if (t.right[0] === 'P' && !keep.has(t.right)) t.right = 'O|' + nOther; });
  return { T, neg, negBy, tot: T.reduce((s, t) => s + t.a, 0) };
}
function renderFlow() {
  const D = flowData(), el = $('flow'), fm = (v) => (Math.abs(v) >= 1e6 ? (v / 1e6).toFixed(1) + 'M' : fmt(v)), pct = (v) => (D.tot ? (100 * v / D.tot).toFixed(v / D.tot < 0.0995 ? 1 : 0) + '%' : '');
  const seg = (k, opts) => `<span class="seg">${opts.map(([v, l]) => `<button data-fl="${k}:${v}" class="${FLOW[k] === v ? 'on' : ''}">${l}</button>`).join('')}</span>`;
  const head = `<div class="flh"><h3>Where the cost goes</h3><span class="help">actual cost ${FLOW.per === 'tm' ? 'of ' + R.repLab : 'to the cut date'} · <b>${fmt(D.tot)}</b> · point at a band to follow it · click a name to open it</span><span class="sp"></span>${seg('per', [['td', 'To date'], ['tm', R.repLab]])} ${seg('lvl', [['pkg', 'Packages'], ['grp', 'Groups']])}</div>`;
  if (!D.T.length) { el.innerHTML = `<div class="flc">${head}<div class="help" style="padding:30px">No cost in this period.</div></div>`; return; }
  // nodes of the three columns
  const node = (m, id, lab, col, ord, go) => m.get(id) || m.set(id, { id, lab, col, ord, go, v: 0, o1: 0, o2: 0 }).get(id), A = new Map(), B = new Map(), C = new Map(), M4 = new Map(), MNC = { MAT: '#1F4E9A', SUB: '#D9772B', LAB: '#C9A227', EQU: '#B23A3A', OTHER: '#6B7A8F' }, MNN = { MAT: 'MAT · material', SUB: 'SUB · subcontract', LAB: 'LAB · labour', EQU: 'EQU · equipment', OTHER: 'OTHER' };
  const rLab = (r) => (r[0] === 'N' ? 'Not coded yet' : r[0] === 'O' ? `Other packages (${r.slice(2)})` : r[0] === 'P' ? r.slice(2) + (pkgLabel(r.slice(2)) ? ' · ' + pkgLabel(r.slice(2)) : '') : r.slice(2));
  D.T.forEach((t) => { node(A, t.b, BK[t.b].short, bkColor(t.b), (t.mid === 'D' ? 0 : 1), 'b:' + t.b).v += t.a; node(B, t.mid, t.mid === 'D' ? 'Direct' : 'Indirect', t.mid === 'D' ? '#1F3864' : '#7A4B8C', t.mid === 'D' ? 0 : 1, '').v += t.a;
    node(C, t.mid + t.right, rLab(t.right), t.right[0] === 'N' ? '#C00000' : t.mid === 'D' ? '#1F3864' : '#7A4B8C', (t.mid === 'D' ? 0 : 10) + (t.right[0] === 'N' ? 3 : t.right[0] === 'O' ? 2 : 1), t.right[0] === 'N' ? 'n:' + t.mid : t.right[0] === 'P' ? 'p:' + t.right.slice(2) : '').v += t.a;
    if (t.mnl) node(M4, t.mnl, MNN[t.mnl] || t.mnl, MNC[t.mnl] || '#6B7A8F', ['MAT', 'SUB', 'LAB', 'EQU', 'OTHER'].indexOf(t.mnl) + 1 || 9, '').v += t.a; });
  const sortN = (m) => [...m.values()].sort((x, y) => x.ord - y.ord || y.v - x.v), cA = sortN(A), cB = sortN(B), cC = sortN(C), cD = [...M4.values()].sort((x, y) => x.ord - y.ord);
  // every name gets room: a node never takes less than MINH of height in its column, however small its amount
  const four = cD.length > 0, W = 1240, nw = 14, xA = 190, xB = four ? 465 : 600, xC = four ? 725 : 960, xD = 1030, gap = 8, MINH = 17, rows = Math.max(cA.length, cC.length), H = Math.max(440, rows * 34);
  const fit = (c, g, sc0) => c.reduce((t, n) => t + Math.max(n.v * sc0, MINH), 0) + g * (c.length - 1), scOf = (c, g) => { let lo = 0, hi = H / D.tot; for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (fit(c, g, m) <= H) lo = m; else hi = m; } return lo; };
  const sc = Math.min(scOf(cA, gap), scOf(cB, 38), scOf(cC, gap));   // the MNL column is shorter than the others (direct, coded only), so it always fits
  const lay = (c, g) => { let y = (H - fit(c, g, sc)) / 2; c.forEach((n, i) => { n.h = n.v * sc; const slot = Math.max(n.h, MINH); n.y = y + (slot - n.h) / 2; n.i = i; y += slot + g; }); }; lay(cA, gap); lay(cB, 38); lay(cC, gap);
  if (four) { let y = cC[0].y; cD.forEach((n, i) => { n.h = n.v * sc; const slot = Math.max(n.h, MINH); n.y = y + (slot - n.h) / 2; n.i = i; y += slot + 22; }); }
  // bands: bucket → middle (in the order of the buckets), middle → right (in the order of the right column)
  const l1 = new Map(), l2 = new Map(), l3 = new Map(); D.T.forEach((t) => { const k1 = t.b + '|' + t.mid, k2 = t.mid + '|' + t.mid + t.right; l1.set(k1, (l1.get(k1) || 0) + t.a); l2.set(k2, (l2.get(k2) || 0) + t.a); if (t.mnl) { const k3 = t.mid + t.right + '|' + t.mnl; l3.set(k3, (l3.get(k3) || 0) + t.a); } });
  const band = (a, b2, v, col, xa, xb, cls, tip) => { const h = Math.max(v * sc, 0.6), ya = a.y + a.o2, yb = b2.y + b2.o1; a.o2 += v * sc; b2.o1 += v * sc; const mx = (xa + xb) / 2; return `<path class="fb ${cls}" d="M${xa},${ya.toFixed(1)} C${mx},${ya.toFixed(1)} ${mx},${yb.toFixed(1)} ${xb},${yb.toFixed(1)} L${xb},${(yb + h).toFixed(1)} C${mx},${(yb + h).toFixed(1)} ${mx},${(ya + h).toFixed(1)} ${xa},${(ya + h).toFixed(1)} Z" fill="${col}"><title>${esc(tip)}</title></path>`; };
  let s = '';
  cA.forEach((a) => cB.forEach((m) => { const v = l1.get(a.id + '|' + m.id); if (v) s += band(a, m, v, a.col, xA + nw, xB, `a${a.i} m${m.i}`, `${a.lab} → ${m.lab}: ${fmt(v)} · ${pct(v)}`); }));
  cB.forEach((m) => cC.forEach((c) => { const v = l2.get(m.id + '|' + c.id); if (v) s += band(m, c, v, c.col, xB + nw, xC, `m${m.i} c${c.i}`, `${m.lab} → ${c.lab}: ${fmt(v)} · ${pct(v)}`); }));
  cC.forEach((c) => cD.forEach((d) => { const v = l3.get(c.id + '|' + d.id); if (v) s += band(c, d, v, d.col, xC + nw, xD, `c${c.i} d${d.i}`, `${c.lab} → ${d.lab}: ${fmt(v)} · ${(100 * v / c.v).toFixed(0)}% of this package`); }));
  const lab = (n, x, anchor, cls, big) => `<g class="fn ${cls}${n.go ? ' go' : ''}" data-hl="${cls}" ${n.go ? `data-go="${esc(n.go)}"` : ''}><rect x="${x}" y="${n.y.toFixed(1)}" width="${nw}" height="${Math.max(n.h, 2).toFixed(1)}" rx="2" fill="${n.col}"/>${big
    ? `<text x="${x + nw + 9}" y="${(n.y + n.h / 2 - 2).toFixed(1)}" font-size="15" font-weight="700">${esc(n.lab)}</text><text x="${x + nw + 9}" y="${(n.y + n.h / 2 + 16).toFixed(1)}" font-size="12.5" class="mu">${fm(n.v)} · ${pct(n.v)}</text>`
    : `<text x="${anchor === 'end' ? x - 9 : x + nw + 9}" y="${(n.y + n.h / 2 + 4.5).toFixed(1)}" text-anchor="${anchor}" font-size="12.5"><tspan font-weight="600">${esc(n.lab.length > (four ? 30 : 34) ? n.lab.slice(0, four ? 29 : 33) + '…' : n.lab)}</tspan> <tspan class="mu">${fm(n.v)} · ${pct(n.v)}</tspan></text>`}<title>${esc(n.lab)}: ${fmt(n.v)} · ${pct(n.v)}${n.go ? ' – click to open' : ''}</title></g>`;
  cA.forEach((n) => { s += lab(n, xA, 'end', 'a' + n.i); }); cB.forEach((n) => { s += lab(n, xB, 'start', 'm' + n.i, true); }); cC.forEach((n) => { s += lab(n, xC, 'start', 'c' + n.i); }); cD.forEach((n) => { s += lab(n, xD, 'start', 'd' + n.i); });
  const negTxt = D.neg < -0.5 ? `<div class="fln">Not drawn: <b>${fmt(D.neg)}</b> of credits (${[...D.negBy].map(([b, v]) => esc(BK[b].short) + ' ' + fmt(v)).join(' · ')}). A band cannot be negative. Bands ${fmt(D.tot)} + credits ${fmt(D.neg)} = <b>${fmt(D.tot + D.neg)}</b>${FLOW.per === 'td' ? ' = the cost to date' : ''}.</div>` : '';
  el.innerHTML = `<div class="flc">${head}<div class="flcol" style="max-width:${W}px">${[[xA, 'SAP BUCKET', 'end'], [xB, 'DIRECT / INDIRECT', 'start'], [xC, (FLOW.lvl === 'grp' ? 'GROUP' : 'PACKAGE (PKG)') + ' · INDIRECT GROUP', 'start'], ...(four ? [[xD, 'MADE OF (MNL)', 'start']] : [])].map(([x, l, a2]) => `<span style="position:absolute;${a2 === 'end' ? `right:${(100 - 100 * (x + nw) / W).toFixed(2)}%` : `left:${(100 * x / W).toFixed(2)}%`}">${l}</span>`).join('')}</div><svg id="flsvg" viewBox="0 0 ${W} ${H}" style="max-width:${W}px;width:100%;height:auto">${s}</svg>${negTxt}</div>`;
}
// point at a name or a band: its bands stay, the rest fades
$('flow').addEventListener('mouseover', (e) => { const sv = $('flsvg'); if (!sv) return; const n = e.target.closest('.fn'), b = e.target.closest('.fb'), keys = n ? [n.dataset.hl] : b ? b.getAttribute('class').split(' ').slice(1) : null;
  sv.querySelectorAll('.fb').forEach((x) => { const c = x.getAttribute('class').split(' '); x.style.opacity = !keys ? '' : (n ? c.includes(keys[0]) : keys.every((k) => c.includes(k))) ? '.62' : '.07'; }); });
$('flow').addEventListener('mouseleave', () => { const sv = $('flsvg'); if (sv) sv.querySelectorAll('.fb').forEach((x) => { x.style.opacity = ''; }); });
$('flow').addEventListener('click', (e) => { const f = e.target.closest('[data-fl]'); if (f) { const [k, v] = f.dataset.fl.split(':'); FLOW[k] = v; renderFlow(); return; }
  const g = e.target.closest('[data-go]'); if (!g) return; const [t, v] = g.dataset.go.split(':'); sel.clear();
  if (t === 'b') { ST.tab = 'cod'; ST.bk = +v; ST.next = false; } else if (t === 'n') { ST.tab = 'cod'; ST.next = true; } else { ST.tab = 'exp'; render(); vs().q = v; }
  render(); $('wrap').scrollTop = 0; });
