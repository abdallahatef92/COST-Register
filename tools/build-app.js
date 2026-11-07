#!/usr/bin/env node
'use strict';
// Builds the Cost Register TOOL: one offline HTML page that reads the SAP files itself (no data inside).
// usage: node tools/build-app.js [out/Cost_Register_Tool.html]
const fs = require('fs'), path = require('path');
const esbuild = require('esbuild');
function page(dataJs) {
const engine = esbuild.buildSync({ entryPoints: [path.join(__dirname, '..', 'app', 'engine-entry.js')], bundle: true, format: 'iife', platform: 'browser', external: ['xlsx'], minify: true, write: false }).outputFiles[0].text;
const tpl = fs.readFileSync(path.join(__dirname, '..', 'app', 'register.html'), 'utf8');
const lib = fs.readFileSync(require.resolve('xlsx/dist/xlsx.mini.min.js'), 'utf8'), xl = fs.readFileSync(require.resolve('exceljs/dist/exceljs.min.js'), 'utf8');
return tpl.replace('/*__XLSX__*/', () => lib).replace('/*__EXCELJS__*/', () => xl).replace('/*__ENGINE__*/', () => engine).replace('/*__DATA__*/', () => dataJs || 'const DATA0 = null;');
}
if (require.main === module) { const out = process.argv[2] || 'out/Cost_Register_Tool.html', html = page(); fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, html); console.log(`${out}: ${(html.length / 1e6).toFixed(2)} MB (no data inside – drop the SAP files)`); }
module.exports = { page };
