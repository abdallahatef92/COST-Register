// Unit tests (no browser, no real data): node tests/unit.cjs
const assert = require('node:assert/strict');
const U = require('../src/util.js'), R = require('../src/reports.js');
let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok  ' + name); };

t('amounts: separators, trailing minus, parentheses, empties', () => {
  assert.equal(U.toNum('1,234.50-'), -1234.5); assert.equal(U.toNum('(1,234)'), -1234); assert.equal(U.toNum(' 12 '), 12);
  assert.equal(U.toNum(''), null); assert.equal(U.toNum(null), null); assert.ok(Number.isNaN(U.toNum('abc'))); assert.equal(U.toNum(-5.25), -5.25);
});
t('dates: Excel serial, ISO, dd.mm.yyyy, yyyymmdd; bad ones are null', () => {
  assert.equal(U.toDate(45925), '2025-09-25'); assert.equal(U.toDate('2026-09-30 00:00:00'), '2026-09-30'); assert.equal(U.toDate('30.09.2026'), '2026-09-30');
  assert.equal(U.toDate('20260930'), '2026-09-30'); assert.equal(U.toDate('0'), null); assert.equal(U.toDate(''), null); assert.equal(U.toDate('31.02.20'), null);
});
t('time of day from an Excel fraction', () => assert.equal(U.toTime(0.5), '12:00:00'));
t('codes: numbers become text; WBS upper case without spaces; join keys drop leading zeros', () => {
  assert.equal(U.toText(30101200), '30101200'); assert.equal(U.toText('  a  '), 'a'); assert.equal(U.toText(' '), null);
  assert.equal(U.toWbs(' i-suth.in-03-3 '), 'I-SUTH.IN-03-3'); assert.equal(U.joinKey('0001700'), '1700'); assert.equal(U.joinKey('dp116'), 'DP116');
});
t('project key: WBS root, plant, with or without the type prefix', () => {
  assert.equal(U.projectKey('I-SUTH.IN-03-3'), 'SUTH'); assert.equal(U.projectKey('R-SBAY'), 'SBAY'); assert.equal(U.projectKey('SUTH'), 'SUTH'); assert.equal(U.projectKey(''), null);
});
t('data date from the file name, else the modified date', () => {
  assert.equal(U.dataDateOf('cji3-suth - 30-9-2026.xlsx', 0), '2026-09-30'); assert.equal(U.dataDateOf('x 2026-10-14.xlsx', 0), '2026-10-14');
  assert.equal(U.dataDateOf('ZINTC1 - 2025.xlsx', Date.UTC(2026, 0, 5, 12)), '2026-01-05');
});
t('every report has a unique table, unique column names, and keys that exist', () => {
  assert.equal(new Set(R.REPORTS.map((d) => d.table)).size, R.REPORTS.length);
  for (const d of R.REPORTS) { const cols = d.all.map((c) => c.col); assert.equal(new Set(cols).size, cols.length, d.id + ' duplicate column'); d.keyCols.forEach((k) => assert.ok(cols.includes(k))); d.defaultVisible.forEach((c) => assert.ok(cols.includes(c), d.id + ' ' + c)); }
});

// a small CJI3 sheet: grand total row, a real line, a subtotal row, a duplicate line, a line with no posting row, a revenue line and an opening-balance line
const hdr = R.byId.cji3.columns.map((c) => c.src);
const mk = (o) => hdr.map((h) => (h in o ? o[h] : null));
const aoa = [
  [], // title block above the header: detection must search for it
  hdr,
  mk({ 'Val/COArea Crcy': 100 }),
  mk({ 'Document Number': 'A0004LG900', 'Posting Row': 1, 'Fiscal Year': 2026, 'Cost Element': 30201100, 'Cost element name': 'Main Material', 'WBS Element': 'i-suth.in-03-3', 'Val/COArea Crcy': 40, 'Posting Date': 46000, 'Document Type': 'WA', 'Purchasing Document': 1700000298 }),
  mk({ 'Val/COArea Crcy': 40, 'Cost Element': 30201100 }),
  mk({ 'Document Number': 'A0004LG900', 'Posting Row': 1, 'Fiscal Year': 2026, 'Cost Element': 30201100, 'WBS Element': 'I-SUTH.IN-03-3', 'Val/COArea Crcy': 40, 'Posting Date': 46000 }),
  mk({ 'Document Number': 'A0004LG901', 'Fiscal Year': 2026, 'Cost Element': 30201100, 'Val/COArea Crcy': 1 }),
  mk({ 'Document Number': 'B1', 'Posting Row': 1, 'Fiscal Year': 2026, 'Cost Element': 40101000, 'WBS Element': 'I-SUTH.01', 'Val/COArea Crcy': -60, 'Posting Date': 46001, 'Document Type': 'RV' }),
  mk({ 'Document Number': 'U1', 'Posting Row': 2, 'Fiscal Year': 2025, 'Cost Element': 30101200, 'WBS Element': 'I-SUTH.01', 'Val/COArea Crcy': 10, 'Posting Date': 45900, 'Document Type': 'UE' }),
];
t('detection finds the header under a title block, by column names', () => { const h = R.detect(aoa); assert.equal(h.def.id, 'cji3'); assert.equal(h.headerRow, 1); });
t('a SAP total row and an unrelated header are not detected as the wrong report', () => { assert.equal(R.detect([['a', 'b', 'c']]), null); assert.equal(R.detect([R.byId.zscprg01.columns.map((c) => c.src)]).def.id, 'zscprg01'); });
t('CJI3 prepare: skips subtotals, rejects missing key, flags duplicate keys, splits cost / revenue / opening', () => {
  const o = R.prepare(R.byId.cji3, aoa, 1, { sourceFile: 'x.xlsx' });
  assert.equal(o.blankRows, 2); assert.equal(o.footer, 100); assert.equal(o.rejected, 1); assert.equal(o.dupKeys, 1); assert.equal(o.rows.length, 3);
  const d = R.byId.cji3, ix = (c) => d.all.findIndex((x) => x.col === c), r = o.rows[0];
  assert.equal(r[ix('document_number')], 'A0004LG900'); assert.equal(r[ix('cost_element')], '30201100'); assert.equal(r[ix('wbs_element')], 'I-SUTH.IN-03-3');
  assert.equal(r[ix('period_ym')], '2025-12'); assert.equal(r[ix('join_po')], '1700000298'); assert.equal(r[ix('kind')], 'cost'); assert.equal(r[ix('is_opening')], 0);
  assert.equal(o.rows[1][ix('kind')], 'revenue'); assert.equal(o.rows[2][ix('is_opening')], 1);
  assert.equal(o.sumAmount, 40 - 60 + 10); assert.equal(R.projectOf(o.proj), 'SUTH'); assert.equal(o.keys.length, 3);
});
t('ZINTC1 has no line key: identical rows are all kept, blank rows are skipped', () => {
  const d = R.byId.zintc1, h = d.columns.map((c) => c.src), row = (o) => h.map((x) => (x in o ? o[x] : null));
  const line = row({ Order: '510000552', Actual: 36400, Year: 2026, Month: 3, WBS: 'I-SUTH.IN-03-1', Category: 'WBS' });
  const o = R.prepare(d, [h, line, line.slice(), row({ Actual: 5 })], 0, {});
  assert.equal(o.rows.length, 2); assert.equal(o.blankRows, 1); assert.equal(o.dupKeys, 0); assert.deepEqual([...o.periods], ['2026-03']);
});
console.log(n + ' unit tests passed');
