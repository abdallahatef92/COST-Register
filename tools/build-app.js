#!/usr/bin/env node
'use strict';
// Builds the Cost Register TOOL: one offline HTML page that reads the SAP files itself (no data inside).
// usage: node tools/build-app.js [out file]   – version from the VERSION file (v01, v02 …), shown in the Tool and in its file name
const fs = require('fs'),
  path = require('path');
const esbuild = require('esbuild');
// the page = app/register.html (skeleton) + app/css/register.css + app/js/*.js in file-name order (one script, as before:
// parts 01–18 sit inside function boot(), so they share its scope – read them as chapters of one file, not as modules)
function assemble() {
  const A = path.join(__dirname, '..', 'app'),
    rd = (f) => fs.readFileSync(f, 'utf8').replace(/\n$/, '');
  const js = fs
    .readdirSync(path.join(A, 'js'))
    .filter((f) => /^\d\d-.*\.js$/.test(f))
    .sort()
    .map((f) => rd(path.join(A, 'js', f)))
    .join('\n');
  return (
    rd(path.join(A, 'register.html'))
      .replace('/*__CSS__*/', () => rd(path.join(A, 'css', 'register.css')))
      .replace('/*__APP__*/', () => js) + '\n'
  );
}
function page(dataJs) {
  const engine = esbuild.buildSync({
    entryPoints: [path.join(__dirname, '..', 'app', 'engine-entry.js')],
    bundle: true,
    format: 'iife',
    platform: 'browser',
    external: ['xlsx'],
    minify: true,
    write: false,
  }).outputFiles[0].text;
  const VER =
    'v' +
    fs
      .readFileSync(path.join(__dirname, '..', 'VERSION'), 'utf8')
      .trim()
      .padStart(2, '0');
  const tpl = assemble().replace(/__VER__/g, VER);
  const lib = fs.readFileSync(require.resolve('xlsx/dist/xlsx.mini.min.js'), 'utf8'),
    xl0 = fs.readFileSync(require.resolve('exceljs/dist/exceljs.min.js'), 'utf8');
  // ExcelJS writes <pageSetUpPr> before <outlinePr> inside <sheetPr>; Excel wants the other order and "repairs" the sheet (PKG summary: fit to page + outline).
  // Swap the two calls in the library text; stop the build if the library changed and the text is not found.
  const XL_BAD =
    /(\w=this\.map\.pageSetUpPr\.render\(\w,\w\.pageSetup\)\|\|\w),(\w=this\.map\.outlinePr\.render\(\w,\w\.outlineProperties\)\|\|\w)/;
  if (!XL_BAD.test(xl0))
    throw new Error('build-app: the ExcelJS sheetPr order fix no longer matches the library – check <sheetPr> order by hand');
  const xl = xl0.replace(XL_BAD, '$2,$1');
  // SQLite (sql.js, WebAssembly) for the data file on the user's computer: the library and its .wasm, inside the page (offline)
  const sqljs =
    fs.readFileSync(require.resolve('sql.js/dist/sql-wasm.js'), 'utf8') +
    '\nconst SQLWASM_B64 = "' +
    fs.readFileSync(require.resolve('sql.js/dist/sql-wasm.wasm')).toString('base64') +
    '";';
  return tpl
    .replace('/*__SQLJS__*/', () => sqljs)
    .replace('/*__XLSX__*/', () => lib)
    .replace('/*__EXCELJS__*/', () => xl)
    .replace('/*__ENGINE__*/', () => engine)
    .replace('/*__DATA__*/', () => dataJs || 'const DATA0 = null;');
}
if (require.main === module) {
  const VER =
      'v' +
      fs
        .readFileSync(path.join(__dirname, '..', 'VERSION'), 'utf8')
        .trim()
        .padStart(2, '0'),
    out = process.argv[2] || `out/Cost_Register_Tool_${VER}.html`,
    html = page();
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, html);
  console.log(`${out}: ${(html.length / 1e6).toFixed(2)} MB (no data inside – drop the SAP files)`);
}
module.exports = { page };
