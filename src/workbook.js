'use strict';
// The bucket sheets: <Bucket> Coding (unique list), <Bucket> Data (one row per CJI3 line) and <Bucket> per Month (allocation per month).
const ExcelJS = require('exceljs');
const { r2, r3, colL } = require('./util');
const { famOf, FAMILY } = require('./groups');

const NAVY = '1F3864', GOLD = 'BF8F00', GREY = '7F7F7F', YELLOW = 'FFFFCC', ORANGE = 'F8CBAD', RED = 'C00000';
const BAND = ['CBF6CB', 'F6CBD7', 'CBE4F6', 'FFF2CC', 'D8CBF6', 'C1F6E2', 'F6D2C1', 'EBADEB'];
const BLOCK = { Qty: 'A4EAA4', Rate: 'EAA4B8', Amount: 'A4CDEA' };
const AMT0 = '#,##0;[Red]-#,##0;"-"', AMT2 = '#,##0.00;[Red]-#,##0.00;"-"', QTY = '#,##0.###;[Red]-#,##0.###;"-"', PCT = '0.0%';
const fill = (c) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + c } });
const cfFill = (c) => ({ type: 'pattern', pattern: 'solid', bgColor: { argb: 'FF' + c } });
const font = (o = {}) => ({ name: 'Arial', size: 10, ...o });
const thin = { style: 'thin', color: { argb: 'FFD9D9D9' } }, box = { top: thin, bottom: thin, left: thin, right: thin };
const q = (n) => "'" + n + "'";
const setF = (cell, f, result) => { cell.value = process.env.NO_RESULT ? { formula: f } : { formula: f, result }; };
const DATA_H = 4, DATA_1 = 5, COD_H = 6, COD_1 = 7, PM_H = 5, PM_1 = 6;
const STRONG = ['A4EAA4', 'EAA4B8', 'A4CDEA', 'FFE699', 'C1A4EA', 'A4EAD8', 'EAC1A4', 'D8A4EA'];
const UE_FILL = 'FFE699';
// Data sheet columns. Material gets the group tree, the issue type (from MB51) and the material document.
function dlayout(def) {
  const cols = [], add = (k, l, w) => cols.push({ k, l, w }), mat = def.id === 'Material';
  add('id', 'Line ID', 26); add('date', 'Posting date', 11); add('per', 'Period', 9); add('doc', 'Document', 12); add('type', 'Type', 6); add('ce', 'Cost element', 11); add('cen', 'Cost element name', 24);
  if (mat) { add('fam', 'Family', 22); add('div', 'Division', 22); add('grp', 'Material group', 26); }
  add('item', mat ? 'Material' : 'Item', 14); add('desc', 'Description', 40);
  if (mat) { add('issue', 'Issue type', 17); add('mvt', 'Movement', 9); add('mvtText', 'Movement text', 22); }
  add('wbs', 'WBS element', 22); add('qty', 'Qty', 10); add('unit', 'Unit', 6); add('amt', 'Amount', 14);
  add('pkg', 'PKG', 10); add('mnl', 'MNL', 8); add('cec', 'Cost element code', 14); add('inc', 'Include', 8); add('cid', 'Coding ID', 7); add('over', 'Typed over', 7);
  if (mat) { add('mdoc', 'Material doc.', 12); add('supplier', 'Subcontractor (SAP code)', 14); }
  const D = {}; cols.forEach((c, i) => { D[c.k] = i + 1; });
  return { cols, D };
}
const BASE = dlayout({ id: '' }), D0 = BASE.D;

function title(ws, t, note) {
  ws.getCell('A1').value = t; ws.getCell('A1').font = font({ size: 14, bold: true, color: { argb: 'FF' + NAVY } });
  ws.getCell('A2').value = note; ws.getCell('A2').font = font({ color: { argb: 'FF' + GREY } });
}
function header(ws, row, labels, gold = []) {
  labels.forEach((h, i) => {
    const c = ws.getCell(row, i + 1); c.value = h; const g = gold.includes(h);
    c.font = font({ bold: true, color: { argb: g ? 'FF000000' : 'FFFFFFFF' } }); c.fill = fill(g ? 'FFD966' : NAVY);
    c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }; c.border = box;
  });
  ws.getRow(row).height = 30;
}
const itemOf = (def, it) => (def.id === 'Material' ? it.vals[3] : def.id === 'G&A' ? it.vals[0] + ' · ' + it.vals[1] : it.vals[0]);
const descOf = (def, it) => (def.id === 'Material' ? it.vals[4] : def.id === 'G&A' ? '' : it.vals.length > 1 ? it.vals[1] : '');
const bandOf = (def, it) => (def.id === 'Material' ? BAND[Math.max(0, FAMILY.findIndex(([f]) => f === famOf(it.group))) % BAND.length] : null);

// the code and include every line ends up with: its item's, unless it was typed over last month
function applyCodes(bucket, over) {
  const m = over && over.get(bucket.def.id);
  for (const it of bucket.items) for (const l of it.lines) {
    l.pkg = it.pkg; l.mnl = it.mnl; l.cec = it.ce; l.inc = it.inc === 'No' ? 'No' : 'Yes'; l.typed = {};
    const o = m && m.get(l.id); if (!o) continue;
    if (o.pkg !== undefined && o.pkg !== it.pkg) { l.pkg = o.pkg; l.typed.pkg = 1; }
    if (o.mnl !== undefined && o.mnl !== it.mnl) { l.mnl = o.mnl; l.typed.mnl = 1; }
    if (o.ce !== undefined && o.ce !== it.ce) { l.cec = o.ce; l.typed.cec = 1; }
    if (o.inc !== undefined && o.inc !== l.inc) { l.inc = o.inc === 'No' ? 'No' : 'Yes'; l.typed.inc = 1; }
    l.s = 0;
  }
  for (const it of bucket.items) for (const l of it.lines) l.s = l.pkg !== it.pkg || l.mnl !== it.mnl || l.cec !== it.ce ? 1 : 0;
}

function bucketSheets(wb, b, model, opts) {
  const def = b.def, isMat = def.id === 'Material', k = def.cols.length, n = b.items.length, N = b.count, np = model.periods.length, periods = model.periods;
  const { cols: DC, D } = dlayout(def), nD = DC.length;
  const C = { pkg: k + 1, mnl: k + 2, ce: k + 3, inc: k + 4, st: k + 5, td: k + 6, tm: k + 7, nw: k + 8, fp: k + 9, lp: k + 10, ln: k + 11, id: k + 12, key: k + 13 };
  const nCod = def.short + ' Coding', nDat = def.short + ' Data', nPm = def.short + ' per Month';
  const wsC = wb.addWorksheet(nCod, { properties: { tabColor: { argb: 'FF' + GOLD }, outlineProperties: { summaryBelow: false } } });
  const wsP = wb.addWorksheet(nPm, { properties: { tabColor: { argb: 'FF' + def.tab }, outlineProperties: { summaryBelow: false } } });
  const wsD = wb.addWorksheet(nDat, { properties: { tabColor: { argb: 'FF' + GREY } } });
  const rep = model.reportLabel;
  // ---- row positions: Material has a Division header row above each division (the report's tree), the other buckets are flat
  let crow = COD_1; const heads = []; let cur = null;
  b.items.forEach((it) => {
    if (isMat && (!cur || cur.key !== it.dk)) { cur = { key: it.dk, label: it.vals[1], fam: it.vals[0], famCode: it.fam, row: crow, items: [] }; heads.push(cur); crow++; }
    it.crow = crow; it.id = crow - COD_1 + 1; it.pmRow = PM_1 + (crow - COD_1); if (cur) cur.items.push(it); crow++;
  });
  const lastC = crow - 1, lastD = DATA_1 + N - 1, lastItem = PM_1 + (lastC - COD_1);
  let r = DATA_1; for (const it of b.items) { it.r1 = r; r += it.lines.length; it.r2 = r - 1; }
  const dr = (col, a = DATA_1, z = lastD) => q(nDat) + '!$' + colL(col) + '$' + a + ':$' + colL(col) + '$' + z;
  const cr = (col) => q(nCod) + '!$' + colL(col) + '$' + COD_1 + ':$' + colL(col) + '$' + lastC;
  const famIdx = (code) => Math.max(0, FAMILY.findIndex(([f]) => f === code)), light = (code) => BAND[famIdx(code) % BAND.length], strong = (code) => STRONG[famIdx(code) % STRONG.length];

  // ================= Coding
  title(wsC, def.id + ' Coding — ' + opts.project, 'Unique list: type PKG, MNL, Cost element code and Include ONCE per item (yellow). Every line on "' + nDat + '" reads its code from here; type over a code on the Data sheet to code a single line differently.' + (isMat ? ' Family › division › material group, largest first; the − / + at the left folds a division.' : ''));
  header(wsC, COD_H, [...def.cols.map((c) => c[0]), 'PKG', 'MNL', 'Cost element code', 'Include', 'Status', 'To date', 'This month · ' + rep, 'New', 'First posted', 'Last posted', 'Lines', 'ID', 'Item key'], ['PKG', 'MNL', 'Cost element code', 'Include']);
  let tdSum = 0, fullSum = 0, nFull = 0, nPart = 0, nNot = 0, nEx = 0;
  b.items.forEach((it) => {
    const row = it.crow, bf = isMat ? light(it.fam) : null, rg = (col) => '$' + colL(col) + row;
    if (isMat) wsC.getRow(row).outlineLevel = 1;
    it.vals.forEach((v, c) => { const x = wsC.getCell(row, c + 1); x.value = v; x.font = font({ bold: isMat ? c === 3 : c === 0 }); x.border = box; if (bf && c < 3) x.fill = fill(bf); });
    [['pkg', it.pkg], ['mnl', it.mnl], ['ce', it.ce], ['inc', it.inc]].forEach(([nm, v]) => { const x = wsC.getCell(row, C[nm]); x.value = v === '' ? null : v; x.fill = fill(YELLOW); x.font = font({ bold: true }); x.border = box; x.alignment = { horizontal: 'center' }; });
    const full = it.pkg && it.mnl && it.ce, part = it.pkg || it.ce, status = full ? 'Fully coded' : part ? 'Partly coded' : 'Not coded';
    setF(wsC.getCell(row, C.st), `IF(AND(${rg(C.pkg)}<>"",${rg(C.mnl)}<>"",${rg(C.ce)}<>""),"Fully coded",IF(OR(${rg(C.pkg)}<>"",${rg(C.ce)}<>""),"Partly coded","Not coded"))`, status);
    const incl = it.lines.filter((l) => l.inc === 'Yes'); it.tot = r2(incl.reduce((s, l) => s + l.amt, 0)); it.tmv = r2(incl.filter((l) => l.per === rep).reduce((s, l) => s + l.amt, 0));
    setF(wsC.getCell(row, C.td), `SUMIFS(${dr(D.amt, it.r1, it.r2)},${dr(D.inc, it.r1, it.r2)},"Yes")`, it.tot);
    setF(wsC.getCell(row, C.tm), `SUMIFS(${dr(D.amt, it.r1, it.r2)},${dr(D.inc, it.r1, it.r2)},"Yes",${dr(D.per, it.r1, it.r2)},"${rep}")`, it.tmv);
    [[C.nw, it.isNew ? 'New' : null], [C.fp, it.firstP], [C.lp, it.lastP], [C.ln, it.lines.length], [C.id, it.id], [C.key, it.key]].forEach(([c, v]) => { wsC.getCell(row, c).value = v; });
    for (const nm of ['st', 'td', 'tm', 'nw', 'fp', 'lp', 'ln', 'id', 'key']) { const x = wsC.getCell(row, C[nm]); x.border = box; x.font = font(nm === 'key' ? { size: 8, color: { argb: 'FF' + GREY } } : {}); }
    wsC.getCell(row, C.td).numFmt = AMT0; wsC.getCell(row, C.tm).numFmt = AMT0;
    tdSum += it.tot; if (full) { fullSum += it.tot; nFull++; } else if (part) nPart++; else nNot++; if (it.inc === 'No') nEx++;
  });
  for (const h of heads) {   // division rows: coloured by family, with subtotals
    const f1 = h.items[0].crow, f2 = h.items[h.items.length - 1].crow, c = strong(h.famCode);
    for (let col = 1; col <= C.key; col++) { const x = wsC.getCell(h.row, col); x.fill = fill(c); x.border = box; x.font = font({ bold: true }); }
    wsC.getCell(h.row, 1).value = h.fam; wsC.getCell(h.row, 2).value = h.label;
    for (const [nm, key] of [['td', 'tot'], ['tm', 'tmv']]) { const x = wsC.getCell(h.row, C[nm]); setF(x, `SUM(${colL(C[nm])}${f1}:${colL(C[nm])}${f2})`, r2(h.items.reduce((s, it) => s + it[key], 0))); x.numFmt = AMT0; }
    setF(wsC.getCell(h.row, C.ln), `SUM(${colL(C.ln)}${f1}:${colL(C.ln)}${f2})`, h.items.reduce((s, it) => s + it.lines.length, 0));
  }
  [['Items', `COUNT(${cr(C.id)})`, n, '#,##0'], ['Fully coded', `COUNTIF(${cr(C.st)},"Fully coded")`, nFull, '#,##0'], ['Partly coded', `COUNTIF(${cr(C.st)},"Partly coded")`, nPart, '#,##0'],
    ['Not coded', `COUNTIF(${cr(C.st)},"Not coded")`, nNot, '#,##0'], ['Coded share of To date', `IFERROR(SUMIFS(${cr(C.td)},${cr(C.st)},"Fully coded")/SUMIFS(${cr(C.td)},${cr(C.id)},">0"),0)`, tdSum ? fullSum / tdSum : 0, PCT],
    ['Items excluded', `COUNTIF(${cr(C.inc)},"No")`, nEx, '#,##0']].forEach(([l, f, v, nf], i) => {
    const a = wsC.getCell(3, i + 1), x = wsC.getCell(4, i + 1); a.value = l; a.font = font({ size: 9, color: { argb: 'FF' + GREY } }); a.fill = fill('DDEBF7'); a.alignment = { horizontal: 'center' };
    setF(x, f, v); x.numFmt = nf; x.font = font({ size: 14, bold: true, color: { argb: 'FF' + NAVY } }); x.fill = fill('DDEBF7'); x.alignment = { horizontal: 'center' };
  });
  def.cols.forEach((c, i) => { wsC.getColumn(i + 1).width = c[1]; });
  [[C.pkg, 12], [C.mnl, 8], [C.ce, 16], [C.inc, 9], [C.st, 13], [C.td, 15], [C.tm, 16], [C.nw, 6], [C.fp, 10], [C.lp, 10], [C.ln, 7], [C.id, 6], [C.key, 18]].forEach(([c, w]) => { wsC.getColumn(c).width = w; });
  wsC.views = [{ showGridLines: false, state: 'frozen', xSplit: k, ySplit: COD_H }];
  wsC.autoFilter = { from: { row: COD_H, column: 1 }, to: { row: lastC, column: C.key } };
  wsC.dataValidations.add(`${colL(C.inc)}${COD_1}:${colL(C.inc)}${lastC}`, { type: 'list', allowBlank: true, formulae: ['"Yes,No"'] });
  const sc = colL(C.st);
  wsC.addConditionalFormatting({ ref: `${sc}${COD_1}:${sc}${lastC}`, rules: [
    { type: 'expression', formulae: [`$${sc}${COD_1}="Fully coded"`], style: { fill: cfFill('C6EFCE') }, priority: 1 },
    { type: 'expression', formulae: [`$${sc}${COD_1}="Partly coded"`], style: { fill: cfFill('FFEB9C') }, priority: 2 },
    { type: 'expression', formulae: [`$${sc}${COD_1}="Not coded"`], style: { fill: cfFill('FFC7CE') }, priority: 3 }] });
  wsC.addConditionalFormatting({ ref: `A${COD_1}:${colL(C.key)}${lastC}`, rules: [{ type: 'expression', formulae: [`$${colL(C.inc)}${COD_1}="No"`], style: { font: { color: { argb: 'FFA6A6A6' }, strike: true } }, priority: 4 }] });

  // ================= Data
  title(wsD, def.id + ' Data — ' + opts.project, 'One row per CJI3 line. PKG, MNL, Cost element code and Include are FORMULAS reading the item on "' + nCod + '". Type over any of them to code or exclude one line (orange = typed over; Include = No greys the line out and takes it out of all totals).');
  wsD.getCell('A3').value = 'Yellow-orange rows = UE documents (opening balances brought in from the previous system / year).'; wsD.getCell('A3').font = font({ bold: true, color: { argb: 'FFBF8F00' } });
  header(wsD, DATA_H, DC.map((c) => c.l), ['PKG', 'MNL', 'Cost element code', 'Include']); DC.forEach((c, i) => { wsD.getColumn(i + 1).width = c.w; });
  b.items.forEach((it) => it.lines.forEach((l, j) => {
    const row = it.r1 + j, cell = (c) => wsD.getCell(row, c), bf = isMat ? light(it.fam) : null;
    const v = { id: l.id, date: l.date, per: l.per, doc: l.doc, type: l.type, ce: l.ce, cen: l.cen, item: itemOf(def, it), desc: isMat ? l.matDesc : (l.poText || l.name || l.header), wbs: l.wbs,
      qty: l.qty || null, unit: l.unit || null, amt: l.amt, cid: it.id, fam: it.vals[0], div: it.vals[1], grp: it.vals[2], issue: l.issue || null, mvt: l.mvt || null, mvtText: l.mvtText || null, mdoc: l.refDoc, supplier: l.supplier || null };
    DC.forEach((c, i) => { if (v[c.k] !== undefined) cell(i + 1).value = v[c.k]; });
    cell(D.amt).numFmt = AMT2; cell(D.qty).numFmt = QTY;
    const ix = (col) => `IFERROR(INDEX(${cr(col)},$${colL(D.cid)}${row})&"","")`;
    const put = (dcol, ccol, val, typed) => { if (typed) cell(dcol).value = val; else setF(cell(dcol), ix(ccol), val); };
    put(D.pkg, C.pkg, l.pkg, l.typed.pkg); put(D.mnl, C.mnl, l.mnl, l.typed.mnl); put(D.cec, C.ce, l.cec, l.typed.cec);
    if (l.typed.inc) cell(D.inc).value = l.inc; else setF(cell(D.inc), `IFERROR(IF(INDEX(${cr(C.inc)},$${colL(D.cid)}${row})="No","No","Yes"),"Yes")`, l.inc);
    setF(cell(D.over), `IF(AND($${colL(D.pkg)}${row}=${ix(C.pkg)},$${colL(D.mnl)}${row}=${ix(C.mnl)},$${colL(D.cec)}${row}=${ix(C.ce)}),0,1)`, l.s);
    for (let c = 1; c <= nD; c++) { const x = cell(c); x.border = box; x.font = font({ size: c === 1 ? 8 : 10, bold: c >= D.pkg && c <= D.cec, color: c === 1 ? { argb: 'FF' + GREY } : undefined }); }
    if (bf) for (const kx of ['fam', 'div', 'grp']) cell(D[kx]).fill = fill(bf);
  }));
  wsD.views = [{ showGridLines: false, state: 'frozen', xSplit: 3, ySplit: DATA_H }];
  wsD.autoFilter = { from: { row: DATA_H, column: 1 }, to: { row: lastD, column: nD } };
  wsD.dataValidations.add(`${colL(D.inc)}${DATA_1}:${colL(D.inc)}${lastD}`, { type: 'list', allowBlank: true, formulae: ['"Yes,No"'] });
  wsD.addConditionalFormatting({ ref: `${colL(D.pkg)}${DATA_1}:${colL(D.cec)}${lastD}`, rules: [{ type: 'expression', formulae: [`$${colL(D.over)}${DATA_1}=1`], style: { fill: cfFill(ORANGE), font: { bold: true, color: { argb: 'FFC55A11' } } }, priority: 5 }] });
  wsD.addConditionalFormatting({ ref: `A${DATA_1}:${colL(nD)}${lastD}`, rules: [
    { type: 'expression', formulae: [`$${colL(D.inc)}${DATA_1}="No"`], style: { font: { color: { argb: 'FFA6A6A6' }, strike: true }, fill: cfFill('EDEDED') }, priority: 6 },
    { type: 'expression', formulae: [`$${colL(D.type)}${DATA_1}="UE"`], style: { fill: cfFill(UE_FILL), font: { bold: true } }, priority: 7 }] });

  // ================= per Month – Material: Qty | Rate | Amount side by side for every month (the report's layout); other buckets: amount only
  const M = isMat ? ['Qty', 'Rate', 'Amount'] : ['Amount'], lead = k + 3, aM = M.length - 1, per = (p) => (p < np ? periods[p] : 'To date');
  const colOf = (bn, p) => (isMat ? lead + 1 + p * 3 + M.indexOf(bn) : lead + 1 + p), pRef = (p) => (isMat ? `${colL(colOf('Qty', p))}$${PM_H - 1}` : `${colL(colOf('Amount', p))}$${PM_H}`);
  const lastCol = colOf('Amount', np);
  title(wsP, def.id + ' per Month — ' + opts.project, 'Live: sums the lines of each item by posting month (counted lines only: Include = Yes and not typed over). Codes follow "' + nCod + '". The rows under the items catch typed-over and excluded lines, so the total always equals the Data sheet.');
  const hdr = [...def.cols.map((c) => c[0]), 'PKG', 'MNL', 'Cost element code']; for (let p = 0; p <= np; p++) for (const bn of M) hdr.push(isMat ? bn : per(p));
  header(wsP, PM_H, hdr);
  if (isMat) for (let p = 0; p <= np; p++) {
    const c0 = colOf('Qty', p); wsP.mergeCells(PM_H - 1, c0, PM_H - 1, c0 + 2); const x = wsP.getCell(PM_H - 1, c0); x.value = per(p);
    const isRep = p === np - 1, col = p === np ? NAVY : isRep ? GOLD : 'A6A6A6'; x.font = font({ bold: true, color: { argb: 'FFFFFFFF' } }); x.fill = fill(col); x.alignment = { horizontal: 'center' };
    M.forEach((bn, bi) => { const h = wsP.getCell(PM_H, c0 + bi); h.fill = fill(BLOCK[bn]); h.font = font({ bold: true }); });
  } else { wsP.mergeCells(PM_H - 1, lead + 1, PM_H - 1, lastCol); const x = wsP.getCell(PM_H - 1, lead + 1); x.value = 'Amount (EGP)'; x.font = font({ bold: true }); x.fill = fill(BLOCK.Amount); x.alignment = { horizontal: 'center' };
    for (let p = 0; p <= np; p++) { const h = wsP.getCell(PM_H, colOf('Amount', p)); h.fill = fill(BLOCK.Amount); h.font = font({ bold: true }); } }
  const sumL = (ls, key) => (key === 'qty' ? r3(ls.reduce((s, l) => s + l.qty, 0)) : r2(ls.reduce((s, l) => s + l.amt, 0)));
  const inP = (ls, p) => (p < np ? ls.filter((l) => l.per === periods[p]) : ls);
  const repP = np - 1, todate = (bn, row) => `SUM(${Array.from({ length: np }, (_, p) => colL(colOf(bn, p)) + row).join(',')})`;
  const fmtOf = (bn) => (bn === 'Qty' ? QTY : bn === 'Rate' ? '#,##0.00' : AMT0);
  // cell writer shared by item rows, division rows and the total row: (row, p, bn) -> formula + value
  const rateCell = (x, row, p, qv, av) => { setF(x, `IFERROR(${colL(colOf('Amount', p))}${row}/${colL(colOf('Qty', p))}${row},"")`, qv ? av / qv : ''); };
  b.items.forEach((it, i) => {
    const row = it.pmRow, bf = isMat ? light(it.fam) : null, own = it.lines.filter((l) => l.inc === 'Yes' && l.s === 0), rd = (c) => dr(c, it.r1, it.r2);
    if (isMat) wsP.getRow(row).outlineLevel = 1;
    it.vals.forEach((v, c) => { const x = wsP.getCell(row, c + 1); x.value = v; x.border = box; x.font = font(); if (bf && c < 3) x.fill = fill(bf); });
    [[C.pkg, it.pkg], [C.mnl, it.mnl], [C.ce, it.ce]].forEach(([cc, v], j) => { const x = wsP.getCell(row, k + 1 + j); setF(x, `${q(nCod)}!${colL(cc)}${it.crow}&""`, v || ''); x.font = font({ bold: true }); x.border = box; });
    for (let p = 0; p <= np; p++) for (const bn of M) {
      const x = wsP.getCell(row, colOf(bn, p)); x.border = box; x.font = font({ bold: p === np }); x.numFmt = fmtOf(bn); if (isMat && p === repP) x.fill = fill('FFF2CC');
      if (bn === 'Rate') { rateCell(x, row, p, sumL(inP(own, p), 'qty'), sumL(inP(own, p), 'amt')); continue; }
      const key = bn === 'Qty' ? 'qty' : 'amt', dcol = bn === 'Qty' ? D.qty : D.amt;
      if (p < np) setF(x, `SUMIFS(${rd(dcol)},${rd(D.over)},0,${rd(D.inc)},"Yes",${rd(D.per)},${pRef(p)})`, sumL(inP(own, p), key));
      else setF(x, todate(bn, row), sumL(own, key));
    }
  });
  for (const h of heads) {   // division rows: coloured by family, subtotals of the items below
    const f1 = h.items[0].pmRow, f2 = h.items[h.items.length - 1].pmRow, c = strong(h.famCode), own = h.items.flatMap((it) => it.lines.filter((l) => l.inc === 'Yes' && l.s === 0)), row = h.row - COD_1 + PM_1;
    for (let col = 1; col <= lastCol; col++) { const x = wsP.getCell(row, col); x.fill = fill(c); x.border = box; x.font = font({ bold: true }); }
    wsP.getCell(row, 1).value = h.fam; wsP.getCell(row, 2).value = h.label;
    for (let p = 0; p <= np; p++) for (const bn of M) {
      const x = wsP.getCell(row, colOf(bn, p)); x.numFmt = fmtOf(bn);
      if (bn === 'Rate') { rateCell(x, row, p, sumL(inP(own, p), 'qty'), sumL(inP(own, p), 'amt')); continue; }
      setF(x, `SUM(${colL(colOf(bn, p))}${f1}:${colL(colOf(bn, p))}${f2})`, sumL(inP(own, p), bn === 'Qty' ? 'qty' : 'amt'));
    }
  }
  const rHand = lastItem + 2, rTot = rHand + 1, rData = rHand + 2, rDiff = rHand + 3, rExc = rHand + 4, all = b.items.flatMap((it) => it.lines);
  [[rHand, 'Hand-coded lines (typed over on the Data sheet)', false, null], [rTot, 'TOTAL counted', true, NAVY], [rData, 'Data sheet total, counted lines (check)', false, GREY],
    [rDiff, 'Difference (must be 0)', true, RED], [rExc, 'Excluded by user (memo – not in the total)', false, GREY]].forEach(([row, t, bold, col]) => { const x = wsP.getCell(row, 1); x.value = t; x.font = font({ bold, color: col ? { argb: 'FF' + col } : undefined }); });
  for (let p = 0; p <= np; p++) for (const bn of M) {
    const colN = colOf(bn, p), cl = colL(colN), perCrit = p < np ? `,${dr(D.per)},${pRef(p)}` : '';
    const set = (row, f, v, bold) => { const x = wsP.getCell(row, colN); setF(x, f, v); x.numFmt = fmtOf(bn); x.font = font({ bold }); x.border = box; };
    if (bn === 'Rate') { const cnt = inP(all.filter((l) => l.inc === 'Yes'), p); const x = wsP.getCell(rTot, colN); rateCell(x, rTot, p, sumL(cnt, 'qty'), sumL(cnt, 'amt')); x.numFmt = '#,##0.00'; x.font = font({ bold: true }); x.border = box; continue; }
    const key = bn === 'Qty' ? 'qty' : 'amt', dcol = bn === 'Qty' ? D.qty : D.amt, sel = (f) => inP(all.filter(f), p);
    const hand = sumL(sel((l) => l.inc === 'Yes' && l.s === 1), key), counted = sumL(sel((l) => l.inc === 'Yes'), key), exc = sumL(sel((l) => l.inc === 'No'), key);
    // item rows only (the division rows above carry the same numbers again – they are left out of the total)
    const itemRows = b.items.map((it) => cl + it.pmRow);
    const rng = []; let a = null, z = null; for (const it of b.items) { if (a === null) { a = z = it.pmRow; } else if (it.pmRow === z + 1) z = it.pmRow; else { rng.push([a, z]); a = z = it.pmRow; } } if (a !== null) rng.push([a, z]); void itemRows;
    set(rHand, `SUMIFS(${dr(dcol)},${dr(D.over)},1,${dr(D.inc)},"Yes"${perCrit})`, hand);
    set(rTot, `${rng.map(([x1, x2]) => `SUM(${cl}${x1}:${cl}${x2})`).join('+')}+${cl}${rHand}`, counted, true);
    set(rData, `SUMIFS(${dr(dcol)},${dr(D.inc)},"Yes"${perCrit})`, counted);
    set(rDiff, `ROUND(${cl}${rTot}-${cl}${rData},${key === 'qty' ? 3 : 2})`, 0, true);
    set(rExc, `SUMIFS(${dr(dcol)},${dr(D.inc)},"No"${perCrit})`, exc);
  }
  def.cols.forEach((c, i) => { wsP.getColumn(i + 1).width = c[1]; }); wsP.getColumn(k + 1).width = 12; wsP.getColumn(k + 2).width = 8; wsP.getColumn(k + 3).width = 16;
  for (let c = lead + 1; c <= lastCol; c++) wsP.getColumn(c).width = isMat ? 12 : 13;
  wsP.views = [{ showGridLines: false, state: 'frozen', xSplit: lead, ySplit: PM_H }];
  wsP.autoFilter = { from: { row: PM_H, column: 1 }, to: { row: lastItem, column: lastCol } };
  const amtCol = (p) => colOf('Amount', p);
  return { def, b, nCod, nDat, nPm, k, n, C, D, lead, lastItem, rHand, rTot, rDiff, rExc, lastC, lastD, amtCol, nStatus: { nFull, nPart, nNot, nEx } };
}

function revenueSheet(wb, model, opts) {
  const lines = model.lines.filter((l) => l.bucket === 'Revenue').sort((a, b) => (a.date < b.date ? -1 : a.id < b.id ? -1 : 1)); if (!lines.length) return null;
  const ws = wb.addWorksheet('Revenue Data', { properties: { tabColor: { argb: 'FF548235' } } });
  title(ws, 'Revenue Data — ' + opts.project, 'Cost elements starting with 4 (revenue) and Client-Deductions. Signs as CJI3 has them (revenue is a credit = negative). Never netted against cost.');
  header(ws, DATA_H, [...BASE.cols.slice(0, 13).map((c) => c.l), 'Include']); BASE.cols.slice(0, 13).forEach((c, i) => { ws.getColumn(i + 1).width = c.w; }); ws.getColumn(14).width = 8;
  lines.forEach((l, i) => {
    const row = DATA_1 + i;
    [l.id, l.date, l.per, l.doc, l.type, l.ce, l.cen, '', l.name || l.header, l.wbs, null, null, l.amt, 'Yes'].forEach((v, c) => { const x = ws.getCell(row, c + 1); x.value = v; x.border = box; x.font = font({ size: c === 0 ? 8 : 10 }); });
    ws.getCell(row, D0.amt).numFmt = AMT2;
  });
  ws.getCell('A3').value = 'Yellow-orange rows = UE documents (opening balances).'; ws.getCell('A3').font = font({ bold: true, color: { argb: 'FFBF8F00' } });
  const last = DATA_1 + lines.length - 1;
  ws.views = [{ showGridLines: false, state: 'frozen', xSplit: 3, ySplit: DATA_H }]; ws.autoFilter = { from: { row: DATA_H, column: 1 }, to: { row: last, column: 14 } };
  ws.addConditionalFormatting({ ref: `A${DATA_1}:N${last}`, rules: [{ type: 'expression', formulae: [`$E${DATA_1}="UE"`], style: { fill: cfFill(UE_FILL), font: { bold: true } }, priority: 1 }] });
  ws.dataValidations.add(`N${DATA_1}:N${last}`, { type: 'list', allowBlank: true, formulae: ['"Yes,No"'] });
  return { lines, last, name: 'Revenue Data' };
}

module.exports = { applyCodes, bucketSheets, revenueSheet, ExcelJS, AMT0, AMT2, QTY, PCT, NAVY, GOLD, GREY, YELLOW, RED, BAND, fill, font, box, q, setF, title, header, itemOf, descOf, DATA_H, DATA_1, COD_1, PM_H, PM_1, dlayout, D: D0, UE_FILL };
