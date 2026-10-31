// Local check against real SAP exports (not committed data): node tests/real-files.cjs <folder with the xlsx files>
const fs = require('fs'), path = require('path'), XLSX = require('xlsx');
const R = require('../src/reports.js');
const dir = process.argv[2];
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.xlsx'))) {
  const buf = fs.readFileSync(path.join(dir, f));
  let t = Date.now();
  const head = XLSX.utils.sheet_to_json(XLSX.read(buf, { type: 'buffer', sheetRows: 20, dense: true }).Sheets[XLSX.read(buf, { type: 'buffer', sheetRows: 1 }).SheetNames[0]], { header: 1, raw: true, defval: null });
  const hit = R.detect(head);
  if (!hit) { console.log(f, '-> UNRECOGNIZED'); continue; }
  const wb = XLSX.read(buf, { type: 'buffer', dense: true });
  const aoa = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: null });
  const o = R.prepare(hit.def, aoa, hit.headerRow, { sourceFile: f });
  console.log(f.slice(9, 40), '->', hit.def.id, '| rows', o.rows.length, 'blank', o.blankRows, 'empty', o.emptyRows, 'rej', o.rejected, 'dupKeys', o.dupKeys,
    'badNum', o.badNumbers, 'badDate', o.badDates, '| proj', R.projectOf(o.proj), '| periods', o.minPeriod, o.maxPeriod, '| sum', Math.round(o.sumAmount * 100) / 100, 'footer', o.footer,
    '| missing', o.missing.length, 'unknown', o.unknown.length, (Date.now() - t) + 'ms');
  if (hit.def.id === 'cji3') {
    const ci = hit.def.columns.length; let cost = 0, rev = 0, open = 0;
    for (const r of o.rows) { const a = r[hit.def.columns.findIndex((c) => c.col === 'amount')]; if (r[ci + 7] === 'revenue') rev += a; else { cost += a; if (r[ci + 8]) open += a; } }
    console.log('   cost', cost.toFixed(2), 'revenue', (-rev).toFixed(2), 'opening cost', open.toFixed(2));
  }
}
