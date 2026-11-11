// =====================================================================================  Dashboard › Cost flow: a Sankey of the actual cost
// SAP bucket → Direct / Indirect → package (PKG) or indirect group → a last layer that breaks each package down by the bucket its cost came from. Built from the same coded lines as the PKG summary, so it follows the cut date and every code.
const FLOW = { from: null, to: null, lvl: 'pkg', bd: 'main' };   // from / to: period indexes (0 = Opening … the cut month); null = from the start / to the cut month
const flowRange = () => { const last = Math.max(0, R.rep), t = FLOW.to === null ? last : Math.min(Math.max(0, FLOW.to), last), f = FLOW.from === null ? 0 : Math.min(Math.max(0, FLOW.from), t); return [f, t, last]; };
function flowData() {
  const cfg = psCfg(), indG = new Map(), dirG = new Map(); cfg.indirect.forEach((g) => g.c.forEach((c) => indG.set(c, g.n))); cfg.direct.forEach((g) => g.c.forEach((c) => dirG.set(c, g.n)));
  const tri = new Map(), [F0, F1] = flowRange(); let neg = 0; const negBy = new Map();
  for (const e of R.exp.values()) { let a = 0; for (let p = F0; p <= F1; p++) a += e.p[p]; if (Math.abs(a) < 0.005) continue;
    const ind = e.pkg ? isIndPkg(e.pkg) : IND_BK.includes(BK[e.b].id), mid = ind ? 'I' : 'D';
    const right = !e.pkg ? 'N|' + mid : ind ? 'G|' + (indG.get(e.ce) || 'Other indirect') : FLOW.lvl === 'grp' ? 'G|' + (dirG.get(e.pkg) || 'PKGs not in a group') : 'P|' + e.pkg;
    const k = e.b + '\u0001' + mid + '\u0001' + right; tri.set(k, (tri.get(k) || 0) + a); }
  const T = []; tri.forEach((a, k) => { const [b, mid, right] = k.split('\u0001'); if (a > 0.5) T.push({ b: +b, mid, right, a }); else if (a < -0.5) { neg += a; negBy.set(+b, (negBy.get(+b) || 0) + a); } });
  // keep the picture readable: the 12 largest packages, the rest as one band
  const pk = new Map(); T.forEach((t) => { if (t.right[0] === 'P') pk.set(t.right, (pk.get(t.right) || 0) + t.a); }); const keep = new Set([...pk].sort((x, y) => y[1] - x[1]).slice(0, 12).map((x) => x[0])), nOther = pk.size - keep.size;
  T.forEach((t) => { if (t.right[0] === 'P' && !keep.has(t.right)) t.right = 'O|' + nOther; });
  return { T, neg, negBy, tot: T.reduce((s, t) => s + t.a, 0) };
}
function renderFlow() {
  const D = flowData(), el = $('flow'), fm = (v) => (Math.abs(v) >= 1e6 ? (v / 1e6).toFixed(1) + 'M' : fmt(v)), pct = (v) => (D.tot ? (100 * v / D.tot).toFixed(v / D.tot < 0.0995 ? 1 : 0) + '%' : '');
  const seg = (k, opts) => `<span class="seg">${opts.map(([v, l]) => `<button data-fl="${k}:${v}" class="${FLOW[k] === v ? 'on' : ''}">${l}</button>`).join('')}</span>`;
  const [F0, F1, FL] = flowRange(), all = F0 === 0 && F1 === FL, one = F0 === F1, yr0 = (() => { const y = (MI[FL - 1] || {}).y; const k = MI.findIndex((m) => m.y === y); return k < 0 ? 0 : k + 1; })(), pre = all ? 'td' : one && F1 === FL ? 'tm' : F0 === yr0 && F1 === FL ? 'yr' : '';
  const opt = (cur) => PER.slice(0, FL + 1).map((l, k) => `<option value="${k}" ${k === cur ? 'selected' : ''}>${esc(l)}</option>`).join('');
  const when = all ? 'to the cut date' : one ? 'of ' + PER[F0] : 'from ' + PER[F0] + ' to ' + PER[F1];
  const head = `<div class="flh"><h3>Where the cost goes</h3><span class="help">actual cost ${when} · <b>${fmt(D.tot)}</b> · point at a band to follow it · click a name to open it</span><span class="sp"></span>
    <span class="seg" title="The period shown">${[['td', 'To date'], ['yr', 'This year'], ['tm', R.repLab]].map(([v, l]) => `<button data-flp="${v}" class="${pre === v ? 'on' : ''}">${l}</button>`).join('')}</span>
    <span class="fltm" title="Any month or any range up to the cut date. ◀ ▶ move the period one month"><button data-flp="prev" ${F0 <= 0 ? 'disabled' : ''}>◀</button><select id="flFrom">${opt(F0)}</select><span>to</span><select id="flTo">${opt(F1)}</select><button data-flp="next" ${F1 >= FL ? 'disabled' : ''}>▶</button></span>
    ${seg('lvl', [['pkg', 'Packages'], ['grp', 'Groups']])} <span class="help">Breakdown</span>${seg('bd', [['off', 'Hide'], ['main', 'Main'], ['all', 'All']])}</div>`;
  if (!D.T.length) { el.innerHTML = `<div class="flc">${head}<div class="help" style="padding:30px">No cost in this period.</div></div>`; return; }
  // nodes of the three columns
  const node = (m, id, lab, col, ord, go) => m.get(id) || m.set(id, { id, lab, col, ord, go, v: 0, o1: 0, o2: 0 }).get(id), A = new Map(), B = new Map(), C = new Map();
  const rLab = (r) => (r[0] === 'N' ? 'Not coded yet' : r[0] === 'O' ? `Other packages (${r.slice(2)})` : r[0] === 'P' ? r.slice(2) + (pkgLabel(r.slice(2)) ? ' · ' + pkgLabel(r.slice(2)) : '') : r.slice(2));
  D.T.forEach((t) => { node(A, t.b, BK[t.b].short, bkColor(t.b), (t.mid === 'D' ? 0 : 1), 'b:' + t.b).v += t.a; node(B, t.mid, t.mid === 'D' ? 'Direct' : 'Indirect', t.mid === 'D' ? '#1F3864' : '#7A4B8C', t.mid === 'D' ? 0 : 1, '').v += t.a;
    node(C, t.mid + t.right, rLab(t.right), t.right[0] === 'N' ? '#C00000' : t.mid === 'D' ? '#1F3864' : '#7A4B8C', (t.mid === 'D' ? 0 : 10) + (t.right[0] === 'N' ? 3 : t.right[0] === 'O' ? 2 : 1), t.right[0] === 'N' ? 'n:' + t.mid : t.right[0] === 'P' ? 'p:' + t.right.slice(2) : '').v += t.a; });
  const sortN = (m) => [...m.values()].sort((x, y) => x.ord - y.ord || y.v - x.v), cA = sortN(A), cB = sortN(B), cC = sortN(C);
  // every name gets room: a node never takes less than MINH of height in its column, however small its amount
  const bd = FLOW.bd !== 'off', W = 1240, nw = 14, xA = 190, xB = bd ? 520 : 600, xC = bd ? 800 : 960, xD = 1040, gap = 8, MINH = 17, rows = Math.max(cA.length, cC.length);
  // 'All': a package gets the height its breakdown labels need
  if (FLOW.bd === 'all') { const parts = new Map(); D.T.forEach((t) => { const k = t.mid + t.right; (parts.get(k) || parts.set(k, new Set()).get(k)).add(t.b); }); cC.forEach((n) => { if (n.col !== '#C00000') n.mh = Math.max(MINH, (parts.get(n.id) || new Set()).size * 13.5); }); }
  const H = Math.max(440, rows * 34, cC.reduce((t, n) => t + (n.mh || MINH) + gap, 0) + 60);
  const fit = (c, g, sc0) => c.reduce((t, n) => t + Math.max(n.v * sc0, n.mh || MINH), 0) + g * (c.length - 1), scOf = (c, g) => { let lo = 0, hi = H / D.tot; for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (fit(c, g, m) <= H) lo = m; else hi = m; } return lo; };
  const sc = Math.min(scOf(cA, gap), scOf(cB, 38), scOf(cC, gap));
  const lay = (c, g) => { let y = (H - fit(c, g, sc)) / 2; c.forEach((n, i) => { n.h = n.v * sc; const slot = Math.max(n.h, n.mh || MINH); n.y = y + (slot - n.h) / 2; n.st = y; n.i = i; y += slot + g; }); }; lay(cA, gap); lay(cB, 38); lay(cC, gap);
  // bands: bucket → middle (in the order of the buckets), middle → right (in the order of the right column)
  const l1 = new Map(), l2 = new Map(), l3 = new Map(); D.T.forEach((t) => { const k1 = t.b + '|' + t.mid, k2 = t.mid + '|' + t.mid + t.right; l1.set(k1, (l1.get(k1) || 0) + t.a); l2.set(k2, (l2.get(k2) || 0) + t.a); const k3 = t.mid + t.right + '|' + t.b; l3.set(k3, (l3.get(k3) || 0) + t.a); });
  const band = (a, b2, v, col, xa, xb, cls, tip) => { const h = Math.max(v * sc, 0.6), ya = a.y + a.o2, yb = b2.y + b2.o1; a.o2 += v * sc; b2.o1 += v * sc; const mx = (xa + xb) / 2; return `<path class="fb ${cls}" d="M${xa},${ya.toFixed(1)} C${mx},${ya.toFixed(1)} ${mx},${yb.toFixed(1)} ${xb},${yb.toFixed(1)} L${xb},${(yb + h).toFixed(1)} C${mx},${(yb + h).toFixed(1)} ${mx},${(ya + h).toFixed(1)} ${xa},${(ya + h).toFixed(1)} Z" fill="${col}"><title>${esc(tip)}</title></path>`; };
  let s = '';
  cA.forEach((a) => cB.forEach((m) => { const v = l1.get(a.id + '|' + m.id); if (v) s += band(a, m, v, a.col, xA + nw, xB, `a${a.i} m${m.i}`, `${a.lab} → ${m.lab}: ${fmt(v)} · ${pct(v)}`); }));
  cB.forEach((m) => cC.forEach((c) => { const v = l2.get(m.id + '|' + c.id); if (v) s += band(m, c, v, c.col, xB + nw, xC, `m${m.i} c${c.i}`, `${m.lab} → ${c.lab}: ${fmt(v)} · ${pct(v)}`); }));
  const lab = (n, x, anchor, cls, big, short) => `<g class="fn ${cls}${n.go ? ' go' : ''}" data-hl="${cls}" ${n.go ? `data-go="${esc(n.go)}"` : ''}><rect x="${x}" y="${n.y.toFixed(1)}" width="${nw}" height="${Math.max(n.h, 2).toFixed(1)}" rx="2" fill="${n.col}"/>${big
    ? `<text x="${x + nw + 9}" y="${(n.y + n.h / 2 - 2).toFixed(1)}" font-size="15" font-weight="700">${esc(n.lab)}</text><text x="${x + nw + 9}" y="${(n.y + n.h / 2 + 16).toFixed(1)}" font-size="12.5" class="mu">${fm(n.v)} · ${pct(n.v)}</text>`
    : `<text x="${anchor === 'end' ? x - 9 : x + nw + 9}" y="${(n.y + n.h / 2 + 4.5).toFixed(1)}" text-anchor="${anchor}" font-size="12.5"><tspan font-weight="600">${esc(n.lab.length > (short ? 21 : 34) ? n.lab.slice(0, short ? 20 : 33) + '…' : n.lab)}</tspan> <tspan class="mu">${fm(n.v)}${short ? '' : ' · ' + pct(n.v)}</tspan></text>`}<title>${esc(n.lab)}: ${fmt(n.v)} · ${pct(n.v)}${n.go ? ' – click to open' : ''}</title></g>`;
  cA.forEach((n) => { s += lab(n, xA, 'end', 'a' + n.i); }); cB.forEach((n) => { s += lab(n, xB, 'start', 'm' + n.i, true); }); // the last layer: each package (or indirect head) broken down by the bucket its cost came from – straight, so nothing crosses
  let lastLy = -99, maxLy = 0;
  if (bd) cC.forEach((c) => { if (c.col === '#C00000') return; let y = c.y; if (FLOW.bd === 'all') lastLy = c.st - 3; cA.forEach((a) => { const v = l3.get(c.id + '|' + a.id); if (!v) return; const h = Math.max(v * sc, 0.8), tip = `${c.lab} – from ${a.lab}: ${fmt(v)} · ${(100 * v / c.v).toFixed(0)}% of it`;
      s += `<path class="fb a${a.i} c${c.i}" d="M${xC + nw},${y.toFixed(1)} L${xD},${y.toFixed(1)} L${xD},${(y + h).toFixed(1)} L${xC + nw},${(y + h).toFixed(1)} Z" fill="${a.col}"><title>${esc(tip)}</title></path><rect x="${xD}" y="${y.toFixed(1)}" width="${nw}" height="${h.toFixed(1)}" fill="${a.col}"><title>${esc(tip)}</title></rect>`
        + ((FLOW.bd === 'all' || v * sc >= 13) ? ((ly) => { lastLy = ly; maxLy = Math.max(maxLy, ly); return `<text x="${xD + nw + 8}" y="${ly.toFixed(1)}" font-size="11.5"><tspan font-weight="600">${esc(a.lab)}</tspan> <tspan class="mu">${fm(v)} · ${(100 * v / c.v).toFixed(0)}%</tspan></text>`; })(Math.max(y + v * sc / 2 + 4, lastLy + 13)) : ''); y += v * sc; }); });
  cC.forEach((n) => { s += lab(n, xC, 'start', 'c' + n.i, false, bd && n.col !== '#C00000'); }); const HH = Math.max(H, maxLy + 8);
  const negTxt = D.neg < -0.5 ? `<div class="fln">Not drawn: <b>${fmt(D.neg)}</b> of credits (${[...D.negBy].map(([b, v]) => esc(BK[b].short) + ' ' + fmt(v)).join(' · ')}). A band cannot be negative. Bands ${fmt(D.tot)} + credits ${fmt(D.neg)} = <b>${fmt(D.tot + D.neg)}</b>${all ? ' = the cost to date' : ' = the cost ' + when}.</div>` : '';
  el.innerHTML = `<div class="flc">${head}<div class="flcol" style="max-width:${W}px">${[[xA, 'SAP BUCKET', 'end'], [xB, 'DIRECT / INDIRECT', 'start'], [xC, (FLOW.lvl === 'grp' ? 'GROUP' : 'PACKAGE (PKG)') + ' · INDIRECT HEAD', 'start'], ...(bd ? [[xD, 'MADE OF (BUCKET)', 'start']] : [])].map(([x, l, a2]) => `<span style="position:absolute;${a2 === 'end' ? `right:${(100 - 100 * (x + nw) / W).toFixed(2)}%` : `left:${(100 * x / W).toFixed(2)}%`}">${l}</span>`).join('')}</div><svg id="flsvg" viewBox="0 0 ${W} ${HH}" style="max-width:${W}px;width:100%;height:auto">${s}</svg>${negTxt}</div>`;
}
// point at a name or a band: its bands stay, the rest fades
$('flow').addEventListener('mouseover', (e) => { const sv = $('flsvg'); if (!sv) return; const n = e.target.closest('.fn'), b = e.target.closest('.fb'), keys = n ? [n.dataset.hl] : b ? b.getAttribute('class').split(' ').slice(1) : null;
  sv.querySelectorAll('.fb').forEach((x) => { const c = x.getAttribute('class').split(' '); x.style.opacity = !keys ? '' : (n ? c.includes(keys[0]) : keys.every((k) => c.includes(k))) ? '.62' : '.07'; }); });
$('flow').addEventListener('mouseleave', () => { const sv = $('flsvg'); if (sv) sv.querySelectorAll('.fb').forEach((x) => { x.style.opacity = ''; }); });
$('flow').addEventListener('change', (e) => { if (e.target.id === 'flFrom') { FLOW.from = +e.target.value; if (FLOW.to !== null && FLOW.to < FLOW.from) FLOW.to = FLOW.from; renderFlow(); } if (e.target.id === 'flTo') { FLOW.to = +e.target.value; if ((FLOW.from === null ? 0 : FLOW.from) > FLOW.to) FLOW.from = FLOW.to; renderFlow(); } });
$('flow').addEventListener('click', (e) => { const fp = e.target.closest('[data-flp]'); if (fp) { const [f0, f1, last] = flowRange(), v = fp.dataset.flp;
    if (v === 'td') { FLOW.from = null; FLOW.to = null; } else if (v === 'tm') { FLOW.from = last; FLOW.to = null; } else if (v === 'yr') { const y = (MI[last - 1] || {}).y, k = MI.findIndex((m) => m.y === y); FLOW.from = k < 0 ? 0 : k + 1; FLOW.to = null; }
    else { const d = v === 'prev' ? -1 : 1; if (f0 + d < 0 || f1 + d > last) return; FLOW.from = f0 + d; FLOW.to = f1 + d; }
    renderFlow(); return; }
  const f = e.target.closest('[data-fl]'); if (f) { const [k, v] = f.dataset.fl.split(':'); FLOW[k] = v; renderFlow(); return; }
  const g = e.target.closest('[data-go]'); if (!g) return; const [t, v] = g.dataset.go.split(':'); sel.clear();
  if (t === 'b') { ST.tab = 'cod'; ST.bk = +v; ST.next = false; } else if (t === 'n') { ST.tab = 'cod'; ST.next = true; } else { ST.tab = 'exp'; render(); vs().q = v; }
  render(); $('wrap').scrollTop = 0; });
