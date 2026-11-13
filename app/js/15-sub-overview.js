// =====================================================================================  Subcontractor › Overview: KPIs, packages, trend, insights, top POs – each opens its working view
const subSeg = (cur) =>
  '' &&
  `<span class="seg">${[
    ['ov', 'Overview'],
    ['pkg', 'Packages'],
    ['rate', 'Rate study'],
    ['po', 'POs'],
    ['reg', 'PO Register'],
    ['bridge', 'Bridge to CJI3'],
  ]
    .map(([k, l]) => `<button data-sv="${k}" class="${cur === k ? 'on' : ''}">${l}</button>`)
    .join('')}</span>`;
function renderSov() {
  const D0 = pkData(),
    sp = R.bkP[SUBI],
    rep = R.rep,
    prevP = rep > 1 ? rep - 1 : -1,
    tm = rep > 0 ? sp[rep] : 0,
    pm = prevP > 0 ? sp[prevP] : 0,
    td = sp.slice(0, NP - 1).reduce((s, v) => s + v, 0);
  const fM = (v) => (Math.abs(v) >= 1e6 ? (v / 1e6).toFixed(Math.abs(v) >= 1e7 ? 1 : 2) + 'M' : fmt(v)),
    pct = (a, b) => (b ? ((a / b - 1) * 100).toFixed(1) : '0');
  const allA = D0.pos.reduce((s, p) => s + p.amt, 0),
    alloc = D0.pos.filter((p) => p.code !== ''),
    allocA = alloc.reduce((s, p) => s + p.amt, 0),
    na = D0.pos.filter((p) => p.code === '');
  const sups = new Set(D0.pos.map((p) => p.sup)).size,
    notIn = R.unsInK ? R.unsInK.c + R.unsExcK.c : 0,
    vat = SUB ? (SUB.vatOnPosted || 0) + (SUB.vatOnOpening || 0) : 0;
  // per PO: last certificate date and this month
  const lastC = new Map();
  for (let i = 0; i < N; i++)
    if (L.b[i] === SUBI && L.cd[i] && !UNS[i]) {
      const po = S[L.po[i]];
      if (L.cd[i] > (lastC.get(po) || 0)) lastC.set(po, L.cd[i]);
    }
  // rate spread between POs for the same work item (certificate lines with a quantity)
  const W = new Map();
  for (let i = 0; i < N; i++) {
    if (L.b[i] !== SUBI || !L.qty[i] || !R.inc[i] || R.per[i] === NP - 1 || !(SRC[i] === 'Certificate' || SRC[i] === 'Opening certificate'))
      continue;
    const po = S[L.po[i]];
    let w = W.get(L.it[i]);
    if (!w) W.set(L.it[i], (w = new Map()));
    const x = w.get(po) || w.set(po, { q: 0, a: 0 }).get(po);
    x.q += L.qty[i];
    x.a += R.amt[i];
  }
  const spr = [...W]
    .map(([ii, w]) => {
      const r = [...w.values()].filter((x) => x.q > 0 && x.a > 0).map((x) => x.a / x.q);
      if (r.length < 3) return null;
      return { ii, n: r.length, s: Math.max(...r) / Math.min(...r) - 1, a: [...w.values()].reduce((s, x) => s + x.a, 0) };
    })
    .filter((x) => x && x.s > 0.15 && x.s < 5)
    .sort((a, b) => b.a - a.a);
  // movement by type of works this month vs last
  const tw = new Map();
  if (rep > 0)
    for (let i = 0; i < N; i++) {
      if (L.b[i] !== SUBI || !R.inc[i]) continue;
      const p = R.per[i];
      if (p !== rep && p !== prevP) continue;
      const t = (BK[SUBI].items[L.it[i]].vals[0] || '').replace(/^مقاولين-\s?/, '');
      if (t[0] === '~') continue;
      const x = tw.get(t) || tw.set(t, { a: 0, b: 0 }).get(t);
      if (p === rep) x.a += R.amt[i];
      else x.b += R.amt[i];
    }
  const mv = [...tw].map(([t, x]) => [t, x.a - x.b]).sort((a, b) => b[1] - a[1]);
  const cutI = R.cutI,
    d90 = (() => {
      const d = new Date(String(cutI).replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3'));
      d.setDate(d.getDate() - 90);
      return +d.toISOString().slice(0, 10).replace(/-/g, '');
    })();
  const idle = D0.pos.filter((p) => p.amt > 500000 && (lastC.get(p.po) || 0) < d90);
  const ins = [];
  if (spr.length) {
    const it = BK[SUBI].items[spr[0].ii];
    ins.push([
      '!',
      'risk',
      `${spr.length} work items: same work, rates differ more than 15% between POs`,
      `largest: <bdi>${esc(it.vals[1] + ' · ' + it.vals[2])}</bdi> · ${spr[0].n} POs · spread ${(spr[0].s * 100).toFixed(0)}%`,
      'rate',
    ]);
  }
  if (rep > 0 && pm)
    ins.push([
      tm >= pm ? '↑' : '↓',
      'watch',
      `${R.repLab} ${fM(tm)} – ${tm >= pm ? '+' : ''}${pct(tm, pm)}% vs ${PER[prevP]}`,
      mv.length
        ? `biggest rise: <bdi>${esc(mv[0][0])}</bdi> +${fM(mv[0][1])}${mv[1] && mv[1][1] > 0 ? ` · <bdi>${esc(mv[1][0])}</bdi> +${fM(mv[1][1])}` : ''} · biggest fall: <bdi>${esc(mv[mv.length - 1][0])}</bdi> ${fM(mv[mv.length - 1][1])}`
        : '',
      'po',
    ]);
  ins.push([
    '○',
    'neutral',
    na.length ? `${na.length} POs not in a package yet` : 'Every PO is in a package',
    na.length ? `${fM(na.reduce((s, p) => s + p.amt, 0))} of ${fM(allA)} counted` : '',
    'pkg',
  ]);
  if (idle.length)
    ins.push([
      '⏸',
      'neutral',
      `${idle.length} POs above 0.5M with no certificate in the last 90 days`,
      'finished, or work stopped? – largest: ' +
        idle
          .slice(0, 3)
          .map((p) => `<bdi>${esc(p.sup.split(' ').slice(0, 3).join(' '))}</bdi>`)
          .join(' · '),
      'po',
    ]);
  if (notIn)
    ins.push([
      '€',
      'info',
      `${fM(notIn)} certificates not in CJI3 yet`,
      `included by you ${fM(R.unsInK.c)} · left out ${fM(R.unsExcK.c)}`,
      'uns',
    ]);
  // chart: certified per month
  const ks = PER.map((p, k) => k).filter((k) => k < NP - 1 && (rep < 1 || k <= rep)),
    mx = Math.max(1, ...ks.map((k) => sp[k])),
    bw = 640 / ks.length;
  const chart = `<svg viewBox="0 0 640 200" preserveAspectRatio="none" width="100%" height="100%">${ks
    .map((k, j) => {
      const h = (168 * Math.max(0, sp[k])) / mx,
        x = j * bw + bw * 0.18;
      return `<rect x="${x}" y="${178 - h}" width="${bw * 0.64}" height="${h}" rx="3" fill="${k === rep ? 'var(--a5)' : 'var(--a2)'}" opacity="${k === 0 ? 0.45 : 1}"><title>${PER[k]} · ${fmt(sp[k])}</title></rect><text x="${x + bw * 0.32}" y="194" font-size="10" text-anchor="middle" fill="#6B7280">${k === 0 ? 'Open' : PER[k].replace('-', '/')}</text>`;
    })
    .join('')}</svg>`;
  const list = D0.list,
    mxp = Math.max(1, ...list.map((x) => D0.pos.filter((p) => p.codes.includes(x.c)).reduce((s, p) => s + p.amt, 0)));
  const pkRows = list
    .map((x, i) => {
      const ps = D0.pos.filter((p) => p.codes.includes(x.c)),
        a = ps.reduce((s, p) => s + p.amt, 0),
        c = PKC[i % PKC.length];
      return `<div class="ovpk" data-ovpk="${esc(x.c)}"><span class="d" style="background:${c}"></span><span><b>${esc(x.c)}</b> ${esc(x.n || '')}</span><span class="m">${ps.length} POs</span><b class="v">${fM(a)}</b><div class="bb"><i style="width:${((100 * a) / mxp).toFixed(0)}%;background:${c}"></i></div></div>`;
    })
    .join('');
  const top = D0.pos
    .slice()
    .sort((a, b) => b.sep - a.sep)
    .filter((p) => p.sep)
    .slice(0, 14);
  $('sov').innerHTML = `<div class="ovg">
   <div class="ovc kpi"><span>To date</span><b>${fM(td)}</b><i>net of VAT · ${Math.abs(R.diff) < 0.01 ? 'ties to CJI3 ✓' : 'check the difference'}</i></div>
   <div class="ovc kpi"><span>This month · ${R.repLab}</span><b>${fM(tm)}</b><i class="${tm >= pm ? 'up' : 'dn'}">${pm ? (tm >= pm ? '▲ ' : '▼ ') + Math.abs(pct(tm, pm)) + '% vs ' + PER[prevP] : ''}</i></div>
   <div class="ovc kpi"><span>POs · subcontractors</span><b>${D0.pos.length}</b><i>${sups} subcontractors</i></div>
   <div class="ovc kpi ovl" data-sv="pkg"><span>Allocated to packages</span><b>${allA ? Math.round((100 * allocA) / allA) : 0}%</b><i>${alloc.length} of ${D0.pos.length} POs</i></div>
   <div class="ovc kpi ovl" data-ovgo="uns"><span>Not in CJI3 yet</span><b>${fM(notIn)}</b><i>certificates · ${R.unsInK && R.unsInK.c ? 'partly included' : 'left out'}</i></div>
   <div class="ovc kpi"><span>VAT on certificates</span><b>${fM(vat)}</b><i>${esc(ST.vat)} (header switch)</i></div>
   <div class="ovc" style="grid-column:span 4;grid-row:span 2"><div class="ct"><b>Packages</b><small>counted · POs</small><span class="sp"></span><a class="lk" data-sv="pkg">Allocate ›</a></div>
     <div class="ovl2">${pkRows || '<div class="help" style="padding:10px 0">No packages yet – open Packages and add your codes.</div>'}<div class="ovpk" data-ovpk=""><span class="d" style="background:#D1D5DB"></span><span style="color:var(--risk)">Not allocated</span><span class="m">${na.length} POs</span><b class="v">${fM(na.reduce((s, p) => s + p.amt, 0))}</b></div></div>
     <div class="help" style="margin-top:auto">Click a package → its POs open in Packages</div></div>
   <div class="ovc" style="grid-column:span 5"><div class="ct"><b>Certified per month</b><small>counted · gold = ${R.repLab}</small></div><div style="flex:1;min-height:0">${chart}</div></div>
   <div class="ovc" style="grid-column:span 3;grid-row:span 2"><div class="ct"><b>Top POs · ${R.repLab}</b></div><div style="overflow:auto;flex:1"><table class="ovt">${top.map((p) => `<tr data-ovpo="${esc(p.po)}"><td><b>${esc(p.po)}</b><span dir="auto">${esc(p.sup)}</span></td><td class="num">${fmt(p.sep)}</td></tr>`).join('') || '<tr><td class="help">Nothing this month.</td></tr>'}</table></div></div>
   <div class="ovc" style="grid-column:span 5"><div class="ct"><b>Insights</b><small>what needs your attention</small></div><div style="overflow:auto">${ins.map(([ic, k, t, s1, go]) => `<div class="ins"><span class="ic ${k}">${ic}</span><span>${t}<small>${s1}</small></span><a class="lk" ${go === 'uns' ? 'data-ovgo="uns"' : `data-sv="${go}"`}>${{ rate: 'Rate study', po: 'POs', pkg: 'Allocate', uns: 'Unsettled' }[go]} ›</a></div>`).join('')}</div></div></div>`;
}
document.addEventListener('click', (e) => {
  const pg = $('sov');
  if (!pg || !pg.contains(e.target)) return;
  const t = e.target;
  const sv = t.closest('[data-sv]');
  if (sv) {
    goSub(sv.dataset.sv);
    return;
  }
  const g = t.closest('[data-ovgo]');
  if (g) {
    ST.tab = 'uns';
    ST.unsView = 'c';
    render();
    return;
  }
  const pk = t.closest('[data-ovpk]');
  if (pk) {
    ST.pkSel = pk.dataset.ovpk;
    ST.pkView = 'alloc';
    goSub('pkg');
    return;
  }
  const po = t.closest('[data-ovpo]');
  if (po) {
    ST.sub = 'po';
    const S0 = vs();
    S0.q = po.dataset.ovpo;
    S0.fold.clear();
    render();
  }
});
function goSub(k) {
  if (k === 'rate') {
    ST.sub = 'pkg';
    ST.pkView = 'rate';
  } else {
    if (k === 'pkg' && ST.pkView === 'rate' && ST.sub !== 'pkg') ST.pkView = 'alloc';
    ST.sub = k;
  }
  sel.clear();
  render();
}
