// =====================================================================================  Adjust › Adjustment lines
// Like CJI3, one row per line: every amount in the register that is not a plain CJI3 line – what is added (VAT in, owner material,
// ZINTC1 orders and certificates not in CJI3 yet) and what is taken out (excluded, depreciation out, client deductions), each in its month.
// CJI3 + added − taken out = To date + Pending (the footer's bridge, line by line). Grouped by kind (+ / −), exported as on screen.
const ADJORD = [ADJK.vat, ADJK.own, ADJK.ord, ADJK.cert, ADJK.exc, ADJK.dep, ADJK.cd],
  ADJCLS = { [ADJK.vat]: 'vt', [ADJK.own]: 'ow', [ADJK.ord]: 'un', [ADJK.cert]: 'un', [ADJK.exc]: 'ex', [ADJK.dep]: 'ex', [ADJK.cd]: 'cd' };
const ADJOUT = new Set([ADJK.exc, ADJK.dep, ADJK.cd]);
function adjRows() {
  const out = [],
    all = !!ST.adjAll;
  for (let i = 0; i < N; i++) {
    const b = L.b[i],
      it = BK[b].items[L.it[i]],
      push = (g, a, on, why) => {
        if (on || all) out.push({ i, it, g, a, on, why });
      };
    if (UNS[i]) {
      push(
        b === SUBI ? ADJK.cert : ADJK.ord,
        R.amt[i],
        !!R.inc[i],
        (b === SUBI ? 'ZSCPRG01 certificate' : 'ZINTC1 order charge') +
          ' – not in CJI3 yet · ' +
          (R.inc[i] ? 'included on Adjust › ' + (b === SUBI ? 'Certificates not in CJI3' : 'Orders not settled') : 'not included')
      );
      continue;
    }
    if (!R.inc[i]) {
      const dep = b === DEPI && R.depOff(L.m[i] >= 0 ? String(L.m[i]) : 'a');
      push(
        dep ? ADJK.dep : ADJK.exc,
        -R.amt[i],
        true,
        dep
          ? 'month taken out on Adjust › Asset depreciation'
          : 'Include = No (' + (OVR[L.id[i]] && OVR[L.id[i]].inc === 'No' ? 'the line' : 'the item') + ')'
      );
      continue;
    }
    if (R.vin[i]) push(ADJK.vat, R.vin[i], true, ST.vat + ' · VAT of the certificate');
    if (adjKind(i) === ADJK.own) push(ADJK.own, R.amt[i], true, `qty ${fq(L.qty[i])} × your rate ${fmt2(ST.own[it.k])}`);
  }
  REV.forEach((x, k) => {
    if (!x[3])
      out.push({ rv: k, g: ADJK.cd, a: -x[2], on: true, why: 'client deduction booked with revenue – in the CJI3 total, not cost' });
  });
  return out;
}
const adjDate = (r) => {
  const d = r.rv !== undefined ? REV[r.rv][0] : L.d[r.i];
  return d ? String(d).replace(/(\d{4})(\d\d)(\d\d)/, '$1-$2-$3') : '';
};
const adjPer = (r) => {
  if (r.rv !== undefined) {
    const m = REV[r.rv][1],
      d = REV[r.rv][0];
    return m === 0 ? PER[0] : m < 0 || !d || d > R.cutI ? PER[NP - 1] : PER[m];
  }
  return PER[R.per[r.i]];
};
const adjEf = (r, f) => {
  if (r.rv !== undefined) return '';
  const o = OVR[L.id[r.i]];
  return o && o[f] !== undefined ? o[f] : r.it[f];
};
const adjS = (r, arr, k) => (r.rv !== undefined ? (k !== undefined ? S[REV[r.rv][k]] || '' : '') : S[arr[r.i]] || '');
function adjDef() {
  const rows = adjRows().sort(
    (x, y) => ADJORD.indexOf(x.g) - ADJORD.indexOf(y.g) || (adjDate(x) < adjDate(y) ? -1 : adjDate(x) > adjDate(y) ? 1 : 0)
  );
  const cols = [
    { k: 'kind', l: 'Adjustment', w: 190, fz: 1, v: (r) => r.g, h: (r) => `<td><span class="srct ${ADJCLS[r.g]}">${esc(r.g)}</span></td>` },
    { k: 'per', l: 'Period', w: 72, v: adjPer, h: (r) => `<td><b>${adjPer(r)}</b></td>` },
    { k: 'date', l: 'Posting date', w: 96, v: adjDate, h: (r) => `<td>${adjDate(r)}</td>` },
    {
      k: 'bk',
      l: 'Bucket',
      w: 130,
      v: (r) => (r.rv !== undefined ? 'Revenue' : BK[L.b[r.i]].id),
      h: (r) =>
        `<td>${r.rv !== undefined ? '<span class="help">Revenue</span>' : `<span class="bkc"><i style="background:${bkColor(L.b[r.i])}"></i>${esc(BK[L.b[r.i]].short)}</span>`}</td>`,
    },
    {
      k: 'item',
      l: 'Item',
      w: 120,
      v: (r) => (r.it ? itemCode(r.it) : ''),
      h: (r) => `<td>${r.it ? `<a class="lk open2" data-bi="${r.it.bi}" data-ii="${r.it.ii}">${esc(itemCode(r.it))}</a>` : ''}</td>`,
    },
    {
      k: 'idesc',
      l: 'Description',
      w: 230,
      v: (r) => (r.it ? itemDesc(r.it) : adjS(r, null, 5)),
      h: (r) => {
        const t = r.it ? itemDesc(r.it) : adjS(r, null, 5);
        return `<td dir="auto" title="${esc(t)}">${esc(t)}</td>`;
      },
    },
    ...['pkg', 'mnl', 'ce'].map((f) => ({
      k: f,
      l: FN[f],
      w: f === 'ce' ? 104 : 80,
      code: 1,
      v: (r) => adjEf(r, f) || '',
      h: (r) => `<td>${adjEf(r, f) ? `<b>${esc(adjEf(r, f))}</b>` : '<span class="help">–</span>'}</td>`,
    })),
    numC('qty', 'Qty', 84, (r) => (r.rv !== undefined ? 0 : L.qty[r.i]), { f: fq }),
    numC('amt', 'Amount', 120, (r) => r.a, { f: fmt2, h: (r) => `<td class="num${r.a < 0 ? ' neg' : ''}"><b>${fmt2(r.a)}</b></td>` }),
    { k: 'why', l: 'Why', w: 260, v: (r) => r.why, h: (r) => `<td class="help" title="${esc(r.why)}">${esc(r.why)}</td>` },
    {
      k: 'on',
      l: 'Counted',
      w: 104,
      v: (r) => (r.on ? 'In the register' : 'Not counted'),
      h: (r) => `<td><span class="st ${r.on ? 'Coded' : 'off'}">${r.on ? 'In the register' : 'Not counted'}</span></td>`,
    },
    { k: 'po', l: 'PO', w: 96, v: (r) => adjS(r, L.po), h: (r) => `<td>${esc(adjS(r, L.po))}</td>` },
    { k: 'doc', l: 'Document', w: 96, v: (r) => adjS(r, L.doc), h: (r) => `<td>${esc(adjS(r, L.doc))}</td>` },
    { k: 'ty', l: 'Type', w: 60, v: (r) => adjS(r, L.ty), h: (r) => `<td>${esc(adjS(r, L.ty))}</td>` },
    { k: 'gl', l: 'SAP cost element', w: 100, v: (r) => adjS(r, L.ce, 4), h: (r) => `<td>${esc(adjS(r, L.ce, 4))}</td>` },
    { k: 'gln', l: 'Cost element name', w: 170, v: (r) => adjS(r, L.cen, 5), h: (r) => `<td>${esc(adjS(r, L.cen, 5))}</td>` },
    { k: 'wbs', l: 'WBS element', w: 150, v: (r) => adjS(r, L.wbs, 6), h: (r) => `<td>${esc(adjS(r, L.wbs, 6))}</td>` },
    {
      k: 'desc',
      l: 'Line text',
      w: 220,
      v: (r) => adjS(r, L.desc),
      h: (r) => `<td dir="auto" title="${esc(adjS(r, L.desc))}">${esc(adjS(r, L.desc))}</td>`,
    },
  ];
  const foot = (rs) => ({
    amt: fmt2(rs.reduce((t, r) => t + (r.on ? r.a : 0), 0)),
    qty: fq(rs.reduce((t, r) => t + (r.on && r.rv === undefined ? L.qty[r.i] : 0), 0)),
  });
  // the bridge: CJI3 + added − taken out = To date + Pending (every counted line, so it ties to the footer)
  const on = rows.filter((r) => r.on);
  const add = r2(on.filter((r) => !ADJOUT.has(r.g)).reduce((t, r) => t + r.a, 0)),
    out = r2(-on.filter((r) => ADJOUT.has(r.g)).reduce((t, r) => t + r.a, 0)),
    ok = Math.abs(META.cost + add - out - R.toDate - R.pend) < 0.05;
  const kinds = ADJORD.map((k) => [k, on.filter((r) => r.g === k)]).filter((x) => x[1].length);
  const lead = `<span class="adjb"><span>CJI3 <b>${fmt(META.cost)}</b></span><i>+</i><span>added <b class="pos">${fmt(add)}</b></span><i>−</i><span>taken out <b class="neg">${fmt(out)}</b></span><i>=</i><span>To date + Pending <b>${fmt(R.toDate + R.pend)}</b></span> <b class="${ok ? 'pos' : 'neg'}">${ok ? '✓ ties' : '✗ ' + fmt2(META.cost + add - out - R.toDate - R.pend)}</b></span>`;
  const chips = `<span class="seg">${[['', 'All'], ...kinds.map(([k, rs]) => [k, `${k} · ${fmtM(Math.abs(rs.reduce((t, r) => t + r.a, 0)))}`])].map(([k, l]) => `<button data-adjk="${esc(k)}" class="${(ST.adjK0 || '') === k ? 'on' : ''}">${esc(l)}</button>`).join('')}</span>
    <span class="seg"><button data-adjall="0" class="${ST.adjAll ? '' : 'on'}">Counted</button><button data-adjall="1" class="${ST.adjAll ? 'on' : ''}">+ not counted</button></span>`;
  return {
    cols,
    rows: rows.filter((r) => !ST.adjK0 || r.g === ST.adjK0),
    groups: true,
    sel: false,
    status: false,
    foot,
    gCells: (g, rs) => foot(rs),
    gSpanK: 'auto',
    rowCls: (r) => (r.on ? '' : 'exc'),
    gLabel: (g, rs) =>
      `<span class="srct ${ADJCLS[g]}">${esc(g)}</span><span class="gm">${rs.length.toLocaleString('en-US')} line${rs.length === 1 ? '' : 's'}${ADJOUT.has(g) ? ' · taken out of the cost' : ' · added to the cost'}</span>`,
    rpt: {
      title: '<b class="xpt">Adjustment lines</b>',
      lead,
      tools: chips,
      hint: 'every line that is not plain CJI3 – in its month · + / − opens a kind · click an item to open it',
    },
  };
}
document.addEventListener('click', (e) => {
  const k = e.target.closest('[data-adjk]');
  if (k) {
    ST.adjK0 = k.dataset.adjk;
    render();
    return;
  }
  const a = e.target.closest('[data-adjall]');
  if (a) {
    ST.adjAll = a.dataset.adjall === '1';
    render();
  }
});
