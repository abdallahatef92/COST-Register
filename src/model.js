'use strict';
const { r2, r3, ymLabel, nextYm } = require('./util');
const { famLabel, divLabel, grpLabel, divKey, FAM_RANK, famOf, NO_GRP } = require('./groups');

// Bucket definitions. key(l) = the unique-list item the line belongs to; cols = descriptor columns of that item.
const ADJ_GROUP = '~ Adjustments and CJI3-only lines';
const orderKey = (l) => l.order || '(no order)';
const BUCKETS = [
  { id: 'Material', tab: '1F3864', mnl: 'MAT', qty: true, tree: true, boldCol: 3, tintCols: 3, key: (l) => l.mat || '(no material)',
    cols: [['Family', 7], ['Division', 8], ['Group', 10], ['Material', 11], ['Description', 40], ['Unit', 6]] },
  { id: 'Subcontractor', tab: '2F5597', mnl: 'SUB', qty: true, tree: true, boldCol: 1, tintCols: 1, pmName: 'Service per Month', key: (l) => l.ikey || l.po || '(no PO)', cols: [['Type of works', 26], ['Service', 11], ['Description', 44], ['Unit', 6]] },
  { id: 'Subcontractor deductions', short: 'Sub deductions', tab: '2F5597', mnl: 'SUB', key: (l) => l.cen || '(none)', cols: [['Cost element name', 34]] },
  { id: 'Other direct cost', short: 'Other direct', tab: '1F3864', mnl: 'OTHER', key: (l) => l.cen || '(none)', cols: [['Cost element name', 34]] },
  { id: 'Labor', tab: '548235', mnl: 'LAB', key: (l) => l.cen || '(none)', cols: [['Cost element name', 34]] },
  { id: 'Equipment / fuel', short: 'Equipment', tab: '548235', mnl: 'EQU', key: orderKey, cols: [['Order', 14], ['Order name', 44]] },
  { id: 'Fleet / transportation', short: 'Fleet', tab: '548235', mnl: 'EQU', key: orderKey, cols: [['Order', 14], ['Order name', 44]] },
  { id: 'House rent', tab: 'BF8F00', mnl: 'OTHER', key: orderKey, cols: [['Apartment (order)', 16], ['Name', 44]] },
  { id: 'Asset depreciation', short: 'Depreciation', tab: 'BF8F00', mnl: 'OTHER', key: (l) => l.cen || '(none)', cols: [['Cost element name', 34]] },
  { id: 'G&A', tab: 'BF8F00', mnl: 'OTHER', key: (l) => (l.sub || 'G&A') + ' · ' + (l.cen || '(none)'), cols: [['Sub-group', 26], ['Cost element name', 30]] },
  { id: 'Unclassified', tab: 'C00000', mnl: 'OTHER', key: (l) => l.cen || '(none)', cols: [['Cost element name', 34]] },
];
for (const b of BUCKETS) { b.short = b.short || b.id; b.boldCol = b.boldCol || 0; b.tintCols = b.tintCols || 0; }

function descriptors(b, first, groups) {
  switch (b.id) {
    case 'Material': { const gi = groups.get(first.mat); const g = gi ? gi.group : '';
      return { vals: [famOf(g) || '–', g ? divKey(g) : '–', g || '–', first.mat || '(no material)', first.matDesc, first.unit || (gi && gi.unit) || ''], group: g, famFull: famLabel(g), divFull: divLabel(g), headLabel: famLabel(g) + '  ›  ' + divLabel(g) }; }
    case 'Subcontractor': { const odd = first.ikey === 'ADJ' || first.ikey === 'CJI3', unit = first.unit || '';
      return { vals: [odd ? ADJ_GROUP : first.tow || '(no type of works)', first.svc || '', odd ? (first.ikey === 'ADJ' ? 'Differences between CJI3 and the certificate report (see Source)' : 'CJI3 lines no certificate explains (reversals, other documents)') : first.desc, odd ? '' : unit], headLabel: odd ? ADJ_GROUP : first.tow || '(no type of works)' }; }
    case 'House rent': case 'Equipment / fuel': case 'Fleet / transportation': return { vals: [first.order || '(no order)', first.orderName || (first.order ? '' : first.cen)] };
    case 'G&A': return { vals: [first.sub || 'G&A', first.cen] };
    default: return { vals: [first.cen] };
  }
}

function buildModel(lines, { groups = new Map(), prev = null, cut = '' } = {}) {
  const posted = lines.filter((l) => !l.open && l.ym).map((l) => l.ym).sort();
  const first = posted[0], last = posted[posted.length - 1];
  const maxDate = lines.map((l) => l.date).filter(Boolean).sort().pop();
  cut = cut || maxDate;                                   // the cut date: later postings are Pending
  const months = []; for (let m = first; m <= last; m = nextYm(m)) months.push(m);
  const periods = ['Opening', ...months.map(ymLabel), 'Pending'];
  const reportLabel = ymLabel(cut.slice(0, 7));
  for (const l of lines) l.per = l.open ? 'Opening' : !l.date || l.date > cut ? 'Pending' : ymLabel(l.ym);

  const buckets = [];
  for (const def of BUCKETS) {
    const bl = lines.filter((l) => l.bucket === def.id); if (!bl.length) continue;
    const byKey = new Map(); for (const l of bl) { const k = def.key(l); (byKey.get(k) || byKey.set(k, []).get(k)).push(l); }
    const items = [...byKey.entries()].map(([key, ls]) => {
      ls.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id < b.id ? -1 : 1));
      const big = ls.reduce((m, l) => (Math.abs(l.amt) > Math.abs(m.amt) ? l : m), ls[0]);
      const d = descriptors(def, big, groups);
      const act = ls.filter((l) => !l.open && l.per !== 'Pending');
      return { key, lines: ls, vals: d.vals, group: d.group || '', famFull: d.famFull, divFull: d.divFull, headLabel: d.headLabel, total: r2(ls.reduce((s, l) => s + l.amt, 0)),
        firstP: act.length ? ymLabel(act[0].ym) : 'Opening', lastP: act.length ? ymLabel(act[act.length - 1].ym) : 'Opening' };
    });
    if (def.id === 'Material') {
      // the report's order: family (fixed order), then division, group and material each largest first
      const tot = (f) => { const m = new Map(); for (const it of items) { const k = f(it); m.set(k, (m.get(k) || 0) + Math.abs(it.total)); } return m; };
      for (const it of items) { it.dk = divKey(it.group); it.fam = famOf(it.group); }
      const dT = tot((it) => it.dk), gT = tot((it) => it.dk + '|' + it.group);
      const fr = (it) => (it.group ? (FAM_RANK.has(it.fam) ? FAM_RANK.get(it.fam) : 98) : 99);
      items.sort((a, b) => fr(a) - fr(b) || (a.fam < b.fam ? -1 : a.fam > b.fam ? 1 : 0) || dT.get(b.dk) - dT.get(a.dk) || (a.dk < b.dk ? -1 : a.dk > b.dk ? 1 : 0) || gT.get(b.dk + '|' + b.group) - gT.get(a.dk + '|' + a.group) || (a.group < b.group ? -1 : a.group > b.group ? 1 : 0) || Math.abs(b.total) - Math.abs(a.total) || (a.key < b.key ? -1 : 1));
    } else if (def.id === 'Subcontractor') {
      for (const it of items) { it.dk = it.vals[0]; it.fam = ''; }
      const tot = (f) => { const m = new Map(); for (const it of items) { const k = f(it); m.set(k, (m.get(k) || 0) + Math.abs(it.total)); } return m; }, dT = tot((it) => it.dk), sT = tot((it) => it.dk + '|' + it.vals[1]), last = (it) => (it.dk === ADJ_GROUP ? 1 : 0);
      items.sort((a, b) => last(a) - last(b) || dT.get(b.dk) - dT.get(a.dk) || (a.dk < b.dk ? -1 : a.dk > b.dk ? 1 : 0) || sT.get(b.dk + '|' + b.vals[1]) - sT.get(a.dk + '|' + a.vals[1]) || (a.vals[1] < b.vals[1] ? -1 : a.vals[1] > b.vals[1] ? 1 : 0) || Math.abs(b.total) - Math.abs(a.total) || (a.key < b.key ? -1 : 1));
    } else items.sort((a, b) => Math.abs(b.total) - Math.abs(a.total) || (a.key < b.key ? -1 : 1));
    items.forEach((it, i) => { it.id = i + 1; const p = prev && prev.coding.get(def.id); const c = p && p.get(it.key); it.isNew = !!prev && !c;
      it.pkg = c ? c.pkg : ''; it.mnl = c && c.mnl ? c.mnl : def.mnl; it.ce = c ? c.ce : ''; it.inc = c && c.inc ? c.inc : 'Yes';
      if (def.id === 'Subcontractor') it.div = c && c.div !== undefined ? c.div : require('./codes').divOfService(it.vals[1]); });
    buckets.push({ def, items, count: bl.length, total: r2(bl.reduce((s, l) => s + l.amt, 0)) });
  }
  return { buckets, months, periods, reportLabel, cut, lines };
}
module.exports = { buildModel, BUCKETS };
