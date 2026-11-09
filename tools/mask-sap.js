#!/usr/bin/env node
'use strict';
// Make a MASKED copy of SAP downloads for the test data in this (public) repo.
// Kept: every code, number, date, quantity, amount, GL / material / WBS code – so the register builds the same numbers.
// Replaced: people and supplier names, user ids, document header / PO texts, company and project names.
// The same real text always gets the same mask, so grouping by name still behaves the same.
// usage: node tools/mask-sap.js <in.xlsx> <out.xlsx>
const crypto = require('crypto');
const { XLSX } = require('../src/io');

const SALT = 'cost-register-test';
const tag = (pre, v) => pre + ' ' + crypto.createHash('sha1').update(SALT + '|' + v).digest('hex').slice(0, 6).toUpperCase();
const hasLetters = (s) => /[A-Za-z؀-ۿ]/.test(s);
// company / project / place names anywhere in a text
// word for word, keeping spaces and letter case – two texts that differ stay different (items are grouped by text)
const kase = (m, t) => (m === m.toUpperCase() ? t.toUpperCase() : m === m.toLowerCase() ? t.toLowerCase() : t);
const NAMES = [[/south/gi, (m) => kase(m, 'Demo')], [/soma/gi, (m) => kase(m, 'Demo')], [/shorouk/gi, (m) => kase(m, 'Demo')], [/\(Shrk\)/g, '(Demo)'],
  [/ساوث/g, 'ديمو'], [/ثاوث/g, 'ديموث'], [/الشروق/g, 'الديمو']];
const scrub = (s) => NAMES.reduce((x, [re, to]) => x.replace(re, to), s);

// column header → how to mask it (headers as SAP writes them)
const PERSON = (v) => (hasLetters(v) && !/^WIP\b/i.test(v) ? tag('Name', v) : v);                    // CJI3 Name: vendor / employee – keep numbers and "WIP 2025"
const TEXT = (v) => (hasLetters(v) && !/^(OB|ACCREV|WIP)\b/i.test(v) ? tag('Text', v) : v);          // free texts – keep the OB / accrual markers the tool reads
const RULES = {
  'Name': PERSON, 'Document Header Text': TEXT, 'Purchase Order Text': TEXT,
  'User Name': (v) => tag('U', v), 'User': (v) => tag('U', v), 'ZMSC_HD_STATUS-SIMULATED_BY': (v) => tag('U', v),
  'Account Number of Supplier': (v) => tag('Supplier', v), 'Subcontractor Name': (v) => tag('Subcontractor', v),
  'Business Partner De': (v) => tag('Partner', v), 'Short Text': TEXT,
  'Partner object name': (v) => (/شق[ةه]|عمار[ةه]|شاليه|فيل[اه]|شارع|flat|villa|street/i.test(v) ? tag('Flat', v) : scrub(v)),   // flat addresses; equipment / WBS names stay
  'Name of offsetting account': (v) => (/[\u0600-\u06FF]/.test(v) ? tag('Account', v) : scrub(v)),   // vendor / person accounts are in Arabic; GL names in English stay
};

function maskBook(src, dst) {
  const wb = XLSX.readFile(src, { cellDates: false, cellNF: true, cellText: false });
  let n = 0;
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name]; if (!ws['!ref']) continue; const rg = XLSX.utils.decode_range(ws['!ref']);
    // the header row: the first row with at least 3 text cells
    let hr = rg.s.r; for (let r = rg.s.r; r <= Math.min(rg.e.r, rg.s.r + 20); r++) { let t = 0; for (let c = rg.s.c; c <= rg.e.c; c++) { const x = ws[XLSX.utils.encode_cell({ r, c })]; if (x && x.t === 's') t++; } if (t >= 3) { hr = r; break; } }
    const fn = []; for (let c = rg.s.c; c <= rg.e.c; c++) { const h = ws[XLSX.utils.encode_cell({ r: hr, c })]; fn[c] = h ? RULES[String(h.v).trim()] : null; }
    // ZINTC1 house-rent orders: the order description is the flat's address
    let cOT = -1, cOD = -1; for (let c = rg.s.c; c <= rg.e.c; c++) { const h = ws[XLSX.utils.encode_cell({ r: hr, c })], t = h ? String(h.v).trim() : ''; if (t === 'Order Type') cOT = c; if (t === 'Order Description') cOD = c; }
    for (let r = hr + 1; r <= rg.e.r; r++) for (let c = rg.s.c; c <= rg.e.c; c++) {
      const a = XLSX.utils.encode_cell({ r, c }), x = ws[a]; if (!x || x.t !== 's' || x.v === '') continue;
      const hous = c === cOD && cOT >= 0 && ((ws[XLSX.utils.encode_cell({ r, c: cOT })] || {}).v === 'HOUS');
      let v = String(x.v); const f = hous ? (y) => tag('Flat', y) : fn[c]; v = f ? f(v.trim()) : scrub(v); if (v !== x.v) { x.v = v; delete x.w; delete x.h; delete x.r; n++; }
    }
  }
  return { wb, n };
}
// SheetJS writes the zip uncompressed: deflate it so the test data stays small
async function writeSmall(wb, dst) {
  const JSZip = require('jszip'), raw = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }), z = await JSZip.loadAsync(raw);
  require('fs').writeFileSync(dst, await z.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 9 } }));
}
module.exports = { maskBook, writeSmall };
if (require.main === module) { const [src, dst] = process.argv.slice(2); if (!src || !dst) { console.error('usage: node tools/mask-sap.js <in.xlsx> <out.xlsx>'); process.exit(1); } const { wb, n } = maskBook(src, dst); writeSmall(wb, dst).then(() => console.log(dst + ': ' + n + ' cells masked')); }
