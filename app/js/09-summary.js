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
  const kpi = (l, v, sub, cls) => `<div class="sk ${cls || ''}"><span>${l}</span><b>${v}</b><i>${sub}</i></div>`,
    ok = Math.abs(R.diff) < 0.01;
  const kpis = [
    kpi('To date', fmt(R.toDate), `previous ${fM(R.toDate - T)} · pending ${fmt(R.pend)}`),
    kpi(
      'This month · ' + R.repLab,
      fmt(T),
      P ? `<em class="${dm > 0 ? 'up' : 'dn'}">${dm > 0 ? '▲' : '▼'} ${Math.abs(dm).toFixed(1)}%</em> vs ${PER[pv]} (${fM(P)})` : '',
      'hl'
    ),
    kpi(
      'Average month · last ' + last6.length,
      fmt(avg6),
      `this month ${T >= avg6 ? 'above' : 'below'} average by ${Math.abs(avg6 ? (T / avg6 - 1) * 100 : 0).toFixed(0)}%`
    ),
    kpi('Net revenue to date', fmt(netRev), `revenue ${fM(R.rev4)} − deductions ${fM(R.cd)}`),
    kpi(
      'Revenue − cost to date',
      `<span class="${gap < 0 ? 'up' : 'dn'}">${fmt(gap)}</span>`,
      netRev
        ? `<em class="${gap < 0 ? 'up' : 'dn'}">cost ${gap < 0 ? 'above' : 'below'} net revenue by ${Math.abs((gap / netRev) * 100).toFixed(1)}%</em>`
        : ''
    ),
    kpi(
      'Difference to CJI3',
      ok ? '<span class="dn">0.00 ✓</span>' : `<span class="up">${fmt2(R.diff)}</span>`,
      `coded ${cAll}%${notTm ? ' · ' + fM(notTm) + ' of ' + R.repLab + ' still to code' : ''}`
    ),
  ].join('');
  // this month by bucket
  const mx = Math.max(1, ...order.map((bi) => Math.abs(R.bkP[bi][rep] - (pv > 0 ? R.bkP[bi][pv] : 0))));
  const brow = (bi) => {
    const c = rep > 0 ? R.bkP[bi][rep] : 0,
      p = pv > 0 ? R.bkP[bi][pv] : 0,
      x = c - p,
      w = ((Math.abs(x) / mx) * 50).toFixed(1),
      pc = codedPc(bi);
    return `<tr><td><a class="lk" style="color:#1f2937;font-weight:500" data-gob="${bi}"><i class="sdot" style="background:${bkColor(bi)}"></i>${esc(sh(BK[bi]))}</a></td><td class="mut">${fmt(p)}</td><td class="dk" data-dk="${bi}|${rep}"><b>${fmt(c)}</b></td><td class="${x > 0.5 ? 'up' : x < -0.5 ? 'dn' : 'mut'}">${Math.abs(x) < 0.5 ? '-' : (x > 0 ? '+' : '−') + fmt(Math.abs(x))}${p > 0 && c > 0 && Math.abs(x) >= 0.5 ? (p < 0.05 * c ? ' <small>(new)</small>' : ` <small>(${x > 0 ? '+' : ''}${((x / p) * 100).toFixed(0)}%)</small>`) : ''}</td><td><div class="sdv"><span></span><i style="${x >= 0 ? `left:50%;width:${w}%;background:#C98B8B` : `right:50%;width:${w}%;background:#8DB596`}"></i></div></td><td class="dk" data-dk="${bi}|td">${fmt(tdB(bi))}</td><td class="mut">${R.toDate ? ((100 * tdB(bi)) / R.toDate).toFixed(1) : 0}%</td><td><div class="scb"><div><i style="width:${pc}%"></i></div>${pc}%</div></td></tr>`;
  };
  const btab = `<table class="st"><tr><th>Bucket</th><th>${pv > 0 ? PER[pv] : ''}</th><th>${R.repLab}</th><th>Change</th><th style="text-align:center">− change +</th><th>To date</th><th>Share</th><th>Coded</th></tr>${order.map(brow).join('')}<tr class="t"><td>Total</td><td>${fmt(P)}</td><td>${fmt(T)}</td><td class="${T - P > 0 ? 'up' : 'dn'}">${(T - P > 0 ? '+' : '−') + fmt(Math.abs(T - P))}</td><td></td><td>${fmt(R.toDate)}</td><td>100%</td><td>${cAll}%</td></tr></table>`;
  // chart: every bucket in its colour, 6-month average line
  const ks = PER.map((x, k) => k).filter((k) => k > 0 && k < NP - 1 && k <= (rep > 0 ? rep : NM)),
    W = 600,
    H = 196,
    pad = 40,
    mxT = Math.max(1, ...ks.map((k) => R.bkP.reduce((x, a) => x + Math.max(0, a[k]), 0))) * 1.08,
    bw = ((W - pad - 10) / ks.length) * 0.66;
  let svg = `<svg viewBox="0 0 ${W} ${H + 24}" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">`;
  for (let g = 0; g <= 4; g++) {
    const y = H - ((H - 14) * g) / 4;
    svg += `<line x1="${pad}" x2="${W}" y1="${y}" y2="${y}" stroke="#EEF0F4"/><text x="${pad - 5}" y="${y + 4}" font-size="11" fill="#6b7280" text-anchor="end">${Math.round((mxT * g) / 4 / 1e6)}M</text>`;
  }
  ks.forEach((k, j) => {
    const x = pad + 8 + (j * (W - pad - 10)) / ks.length;
    let y = H;
    order.forEach((bi) => {
      const v = Math.max(0, R.bkP[bi][k]);
      if (!v) return;
      const hh = ((H - 14) * v) / mxT;
      y -= hh;
      svg += `<rect x="${x}" y="${y}" width="${bw}" height="${hh}" fill="${bkColor(bi)}" stroke="#fff" stroke-width="0.6"><title>${PER[k]} · ${esc(BK[bi].id)}: ${fmt(v)}</title></rect>`;
    });
    svg += `<text x="${x + bw / 2}" y="${H + 15}" font-size="11" text-anchor="middle" fill="${k === rep ? '#8A6D1F' : '#6b7280'}" font-weight="${k === rep ? 700 : 400}">${PER[k].replace('-', ' ')}</text>`;
    if (k === rep)
      svg += `<text x="${x + bw / 2}" y="${y - 6}" font-size="11.5" text-anchor="middle" font-weight="700" fill="#1B2A41">${fM(R.tot[k])}</text>`;
  });
  const yA = H - ((H - 14) * avg6) / mxT;
  svg += `<line x1="${pad}" x2="${W}" y1="${yA}" y2="${yA}" stroke="#1F3864" stroke-dasharray="4 3"/></svg>`;
  const leg =
    order
      .filter((bi) => R.bkP[bi].some((v) => v > 0))
      .map((bi) => `<small><i class="sdot" style="background:${bkColor(bi)}"></i>${esc(sh(BK[bi]))}</small>`)
      .join('') + `<small style="color:#1F3864">- - - ${last6.length}-month average ${fM(avg6)}</small>`;
  // cost drivers (the short list – the full list is Reports › Cost drivers)
  const drv = sumDrivers(),
    all = drv.flatMap((g) => g[2]),
    sT = (a) => a.reduce((x, y) => x + y.td, 0);
  const dtab = `<table class="st drv">${DV.head()}${drv.map(([bi, l, a]) => DV.gh(bi, l, a) + a.map((x) => DV.row(x)).join('')).join('')}${DV.tot(all, 'Total of these ' + all.length + ' drivers')}</table>`;
  // reconciliation + needs attention
  const rec = [
    ['CJI3 cost', META.cost],
    ['– To date (counted up to the cut date)', R.toDate],
    ['– Pending (after the cut date)', R.pend],
    ['– Excluded by you', R.excl],
    ...(DEPI >= 0 ? [['– Depreciation excluded', R.depExc]] : []),
    ['– Client deductions (with revenue)', R.cdAll],
    ['+ VAT included', R.vatIn],
    ...(HASUNS ? [['+ Included, not in CJI3 yet', R.unsIn]] : []),
  ].filter((x, i) => i < 2 || Math.abs(x[1]) >= 0.005);
  let nPO = 0,
    nSug = 0;
  if (SUBI >= 0) {
    try {
      const D0 = pkData();
      nPO = D0.pos.filter((p) => p.code === '').length;
      nSug = D0.pos.filter((p) => p.code === '' && p.sug).length;
    } catch (e) {
      /* none */
    }
  }
  const att = [
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
    ...(nPO
      ? [
          [
            '○',
            '#5F6B7A',
            `${nPO} POs not in a package`,
            nSug ? nSug + ' suggestions ready' : 'Subcontractor › Packages',
            'sub',
            'Packages',
          ],
        ]
      : []),
  ];
  const recH = `<table class="st rec">${rec.map(([l, v]) => `<tr><td>${l}</td><td>${fmt2(v)}</td></tr>`).join('')}<tr class="t ${ok ? 'okr' : 'bad'}"><td>Difference (must be 0)</td><td>${ok ? '0.00 ✓' : fmt2(R.diff)}</td></tr></table>`;
  const attH =
    att
      .map(
        ([ic, c, t, s, go, l]) =>
          `<div class="sins"><span style="background:${c}">${ic}</span><div>${t}<small>${s}</small></div><a class="lk" data-gotab="${go}">${l} ›</a></div>`
      )
      .join('') || '<div class="help">Nothing – the month is ready.</div>';
  $('sum').innerHTML = `<div class="sg"><div class="sks">${kpis}</div>
   <div class="srow r1"><div class="sc"><div class="sct"><b>This month by bucket</b><small>${R.repLab} vs ${pv > 0 ? PER[pv] : '-'} · sorted by to date · click a bucket to code it · double-click a number for its items</small><span class="sp"></span><a class="lk" data-gotab="pm">Full month × bucket table › Per Month</a></div>${btab}</div>
    <div class="sc"><div class="sct"><b>Cost per month</b><small>up to the cut date</small></div><div class="sleg">${leg}</div><div style="flex:1;min-height:0">${svg}</div></div></div>
   <div class="srow r2"><div class="sc"><div class="sct"><b>Cost drivers</b><small>${all.length} drivers · <b style="color:#1B2A41">${R.toDate ? ((100 * sT(all)) / R.toDate).toFixed(0) : 0}% of the cost to date</b> · this month vs its 6-month average · ▲ red = dearer</small><span class="sp"></span><a class="lk" data-gotab="drv" style="font-weight:600">Full list – all buckets ›</a></div>${dtab}</div>
    <div class="sc"><div class="sct"><b>Reconciliation to CJI3</b><small>CJI3 is the single source of truth</small></div>${recH}<div class="sct" style="margin-top:10px"><b>Needs attention</b></div>${attH}
     <div class="sct" style="margin-top:10px"><b>Revenue</b><small>kept apart, to the cut date</small></div><table class="st rec"><tr><td>Revenue (4xxxxxxx)</td><td>${fmt(R.rev4)}</td></tr><tr><td>Client deductions</td><td>${fmt(-R.cd)}</td></tr><tr class="t"><td>Net revenue</td><td>${fmt(netRev)}</td></tr></table></div></div></div>`;
  $('sum')
    .querySelectorAll('[data-gotab]')
    .forEach((a) => {
      a.onclick = () => {
        const t = a.dataset.gotab;
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
    .querySelectorAll('[data-gob]')
    .forEach((a) => {
      a.onclick = () => {
        ST.tab = 'cod';
        ST.bk = +a.dataset.gob;
        render();
      };
    });
}
