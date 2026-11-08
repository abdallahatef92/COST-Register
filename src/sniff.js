'use strict';
// Recognise a download by its content (column headers / sheet names), whatever the file is called.
const { XLSX, readBook, baseName } = require('./io');
const KINDS = { cji3: 'CJI3 – actual cost line items', zscprg01: 'ZSCPRG01 – subcontract certificates', zscsrv1: 'ZSCSRV1 – PO services', zintc1: 'ZINTC1 – order charges (equipment, fuel, fleet, house rent)', mb52: 'MB52 – stock (material groups)', me2n: 'ME2N – purchase orders (material groups)', prev: 'Last report (codes)', ignore: 'Ignore' };
// the project a download belongs to: the most frequent WBS project code (I-SUTH.01 → SUTH), else the most frequent Plant – '' when the file has neither
function projectOf(rows) {
  const top = (m) => [...m].sort((a, b) => b[1] - a[1]).map((x) => x[0])[0] || '', w = new Map(), p = new Map();
  rows.forEach((r) => r && r.forEach((c) => { const x = String(c ?? '').match(/^[A-Z]-([A-Z0-9]{2,8})[.\-]/); if (x) w.set(x[1].toUpperCase(), (w.get(x[1].toUpperCase()) || 0) + 1); }));
  if (w.size) return top(w);
  const h = rows.findIndex((r) => r && r.some((c) => /^(Plant|Plnt)$/.test(String(c ?? '').trim())));
  if (h >= 0) { const j = rows[h].findIndex((c) => /^(Plant|Plnt)$/.test(String(c ?? '').trim())); rows.slice(h + 1).forEach((r) => { const v = String((r && r[j]) ?? '').trim().toUpperCase(); if (v) p.set(v, (p.get(v) || 0) + 1); }); }
  return top(p);
}
function sniffInfo(src) {
  if (/\.json$/i.test(baseName(src))) return { kind: 'prev', proj: '' };
  const wb = readBook(src, { sheetRows: 400 }), names = wb.SheetNames;
  if (names.some((n) => / Coding$/.test(n) || n === 'Coding') && (names.includes('Summary') || names.includes('Lines'))) return { kind: 'prev', proj: '' };
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[names[0]], { header: 1, raw: true, defval: null }), head = rows.slice(0, 30), has = (t) => head.some((x) => x && x.some((c) => String(c ?? '').trim() === t));
  let kind = 'ignore';
  if (has('SC Work Current Cost')) kind = 'zscprg01';
  else if (has('PO Service Code')) kind = 'zscsrv1';
  else if (has('Order Type Description') && has('Order') && (has('Activity Type') || has('Actual'))) kind = 'zintc1';
  else if (has('Document Number') && (has('Val/COArea Crcy') || has('Cost Element'))) kind = 'cji3';
  else if (has('Material') && has('Material Group')) kind = has('Purchasing Document') || has('Purchasing Doc.') ? 'me2n' : 'mb52';
  return { kind, proj: kind === 'ignore' ? '' : projectOf(rows) };
}
const sniff = (src) => sniffInfo(src).kind;
module.exports = { sniff, sniffInfo, KINDS };
