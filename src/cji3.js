'use strict';
// Reads a CJI3 export (actual cost line items). Subtotal rows (blank Document Number) are skipped; the grand-total row is kept as a control.
const { XLSX, readBook } = require('./io');
const { r2, str, num, isoDate } = require('./util');

function indexHeader(row) { const ix = new Map(); row.forEach((h, i) => { const k = str(h); if (k && !ix.has(k)) ix.set(k, i); }); return ix; }

function readOne(file) {
  const wb = readBook(file, { cellDates: true });
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: null });
  const h = rows.findIndex((r) => r.some((c) => str(c) === 'Document Number'));
  if (h < 0) throw new Error('CJI3: no "Document Number" column found – is this a CJI3 export?');
  const ix = indexHeader(rows[h]);
  const need = ['Document Number', 'Posting Row', 'Fiscal Year', 'Posting Date', 'Cost Element', 'Val/COArea Crcy'];
  for (const n of need) if (!ix.has(n)) throw new Error('CJI3: column "' + n + '" is missing.');
  const g = (r, n) => (ix.has(n) ? r[ix.get(n)] : null);
  const lines = []; let grand = null, subtotals = 0;
  for (let i = h + 1; i < rows.length; i++) {
    const r = rows[i]; if (!r || r.every((c) => c === null)) continue;
    const doc = str(g(r, 'Document Number'));
    if (!doc) { subtotals++; if (grand === null && !str(g(r, 'Cost Element'))) grand = num(g(r, 'Val/COArea Crcy')); continue; }
    const date = isoDate(g(r, 'Posting Date'));
    lines.push({
      id: doc + '|' + str(g(r, 'Posting Row')) + '|' + str(g(r, 'Fiscal Year')), doc, row: str(g(r, 'Posting Row')), fy: str(g(r, 'Fiscal Year')),
      date, ym: date.slice(0, 7), type: str(g(r, 'Document Type')) || '(blank)', ce: str(g(r, 'Cost Element')), cen: str(g(r, 'Cost element name')),
      amt: r2(num(g(r, 'Val/COArea Crcy'))), wbs: str(g(r, 'WBS Element')), wbsName: str(g(r, 'CO Object Name')), mat: str(g(r, 'Material')), matDesc: str(g(r, 'Material Description')),
      qty: num(g(r, 'Total quantity')), unit: str(g(r, 'Unit of Measure')) || str(g(r, 'Posted unit of meas.')),
      name: str(g(r, 'Name')), header: str(g(r, 'Document Header Text')), poText: str(g(r, 'Purchase Order Text')), po: str(g(r, 'Purchasing Document')),
      order: str(g(r, 'Partner Object')), orderName: str(g(r, 'Partner object name')), offset: str(g(r, 'Name of offsetting account')),
      refDoc: str(g(r, 'Ref. document number')), stock: str(g(r, 'Name of offsetting account')), created: isoDate(g(r, 'Created on')), user: str(g(r, 'User Name')), issue: '',
    });
  }
  const sum = r2(lines.reduce((s, l) => s + l.amt, 0));
  return { lines, grand, sum, subtotals, file };
}
// one or several CJI3 files (split by period and/or overlapping downloads): merged on Document | Posting row | Fiscal year.
// A line found in two files is counted once; if the amounts differ, the file with the later postings wins and the line is listed as a conflict.
function readCji3(files) {
  const { baseName } = require('./io');
  const parts = [].concat(files).filter(Boolean).map(readOne).map((p) => ({ ...p, last: p.lines.reduce((m, l) => (l.date > m ? l.date : m), '') }));
  parts.sort((a, b) => (a.last < b.last ? -1 : a.last > b.last ? 1 : 0));
  const byId = new Map(), conflicts = []; let dropped = 0, within = 0;
  parts.forEach((p, k) => { p.name = baseName(p.file); p.dropped = 0; p.conflicts = 0; const seen = new Set();
    for (const l of p.lines) { if (seen.has(l.id)) within++; seen.add(l.id); const o = byId.get(l.id);
      if (o && o.k !== k) { if (r2(o.l.amt) === r2(l.amt)) { p.dropped++; dropped++; continue; } conflicts.push({ id: l.id, was: o.l.amt, now: l.amt, wasFile: parts[o.k].name, nowFile: p.name }); p.conflicts++; }
      byId.set(l.id, { l, k }); } });
  const lines = [...byId.values()].map((x) => x.l), cov = {};
  for (const { l, k } of byId.values()) { if (!l.ym) continue; const c = cov[l.ym] || (cov[l.ym] = { f: [], n: 0, amt: 0 }); if (!c.f.includes(k)) c.f.push(k); c.n++; if (l.ce[0] !== '4') c.amt += l.amt; }   // cost only (revenue 4xxxxxxx is not cost)
  Object.values(cov).forEach((c) => { c.amt = r2(c.amt); });
  return { lines, cov, grand: r2(parts.reduce((s, p) => s + (p.grand || 0), 0)), sum: r2(parts.reduce((s, p) => s + p.sum, 0)), subtotals: parts.reduce((s, p) => s + p.subtotals, 0), dropped, within, conflicts,
    files: parts.map((p) => ({ name: p.name, lines: p.lines.length, sum: p.sum, grand: p.grand, first: p.lines.reduce((m, l) => (l.date && (!m || l.date < m) ? l.date : m), ''), last: p.last, cost: r2(p.lines.reduce((t, l) => t + (l.ce[0] !== '4' ? l.amt : 0), 0)), dropped: p.dropped, conflicts: p.conflicts })) };
}
module.exports = { readCji3, indexHeader };
