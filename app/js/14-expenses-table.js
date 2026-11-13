// =====================================================================================  Expenses: three report pages (the side list picks the page)
// 1 Summary – cumulative, compact: bucket › item (or PKG › bucket › item)   2 Expenses per month   3 Indirect per month
// every row is an item + the codes of its CJI3 lines, so a hand-coded line makes its own row (as in the Expenses sheet)
const XPAGES = [
  ['sum', 'Summary', 'cumulative · bucket › item or PKG › bucket › item'],
  ['month', 'Expenses per month', 'every item · qty · rate · amount · quarters, years'],
  ['ind', 'Indirect per month', 'indirect heads › cost elements, month by month'],
  ['lines', 'SAP CJI3 transactions', 'every CJI3 line, flat, with its bucket and codes'],
];
// an Expenses row opens its CJI3 lines here: the item's lines that carry the row's codes (the same amount as the row)
const xpGoLines = (it, e) => {
  ST.tab = 'xpm';
  ST.xpPage = 'lines';
  ST.xpLF = {
    b: it.bi,
    ii: it.ii,
    codes: e ? { pkg: e.pkg, mnl: e.mnl, ce: e.ce } : null,
    po: e && e.po !== undefined ? e.po : null,
    label:
      itemCode(it) +
      ' · ' +
      itemDesc(it) +
      (e ? ' · ' + [e.pkg, e.mnl, e.ce].filter(Boolean).join(' / ') : '') +
      (e && e.po !== undefined ? ' · PO ' + e.po : ''),
  };
  const S0 = vs();
  S0.f = {};
  S0.q = '';
  S0.st = 'All';
  sel.clear();
  $('drawer').classList.remove('open');
  render();
  $('wrap').scrollTop = 0;
};
document.addEventListener('click', (e) => {
  const x = e.target.closest('[data-xlf]');
  if (x) {
    ST.xpLF = null;
    render();
  }
});
const xpPage = () => ST.xpPage || 'sum';
// the source of an Expenses row: CJI3 (pure CJI3 amount) or an adjustment (its own row, in its month) – filter All / CJI3 only / Adjustments only
const SRCS = ['CJI3', 'VAT in', 'Owner material', 'Order not yet settled', 'Certificate not in CJI3'],
  srcRank = (s) => SRCS.indexOf(s) + 1 || 9;
const SRCC = { CJI3: 'cj', 'VAT in': 'vt', 'Owner material': 'ow', 'Order not yet settled': 'un', 'Certificate not in CJI3': 'un' };
const srcTag = (s) => `<span class="srct ${SRCC[s] || 'un'}">${esc(s)}</span>`;
const xpSrcOk = (e) => !ST.xsrc || (ST.xsrc === 'cji3' ? e.src === 'CJI3' : e.src !== 'CJI3');
const srcCol = { k: 'src', l: 'Source', w: 150, v: (r) => r.e.src, h: (r) => `<td>${srcTag(r.e.src)}</td>` };
const xpSrcSeg = () =>
  `<span class="help">Source</span><span class="seg">${[
    ['', 'All'],
    ['cji3', 'CJI3 only'],
    ['adj', 'Adjustments only'],
  ]
    .map(([k, l]) => `<button data-xsrc="${k}" class="${(ST.xsrc || '') === k ? 'on' : ''}">${l}</button>`)
    .join('')}</span>`;
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-xsrc]');
  if (b) {
    ST.xsrc = b.dataset.xsrc;
    render();
  }
});
// Summary period: From / To months (Opening counts in the first month), ◀ ▶, quick choices
const xsPer = () => {
  const rep = Math.max(1, R.rep),
    last = NP - 2;
  let t = ST.xsT ?? rep,
    f = ST.xsF ?? 0;
  t = Math.min(Math.max(t, 1), last);
  f = Math.min(Math.max(f, 0), t);
  return { f, t };
};
const xsSeg = () => {
  const { f, t } = xsPer(),
    rep = Math.max(1, R.rep),
    opt = (sel, from) =>
      PER.slice(0, NP - 1)
        .map((x, k) => (from || k >= 1 ? `<option value="${k}"${k === sel ? ' selected' : ''}>${k === 0 ? 'Opening' : x}</option>` : ''))
        .join('');
  const y = PER[t].slice(-2),
    y0 = PER.findIndex((x, k) => k >= 1 && x.endsWith('-' + y)),
    q = [
      ['td', 'To date', 0, rep],
      ['yr', 'This year', y0, t],
      ['cm', 'Cut month', rep, rep],
      ['l3', 'Last 3 months', Math.max(1, rep - 2), rep],
    ];
  return `<span class="help">Period</span><select id="xsF" title="From">${opt(f, 1)}</select><select id="xsT" title="To">${opt(t, 0)}</select><button data-xsm2="-1" title="One month back">◀</button><button data-xsm2="1" title="One month on">▶</button>
    <span class="seg">${q.map(([k, l, a, b]) => `<button data-xsq="${a}:${b}" class="${f === a && t === b ? 'on' : ''}">${l}</button>`).join('')}</span>`;
};
document.addEventListener('change', (e) => {
  if (e.target.id === 'xsF') {
    ST.xsF = +e.target.value;
    if ((ST.xsT ?? R.rep) < ST.xsF) ST.xsT = Math.max(1, ST.xsF);
    render();
  }
  if (e.target.id === 'xsT') {
    ST.xsT = +e.target.value;
    if ((ST.xsF ?? 0) > ST.xsT) ST.xsF = ST.xsT;
    render();
  }
});
document.addEventListener('click', (e) => {
  const m = e.target.closest('[data-xsm2]');
  if (m) {
    const { f, t } = xsPer(),
      d = +m.dataset.xsm2,
      nt = Math.min(NP - 2, Math.max(1, t + d));
    ST.xsT = nt;
    ST.xsF = f === 0 ? 0 : Math.min(nt, Math.max(1, f + (nt - t)));
    render();
    return;
  }
  const q = e.target.closest('[data-xsq]');
  if (q) {
    const [a, b] = q.dataset.xsq.split(':').map(Number);
    ST.xsF = a;
    ST.xsT = b;
    render();
  }
});
// kept for the table code: an Expenses row is never a CJI3 line selection
const xpLinesOf = () => [];
const xpExport = () =>
  ' <button id="bXpX" class="hp" title="This page as it is on screen (filters and folds apply), as an Excel file">⇩ Export</button>';
const xpPv = () =>
  `<span class="seg">${['Months', 'Quarters', 'Years'].map((v) => `<button data-pv="${v}" class="${(v === 'Months' && !PF.size) || (v === 'Years' && [...PF].some((x) => x[0] === 'Y')) || (v === 'Quarters' && PF.size && ![...PF].some((x) => x[0] === 'Y')) ? 'on' : ''}">${v}</button>`).join('')}</span>`;
const xpTitle = () => `<b class="xpt">${esc((XPAGES.find((x) => x[0] === xpPage()) || XPAGES[0])[1])}</b>`;
const xpLive = () => [...R.exps.values()].filter((e) => e.p.some((v) => Math.abs(v) >= 0.005));
// a border on the left of every month block (and of To date)
function xpBlocks(cols, subs) {
  cols.forEach((c) => {
    if (c.slot === undefined || c.sub !== subs[0]) return;
    c.th = (c.th || '') + ' mb';
    const h0 = c.h;
    c.h = (r) => h0(r).replace(/^<td( class=")?/, (m0, a) => (a ? '<td class="mb ' : '<td class="mb"'));
  });
}
const codeCells = (f) => ({
  k: f,
  l: FN[f],
  w: f === 'ce' ? 112 : f === 'mnl' ? 66 : 92,
  v: (r) => r.e[f] || '(blank)',
  h: (r) =>
    r.e[f]
      ? `<td${r.e.hand ? ' class="xph" title="Coded on its CJI3 lines (not the item code)"' : ''}><b>${esc(r.e[f])}</b>${r.e.hand && f === 'pkg' ? ' <span class="help">✎</span>' : ''}</td>`
      : '<td class="help">–</td>',
});
const gtyOf = (it) =>
  it.bi === MATI
    ? it.vals[2] + ((META.grpNames || {})[it.vals[2]] ? ' · ' + META.grpNames[it.vals[2]] : '')
    : isSub(it.bi)
      ? it.vals[0] || ''
      : '';
const gtyCol = {
  k: 'gty',
  l: 'Material group / Type of works',
  w: 210,
  v: (r) => gtyOf(r.it),
  h: (r) => `<td dir="auto" title="${esc(gtyOf(r.it))}">${esc(gtyOf(r.it))}</td>`,
};
const xpGrp = (e) => (ST.xsm === 'pkg' ? (e.pkg || '(no PKG)') + ' › ' + BK[e.b].id : BK[e.b].id);
const xpBkOf = (g) => BK.findIndex((b) => b.id === (ST.xsm === 'pkg' ? g.split(' › ').slice(1).join(' › ') : g));
const xpGLabel = (g, rs) =>
  `<span class="bkc"><i style="background:${bkColor(xpBkOf(g))}"></i>${esc(g)}</span><span class="gm">${rs.length.toLocaleString('en-US')} rows</span>`;
const xpGrpSeg = () =>
  `<span class="seg">${[
    ['', 'Bucket › Item'],
    ['pkg', 'PKG › Bucket › Item'],
  ]
    .map(([k, l]) => `<button data-xsm="${k}" class="${(ST.xsm || '') === k ? 'on' : ''}">${l}</button>`)
    .join('')}</span>`;
const xpFoldInit = (rows) => {
  const S0 = vs();
  if (!S0.init) {
    S0.init = 1;
    new Set(rows.map((x) => x.g)).forEach((g) => S0.fold.add(g));
  }
}; // compact: groups folded at first
const sumIdx = (e, idx, q) => {
  let a = 0;
  for (const k of idx) a += q ? e.q[k] : e.p[k];
  return a;
};
function xpReport() {
  const pg = xpPage(),
    rep = Math.max(1, R.rep),
    A3 = [rep - 2, rep - 1, rep].filter((k) => k >= 1),
    SP = xsPer(),
    rng = (a, b) => {
      const o = [];
      for (let k = a; k <= b; k++) o.push(k);
      return o;
    };
  // the Summary follows its period (From – To): Previous = the months before the last one, This month = the last one; the other pages: to the cut date
  const PC = pg === 'sum' ? rng(SP.f, SP.t - 1) : PER.slice(0, rep).map((x, k) => k),
    TM = pg === 'sum' ? [SP.t] : [rep],
    CU = pg === 'sum' ? rng(SP.f, SP.t) : PER.slice(0, NP - 1).map((x, k) => k);
  const perL = (a, b) => (a > b ? '' : (a === 0 ? 'Opening' : PER[a]) + (b > a ? ' – ' + PER[b] : ''));
  const S0 = vs();
  if (pg === 'sum') {
    // 1. Summary
    const byPkg = ST.xsm === 'pkg',
      tot = R.toDate || 1; // eslint-disable-line no-unused-vars
    const rows = xpLive()
      .filter(xpSrcOk)
      .filter((e) => CU.some((k) => Math.abs(e.p[k]) >= 0.005))
      .map((e) => ({ it: BK[e.b].items[e.ii], e, g: xpGrp(e), a: sumIdx(e, CU) }))
      .sort(
        (x, y) =>
          (byPkg ? x.g.localeCompare(y.g) : x.e.b - y.e.b) ||
          x.e.ii - y.e.ii ||
          String(x.e.pkg + x.e.mnl + x.e.ce).localeCompare(String(y.e.pkg + y.e.mnl + y.e.ce)) ||
          srcRank(x.e.src) - srcRank(y.e.src)
      );
    {
      const big = new Map();
      rows.forEach((r) => big.set(r.e.b + ':' + r.e.ii, (big.get(r.e.b + ':' + r.e.ii) || 0) + Math.abs(r.a)));
      rows.sort(
        (x, y) =>
          (byPkg ? x.g.localeCompare(y.g) : x.e.b - y.e.b) ||
          big.get(y.e.b + ':' + y.e.ii) - big.get(x.e.b + ':' + x.e.ii) ||
          x.e.ii - y.e.ii ||
          srcRank(x.e.src) - srcRank(y.e.src)
      );
    } // biggest item first, its sources together
    xpFoldInit(rows);
    const amt = (k, l, idx, o = {}) => numC(k, l, o.w || 118, (r) => sumIdx(r.e, idx), { f: fmt, ...o });
    const cols = [
      {
        k: 'item',
        l: 'Item',
        w: 330,
        fz: 1,
        v: (r) => itemCode(r.it) + ' ' + itemDesc(r.it),
        h: (r) =>
          `<td title="${esc(itemDesc(r.it))}"><a class="lk open">${esc(itemCode(r.it))}</a> <span class="help" dir="auto">${esc(itemDesc(r.it))}</span></td>`,
      },
      codeCells('pkg'),
      codeCells('mnl'),
      codeCells('ce'),
      srcCol,
      gtyCol,
      numC('qty', 'Qty cumulative', 112, (r) => sumIdx(r.e, CU, 1), { f: fq }),
      amt('pc', 'Previous' + (PC.length ? ' (' + perL(PC[0], PC[PC.length - 1]) + ')' : ''), PC, { w: 150 }),
      amt('tm', 'This month · ' + PER[SP.t], TM, { th: SP.t === rep ? 'cut' : '', cls: () => (SP.t === rep ? 'cutc' : '') }),
      amt('cu', 'Cumulative' + (SP.f > 0 ? ' (' + perL(SP.f, SP.t) + ')' : ''), CU, {
        th: 'cumh',
        cls: () => 'cumc',
        h: (r) => `<td class="num cumc"><b>${fmt(sumIdx(r.e, CU))}</b></td>`,
      }),
      numC('sh', 'Share', 74, (r) => sumIdx(r.e, CU) / tot, { f: (v) => (Math.abs(v) < 0.0005 ? '-' : (100 * v).toFixed(1) + '%') }),
    ];
    const foot = (rs) => ({
      pc: fmt(rs.reduce((t, r) => t + sumIdx(r.e, PC), 0)),
      tm: fmt(rs.reduce((t, r) => t + sumIdx(r.e, TM), 0)),
      cu: fmt(rs.reduce((t, r) => t + sumIdx(r.e, CU), 0)),
      sh: ((100 * rs.reduce((t, r) => t + sumIdx(r.e, CU), 0)) / tot).toFixed(1) + '%',
    });
    return {
      cols,
      rows,
      groups: true,
      sel: false,
      status: false,
      foot,
      gCells: (g, rs) => foot(rs),
      gSpanK: 'auto',
      gLabel: xpGLabel,
      rpt: {
        title: xpTitle(),
        lead: xpGrpSeg() + ' ' + xpSrcSeg(),
        tools: xsSeg(),
        hint: `${perL(SP.f, SP.t)} · a row = an item + the codes of its lines + the source (CJI3, or an adjustment in its month) · ✎ = coded by hand · click an item for its lines`,
      },
    };
  }
  // 3. Indirect per month: indirect head › cost element › item (PKG = Indirect), amount; an item opens its CJI3 lines
  const head = new Map(),
    ord = new Map();
  psCfg().indirect.forEach((g, gi) =>
    g.c.forEach((c) => {
      head.set(c, g.n);
      ord.set(g.n, gi);
    })
  );
  const famOfCe = (ce) => head.get(ce) || 'Other indirect',
    MO = MI.filter((m) => m.idx <= rep).map((m) => m.idx);
  const rows = [...R.exp.values()]
    .filter((e) => e.p.some((v) => Math.abs(v) >= 0.005))
    .filter((e) => isIndPkg(e.pkg))
    .map((e) => {
      const it = BK[e.b].items[e.ii],
        ce = e.ce || '(no cost element)';
      return { it, e, g: ce, a: sumIdx(e, CU), sq: [ce, ceLabel(IND_PKG, ce), itemCode(it), itemDesc(it), BK[e.b].id].join(' ') };
    })
    .sort(
      (x, y) =>
        (ord.has(famOfCe(x.g)) ? ord.get(famOfCe(x.g)) : 99) - (ord.has(famOfCe(y.g)) ? ord.get(famOfCe(y.g)) : 99) ||
        x.g.localeCompare(y.g) ||
        Math.abs(y.a) - Math.abs(x.a)
    );
  xpFoldInit(rows);
  const slots = slotsOf(),
    cols = [
      {
        k: 'item',
        l: 'Head › Cost element › Item',
        w: 430,
        fixW: 1,
        fz: 1,
        v: (r) => itemCode(r.it) + ' ' + itemDesc(r.it),
        h: (r) =>
          `<td class="xi" title="${esc(BK[r.it.bi].id + ' · ' + itemDesc(r.it))}"><a class="lk open" title="Open its CJI3 lines">${esc(itemCode(r.it))}</a> <span class="help" dir="auto">${esc(itemDesc(r.it))}</span></td>`,
      },
    ];
  slots.forEach((sl, si) =>
    cols.push(
      numC('s' + si, sl.label, 104, (r) => sumIdx(r.e, sl.idx), {
        f: fmt,
        slot: si,
        sub: 'Amount',
        pl: sl.label,
        pidx: sl.idx,
        th: (sl.idx.includes(rep) ? 'cut' : sl.kind === 'pend' ? 'pend' : '') + (sl.kind === 'q' || sl.kind === 'y' ? ' agg' : ''),
        cls: () => (sl.idx.includes(rep) ? 'cutc' : ''),
      })
    )
  );
  cols.push(
    numC('td', 'To date', 116, (r) => sumIdx(r.e, CU), {
      f: fmt,
      slot: 'td',
      sub: 'Amount',
      pl: 'To date',
      pidx: CU,
      th: 'cumh',
      h: (r) => `<td class="num cumc"><b>${fmt(sumIdx(r.e, CU))}</b></td>`,
    }),
    numC('am', `Avg per month (${PER[MO[0]]} – ${PER[rep]}, ${MO.length} months)`, 170, (r) => sumIdx(r.e, MO) / MO.length, { f: fmt }),
    numC('a3', `Avg last 3 months (${PER[A3[0]]} – ${PER[rep]})`, 150, (r) => sumIdx(r.e, A3) / A3.length, { f: fmt })
  );
  xpBlocks(cols, ['Amount']);
  const foot = (rs) => {
    const o = {};
    cols.forEach((c) => {
      if (c.num) o[c.k] = fmt(rs.reduce((t, r) => t + c.v(r), 0));
    });
    return o;
  };
  return {
    cols,
    rows,
    groups: true,
    sel: false,
    status: false,
    foot,
    gCells: (g, rs) => foot(rs),
    gSpanK: 'auto',
    fam: famOfCe,
    fLabel: (f, rs) =>
      `<b>${esc(f)}</b><span class="gm">${new Set(rs.map((x) => x.g)).size} cost element${new Set(rs.map((x) => x.g)).size === 1 ? '' : 's'}</span>`,
    gLabel: (g, rs) =>
      `<b>${esc(g)}</b>&nbsp;<span class="help">${esc(ceLabel(IND_PKG, g))}${rs.length > 1 ? ' · ' + rs.length + ' items' : ''}</span>`,
    rpt: {
      title: xpTitle(),
      hint: 'PKG = Indirect only · amount · + opens a cost element · click an item for its CJI3 lines',
      tools: xpPv(),
    },
  };
}
// 2. Expenses per month: the page definition in 14-table-pages (pm / xpm) ends here
const xpMonthDef = (o) => {
  xpFoldInit(o.rows);
  return {
    cols: o.cols,
    rows: o.rows,
    rowCls: (r) => (r.rep ? 'xrep' : ''),
    bands: o.bands,
    groups: true,
    sel: false,
    status: false,
    foot: o.footF,
    gCells: (g, rs) => o.footF(rs),
    gSpanK: 'auto',
    gLabel: xpGLabel,
    rpt: {
      title: xpTitle(),
      lead: xpGrpSeg() + ' ' + xpSrcSeg(),
      hint: 'every item by month · Source = CJI3 or an adjustment (its own row, in its month) · subcontractor: one row per PO (the item repeats in grey) · click an item for its lines',
      tools:
        (o.hasQ
          ? `<span class="seg">${[
              ['All', 'Qty · Rate · Amount'],
              ['Amount', 'Amount'],
            ]
              .map(([m, l]) => `<button data-pm="${m}" class="${o.mode === m ? 'on' : ''}">${l}</button>`)
              .join('')}</span>`
          : '') + xpPv(),
    },
  };
};
document.addEventListener('click', (e) => {
  if (ST.tab !== 'xpm') return;
  const b = e.target.closest('[data-xsm]');
  if (b) {
    ST.xsm = b.dataset.xsm;
    render();
    $('wrap').scrollTop = 0;
  }
});
