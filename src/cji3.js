'use strict';
// Reads a CJI3 export (actual cost line items). Subtotal rows (blank Document Number) are skipped; the grand-total row is kept as a control.
const { XLSX, readBook } = require('./io');
const { r2, str, num, isoDate } = require('./util');

function indexHeader(row) { const ix = new Map(); row.forEach((h, i) => { const k = str(h); if (k && !ix.has(k)) ix.set(k, i); }); return ix; }

function readCji3(file) {
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
      amt: r2(num(g(r, 'Val/COArea Crcy'))), wbs: str(g(r, 'WBS Element')), mat: str(g(r, 'Material')), matDesc: str(g(r, 'Material Description')),
      qty: num(g(r, 'Total quantity')), unit: str(g(r, 'Unit of Measure')) || str(g(r, 'Posted unit of meas.')),
      name: str(g(r, 'Name')), header: str(g(r, 'Document Header Text')), poText: str(g(r, 'Purchase Order Text')), po: str(g(r, 'Purchasing Document')),
      order: str(g(r, 'Partner Object')), orderName: str(g(r, 'Partner object name')), offset: str(g(r, 'Name of offsetting account')),
      refDoc: str(g(r, 'Ref. document number')), stock: str(g(r, 'Name of offsetting account')), created: isoDate(g(r, 'Created on')), user: str(g(r, 'User Name')), issue: '',
    });
  }
  const sum = r2(lines.reduce((s, l) => s + l.amt, 0));
  return { lines, grand, sum, subtotals, file };
}
module.exports = { readCji3, indexHeader };
