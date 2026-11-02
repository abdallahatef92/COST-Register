'use strict';
const { r2, r3, ymLabel, nextYm } = require('./util');
const { famLabel, divLabel, grpLabel, divKey, FAM_RANK, famOf, NO_GRP } = require('./groups');

// Bucket definitions. key(l) = the unique-list item the line belongs to; cols = descriptor columns of that item.
const orderKey = (l) => l.order || '(no order)';
const BUCKETS = [
  { id: 'Material', tab: '1F3864', mnl: 'MAT', qty: true, key: (l) => l.mat || '(no material)',
    cols: [['Family', 22], ['Division', 22], ['Material group', 26], ['Material', 11], ['Description', 40], ['Unit', 6]] },
  { id: 'Subcontractor', tab: '2F5597', mnl: 'SUB', key: (l) => l.po || '(no PO)', cols: [['PO', 12], ['Service text', 52]] },
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
for (const b of BUCKETS) b.short = b.short || b.id;

function descriptors(b, first, groups) {
  switch (b.id) {
    case 'Material': { const gi = groups.get(first.mat); const g = gi ? gi.group : '';
      return { vals: [famLabel(g), divLabel(g), grpLabel(g), first.mat || '(no material)', first.matDesc, first.unit || (gi && gi.unit) || ''], group: g }; }
    case 'Subcontractor': return { vals: [first.po || '(no PO)', first.poText || first.name] };
    case 'House rent': case 'Equipment / fuel': case 'Fleet / transportation': return { vals: [first.order || '(no order)', first.orderName || (first.order ? '' : first.cen)] };
    case 'G&A': return { vals: [first.sub || 'G&A', first.cen] };
    default: return { vals: [first.cen] };
  }
}

function buildModel(lines, { groups = new Map(), prev = null } = {}) {
  const posted = lines.filter((l) => !l.open && l.ym).map((l) => l.ym).sort();
  const first = posted[0], last = posted[posted.length - 1];
  const months = []; for (let m = first; m <= last; m = nextYm(m)) months.push(m);
  const periods = ['Opening', ...months.map(ymLabel)];
  const reportLabel = ymLabel(last);
  for (const l of lines) l.per = l.open ? 'Opening' : ymLabel(l.ym);

  const buckets = [];
  for (const def of BUCKETS) {
    const bl = lines.filter((l) => l.bucket === def.id); if (!bl.length) continue;
    const byKey = new Map(); for (const l of bl) { const k = def.key(l); (byKey.get(k) || byKey.set(k, []).get(k)).push(l); }
    const items = [...byKey.entries()].map(([key, ls]) => {
      ls.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id < b.id ? -1 : 1));
      const big = ls.reduce((m, l) => (Math.abs(l.amt) > Math.abs(m.amt) ? l : m), ls[0]);
      const d = descriptors(def, big, groups);
      const act = ls.filter((l) => !l.open);
      return { key, lines: ls, vals: d.vals, group: d.group || '', total: r2(ls.reduce((s, l) => s + l.amt, 0)),
        firstP: act.length ? ymLabel(act[0].ym) : 'Opening', lastP: act.length ? ymLabel(act[act.length - 1].ym) : 'Opening' };
    });
    if (def.id === 'Material') {
      // the report's order: family (fixed order), then division, group and material each largest first
      const tot = (f) => { const m = new Map(); for (const it of items) { const k = f(it); m.set(k, (m.get(k) || 0) + Math.abs(it.total)); } return m; };
      for (const it of items) { it.dk = divKey(it.group); it.fam = famOf(it.group); }
      const dT = tot((it) => it.dk), gT = tot((it) => it.dk + '|' + it.group);
      const fr = (it) => (it.group ? (FAM_RANK.has(it.fam) ? FAM_RANK.get(it.fam) : 98) : 99);
      items.sort((a, b) => fr(a) - fr(b) || (a.fam < b.fam ? -1 : a.fam > b.fam ? 1 : 0) || dT.get(b.dk) - dT.get(a.dk) || (a.dk < b.dk ? -1 : a.dk > b.dk ? 1 : 0) || gT.get(b.dk + '|' + b.group) - gT.get(a.dk + '|' + a.group) || (a.group < b.group ? -1 : a.group > b.group ? 1 : 0) || Math.abs(b.total) - Math.abs(a.total) || (a.key < b.key ? -1 : 1));
    } else items.sort((a, b) => Math.abs(b.total) - Math.abs(a.total) || (a.key < b.key ? -1 : 1));
    items.forEach((it, i) => { it.id = i + 1; const p = prev && prev.coding.get(def.id); const c = p && p.get(it.key); it.isNew = !!prev && !c;
      it.pkg = c ? c.pkg : ''; it.mnl = c && c.mnl ? c.mnl : def.mnl; it.ce = c ? c.ce : ''; it.inc = c && c.inc ? c.inc : 'Yes'; });
    buckets.push({ def, items, count: bl.length, total: r2(bl.reduce((s, l) => s + l.amt, 0)) });
  }
  return { buckets, months, periods, reportLabel, lines };
}
module.exports = { buildModel, BUCKETS };
