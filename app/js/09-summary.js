function renderSummary() {
  // one-screen management view
  const rep = R.rep,
    pv = rep - 1,
    T = R.thisM,
    P = pv > 0 ? R.tot[pv] : 0,
    fM = (v) => (v / 1e6).toFixed(1) + 'M',
    last6 = PER.slice(1, NP - 1)
      .map((x, k) => k + 1)
      .filter((k) => k <= rep)
      .slice(-6),
    avg6 = last6.reduce((x, k) => x + R.tot[k], 0) / (last6.length || 1);
  const netRev = R.rev4 - R.cd,
    gap = netRev - R.toDate,
    dm = P ? (T / P - 1) * 100 : 0,
    sh = (b) =>
      ({
        'Subcontractor deductions': 'Sub deductions',
        'Other direct cost': 'Other direct',
        'Fleet / transportation': 'Fleet / transport',
        'Asset depreciation': 'Depreciation',
      })[b.id] || b.id;
  const tdB = (bi) => R.bkP[bi].slice(0, NP - 1).reduce((x, v) => x + v, 0),
    order = BK.map((b, i) => i).sort((a, b) => Math.abs(tdB(b)) - Math.abs(tdB(a)));
  const codedPc = (bi) => {
    const its = BK[bi].items.filter((x) => x.inc !== 'No'),
      t = its.reduce((x, y) => x + Math.abs(y.td), 0),
      f = its.filter((x) => statusOf(x) === 'Coded').reduce((x, y) => x + Math.abs(y.td), 0);
    return t ? Math.round((100 * f) / t) : 0;
  };
  const allInc = BK.flatMap((b) => b.items.filter((x) => x.inc !== 'No')),
    tA = allInc.reduce((x, y) => x + Math.abs(y.td), 0),
    cAll = tA ? Math.round((100 * allInc.filter((x) => statusOf(x) === 'Coded').reduce((x, y) => x + Math.abs(y.td), 0)) / tA) : 0,
    notTm = allInc.filter((x) => statusOf(x) !== 'Coded').reduce((x, y) => x + y.tm, 0);
  const kpi = (l, v, sub, cls) => `<div class="sk ${cls || ''}"><span>${l}</span><b>${v}</b><i>${sub}</i></div>`;
  const kpis = [
    kpi('To date', fmt(R.toDate), `${fM(R.toDate - T)} before ${R.repLab}${R.pend > 0.5 ? ' · ' + fM(R.pend) + ' after the cut' : ''}`),
    kpi(
      R.repLab,
      fmt(T),
      P ? `<em class="${dm > 0 ? 'up' : 'dn'}">${dm > 0 ? '▲' : '▼'} ${Math.abs(dm).toFixed(0)}%</em> vs ${PER[pv]} (${fM(P)})` : '',
      'hl'
    ),
    kpi(
      'Average month · last ' + last6.length,
      fmt(avg6),
      `${R.repLab} ${T >= avg6 ? 'above' : 'below'} it by ${Math.abs(avg6 ? (T / avg6 - 1) * 100 : 0).toFixed(0)}%`
    ),
    kpi(
      'Revenue − cost to date',
      `<span class="${gap < 0 ? 'up' : 'dn'}">${fmt(gap)}</span>`,
      `net revenue ${fM(netRev)} · cost ${fM(R.toDate)}`
    ),
  ].join('');
  // this month by bucket
  const fb = ST.sumBk !== undefined && ST.sumBk !== null && BK[ST.sumBk] ? ST.sumBk : null,
    cOrd = fb === null ? order : [fb],
    mv = (k) => cOrd.reduce((x, bi) => x + Math.max(0, R.bkP[bi][k]), 0),
    avgC = fb === null ? avg6 : last6.reduce((x, k) => x + R.bkP[fb][k], 0) / (last6.length || 1);
  const brow = (bi) => {
    const c = rep > 0 ? R.bkP[bi][rep] : 0,
      p = pv > 0 ? R.bkP[bi][pv] : 0,
      x = c - p,
      pc = codedPc(bi);
    return `<tr${fb === bi ? ' class="son"' : ''}><td><a class="lk" style="color:#1f2937;font-weight:500" data-sbk="${bi}" title="Show ${esc(BK[bi].id)} alone in the chart"><i class="sdot" style="background:${bkColor(bi)}"></i>${esc(sh(BK[bi]))}</a></td><td class="mut">${fmt(p)}</td><td class="dk" data-dk="${bi}|${rep}"><b>${fmt(c)}</b></td><td class="${x > 0.5 ? 'up' : x < -0.5 ? 'dn' : 'mut'}">${Math.abs(x) < 0.5 ? '-' : (x > 0 ? '+' : '−') + fmt(Math.abs(x))}${p > 0 && c > 0 && Math.abs(x) >= 0.5 ? (p < 0.05 * c ? ' <small>(new)</small>' : ` <small>(${x > 0 ? '+' : ''}${((x / p) * 100).toFixed(0)}%)</small>`) : ''}</td><td class="dk" data-dk="${bi}|td">${fmt(tdB(bi))}</td><td class="mut">${R.toDate ? ((100 * tdB(bi)) / R.toDate).toFixed(1) : 0}%</td><td><div class="scb"><div><i style="width:${pc}%"></i></div>${pc}%</div></td></tr>`;
  };
  const btab = `<table class="st"><tr><th>Bucket</th><th>${pv > 0 ? PER[pv] : ''}</th><th>${R.repLab}</th><th>Change</th><th>To date</th><th>Share</th><th>Coded</th></tr>${order.map(brow).join('')}<tr class="t"><td>Total</td><td>${fmt(P)}</td><td>${fmt(T)}</td><td class="${T - P > 0 ? 'up' : 'dn'}">${(T - P > 0 ? '+' : '−') + fmt(Math.abs(T - P))}</td><td>${fmt(R.toDate)}</td><td>100%</td><td>${cAll}%</td></tr></table>`;
  // chart: every bucket in its colour, 6-month average line; a bucket picked (legend or table) shows that bucket alone
  const ks = PER.map((x, k) => k).filter((k) => k > 0 && k < NP - 1 && k <= (rep > 0 ? rep : NM)),
    W = 1200,
    H = 190,
    pad = 40,
    mxT = Math.max(1, avgC, ...ks.map(mv)) * 1.1,
    slot = (W - pad - 10) / ks.length,
    bw = Math.min(slot * 0.6, 56); // a slim bar, whatever the number of months
  let svg = `<svg viewBox="0 0 ${W} ${H + 24}" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">`;
  for (let g = 0; g <= 4; g++) {
    const y = H - ((H - 14) * g) / 4;
    svg += `<line x1="${pad}" x2="${W}" y1="${y}" y2="${y}" stroke="#EEF0F4"/><text x="${pad - 5}" y="${y + 4}" font-size="11" fill="#6b7280" text-anchor="end">${Math.round((mxT * g) / 4 / 1e6)}M</text>`;
  }
  ks.forEach((k, j) => {
    const x = pad + 4 + j * slot + (slot - bw) / 2;
    let y = H;
    // the cut month: an amber band behind its bar (the same amber as Expenses · Per month)
    if (k === rep)
      svg += `<rect x="${x - Math.min(slot * 0.18, 22)}" y="0" width="${bw + 2 * Math.min(slot * 0.18, 22)}" height="${H + 22}" rx="4" fill="#FFF4D6"/>`;
    svg += `<g class="smo" data-gom="${k}" style="cursor:pointer">`;
    cOrd.forEach((bi) => {
      const v = Math.max(0, R.bkP[bi][k]);
      if (!v) return;
      const hh = ((H - 14) * v) / mxT;
      y -= hh;
      svg += `<rect x="${x}" y="${y}" width="${bw}" height="${hh}" fill="${bkColor(bi)}" stroke="#fff" stroke-width="0.6"><title>${PER[k]} · ${esc(BK[bi].id)}: ${fmt(v)}</title></rect>`;
    });
    svg += `<text x="${x + bw / 2}" y="${H + 15}" font-size="12" text-anchor="middle" fill="${k === rep ? '#8A5A00' : '#4B5563'}" font-weight="${k === rep ? 800 : 500}">${PER[k].replace('-', ' ')}</text>`;
    svg += `<text x="${x + bw / 2}" y="${y - 6}" font-size="${k === rep ? 12.5 : 11}" text-anchor="middle" font-weight="${k === rep ? 800 : 500}" fill="${k === rep ? '#1B2A41' : '#6B7280'}">${fM(fb === null ? R.tot[k] : mv(k))}</text></g>`;
  });
  const yA = H - ((H - 14) * Math.max(0, avgC)) / mxT;
  svg += `<line x1="${pad}" x2="${W}" y1="${yA}" y2="${yA}" stroke="#1F3864" stroke-dasharray="4 3"/><text x="${pad + 6}" y="${yA - 6}" font-size="12" font-weight="700" fill="#1F3864" stroke="#fff" stroke-width="4" paint-order="stroke">${last6.length}-month average ${fM(avgC)}</text></svg>`;
  const leg =
    order
      .filter((bi) => R.bkP[bi].some((v) => v > 0))
      .map(
        (bi) =>
          `<button class="slb${fb === bi ? ' on' : fb !== null ? ' off' : ''}" data-sbk="${bi}" title="Show ${esc(BK[bi].id)} alone – click again for all"><i class="sdot" style="background:${bkColor(bi)}"></i>${esc(sh(BK[bi]))}</button>`
      )
      .join('') + (fb !== null ? `<button class="slb all" data-sbk="">✕ All buckets</button>` : '');
  // cost drivers (the short list – the full list is Reports › Cost drivers)
  // the top 5 cost drivers (the full list: Cost drivers tab)
  const top5 = sumDrivers()
      .flatMap((g) => g[2])
      .sort((a, b) => b.td - a.td)
      .slice(0, 5),
    dtab = `<table class="st drv5"><colgroup><col><col style="width:52px"><col style="width:84px"><col style="width:66px"><col style="width:84px"><col style="width:66px"></colgroup><tr><th>Driver</th><th style="text-align:center">Unit</th><th>${R.repLab}</th><th>vs avg</th><th style="text-align:center">Trend</th><th>To date</th></tr>${top5
      .map((x) => {
        const c = DV.calc(x);
        return `<tr title="${esc(String(x.txt || '').slice(0, 200))}"><td><i class="sdot" style="background:${bkColor(x.bi)}"></i>${x.name}</td><td style="text-align:center">${x.amt ? '<span class="mut" style="font-size:11px">/ month</span>' : `<span class="u" style="background:${unitCol(x.u)}">${esc(x.u)}</span>`}</td><td>${c.cur ? `<b>${x.amt ? DV.fM(c.Lm.r) : DV.fr(c.Lm.r)}</b>` : '<span class="mut">none</span>'}</td><td class="${c.va === null ? 'mut' : DV.cl(c.va)}">${c.va === null ? '-' : DV.ar(c.va) + DV.pf(c.va)}</td><td>${DV.spk(x.s)}</td><td><b>${DV.fM(x.td)}</b></td></tr>`;
      })
      .join('')}</table>`;
  // needs attention: one line on top, each point with its button
  // indirect cost (PKG Indirect) whose cost element is empty or in no indirect head: it lands in "Other indirect" in every indirect report
  const indHead = new Set(psCfg().indirect.flatMap((g) => g.c)),
    noCe = { a: 0, n: 0, by: new Map() };
  for (const e of R.exp.values()) {
    if (!isIndPkg(e.pkg) || indHead.has(e.ce)) continue;
    let a = 0;
    for (let k = 0; k <= rep && k < e.p.length; k++) a += e.p[k];
    if (Math.abs(a) < 0.5) continue;
    noCe.a += a;
    noCe.n++;
    noCe.by.set(e.b, (noCe.by.get(e.b) || 0) + a);
  }
  const noCeBk = [...noCe.by].sort((x, y) => Math.abs(y[1]) - Math.abs(x[1]))[0];
  const att = [
    ...(noCe.a > 0.5
      ? [
          [
            '◇',
            '#8E5EA2',
            `Indirect without a cost element: ${fM(noCe.a)}`,
            `${noCe.n} items coded PKG Indirect have no indirect cost element – they show as "Other indirect" · most in ${BK[noCeBk[0]].id}`,
            'cod:' + noCeBk[0],
            'Code',
          ],
        ]
      : []),
    ...(notTm > 0.5
      ? [['!', '#8A6D1F', `Not coded: ${fM(notTm)} of ${R.repLab}`, 'code the largest items first – Code › New this month', 'cod', 'Code']]
      : []),
    ...(HASUNS && R.unsExc > 0.5
      ? [
          [
            '€',
            '#1F6F8B',
            `Not in CJI3 yet: ${fM(R.unsExc)} left out`,
            `orders not settled ${fM(R.unsExcK.o)} · certificates ${fM(R.unsExcK.c)}`,
            'uns',
            'Adjust',
          ],
        ]
      : []),
  ];
  const attL = att.length
    ? `<div class="satt"><b>Needs attention</b>${att.map(([ic, c, t, s2, go, l]) => `<span class="sai" title="${esc(s2)}"><i style="background:${c}">${ic}</i>${t} <a class="lk" data-gotab="${go}">${l} ›</a></span>`).join('')}</div>`
    : '';
  const revH = `<table class="st rec"><tr><td>Revenue (4xxxxxxx)</td><td>${fmt(R.rev4)}</td></tr><tr><td>Client deductions</td><td>${fmt(-R.cd)}</td></tr>${[
    ...R.cdBy,
  ]
    .sort((x, y) => x[1] - y[1])
    .map(([g, a]) => `<tr class="cdg"><td>· ${esc(g)}</td><td>${fmt(-a)}</td></tr>`)
    .join('')}<tr class="t"><td>Net revenue</td><td>${fmt(netRev)}</td></tr></table>`;
  $('sum').innerHTML = `<div class="sg s2">${attL}<div class="sks">${kpis}</div>
   <div class="sc sch"><div class="sct"><b>Cost per month</b><small>${fb === null ? 'by bucket' : '<b style="color:' + bkColor(fb) + '">' + esc(BK[fb].id) + '</b> only'} · click a bucket to show it alone · click a month to open it in Expenses · Per month</small></div><div class="sleg">${leg}</div><div style="flex:1;min-height:0">${svg}</div></div>
   <div class="srow"><div class="sc"><div class="sct"><b>This month by bucket</b><small>${R.repLab} vs ${pv > 0 ? PER[pv] : '-'} · click a bucket to show it in the chart</small><span class="sp"></span><a class="lk" data-gotab="pm">Per month ›</a></div>${btab}</div>
    <div class="sc"><div class="sct"><b>Top 5 cost drivers</b><small>this month vs its 6-month average · ▲ red = dearer</small><span class="sp"></span><a class="lk" data-gotab="drv" style="font-weight:600">All drivers ›</a></div>${dtab}
     <div class="sct" style="margin-top:12px"><b>Revenue</b><small>kept apart, to the cut date</small></div>${revH}</div></div></div>`;
  $('sum')
    .querySelectorAll('[data-gotab]')
    .forEach((a) => {
      a.onclick = () => {
        const t = a.dataset.gotab;
        if (t.startsWith('cod:')) {
          ST.tab = 'cod';
          ST.bk = +t.slice(4);
          render();
          return;
        }
        if (t === 'sub') {
          ST.tab = 'sub';
          ST.sub = 'pkg';
          ST.pkView = 'alloc';
          ST.pkSel = '';
        } else if (t === 'mrate') {
          ST.tab = 'mrate';
          ST.bk = MATI;
        } else ST.tab = t;
        if (a.dataset.uv) ST.unsView = a.dataset.uv;
        render();
      };
    });
  $('sum')
    .querySelectorAll('[data-sbk]')
    .forEach((a) => {
      a.onclick = () => {
        const v = a.dataset.sbk === '' ? null : +a.dataset.sbk;
        ST.sumBk = ST.sumBk === v ? null : v;
        render();
      };
    });
  $('sum')
    .querySelectorAll('[data-gom]')
    .forEach((g) => {
      g.onclick = () => {
        ST.tab = 'xpm';
        ST.xpPage = 'month';
        render();
      };
    });
}
