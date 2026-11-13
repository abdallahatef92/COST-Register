'use strict';
// Equipment / fuel, Fleet and House rent detail from the internal-order charges report (ZINTC1).
// CJI3 stays the truth: each CJI3 order settlement (order × posting month) that ZINTC1 explains is replaced by the ZINTC1 rows behind it
// (equipment unit × days, fuel order × litres, trips, apartments). What ZINTC1 cannot explain stays visible:
//   - CJI3 settlement lines with no ZINTC1 rows stay as they are;
//   - a settlement that differs from its ZINTC1 rows gets a difference row (cents → rounding row);
//   - ZINTC1 charges CJI3 has not settled yet are kept as "not yet settled" lines (uns = 1): excluded by default, the user may include them
//     (then the register exceeds CJI3 by exactly that amount, shown on its own line).
const { XLSX, readBook, baseName } = require('./io');
const { str, num, r2 } = require('./util');

const COLS = {
  order: 'Order',
  odesc: 'Order Description',
  otype: 'Order Type',
  otypeDesc: 'Order Type Description',
  place: 'Functional Location Description PLTXT',
  amt: 'Actual',
  year: 'Year',
  month: 'Month',
  wbs: 'WBS',
  actDesc: 'Activity Type Descripti',
  uom: 'Activity type UOM',
  qty: 'Total Qty',
  act: 'Activity Type',
  zce: 'Cost Element',
  zcen: 'Cost Element Descriptio',
  bp: 'Business Partner',
  bpn: 'Business Partner De',
  cat: 'Category',
};
const TYPE_BUCKET = {
  ZE01: 'Equipment / fuel',
  ZFU1: 'Equipment / fuel',
  DCRM: 'Equipment / fuel',
  ZF01: 'Fleet / transportation',
  ZTM1: 'Fleet / transportation',
  HOUS: 'House rent',
};
const TYPE_GROUP = {
  ZE01: 'Equipment charges (ZE01)',
  ZFU1: 'Fuel orders (ZFU1)',
  DCRM: 'Corrective maintenance (DCRM)',
  ZF01: 'Fleet orders (ZF01)',
  ZTM1: 'Trips (ZTM1)',
  HOUS: 'House rent orders (HOUS)',
};
const G_CJI = 'CJI3 lines (no ZINTC1 detail)',
  G_ADJ = '~ Differences between CJI3 and ZINTC1',
  G_UNS = '~ Not yet settled in CJI3 (include them on the Unsettled tab)';
const GROUP_RANK = [...Object.values(TYPE_GROUP), G_CJI, G_ADJ, G_UNS];

function readOne(src) {
  const wb = readBook(src),
    ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
  const hi = rows.findIndex((r) => r && r.some((c) => str(c) === 'Order Type') && r.some((c) => str(c) === 'Order'));
  if (hi < 0) throw new Error(baseName(src) + ': not a ZINTC1 report (no "Order" / "Order Type" columns)');
  const ix = new Map();
  rows[hi].forEach((c, i) => {
    const k = str(c);
    if (k && !ix.has(k)) ix.set(k, i);
  });
  const g = (r, n) => (ix.has(COLS[n]) ? r[ix.get(COLS[n])] : null),
    out = [];
  for (const r of rows.slice(hi + 1)) {
    if (!r) continue;
    const order = str(g(r, 'order')),
      y = str(g(r, 'year')),
      m = str(g(r, 'month'));
    if (!order || !/^\d{4}$/.test(y) || !m) continue; // totals / subtotals have no order or year
    const uom = str(g(r, 'uom')),
      otype = str(g(r, 'otype'));
    out.push({
      order,
      odesc: str(g(r, 'odesc')).replace(/\s+/g, ' '),
      otype,
      otypeDesc: str(g(r, 'otypeDesc')),
      ym: y + '-' + m.padStart(2, '0'),
      amt: r2(num(g(r, 'amt'))),
      wbs: str(g(r, 'wbs')),
      act: str(g(r, 'act')),
      actDesc: str(g(r, 'actDesc')),
      uom,
      qty: uom === 'EGP' || otype === 'HOUS' ? 0 : num(g(r, 'qty')),
      zce: str(g(r, 'zce')),
      zcen: str(g(r, 'zcen')),
      bpn: str(g(r, 'bpn')),
      place: str(g(r, 'place')),
    });
  }
  const yms = out.map((x) => x.ym).sort();
  return { name: baseName(src), rows: out, first: yms[0] || '', last: yms[yms.length - 1] || '' };
}

// several files (2025 + 2026, or an older and a newer download): every order × month comes from the newest file that has it.
// Rows are NOT de-duplicated inside a file – ZINTC1 has no document number, two equal diesel issues are two real charges.
function readZint(files) {
  const parts = []
    .concat(files || [])
    .filter(Boolean)
    .map(readOne);
  const own = new Map(); // order|ym → part index
  parts.forEach((p, pi) => {
    for (const r of p.rows) {
      const k = r.order + '|' + r.ym,
        o = own.get(k);
      if (o === undefined || p.last > parts[o].last || (p.last === parts[o].last && pi > o)) own.set(k, pi);
    }
  });
  const rows = [],
    cov = {},
    over = new Map();
  parts.forEach((p, pi) => {
    p.used = 0;
    p.amt = 0;
    p.dropAmt = 0;
    for (const r of p.rows) {
      const k = r.order + '|' + r.ym,
        w = own.get(k);
      if (w === pi) {
        rows.push(r);
        p.used++;
        p.amt += r.amt;
        const c = cov[r.ym] || (cov[r.ym] = { f: [], n: 0, amt: 0 });
        if (!c.f.includes(pi)) c.f.push(pi);
        c.n++;
        c.amt += r.amt;
      } else {
        p.dropAmt += r.amt;
        const x = over.get(r.ym) || over.set(r.ym, { ym: r.ym, kept: parts[w].name, dropped: new Map() }).get(r.ym);
        x.dropped.set(p.name, (x.dropped.get(p.name) || 0) + 1);
      }
    }
  });
  Object.values(cov).forEach((c) => {
    c.amt = r2(c.amt);
  });
  return {
    rows,
    cov,
    overlaps: [...over.values()]
      .map((x) => ({ ym: x.ym, kept: x.kept, dropped: [...x.dropped].map(([name, n]) => ({ name, n })) }))
      .sort((a, b) => (a.ym < b.ym ? -1 : 1)),
    files: parts.map((p) => ({
      name: p.name,
      rows: p.rows.length,
      used: p.used,
      dropped: p.rows.length - p.used,
      amt: r2(p.amt),
      first: p.first,
      last: p.last,
    })),
  };
}

const near = (a, b) => Math.abs(r2(a - b)) < 1;
const monthEnd = (ym) => {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
};

// lines: all classified CJI3 lines. Returns the new line list and the bridge numbers.
function applyZint(lines, Z, { lastYm } = {}) {
  const byOrder = new Map();
  for (const r of Z.rows) (byOrder.get(r.order) || byOrder.set(r.order, []).get(r.order)).push(r);
  const isSettle = (l) => l.order && byOrder.has(l.order) && l.ce[0] !== '4';
  const cBy = new Map();
  for (const l of lines) if (isSettle(l)) (cBy.get(l.order) || cBy.set(l.order, []).get(l.order)).push(l);
  // the bucket / CJI3 cost element an order type settles to (from the settled orders), for unsettled orders
  const tB = new Map(),
    tCE = new Map(),
    tally = (m, k, v, w) => {
      const x = m.get(k) || m.set(k, new Map()).get(k);
      x.set(v, (x.get(v) || 0) + w);
    },
    top = (m) => (m ? [...m].sort((a, b) => b[1] - a[1])[0][0] : '');
  for (const [o, cl] of cBy) {
    const t = byOrder.get(o)[0].otype;
    for (const l of cl) {
      tally(tB, t, l.bucket, Math.abs(l.amt));
      tally(tCE, t, l.ce + '\u0001' + l.cen, Math.abs(l.amt));
    }
  }
  const removed = new Set(),
    out = [],
    st = {
      cjiSettle: 0,
      explained: 0,
      detail: 0,
      adj: 0,
      adjN: 0,
      round: 0,
      roundN: 0,
      cjiOnly: 0,
      cjiOnlyN: 0,
      uns: 0,
      unsN: 0,
      unsAfter: 0,
      unsByType: {},
      orders: byOrder.size,
      ordersSettled: 0,
      shifted: 0,
    };
  for (const [order, zr] of byOrder) {
    const cl = cBy.get(order) || [],
      t = zr[0].otype,
      cm = new Map(),
      zm = new Map();
    for (const l of cl) (cm.get(l.ym) || cm.set(l.ym, []).get(l.ym)).push(l);
    for (const r of zr) (zm.get(r.ym) || zm.set(r.ym, []).get(r.ym)).push(r);
    if (cl.length) st.ordersSettled++;
    const months = [...new Set([...cm.keys(), ...zm.keys()])].sort();
    let pending = [];
    const mk = (r, i, post, cls, uns) => {
      // one ZINTC1 row as a register line
      const main = cls ? cls.find((l) => l.ce === r.zce) || cls.reduce((a, b) => (Math.abs(b.amt) > Math.abs(a.amt) ? b : a)) : null;
      const [ce, cen] = main
        ? [main.ce, main.cen]
        : t === 'HOUS'
          ? [r.zce, r.zcen]
          : (top(tCE.get(t)) || r.zce + '\u0001' + r.zcen).split('\u0001');
      const bucket = main ? main.bucket : cl.length ? cl[0].bucket : top(tB.get(t)) || TYPE_BUCKET[t] || 'Unclassified';
      const code = r.act || order,
        desc = r.act ? r.actDesc : r.odesc,
        unit = r.uom === 'EGP' ? '' : r.uom || (t === 'ZFU1' ? 'L' : '');
      return {
        id: 'Z|' + order + '|' + r.ym + '|' + i,
        doc: main ? main.doc : '',
        row: '',
        fy: '',
        date: main
          ? cls
              .map((l) => l.date)
              .sort()
              .pop()
          : monthEnd(r.ym),
        ym: post,
        svcYm: r.ym,
        type: main ? main.type : '(blank)',
        ce,
        cen,
        amt: r.amt,
        qty: r.qty,
        unit,
        wbs: r.wbs || (main ? main.wbs : ''),
        wbsName: main ? main.wbsName : '',
        mat: '',
        matDesc: '',
        po: '',
        order,
        orderName: r.odesc,
        otype: t,
        name: [r.zcen, r.bpn].filter(Boolean).join(' · '),
        header: r.odesc,
        poText: '',
        offset: r.place,
        desc: [order, r.odesc, r.act ? '' : r.zcen, r.bpn].filter(Boolean).join(' · '),
        source: uns ? 'ZINTC1 not yet settled' : 'ZINTC1',
        bucket,
        sub: main ? main.sub : '',
        rule: main ? main.rule : '',
        zkey: (uns ? 'U|' : '') + code,
        zv: [code, desc, unit],
        zgrp: uns ? G_UNS : TYPE_GROUP[t] || t,
        uns: uns ? 1 : 0,
        issue: '',
      };
    };
    const take = (groups, post, cls) => {
      for (const gq of groups) {
        if (gq.ym !== post) st.shifted += gq.amt;
        gq.rows.forEach((r) => out.push(mk(r, gq.base + r.__i, post, cls, false)));
        st.detail += gq.amt;
      }
    };
    for (const m of months) {
      if (zm.has(m)) {
        const rs = zm.get(m);
        rs.forEach((r, i) => {
          r.__i = i;
        });
        pending.push({ ym: m, rows: rs, amt: r2(rs.reduce((s, r) => s + r.amt, 0)), base: 0 });
      }
      if (!cm.has(m)) continue;
      const cls = cm.get(m),
        c = r2(cls.reduce((s, l) => s + l.amt, 0));
      st.cjiSettle += c;
      if (!pending.length) continue; // CJI3 settled more for an order whose charges were all used already: stays as CJI3 lines
      const sum = (gs) => r2(gs.reduce((s, g) => s + g.amt, 0));
      let pick = null;
      if (near(sum(pending), c)) pick = pending;
      else if (zm.has(m) && near(sum([pending[pending.length - 1]]), c) && pending[pending.length - 1].ym === m)
        pick = [pending[pending.length - 1]];
      else {
        for (let k = 1; k < pending.length && !pick; k++) {
          if (near(sum(pending.slice(0, k)), c)) pick = pending.slice(0, k);
          else if (near(sum(pending.slice(-k)), c)) pick = pending.slice(-k);
        }
      }
      const exact = !!pick;
      if (!pick) pick = zm.has(m) && pending[pending.length - 1].ym === m ? [pending[pending.length - 1]] : pending;
      pending = pending.filter((g) => !pick.includes(g));
      for (const l of cls) removed.add(l);
      take(pick, m, cls);
      st.explained += c;
      const diff = r2(c - sum(pick));
      if (diff !== 0) {
        const big = cls.reduce((a, b) => (Math.abs(b.amt) > Math.abs(a.amt) ? b : a));
        out.push({
          ...big,
          id: 'ZADJ|' + order + '|' + m,
          amt: diff,
          qty: 0,
          source: exact ? 'Rounding (under 1 EGP)' : 'Settlement difference',
          zkey: 'ADJ',
          zv: ['ADJ', 'Differences between CJI3 settlements and ZINTC1 (see Source)', ''],
          zgrp: G_ADJ,
          desc: (exact ? 'Rounding' : 'CJI3 settlement minus ZINTC1') + ' · order ' + order + ' · ' + m,
          uns: 0,
        });
        if (exact) {
          st.round += diff;
          st.roundN++;
        } else {
          st.adj += diff;
          st.adjN++;
        }
      }
    }
    for (const gq of pending) {
      if (gq.amt === 0) {
        st.zeroGroups = (st.zeroGroups || 0) + 1;
        continue;
      } // charges and their reversal in one month, never settled: nothing to show
      gq.rows.forEach((r) => out.push(mk(r, r.__i, gq.ym, null, true)));
      st.uns += gq.amt;
      st.unsN += gq.rows.length;
      if (lastYm && gq.ym > lastYm) st.unsAfter += gq.amt;
      st.unsByType[t] = r2((st.unsByType[t] || 0) + gq.amt);
    }
  }
  for (const l of lines)
    if (isSettle(l) && !removed.has(l)) {
      st.cjiOnly += l.amt;
      st.cjiOnlyN++;
    }
  for (const k of ['cjiSettle', 'explained', 'detail', 'adj', 'round', 'cjiOnly', 'uns', 'unsAfter', 'shifted']) st[k] = r2(st[k]);
  return { lines: lines.filter((l) => !removed.has(l)).concat(out), stats: st, files: Z.files };
}

module.exports = { readZint, applyZint, TYPE_GROUP, GROUP_RANK, G_CJI, G_ADJ, G_UNS };
