'use strict';
// Recognise a download by its content (column headers / sheet names), whatever the file is called.
const { XLSX, readBook, baseName } = require('./io');
const KINDS = { cji3: 'CJI3 – actual cost line items', zscprg01: 'ZSCPRG01 – subcontract certificates', zscsrv1: 'ZSCSRV1 – PO services', mb52: 'MB52 – stock (material groups)', me2n: 'ME2N – purchase orders (material groups)', prev: 'Last report (codes)', ignore: 'Ignore' };
function sniff(src) {
  if (/\.json$/i.test(baseName(src))) return 'prev';
  const wb = readBook(src, { sheetRows: 30 }), names = wb.SheetNames;
  if (names.some((n) => / Coding$/.test(n) || n === 'Coding') && (names.includes('Summary') || names.includes('Lines'))) return 'prev';
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[names[0]], { header: 1, raw: true, defval: null }), has = (t) => rows.some((x) => x && x.some((c) => String(c ?? '').trim() === t));
  if (has('SC Work Current Cost')) return 'zscprg01';
  if (has('PO Service Code')) return 'zscsrv1';
  if (has('Document Number') && (has('Val/COArea Crcy') || has('Cost Element'))) return 'cji3';
  if (has('Material') && has('Material Group')) return has('Purchasing Document') || has('Purchasing Doc.') ? 'me2n' : 'mb52';
  return 'ignore';
}
module.exports = { sniff, KINDS };
