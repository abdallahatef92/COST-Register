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
const D = { id: 1, date: 2, per: 3, doc: 4, type: 5, ce: 6, cen: 7, item: 8, desc: 9, wbs: 10, qty: 11, unit: 12, amt: 13, pkg: 14, mnl: 15, cec: 16, inc: 17, cid: 18, over: 19 };
const DCOLS = [['Line ID', 26], ['Posting date', 11], ['Period', 9], ['Document', 12], ['Type', 6], ['Cost element', 11], ['Cost element name', 24], ['Item', 14], ['Description', 40], ['WBS element', 22],
  ['Qty', 10], ['Unit', 6], ['Amount', 14], ['PKG', 10], ['MNL', 8], ['Cost element code', 14], ['Include', 8], ['Coding ID', 7], ['Typed over', 7]];

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
  const def = b.def, k = def.cols.length, n = b.items.length, N = b.count, np = model.periods.length, periods = model.periods;
  const C = { pkg: k + 1, mnl: k + 2, ce: k + 3, inc: k + 4, st: k + 5, td: k + 6, tm: k + 7, nw: k + 8, fp: k + 9, lp: k + 10, ln: k + 11, id: k + 12, key: k + 13 };
  const nCod = def.short + ' Coding', nDat = def.short + ' Data', nPm = def.short + ' per Month';
  const wsC = wb.addWorksheet(nCod, { properties: { tabColor: { argb: 'FF' + GOLD } } });
  const wsP = wb.addWorksheet(nPm, { properties: { tabColor: { argb: 'FF' + def.tab } } });
  const wsD = wb.addWorksheet(nDat, { properties: { tabColor: { argb: 'FF' + GREY } } });
  const lastC = COD_1 + n - 1, lastD = DATA_1 + N - 1;
  let r = DATA_1; for (const it of b.items) { it.r1 = r; r += it.lines.length; it.r2 = r - 1; }
  const dr = (col, a = DATA_1, z = lastD) => q(nDat) + '!$' + colL(col) + '$' + a + ':$' + colL(col) + '$' + z;
  const cr = (col) => q(nCod) + '!$' + colL(col) + '$' + COD_1 + ':$' + colL(col) + '$' + lastC;
  const rep = model.reportLabel;

  // ================= Coding
  title(wsC, def.id + ' Coding — ' + opts.project, 'Unique list: type PKG, MNL, Cost element code and Include ONCE per item (yellow). Every line on "' + nDat + '" reads its code from here; type over a code on the Data sheet to code a single line differently.');
  header(wsC, COD_H, [...def.cols.map((c) => c[0]), 'PKG', 'MNL', 'Cost element code', 'Include', 'Status', 'To date', 'This month · ' + rep, 'New', 'First posted', 'Last posted', 'Lines', 'ID', 'Item key'], ['PKG', 'MNL', 'Cost element code', 'Include']);
  let tdSum = 0, fullSum = 0, nFull = 0, nPart = 0, nNot = 0, nEx = 0;
  b.items.forEach((it, i) => {
    const row = COD_1 + i, bf = bandOf(def, it), rg = (col) => '$' + colL(col) + row;
    it.vals.forEach((v, c) => { const x = wsC.getCell(row, c + 1); x.value = v; x.font = font({ bold: def.id === 'Material' ? c === 3 : c === 0 }); x.border = box; if (bf && c < 3) x.fill = fill(bf); });
    [['pkg', it.pkg], ['mnl', it.mnl], ['ce', it.ce], ['inc', it.inc]].forEach(([nm, v]) => { const x = wsC.getCell(row, C[nm]); x.value = v === '' ? null : v; x.fill = fill(YELLOW); x.font = font({ bold: true }); x.border = box; x.alignment = { horizontal: 'center' }; });
    const full = it.pkg && it.mnl && it.ce, part = it.pkg || it.ce, status = full ? 'Fully coded' : part ? 'Partly coded' : 'Not coded';
    setF(wsC.getCell(row, C.st), `IF(AND(${rg(C.pkg)}<>"",${rg(C.mnl)}<>"",${rg(C.ce)}<>""),"Fully coded",IF(OR(${rg(C.pkg)}<>"",${rg(C.ce)}<>""),"Partly coded","Not coded"))`, status);
    const incl = it.lines.filter((l) => l.inc === 'Yes'), tot = r2(incl.reduce((s, l) => s + l.amt, 0)), tmv = r2(incl.filter((l) => l.per === rep).reduce((s, l) => s + l.amt, 0));
    setF(wsC.getCell(row, C.td), `SUMIFS(${dr(D.amt, it.r1, it.r2)},${dr(D.inc, it.r1, it.r2)},"Yes")`, tot);
    setF(wsC.getCell(row, C.tm), `SUMIFS(${dr(D.amt, it.r1, it.r2)},${dr(D.inc, it.r1, it.r2)},"Yes",${dr(D.per, it.r1, it.r2)},"${rep}")`, tmv);
    [[C.nw, it.isNew ? 'New' : null], [C.fp, it.firstP], [C.lp, it.lastP], [C.ln, it.lines.length], [C.id, it.id], [C.key, it.key]].forEach(([c, v]) => { wsC.getCell(row, c).value = v; });
    for (const nm of ['st', 'td', 'tm', 'nw', 'fp', 'lp', 'ln', 'id', 'key']) { const x = wsC.getCell(row, C[nm]); x.border = box; x.font = font(nm === 'key' ? { size: 8, color: { argb: 'FF' + GREY } } : {}); }
    wsC.getCell(row, C.td).numFmt = AMT0; wsC.getCell(row, C.tm).numFmt = AMT0;
    tdSum += tot; if (full) { fullSum += tot; nFull++; } else if (part) nPart++; else nNot++; if (it.inc === 'No') nEx++;
  });
  [['Items', `COUNT(${cr(C.id)})`, n, '#,##0'], ['Fully coded', `COUNTIF(${cr(C.st)},"Fully coded")`, nFull, '#,##0'], ['Partly coded', `COUNTIF(${cr(C.st)},"Partly coded")`, nPart, '#,##0'],
    ['Not coded', `COUNTIF(${cr(C.st)},"Not coded")`, nNot, '#,##0'], ['Coded share of To date', `IFERROR(SUMIFS(${cr(C.td)},${cr(C.st)},"Fully coded")/SUM(${cr(C.td)}),0)`, tdSum ? fullSum / tdSum : 0, PCT],
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
  header(wsD, DATA_H, DCOLS.map((c) => c[0]), ['PKG', 'MNL', 'Cost element code', 'Include']); DCOLS.forEach((c, i) => { wsD.getColumn(i + 1).width = c[1]; });
  b.items.forEach((it) => it.lines.forEach((l, j) => {
    const row = it.r1 + j, cell = (c) => wsD.getCell(row, c);
    [l.id, l.date, l.per, l.doc, l.type, l.ce, l.cen, itemOf(def, it), def.id === 'Material' ? l.matDesc : (l.poText || l.name || l.header), l.wbs, l.qty || null, l.unit || null, l.amt].forEach((v, c) => { cell(c + 1).value = v; });
    cell(D.amt).numFmt = AMT2; cell(D.qty).numFmt = QTY;
    const ix = (col) => `IFERROR(INDEX(${cr(col)},$${colL(D.cid)}${row})&"","")`;
    const put = (dcol, ccol, val, typed) => { if (typed) cell(dcol).value = val; else setF(cell(dcol), ix(ccol), val); };
    put(D.pkg, C.pkg, l.pkg, l.typed.pkg); put(D.mnl, C.mnl, l.mnl, l.typed.mnl); put(D.cec, C.ce, l.cec, l.typed.cec);
    if (l.typed.inc) cell(D.inc).value = l.inc; else setF(cell(D.inc), `IFERROR(IF(INDEX(${cr(C.inc)},$${colL(D.cid)}${row})="No","No","Yes"),"Yes")`, l.inc);
    cell(D.cid).value = it.id;
    setF(cell(D.over), `IF(AND($${colL(D.pkg)}${row}=${ix(C.pkg)},$${colL(D.mnl)}${row}=${ix(C.mnl)},$${colL(D.cec)}${row}=${ix(C.ce)}),0,1)`, l.s);
    for (let c = 1; c <= DCOLS.length; c++) { const x = cell(c); x.border = box; x.font = font({ size: c === 1 ? 8 : 10, bold: c >= D.pkg && c <= D.cec, color: c === 1 ? { argb: 'FF' + GREY } : undefined }); }
  }));
  wsD.views = [{ showGridLines: false, state: 'frozen', xSplit: 3, ySplit: DATA_H }];
  wsD.autoFilter = { from: { row: DATA_H, column: 1 }, to: { row: lastD, column: DCOLS.length } };
  wsD.dataValidations.add(`${colL(D.inc)}${DATA_1}:${colL(D.inc)}${lastD}`, { type: 'list', allowBlank: true, formulae: ['"Yes,No"'] });
  wsD.addConditionalFormatting({ ref: `${colL(D.pkg)}${DATA_1}:${colL(D.cec)}${lastD}`, rules: [{ type: 'expression', formulae: [`$${colL(D.over)}${DATA_1}=1`], style: { fill: cfFill(ORANGE), font: { bold: true, color: { argb: 'FFC55A11' } } }, priority: 5 }] });
  wsD.addConditionalFormatting({ ref: `A${DATA_1}:${colL(D.over)}${lastD}`, rules: [{ type: 'expression', formulae: [`$${colL(D.inc)}${DATA_1}="No"`], style: { font: { color: { argb: 'FFA6A6A6' }, strike: true }, fill: cfFill('EDEDED') }, priority: 6 }] });

  // ================= per Month
  const blocks = def.qty ? ['Qty', 'Rate', 'Amount'] : ['Amount'], lead = k + 3, c0of = (bi) => lead + 1 + bi * (np + 1), aBlock = blocks.length - 1;
  title(wsP, def.id + ' per Month — ' + opts.project, 'Live: sums the lines of each item by posting month (counted lines only: Include = Yes and not typed over). Codes follow "' + nCod + '". The rows under the items catch typed-over and excluded lines, so the total always equals the Data sheet.');
  header(wsP, PM_H, [...def.cols.map((c) => c[0]), 'PKG', 'MNL', 'Cost element code', ...blocks.flatMap(() => [...periods, 'To date'])]);
  blocks.forEach((bn, bi) => {
    const c0 = c0of(bi); wsP.mergeCells(PM_H - 1, c0, PM_H - 1, c0 + np); const x = wsP.getCell(PM_H - 1, c0);
    x.value = bn === 'Amount' ? 'Amount (EGP)' : bn === 'Qty' ? 'Quantity' : 'Rate (amount ÷ quantity)'; x.font = font({ bold: true }); x.fill = fill(BLOCK[bn]); x.alignment = { horizontal: 'center' };
    for (let p = 0; p <= np; p++) { const h = wsP.getCell(PM_H, c0 + p); h.fill = fill(BLOCK[bn]); h.font = font({ bold: true }); }
  });
  const lastItem = PM_1 + n - 1, sumL = (ls, key) => (key === 'qty' ? r3(ls.reduce((s, l) => s + l.qty, 0)) : r2(ls.reduce((s, l) => s + l.amt, 0)));
  const inP = (ls, p) => (p < np ? ls.filter((l) => l.per === periods[p]) : ls);
  b.items.forEach((it, i) => {
    const row = PM_1 + i, bf = bandOf(def, it), own = it.lines.filter((l) => l.inc === 'Yes' && l.s === 0), rd = (c) => dr(c, it.r1, it.r2);
    it.vals.forEach((v, c) => { const x = wsP.getCell(row, c + 1); x.value = v; x.border = box; x.font = font(); if (bf && c < 3) x.fill = fill(bf); });
    [[C.pkg, it.pkg], [C.mnl, it.mnl], [C.ce, it.ce]].forEach(([cc, v], j) => { const x = wsP.getCell(row, k + 1 + j); setF(x, `${q(nCod)}!${colL(cc)}${COD_1 + i}&""`, v || ''); x.font = font({ bold: true }); x.border = box; });
    blocks.forEach((bn, bi) => {
      const c0 = c0of(bi);
      for (let p = 0; p <= np; p++) {
        const x = wsP.getCell(row, c0 + p); x.border = box; x.font = font({ bold: p === np }); x.numFmt = bn === 'Qty' ? QTY : AMT0;
        if (bn === 'Rate') {
          const qv = sumL(inP(own, p), 'qty'), av = sumL(inP(own, p), 'amt');
          setF(x, `IFERROR(${colL(c0of(aBlock) + p)}${row}/${colL(c0of(0) + p)}${row},"")`, qv ? av / qv : ''); x.numFmt = '#,##0.00'; continue;
        }
        const key = bn === 'Qty' ? 'qty' : 'amt', dcol = bn === 'Qty' ? D.qty : D.amt;
        if (p < np) setF(x, `SUMIFS(${rd(dcol)},${rd(D.over)},0,${rd(D.inc)},"Yes",${rd(D.per)},${colL(c0 + p)}$${PM_H})`, sumL(inP(own, p), key));
        else setF(x, `SUM(${colL(c0)}${row}:${colL(c0 + np - 1)}${row})`, sumL(own, key));
      }
    });
  });
  const rHand = lastItem + 2, rTot = rHand + 1, rData = rHand + 2, rDiff = rHand + 3, rExc = rHand + 4, all = b.items.flatMap((it) => it.lines);
  [[rHand, 'Hand-coded lines (typed over on the Data sheet)', false, null], [rTot, 'TOTAL counted', true, NAVY], [rData, 'Data sheet total, counted lines (check)', false, GREY],
    [rDiff, 'Difference (must be 0)', true, RED], [rExc, 'Excluded by user (memo – not in the total)', false, GREY]].forEach(([row, t, bold, col]) => { const x = wsP.getCell(row, 1); x.value = t; x.font = font({ bold, color: col ? { argb: 'FF' + col } : undefined }); });
  blocks.forEach((bn, bi) => {
    const c0 = c0of(bi);
    for (let p = 0; p <= np; p++) {
      const colN = c0 + p, cl = colL(colN), perCrit = p < np ? `,${dr(D.per)},${cl}$${PM_H}` : '';
      const set = (row, f, v, bold) => { const x = wsP.getCell(row, colN); setF(x, f, v); x.numFmt = bn === 'Qty' ? QTY : AMT0; x.font = font({ bold }); x.border = box; };
      if (bn === 'Rate') {
        const cnt = inP(all.filter((l) => l.inc === 'Yes'), p), qv = sumL(cnt, 'qty'), av = sumL(cnt, 'amt'), x = wsP.getCell(rTot, colN);
        setF(x, `IFERROR(${colL(c0of(aBlock) + p)}${rTot}/${colL(c0of(0) + p)}${rTot},"")`, qv ? av / qv : ''); x.numFmt = '#,##0.00'; x.font = font({ bold: true }); x.border = box; continue;
      }
      const key = bn === 'Qty' ? 'qty' : 'amt', dcol = bn === 'Qty' ? D.qty : D.amt, sel = (f) => inP(all.filter(f), p);
      const hand = sumL(sel((l) => l.inc === 'Yes' && l.s === 1), key), counted = sumL(sel((l) => l.inc === 'Yes'), key), exc = sumL(sel((l) => l.inc === 'No'), key);
      set(rHand, `SUMIFS(${dr(dcol)},${dr(D.over)},1,${dr(D.inc)},"Yes"${perCrit})`, hand);
      set(rTot, `SUM(${cl}${PM_1}:${cl}${lastItem})+${cl}${rHand}`, counted, true);
      set(rData, `SUMIFS(${dr(dcol)},${dr(D.inc)},"Yes"${perCrit})`, counted);
      set(rDiff, `ROUND(${cl}${rTot}-${cl}${rData},${key === 'qty' ? 3 : 2})`, 0, true);
      set(rExc, `SUMIFS(${dr(dcol)},${dr(D.inc)},"No"${perCrit})`, exc);
    }
  });
  def.cols.forEach((c, i) => { wsP.getColumn(i + 1).width = c[1]; }); wsP.getColumn(k + 1).width = 12; wsP.getColumn(k + 2).width = 8; wsP.getColumn(k + 3).width = 16;
  for (let c = lead + 1; c <= lead + blocks.length * (np + 1); c++) wsP.getColumn(c).width = 13;
  wsP.views = [{ showGridLines: false, state: 'frozen', xSplit: lead, ySplit: PM_H }];
  wsP.autoFilter = { from: { row: PM_H, column: 1 }, to: { row: lastItem, column: lead + blocks.length * (np + 1) } };
  const amtCol = (p) => c0of(aBlock) + p;
  return { def, b, nCod, nDat, nPm, k, n, C, lead, lastItem, rHand, rTot, rDiff, rExc, lastC, lastD, amtCol, nStatus: { nFull, nPart, nNot, nEx } };
}

function revenueSheet(wb, model, opts) {
  const lines = model.lines.filter((l) => l.bucket === 'Revenue').sort((a, b) => (a.date < b.date ? -1 : a.id < b.id ? -1 : 1)); if (!lines.length) return null;
  const ws = wb.addWorksheet('Revenue Data', { properties: { tabColor: { argb: 'FF548235' } } });
  title(ws, 'Revenue Data — ' + opts.project, 'Cost elements starting with 4 (revenue) and Client-Deductions. Signs as CJI3 has them (revenue is a credit = negative). Never netted against cost.');
  header(ws, DATA_H, [...DCOLS.slice(0, 13).map((c) => c[0]), 'Include']); DCOLS.slice(0, 13).forEach((c, i) => { ws.getColumn(i + 1).width = c[1]; }); ws.getColumn(14).width = 8;
  lines.forEach((l, i) => {
    const row = DATA_1 + i;
    [l.id, l.date, l.per, l.doc, l.type, l.ce, l.cen, '', l.name || l.header, l.wbs, null, null, l.amt, 'Yes'].forEach((v, c) => { const x = ws.getCell(row, c + 1); x.value = v; x.border = box; x.font = font({ size: c === 0 ? 8 : 10 }); });
    ws.getCell(row, D.amt).numFmt = AMT2;
  });
  const last = DATA_1 + lines.length - 1;
  ws.views = [{ showGridLines: false, state: 'frozen', xSplit: 3, ySplit: DATA_H }]; ws.autoFilter = { from: { row: DATA_H, column: 1 }, to: { row: last, column: 14 } };
  ws.dataValidations.add(`N${DATA_1}:N${last}`, { type: 'list', allowBlank: true, formulae: ['"Yes,No"'] });
  return { lines, last, name: 'Revenue Data' };
}

module.exports = { applyCodes, bucketSheets, revenueSheet, ExcelJS, AMT0, AMT2, QTY, PCT, NAVY, GOLD, GREY, YELLOW, RED, BAND, fill, font, box, q, setF, title, header, itemOf, descOf, DATA_H, DATA_1, COD_1, PM_H, PM_1, D, DCOLS };
