#!/usr/bin/env node
'use strict';
// Prototype: Subcontractor coding screen as ONE offline HTML file, with the data of a built register.
// usage: node tools/proto-sc.js out/Cost_Register.xlsx out/SC_Coding_Prototype.html
const fs = require('fs'), path = require('path'), XLSX = require('xlsx');
const [src = 'out/Cost_Register.xlsx', out = 'out/SC_Coding_Prototype.html'] = process.argv.slice(2);
const wb = XLSX.readFile(src);
const rows = (n) => XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: null });
const str = (v) => (v === null || v === undefined ? '' : String(v));
// Coding sheet (header row 4)
const C = rows('Subcontractor Coding'), h = C[3], ix = (n) => h.indexOf(n);
const items = C.slice(4).filter((r) => r[ix('ID')] !== null).map((r) => ({
  tow: str(r[0]), svc: str(r[1]), desc: str(r[2]), unit: str(r[3]), div: str(r[ix('DIV')]), pkg: str(r[ix('PKG')]), mnl: str(r[ix('MNL')]), ce: str(r[ix('Cost element')]),
  inc: str(r[ix('Include')]) || 'Yes', qty: +r[ix('Qty to date')] || 0, td: +r[ix('To date')] || 0, tm: +r[h.findIndex((x) => str(x).startsWith('This month'))] || 0,
  pos: +r[ix('POs')] || 0, subs: str(r[ix('Subcontractors')]), fp: str(r[ix('First certified')]), lp: str(r[ix('Last certified')]), key: str(r[ix('Item key')]) }));
// Service per Month: periods on row 4 (every 3 columns from column H), item rows in the same order as the Coding sheet
const P = rows('Service per Month'), per = [], amtCols = [];
for (let c = 7; c < P[3].length; c += 3) if (P[3][c]) { per.push(str(P[3][c])); amtCols.push(c + 2); }
const pm = P.slice(5).filter((r) => r[1]);
items.forEach((it, i) => { const r = pm[i]; if (!r || str(r[1]) !== it.svc) throw new Error('row order mismatch at ' + i); it.m = amtCols.slice(0, -1).map((c) => Math.round((+r[c] || 0) * 100) / 100); });
const meta = { project: 'SUTH', cut: str(rows('Summary')[3][3]), periods: per.slice(0, -1), built: new Date().toISOString().slice(0, 10), source: path.basename(src) };
const tpl = fs.readFileSync(path.join(__dirname, '..', 'app', 'sc-coding.html'), 'utf8');
const lib = fs.readFileSync(require.resolve('xlsx/dist/xlsx.mini.min.js'), 'utf8');
const html = tpl.replace('/*__XLSX__*/', () => lib).replace('/*__DATA__*/', () => 'const META=' + JSON.stringify(meta) + ';const ITEMS=' + JSON.stringify(items) + ';');
fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, html);
console.log(`${out}: ${items.length} services, ${meta.periods.length} periods, ${(html.length / 1e6).toFixed(2)} MB`);
