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
const STRONG = ['A4EAA4', 'EAA4B8', 'A4CDEA', 'FFE699', 'C1A4EA', 'A4EAD8', 'EAC1A4', 'D8A4EA', 'A4C3EA', 'EAA4D8', 'C8EAA4', 'EAD8A4'];
const tint = (hex, t) => [0, 2, 4].map((i) => Math.round(parseInt(hex.slice(i, i + 2), 16) + (255 - parseInt(hex.slice(i, i + 2), 16)) * t).toString(16).padStart(2, '0')).join('').toUpperCase();
const UE_FILL = 'FFE699';
// One colour per month (hue steps of the golden angle so neighbouring months differ), used on Data rows, per Month headers and Summary alike
const hsl = (h, sat, l) => { const f = (n) => { const k = (n + h / 30) % 12, a2 = sat * Math.min(l, 1 - l); return l - a2 * Math.max(-1, Math.min(k - 3, 9 - k, 1)); }; return [f(0), f(8), f(4)].map((x) => Math.round(x * 255).toString(16).padStart(2, '0')).join('').toUpperCase(); };
const monthStrong = (i) => hsl((i * 137.5) % 360, 0.55, 0.8), monthLight = (i) => hsl((i * 137.5) % 360, 0.6, 0.93);
const OPEN_C = ['D9D9D9', 'F2F2F2'], PEND_C = ['F4B183', 'FBE5D6'];
const perColors = (periods) => periods.map((p, i) => (p === 'Opening' ? OPEN_C : p === 'Pending' ? PEND_C : [monthStrong(i), monthLight(i)]));
// Data sheet columns: what you read first on the left (date, period, item, qty, rate, amount, codes), references on the right.
function dlayout(def) {
  const cols = [], add = (k, l, w) => cols.push({ k, l, w }), mat = def.id === 'Material', sub = def.id === 'Subcontractor';
  add('date', 'Posting date', 11); add('per', 'Period', 8);
  if (mat) { add('fam', 'Family', 7); add('div', 'Division', 9); add('grp', 'Group', 9); }
  add('item', mat ? 'Material' : sub ? 'Service' : 'Item', mat ? 10 : sub ? 11 : 14); add('desc', 'Description', mat ? 36 : 44);
  if (mat) { add('name', 'Name', 24); add('issue', 'Issue', 8); }
  if (sub) { add('po', 'PO', 11); add('sup', 'Subcontractor', 24); add('cert', 'Cert.', 6); add('cdate', 'Cert. date', 10); add('source', 'Source', 16); }
  if (!mat && !sub) add('wbs', 'WBS element', 18);
  add('qty', 'Qty', 9); add('unit', 'Unit', 5); if (mat || sub) add('rate', 'Rate', 10); add('amt', 'Amount', 13); if (sub) { add('net', 'Net amount', 13); add('vatin', 'VAT in amount', 13); }
  add('pkg', 'PKG', 9); add('mnl', 'MNL', 7); add('cec', 'Cost element code', 12); add('inc', 'Include', 7);
  if (mat) { add('wbs', 'WBS element', 18); add('stock', 'Stock account', 20); }
  if (sub) add('wbs', 'WBS element', 18);
  add('doc', 'Document', 11); add('type', 'Type', 5); add('ce', 'Cost element', 10); add('cen', 'Cost element name', 20);
  if (mat) { add('mdoc', 'Material doc.', 11); add('entry', 'Entry date', 10); add('user', 'User', 9); }
  if (sub) { add('vat', 'VAT', 12); add('vrate', 'VAT rate', 8); add('tax', 'Tax code', 7); add('ctype', 'Contract', 8); add('gross', 'Gross price', 11); }
  add('id', 'Line ID', 22); add('cid', 'Coding ID', 6); add('over', 'Typed over', 6); add('flag', 'Count', 6);
  const D = {}; cols.forEach((c, i) => { D[c.k] = i + 1; });
  return { cols, D, freeze: D.item };
}
// Revenue Data keeps its own fixed layout (the Summary reads its columns C, F, M, N)
const REV = (() => { const l = [['id', 'Line ID', 26], ['date', 'Posting date', 11], ['per', 'Period', 9], ['doc', 'Document', 12], ['type', 'Type', 6], ['ce', 'Cost element', 11], ['cen', 'Cost element name', 24], ['item', 'Item', 14],
  ['desc', 'Description', 40], ['wbs', 'WBS element', 22], ['qty', 'Qty', 10], ['unit', 'Unit', 6], ['amt', 'Amount', 14], ['inc', 'Include', 8]]; const D = {}; l.forEach((c, i) => { D[c[0]] = i + 1; }); return { cols: l.map(([k, lb, w]) => ({ k, l: lb, w })), D }; })();
const BASE = REV, D0 = REV.D;

const CUT = 'Summary!$B$4', CUTLAB = 'Summary!$D$4', VATM = 'Summary!$B$5', VATF = 'Summary!$C$5';
const periodF = (row, D) => `IF(OR($${colL(D.type)}${row}="UE",$${colL(D.type)}${row}="ZB",$${colL(D.type)}${row}="MD",$${colL(D.type)}${row}="HT"),"Opening",IF(OR($${colL(D.date)}${row}="",$${colL(D.date)}${row}>${CUT}),"Pending",CHOOSE(MONTH($${colL(D.date)}${row}),"Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec")&"-"&RIGHT(YEAR($${colL(D.date)}${row}),2)))`;
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
const itemOf = (def, it) => (def.id === 'Material' ? it.vals[3] : def.id === 'Subcontractor' ? it.vals[1] : def.id === 'G&A' ? it.vals[0] + ' · ' + it.vals[1] : it.vals[0]);
const descOf = (def, it) => (def.id === 'Material' ? it.vals[4] : def.id === 'Subcontractor' ? it.vals[2] : def.id === 'G&A' ? '' : it.vals.length > 1 ? it.vals[1] : '');
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
  const def = b.def, isMat = def.id === 'Material', isQ = !!def.qty, isTree = !!def.tree, k = def.cols.length, n = b.items.length, N = b.count, np = model.periods.length, periods = model.periods;
  const { cols: DC, D } = dlayout(def), nD = DC.length;
  // the Subcontractor Coding sheet is laid out exactly as the Subcontract report's Coding sheet (band rows 1-2, header row 4, flat list from row 5, DIV first)
  const toolC = def.id === 'Subcontractor', cod1 = toolC ? 5 : COD_1;
  const C = toolC ? { div: 5, pkg: 6, mnl: 7, ce: 8, st: 9, inc: 10, qty: 11, rate: 12, td: 13, tm: 14, nw: 15, pos: 16, subs: 17, fp: 18, lp: 19, id: 20, key: 21 }
    : isMat ? { pkg: k + 1, mnl: k + 2, ce: k + 3, inc: k + 4, st: k + 5, qty: k + 6, rate: k + 7, td: k + 8, tm: k + 9, nw: k + 10, fp: k + 11, lp: k + 12, ln: k + 13, id: k + 14, key: k + 15 }
    : { pkg: k + 1, mnl: k + 2, ce: k + 3, inc: k + 4, st: k + 5, td: k + 6, tm: k + 7, nw: k + 8, fp: k + 9, lp: k + 10, ln: k + 11, id: k + 12, key: k + 13 };
  const nCod = def.short + ' Coding', nDat = def.short + ' Data', nPm = def.pmName || (def.short + ' per Month');
  const wsC = wb.addWorksheet(nCod, { properties: { tabColor: { argb: 'FF' + GOLD }, outlineProperties: { summaryBelow: false } } });
  const wsP = wb.addWorksheet(nPm, { properties: { tabColor: { argb: 'FF' + def.tab }, outlineProperties: { summaryBelow: false } } });
  const wsD = wb.addWorksheet(nDat, { properties: { tabColor: { argb: 'FF' + GREY } } });
  const rep = model.reportLabel;
  // ---- row positions: Material has a Division header row above each division (the report's tree), the other buckets are flat
  let pr = 0; const heads = []; let cur = null;
  b.items.forEach((it, i) => {
    if (isTree && (!cur || cur.key !== it.dk)) { cur = { key: it.dk, label: it.headLabel, famCode: it.fam, row: COD_1 + pr, items: [] }; heads.push(cur); pr++; }
    it.pmRow = PM_1 + pr; it.crow = toolC ? cod1 + i : COD_1 + pr; it.id = it.crow - cod1 + 1; if (cur) cur.items.push(it); pr++;
  });
  const lastC = toolC ? cod1 + n - 1 : COD_1 + pr - 1, lastD = DATA_1 + N - 1, lastItem = PM_1 + pr - 1;
  // Data rows run by month (Opening, the months, Pending), inside a month in the report's item order
  const pOrd = new Map(periods.map((pp, i) => [pp, i])), flat = []; b.items.forEach((it, ii) => it.lines.forEach((l) => flat.push({ l, it, ii })));
  const sortFlat = () => flat.sort((x, y) => pOrd.get(x.l.per) - pOrd.get(y.l.per) || x.ii - y.ii || (x.l.date < y.l.date ? -1 : x.l.date > y.l.date ? 1 : x.l.id < y.l.id ? -1 : 1)); sortFlat();
  // each item's lines of one month sit together: those blocks are what the per Month and Coding formulas read (small ranges – quick to recalculate)
  flat.forEach((f, i) => { const bl = (f.it.blocks = f.it.blocks || []), last = bl[bl.length - 1]; if (last && last.p === pOrd.get(f.l.per) && last.r2 === DATA_1 + i - 1) last.r2 = DATA_1 + i; else bl.push({ p: pOrd.get(f.l.per), r1: DATA_1 + i, r2: DATA_1 + i }); });
  const blockTerms = (it, dcol, flagCrit, perCrit, only) => (it.blocks || []).filter((bk) => only === undefined || bk.p === only).map((bk) => `SUMIFS(${dr(dcol, bk.r1, bk.r2)},${dr(D.flag, bk.r1, bk.r2)},${flagCrit},${dr(D.per, bk.r1, bk.r2)},${perCrit})`);
  const dr = (col, a = DATA_1, z = lastD) => q(nDat) + '!$' + colL(col) + '$' + a + ':$' + colL(col) + '$' + z;
  const cr = (col) => q(nCod) + '!$' + colL(col) + '$' + cod1 + ':$' + colL(col) + '$' + lastC;
  // colours follow the DIVISION (each division its own colour, in sheet order), as in the Material report
  const divIdx = new Map(); for (const it of b.items) if (isTree && !divIdx.has(it.dk)) divIdx.set(it.dk, divIdx.size);
  const strong = (dk) => STRONG[(divIdx.get(dk) || 0) % STRONG.length], light = (dk) => tint(strong(dk), 0.55);

  // ================= Coding
  let tdSum = 0, fullSum = 0, nFull = 0, nPart = 0, nNot = 0, nEx = 0;
  if (toolC) ({ tdSum, fullSum, nFull, nPart, nNot, nEx } = toolCoding(wsC, b, def, C, cod1, lastC, model, opts, blockTerms, D, nDat));
  else {
  title(wsC, def.id + ' Coding — ' + opts.project, 'Unique list: type PKG, MNL, Cost element code and Include ONCE per item (yellow). Every line on "' + nDat + '" reads its code from here; type over a code on the Data sheet to code a single line differently.' + (isTree ? ' Grouped and largest first; the − / + at the left folds a group.' : ''));
  header(wsC, COD_H, [...def.cols.map((c) => c[0]), 'PKG', 'MNL', 'Cost element code', 'Include', 'Status', ...(isMat ? ['Qty to date', 'Rate'] : []), 'To date', 'This month', 'New', 'First posted', 'Last posted', 'Lines', 'ID', 'Item key'], ['PKG', 'MNL', 'Cost element code', 'Include']);
  b.items.forEach((it) => {
    const row = it.crow, bf = isTree ? light(it.dk) : null, rg = (col) => '$' + colL(col) + row;
    if (isTree) wsC.getRow(row).outlineLevel = 1;
    it.vals.forEach((v, c) => { const x = wsC.getCell(row, c + 1); x.value = v; x.font = font({ bold: c === def.boldCol }); x.border = box; if (bf && c < def.tintCols) x.fill = fill(bf); });
    [['pkg', it.pkg], ['mnl', it.mnl], ['ce', it.ce], ['inc', it.inc]].forEach(([nm, v]) => { const x = wsC.getCell(row, C[nm]); x.value = v === '' ? null : v; x.fill = fill(YELLOW); x.font = font({ bold: true }); x.border = box; x.alignment = { horizontal: 'center' }; });
    const full = it.pkg && it.mnl && it.ce, part = it.pkg || it.ce, status = full ? 'Fully coded' : part ? 'Partly coded' : 'Not coded';
    setF(wsC.getCell(row, C.st), `IF(AND(${rg(C.pkg)}<>"",${rg(C.mnl)}<>"",${rg(C.ce)}<>""),"Fully coded",IF(OR(${rg(C.pkg)}<>"",${rg(C.ce)}<>""),"Partly coded","Not coded"))`, status);
    const incl = it.lines.filter((l) => l.inc === 'Yes'); it.tot = r2(incl.filter((l) => l.per !== 'Pending').reduce((s, l) => s + l.amt, 0)); it.tmv = r2(incl.filter((l) => l.per === rep).reduce((s, l) => s + l.amt, 0));
    setF(wsC.getCell(row, C.td), blockTerms(it, D.amt, '">0"', '"<>Pending"').join('+') || '0', it.tot);
    if (isMat) { const qv = Math.round(incl.filter((l) => l.per !== 'Pending').reduce((s2, l) => s2 + (l.qty || 0), 0) * 1e6) / 1e6, xq = wsC.getCell(row, C.qty), xr = wsC.getCell(row, C.rate);
      setF(xq, blockTerms(it, D.qty, '">0"', '"<>Pending"').join('+') || '0', qv); xq.numFmt = QTY; xq.border = box; xq.font = font();
      setF(xr, `IF(ABS(${colL(C.qty)}${row})<0.000001,"",${colL(C.td)}${row}/${colL(C.qty)}${row})`, Math.abs(qv) < 1e-6 ? '' : it.tot / qv); xr.numFmt = '#,##0.00;[Red]-#,##0.00;""'; xr.border = box; xr.font = font(); }
    setF(wsC.getCell(row, C.tm), blockTerms(it, D.amt, '">0"', CUTLAB).join('+') || '0', it.tmv);
    [[C.nw, it.isNew ? 'New' : null], [C.fp, it.firstP], [C.lp, it.lastP], [C.ln, it.lines.length], [C.id, it.id], [C.key, it.key]].forEach(([c, v]) => { wsC.getCell(row, c).value = v; });
    for (const nm of ['st', 'td', 'tm', 'nw', 'fp', 'lp', 'ln', 'id', 'key']) { const x = wsC.getCell(row, C[nm]); x.border = box; x.font = font(nm === 'key' ? { size: 8, color: { argb: 'FF' + GREY } } : {}); }
    wsC.getCell(row, C.td).numFmt = AMT0; wsC.getCell(row, C.tm).numFmt = AMT0;
    tdSum += it.tot; if (full) { fullSum += it.tot; nFull++; } else if (part) nPart++; else nNot++; if (it.inc === 'No') nEx++;
  });
  for (const h of heads) {   // division rows: coloured by family, (heading only, no numbers)
    const f1 = h.items[0].crow, f2 = h.items[h.items.length - 1].crow, c = strong(h.key);
    for (let col = 1; col <= C.key; col++) { const x = wsC.getCell(h.row, col); x.fill = fill(c); x.border = box; x.font = font({ bold: true }); }
    wsC.getCell(h.row, 1).value = h.label;
    { const st = colL(C.st), a1 = h.items[0].crow, a2 = h.items[h.items.length - 1].crow, nf = h.items.filter((it) => it.pkg && it.mnl && it.ce).length, x = wsC.getCell(h.row, C.st);
      setF(x, `COUNTIF(${st}${a1}:${st}${a2},"Fully coded")&" / "&COUNT(${colL(C.id)}${a1}:${colL(C.id)}${a2})&" coded"`, `${nf} / ${h.items.length} coded`); x.alignment = { horizontal: 'center' }; x.font = font({ bold: true, size: 9 }); }
  }
  [['Items', `COUNT(${cr(C.id)})`, n, '#,##0'], ['Fully coded', `COUNTIF(${cr(C.st)},"Fully coded")`, nFull, '#,##0'], ['Partly coded', `COUNTIF(${cr(C.st)},"Partly coded")`, nPart, '#,##0'],
    ['Not coded', `COUNTIF(${cr(C.st)},"Not coded")`, nNot, '#,##0'], ['Coded share', `IFERROR(SUMIFS(${cr(C.td)},${cr(C.st)},"Fully coded")/SUMIFS(${cr(C.td)},${cr(C.id)},">0"),0)`, tdSum ? fullSum / tdSum : 0, PCT],
    ['Excluded', `COUNTIF(${cr(C.inc)},"No")`, nEx, '#,##0']].forEach(([l, f, v, nf], i) => {
    const a = wsC.getCell(3, i + 1), x = wsC.getCell(4, i + 1); a.value = l; a.font = font({ size: 8, color: { argb: 'FF' + GREY } }); a.fill = fill('DDEBF7'); a.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    setF(x, f, v); x.numFmt = nf; x.font = font({ size: 14, bold: true, color: { argb: 'FF' + NAVY } }); x.fill = fill('DDEBF7'); x.alignment = { horizontal: 'center' };
  });
  wsC.getRow(3).height = 24; def.cols.forEach((c, i) => { wsC.getColumn(i + 1).width = c[1]; });
  [[C.pkg, 12], [C.mnl, 8], [C.ce, 16], [C.inc, 9], [C.st, 13], ...(isMat ? [[C.qty, 12], [C.rate, 11]] : []), [C.td, 15], [C.tm, 16], [C.nw, 6], [C.fp, 10], [C.lp, 10], [C.ln, 7], [C.id, 6], [C.key, 18]].forEach(([c, w]) => { wsC.getColumn(c).width = w; });
  wsC.views = [{ showGridLines: false, state: 'frozen', xSplit: k, ySplit: COD_H }];
  wsC.autoFilter = { from: { row: COD_H, column: 1 }, to: { row: lastC, column: C.key } };
  wsC.dataValidations.add(`${colL(C.inc)}${COD_1}:${colL(C.inc)}${lastC}`, { type: 'list', allowBlank: true, formulae: ['"Yes,No"'] });
  const sc = colL(C.st);
  wsC.addConditionalFormatting({ ref: `${sc}${COD_1}:${sc}${lastC}`, rules: [
    { type: 'expression', formulae: [`$${sc}${COD_1}="Fully coded"`], style: { fill: cfFill('C6EFCE') }, priority: 1 },
    { type: 'expression', formulae: [`$${sc}${COD_1}="Partly coded"`], style: { fill: cfFill('FFEB9C') }, priority: 2 },
    { type: 'expression', formulae: [`$${sc}${COD_1}="Not coded"`], style: { fill: cfFill('FFC7CE') }, priority: 3 }] });
  wsC.addConditionalFormatting({ ref: `A${COD_1}:${colL(C.key)}${lastC}`, rules: [{ type: 'expression', formulae: [`$${colL(C.inc)}${COD_1}="No"`], style: { font: { color: { argb: 'FFA6A6A6' }, strike: true } }, priority: 4 }] });
  }

  // ================= Data
  title(wsD, def.id + ' Data — ' + opts.project, 'One row per CJI3 line. PKG, MNL, Cost element code and Include are FORMULAS reading the item on "' + nCod + '". Type over any of them to code or exclude one line (orange = typed over; Include = No greys the line out and takes it out of all totals).');
  wsD.getCell('A3').value = 'Rows run by month (months alternate light blue-grey / white, a navy line starts each month). Amber = UE document. Orange code = typed over. Grey struck-through = excluded.'; wsD.getCell('A3').font = font({ bold: true, color: { argb: 'FFBF8F00' } });
  header(wsD, DATA_H, DC.map((c) => c.l), ['PKG', 'MNL', 'Cost element code', 'Include']); DC.forEach((c, i) => { wsD.getColumn(i + 1).width = c.w; });
  flat.forEach(({ l, it }, fi) => {
    const row = DATA_1 + fi, cell = (c) => wsD.getCell(row, c), bf = isMat ? light(it.dk) : null; l.row = row;
    const v = { id: l.id, date: new Date(l.date + 'T00:00:00Z'), per: undefined, doc: l.doc, type: l.type, ce: l.ce, cen: l.cen, item: itemOf(def, it), desc: isMat ? l.matDesc : (l.desc || l.poText || l.name || l.header), wbs: l.wbs, po: l.po || null, sup: l.sup || null, cert: l.cert || null, cdate: l.cdate ? new Date(l.cdate + 'T00:00:00Z') : null, source: l.source || null,
      qty: l.qty || null, unit: l.unit || null, amt: l.amt, cid: it.id, fam: it.vals[0], div: it.vals[1], grp: it.vals[2], issue: l.issue || null, stock: l.stock || null, mdoc: l.refDoc, entry: l.created ? new Date(l.created + 'T00:00:00Z') : null, user: l.user || null, name: l.name || null, net: l.net, vatin: 0, vat: l.vat || null, vrate: l.vrate || null, tax: l.tax || null, ctype: l.ctype || null, gross: l.gross || null };
    DC.forEach((c, i) => { if (v[c.k] !== undefined) cell(i + 1).value = v[c.k]; });
    cell(D.amt).numFmt = AMT2; cell(D.qty).numFmt = QTY; cell(D.date).numFmt = 'yyyy-mm-dd';
    if (isQ) { setF(cell(D.rate), `IF(ABS($${colL(D.qty)}${row})<0.000001,"",$${colL(D.amt)}${row}/$${colL(D.qty)}${row})`, Math.abs(l.qty) < 0.000001 ? '' : l.amt / l.qty); cell(D.rate).numFmt = '#,##0.00'; if (isMat) cell(D.entry).numFmt = 'yyyy-mm-dd'; if (D.cdate) cell(D.cdate).numFmt = 'yyyy-mm-dd'; }
    if (D.net) {   // Subcontractor: Amount = Net amount + VAT in amount; VAT follows the Summary switch (B5, date C5)
      cell(D.net).numFmt = AMT2; cell(D.vatin).numFmt = AMT2; cell(D.vat).numFmt = AMT2; cell(D.gross).numFmt = '#,##0.00'; cell(D.vrate).numFmt = '0%';
      const V = `$${colL(D.vat)}${row}`, cd = `$${colL(D.cdate)}${row}`, src = `$${colL(D.source)}${row}`;
      if (l.offsetVat) { const vc = (a, z) => `SUMIFS(${dr(D.vatin, a, z)},${dr(D.source, a, z)},"Opening certificate")`, parts = []; if (row > DATA_1) parts.push(vc(DATA_1, row - 1)); if (row < lastD) parts.push(vc(row + 1, lastD));
        setF(cell(D.vatin), '-(' + parts.join('+') + ')', l.vin); }
      else if (l.source === 'Certificate' || l.source === 'Opening certificate') setF(cell(D.vatin), `IF(${VATM}="Include VAT",${V},IF(${VATM}="Include VAT before date",IF(IF(${cd}="",${src}="Opening certificate",AND(ISNUMBER(${VATF}),${cd}<${VATF})),${V},0),0))`, l.vin);
      else cell(D.vatin).value = 0;
      setF(cell(D.amt), `$${colL(D.net)}${row}+$${colL(D.vatin)}${row}`, l.amt);
    }
    setF(cell(D.per), periodF(row, D), l.per);
    const ix = (col) => `IFERROR(INDEX(${cr(col)},$${colL(D.cid)}${row})&"","")`;
    const put = (dcol, ccol, val, typed) => { if (typed) cell(dcol).value = val; else setF(cell(dcol), ix(ccol), val); };
    put(D.pkg, C.pkg, l.pkg, l.typed.pkg); put(D.mnl, C.mnl, l.mnl, l.typed.mnl); put(D.cec, C.ce, l.cec, l.typed.cec);
    if (l.typed.inc) cell(D.inc).value = l.inc; else setF(cell(D.inc), `IFERROR(IF(INDEX(${cr(C.inc)},$${colL(D.cid)}${row})="No","No","Yes"),"Yes")`, l.inc);
    setF(cell(D.over), `IF(AND($${colL(D.pkg)}${row}=${ix(C.pkg)},$${colL(D.mnl)}${row}=${ix(C.mnl)},$${colL(D.cec)}${row}=${ix(C.ce)}),0,1)`, l.s);
    setF(cell(D.flag), `IF($${colL(D.inc)}${row}="No",0,IF($${colL(D.over)}${row}=1,2,1))`, l.inc === 'No' ? 0 : l.s === 1 ? 2 : 1);
    for (let c = 1; c <= nD; c++) { const x = cell(c); x.border = box; x.font = font({ size: c === D.id ? 8 : 10, bold: c >= D.pkg && c <= D.cec, color: c === D.id ? { argb: 'FF' + GREY } : undefined }); }
    cell(D.per).font = font({ bold: true });
    if (fi === 0 || flat[fi - 1].l.per !== l.per) for (let c = 1; c <= nD; c++) { const x = cell(c); x.border = { ...box, top: { style: 'medium', color: { argb: 'FF' + NAVY } } }; }
  });
  wsD.views = [{ showGridLines: false, state: 'frozen', xSplit: dlayout(def).freeze, ySplit: DATA_H }];
  wsD.autoFilter = { from: { row: DATA_H, column: 1 }, to: { row: lastD, column: nD } };
  wsD.dataValidations.add(`${colL(D.inc)}${DATA_1}:${colL(D.inc)}${lastD}`, { type: 'list', allowBlank: true, formulae: ['"Yes,No"'] });
  wsD.addConditionalFormatting({ ref: `${colL(D.pkg)}${DATA_1}:${colL(D.cec)}${lastD}`, rules: [{ type: 'expression', formulae: [`$${colL(D.over)}${DATA_1}=1`], style: { fill: cfFill(ORANGE), font: { bold: true, color: { argb: 'FFC55A11' } } }, priority: 5 }] });
  wsD.addConditionalFormatting({ ref: `A${DATA_1}:${colL(nD)}${lastD}`, rules: [
    { type: 'expression', formulae: [`$${colL(D.inc)}${DATA_1}="No"`], style: { font: { color: { argb: 'FFA6A6A6' }, strike: true }, fill: cfFill('EDEDED') }, priority: 6 },
    { type: 'expression', formulae: [`$${colL(D.type)}${DATA_1}="UE"`], style: { fill: cfFill(UE_FILL), font: { bold: true } }, priority: 7 }] });
  // ledger banding: months alternate white / light blue-grey, Opening grey, Pending light orange; signals above win; a navy line starts every month
  periods.forEach((pp, i) => { const c = pp === 'Opening' ? 'F2F2F2' : pp === 'Pending' ? 'FBE5D6' : i % 2 === 0 ? 'EEF2F7' : null; if (!c) return;
    wsD.addConditionalFormatting({ ref: `A${DATA_1}:${colL(nD)}${lastD}`, rules: [{ type: 'expression', formulae: [`$${colL(D.per)}${DATA_1}="${pp}"`], style: { fill: cfFill(c) }, priority: 20 + i }] }); });

  // ================= per Month – Material: Qty | Rate | Amount side by side for every month (the report's layout); other buckets: amount only
  const M = isQ ? ['Qty', 'Rate', 'Amount'] : ['Amount'], lead = k + 3, aM = M.length - 1, per = (p) => (p < np ? periods[p] : 'To date');
  const colOf = (bn, p) => (isQ ? lead + 1 + p * 3 + M.indexOf(bn) : lead + 1 + p), pRef = (p) => (isQ ? `${colL(colOf('Qty', p))}$${PM_H - 1}` : `${colL(colOf('Amount', p))}$${PM_H}`);
  const lastCol = colOf('Amount', np);
  title(wsP, def.id + ' per Month — ' + opts.project, 'Live: sums the lines of each item by posting month (counted lines only: Include = Yes and not typed over). Codes follow "' + nCod + '". The rows under the items catch typed-over and excluded lines, so the total always equals the Data sheet.');
  const hdr = [...def.cols.map((c) => c[0]), 'PKG', 'MNL', 'Cost element code']; for (let p = 0; p <= np; p++) for (const bn of M) hdr.push(isQ ? bn : per(p));
  header(wsP, PM_H, hdr);
  const dark = { argb: 'FF1F3864' }, bandC = (p) => (p === np ? NAVY : p === np - 1 ? 'C55A11' : p === 0 ? 'D9D9D9' : p % 2 ? 'BDD7EE' : 'DDEBF7');
  if (isQ) for (let p = 0; p <= np; p++) {
    const c0 = colOf('Qty', p); wsP.mergeCells(PM_H - 1, c0, PM_H - 1, c0 + 2); const x = wsP.getCell(PM_H - 1, c0); x.value = per(p);
    x.font = font({ bold: true, color: p >= np - 1 ? { argb: 'FFFFFFFF' } : dark }); x.fill = fill(bandC(p)); x.alignment = { horizontal: 'center' };
  } else { wsP.mergeCells(PM_H - 1, lead + 1, PM_H - 1, lastCol); const x = wsP.getCell(PM_H - 1, lead + 1); x.value = 'Amount (EGP)'; x.font = font({ bold: true, color: { argb: 'FFFFFFFF' } }); x.fill = fill(NAVY); x.alignment = { horizontal: 'center' };
    for (let p = 0; p <= np; p++) { const h = wsP.getCell(PM_H, colOf('Amount', p)); h.fill = fill(p === np - 1 ? 'C55A11' : NAVY); h.font = font({ bold: true, color: { argb: 'FFFFFFFF' } }); } }
  const sumL = (ls, key) => (key === 'qty' ? Math.round(ls.reduce((s, l) => s + l.qty, 0) * 1e6) / 1e6 : r2(ls.reduce((s, l) => s + l.amt, 0)));
  const inP = (ls, p) => (p < np ? ls.filter((l) => l.per === periods[p]) : ls.filter((l) => l.per !== 'Pending'));
  const todate = (bn, row) => `SUM(${Array.from({ length: np - 1 }, (_, p) => colL(colOf(bn, p)) + row).join(',')})`;
  const fmtOf = (bn) => (bn === 'Qty' ? QTY : bn === 'Rate' ? '#,##0.00' : AMT0);
  // cell writer shared by item rows, division rows and the total row: (row, p, bn) -> formula + value
  const rateCell = (x, row, p, qv, av) => { setF(x, `IFERROR(${colL(colOf('Amount', p))}${row}/${colL(colOf('Qty', p))}${row},"")`, qv ? av / qv : ''); };
  b.items.forEach((it, i) => {
    const row = it.pmRow, bf = isTree ? light(it.dk) : null, own = it.lines.filter((l) => l.inc === 'Yes' && l.s === 0), rd = (c) => dr(c);
    if (isTree) wsP.getRow(row).outlineLevel = 1;
    it.vals.forEach((v, c) => { const x = wsP.getCell(row, c + 1); x.value = v; x.border = box; x.font = font(); if (bf && c < def.tintCols) x.fill = fill(bf); });
    [[C.pkg, it.pkg], [C.mnl, it.mnl], [C.ce, it.ce]].forEach(([cc, v], j) => { const x = wsP.getCell(row, k + 1 + j); setF(x, `${q(nCod)}!${colL(cc)}${it.crow}&""`, v || ''); x.font = font({ bold: true }); x.border = box; });
    for (let p = 0; p <= np; p++) for (const bn of M) {
      const x = wsP.getCell(row, colOf(bn, p)); x.border = box; x.font = font({ bold: p === np }); x.numFmt = fmtOf(bn); 
      if (bn === 'Rate') { rateCell(x, row, p, sumL(inP(own, p), 'qty'), sumL(inP(own, p), 'amt')); continue; }
      const key = bn === 'Qty' ? 'qty' : 'amt', dcol = bn === 'Qty' ? D.qty : D.amt;
      if (p < np) { const t = p === np - 1 ? blockTerms(it, dcol, 1, '"Pending"') : blockTerms(it, dcol, 1, pRef(p), p); setF(x, t.join('+') || '0', sumL(inP(own, p), key)); }
      else setF(x, todate(bn, row), sumL(own, key));
    }
  });
  for (const h of heads) {   // division rows: coloured by family, subtotals of the items below
    const f1 = h.items[0].pmRow, f2 = h.items[h.items.length - 1].pmRow, c = strong(h.key), own = h.items.flatMap((it) => it.lines.filter((l) => l.inc === 'Yes' && l.s === 0)), row = h.row - COD_1 + PM_1;
    for (let col = 1; col <= lastCol; col++) { const x = wsP.getCell(row, col); x.fill = fill(c); x.border = box; x.font = font({ bold: true }); }
    wsP.getCell(row, 1).value = h.label;
  }
  const rHand = lastItem + 2, rTot = rHand + 1, rData = rHand + 2, rDiff = rHand + 3, rExc = rHand + 4, all = b.items.flatMap((it) => it.lines);
  [[rHand, 'Hand-coded lines (typed over on the Data sheet)', false, null], [rTot, 'TOTAL counted', true, NAVY], [rData, 'Data sheet total, counted lines (check)', false, GREY],
    [rDiff, 'Difference (must be 0)', true, RED], [rExc, 'Excluded by user (memo – not in the total)', false, GREY]].forEach(([row, t, bold, col]) => { const x = wsP.getCell(row, 1); x.value = t; x.font = font({ bold, color: col ? { argb: 'FF' + col } : undefined }); });
  for (let p = 0; p <= np; p++) for (const bn of M) {
    const colN = colOf(bn, p), cl = colL(colN), perCrit = p < np ? `,${dr(D.per)},${pRef(p)}` : `,${dr(D.per)},"<>Pending"`, perAll = p < np ? perCrit : '';
    const set = (row, f, v, bold) => { const x = wsP.getCell(row, colN); setF(x, f, v); x.numFmt = fmtOf(bn); x.font = font({ bold }); x.border = box; };
    if (bn === 'Rate') { const cnt = inP(all.filter((l) => l.inc === 'Yes'), p); const x = wsP.getCell(rTot, colN); rateCell(x, rTot, p, sumL(cnt, 'qty'), sumL(cnt, 'amt')); x.numFmt = '#,##0.00'; x.font = font({ bold: true }); x.border = box; continue; }
    const key = bn === 'Qty' ? 'qty' : 'amt', dcol = bn === 'Qty' ? D.qty : D.amt, sel = (f) => inP(all.filter(f), p);
    const hand = sumL(sel((l) => l.inc === 'Yes' && l.s === 1), key), counted = sumL(sel((l) => l.inc === 'Yes'), key);
    // item rows only (the division rows above carry the same numbers again – they are left out of the total)
    const itemRows = b.items.map((it) => cl + it.pmRow);
    const rng = []; let a = null, z = null; for (const it of b.items) { if (a === null) { a = z = it.pmRow; } else if (it.pmRow === z + 1) z = it.pmRow; else { rng.push([a, z]); a = z = it.pmRow; } } if (a !== null) rng.push([a, z]); void itemRows;
    set(rHand, `SUMIFS(${dr(dcol)},${dr(D.flag)},2${perCrit})`, hand);
    set(rTot, `${rng.map(([x1, x2]) => `SUM(${cl}${x1}:${cl}${x2})`).join('+')}+${cl}${rHand}`, counted, true);
    set(rData, `SUMIFS(${dr(dcol)},${dr(D.flag)},">0"${perCrit})`, counted);
    set(rDiff, `ROUND(${cl}${rTot}-${cl}${rData},${key === 'qty' ? 3 : 2})`, 0, true);
    set(rExc, `SUMIFS(${dr(dcol)},${dr(D.flag)},0${perAll})`, sumL(all.filter((l) => l.inc === 'No' && (p < np ? l.per === periods[p] : true)), key));
  }
  def.cols.forEach((c, i) => { wsP.getColumn(i + 1).width = c[1]; }); wsP.getColumn(k + 1).width = 12; wsP.getColumn(k + 2).width = 8; wsP.getColumn(k + 3).width = 16;
  for (let c = lead + 1; c <= lastCol; c++) wsP.getColumn(c).width = isQ ? 12 : 13;
  wsP.views = [{ showGridLines: false, state: 'frozen', xSplit: lead, ySplit: PM_H }];
  wsP.autoFilter = { from: { row: PM_H, column: 1 }, to: { row: lastItem, column: lastCol } };
  if (isQ) for (let p = 0; p < np - 1; p++) { const c0 = colOf('Qty', p), a = colL(c0);
    wsP.addConditionalFormatting({ ref: `${a}${PM_H - 1}:${colL(c0 + 2)}${PM_H - 1}`, rules: [{ type: 'expression', formulae: [`$${a}$${PM_H - 1}=${CUTLAB}`], style: { fill: cfFill(GOLD) }, priority: 20 + p }] });
    wsP.addConditionalFormatting({ ref: `${a}${PM_1}:${colL(c0 + 2)}${lastItem}`, rules: [{ type: 'expression', formulae: [`AND($${a}$${PM_H - 1}=${CUTLAB},$${colL(1)}${PM_1}<>"")`], style: { fill: cfFill('FFF2CC') }, priority: 60 + p }] }); }
  if (!isQ) for (let p = 0; p < np - 1; p++) { const a = colL(colOf('Amount', p)); wsP.addConditionalFormatting({ ref: `${a}${PM_H}`, rules: [{ type: 'expression', formulae: [`${a}$${PM_H}=${CUTLAB}`], style: { fill: cfFill(GOLD) }, priority: 20 + p }] }); }
  const amtCol = (p) => colOf('Amount', p);
  return { cod1, toolC, fullWord: toolC ? 'Coded' : 'Fully coded', def, b, nCod, nDat, nPm, k, n, C, D, lead, lastItem, rHand, rTot, rDiff, rExc, lastC, lastD, amtCol, coded: tdSum ? fullSum / tdSum : 0, nStatus: { nFull, nPart, nNot, nEx } };
}

function revenueSheet(wb, model, opts) {
  const lines = model.lines.filter((l) => l.bucket === 'Revenue').sort((a, b) => (a.date < b.date ? -1 : a.id < b.id ? -1 : 1)); if (!lines.length) return null;
  const ws = wb.addWorksheet('Revenue Data', { properties: { tabColor: { argb: 'FF548235' } } });
  title(ws, 'Revenue Data — ' + opts.project, 'Cost elements starting with 4 (revenue) and Client-Deductions. Signs as CJI3 has them (revenue is a credit = negative). Never netted against cost.');
  header(ws, DATA_H, REV.cols.map((c) => c.l)); REV.cols.forEach((c, i) => { ws.getColumn(i + 1).width = c.w; });
  lines.forEach((l, i) => {
    const row = DATA_1 + i;
    [l.id, new Date(l.date + 'T00:00:00Z'), null, l.doc, l.type, l.ce, l.cen, '', l.name || l.header, l.wbs, null, null, l.amt, 'Yes'].forEach((v, c) => { const x = ws.getCell(row, c + 1); if (c === 2) setF(x, periodF(row, D0), l.per); else x.value = v; if (c === 1) x.numFmt = 'yyyy-mm-dd'; x.border = box; x.font = font({ size: c === 0 ? 8 : 10 }); });
    ws.getCell(row, D0.amt).numFmt = AMT2;
  });
  ws.getCell('A3').value = 'Yellow-orange rows = UE documents (opening balances).'; ws.getCell('A3').font = font({ bold: true, color: { argb: 'FFBF8F00' } });
  const last = DATA_1 + lines.length - 1;
  ws.views = [{ showGridLines: false, state: 'frozen', xSplit: 3, ySplit: DATA_H }]; ws.autoFilter = { from: { row: DATA_H, column: 1 }, to: { row: last, column: 14 } };
  ws.addConditionalFormatting({ ref: `A${DATA_1}:N${last}`, rules: [{ type: 'expression', formulae: [`$E${DATA_1}="UE"`], style: { fill: cfFill(UE_FILL), font: { bold: true } }, priority: 1 }] });
  ws.dataValidations.add(`N${DATA_1}:N${last}`, { type: 'list', allowBlank: true, formulae: ['"Yes,No"'] });
  return { lines, last, name: 'Revenue Data' };
}

// ---- Subcontractor Coding exactly as the Subcontract report's Coding sheet
const DIVS = ['03', '04', '05', '06', '07', '08', '09', '10', '21', '22', '23', '26', '27', '31', '32', '33'];
const divOfService = (svc) => { const m = /^S(\d\d)/i.exec(String(svc || '')); return m && DIVS.includes(m[1]) ? 'DIV ' + m[1] : String(svc || '').startsWith('(') ? '' : 'INDIRECT'; };
const hashBand = (t) => { let h = 0; for (const ch of String(t)) h = (h * 31 + ch.codePointAt(0)) >>> 0; return BAND[h % BAND.length]; };
const monLab = (iso) => (iso ? ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][+iso.slice(5, 7) - 1] + '-' + iso.slice(2, 4) : '');
function toolCoding(ws, b, def, C, R1, lastR, model, opts, blockTerms, D, nDat) {
  const rep = model.reportLabel, rg = (c) => `$${colL(c)}$${R1}:$${colL(c)}$${lastR}`, NUM0 = '#,##0;\\-#,##0;"-"', AMT = '#,##0;[Red]\\-#,##0;"-"';
  const navy = (x, size = 10) => { x.font = font({ bold: true, size, color: { argb: 'FFFFFFFF' } }); x.fill = fill(NAVY); x.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }; x.border = box; };
  let tdSum = 0, fullSum = 0, nFull = 0, nPart = 0, nNot = 0, nEx = 0, nNew = 0, n2po = 0, tdNot = 0, tmNot = 0; const miss = { div: 0, pkg: 0, mnl: 0, ce: 0 };
  b.items.forEach((it) => {
    const r = it.crow, incl = it.lines.filter((l) => l.inc === 'Yes'), cnt = incl.filter((l) => l.per !== 'Pending'), q = Math.round(cnt.reduce((s, l) => s + (l.qty || 0), 0) * 1e6) / 1e6;
    it.tot = r2(cnt.reduce((s, l) => s + l.amt, 0)); it.tmv = r2(incl.filter((l) => l.per === rep).reduce((s, l) => s + l.amt, 0));
    const pos = [...new Set(it.lines.map((l) => l.po).filter((p) => p && !String(p).startsWith('(')))], subs = [...new Set(it.lines.map((l) => l.sup).filter(Boolean))];
    const cds = it.lines.map((l) => l.cdate || l.date).filter(Boolean).sort();
    it.vals.forEach((v, c) => { const x = ws.getCell(r, c + 1); x.value = v; x.font = font(); if (c === 0) x.fill = fill(hashBand(v)); if (c === 1) x.fill = fill(hashBand('s' + v)); });
    [['div', it.div], ['pkg', it.pkg], ['mnl', it.mnl], ['ce', it.ce]].forEach(([k, v]) => { const x = ws.getCell(r, C[k]); x.value = v ? v : null; x.fill = fill(YELLOW); x.font = font({ bold: true }); x.border = box; });
    const full = it.div && it.pkg && it.mnl && it.ce, none = !it.div && !it.pkg && !it.mnl && !it.ce, status = full ? 'Coded' : none ? 'Not coded' : 'Partly coded';
    setF(ws.getCell(r, C.st), `IF(COUNTA(${colL(C.div)}${r}:${colL(C.ce)}${r})=4,"Coded",IF(COUNTA(${colL(C.div)}${r}:${colL(C.ce)}${r})=0,"Not coded","Partly coded"))`, status);
    const x1 = ws.getCell(r, C.qty); setF(x1, blockTerms(it, D.qty, '">0"', '"<>Pending"').join('+') || '0', q); x1.numFmt = '#,##0.00;[Red]\\-#,##0.00;"-"';
    const x2 = ws.getCell(r, C.rate); setF(x2, `IF(ABS(${colL(C.qty)}${r})<0.000001,"",${colL(C.td)}${r}/${colL(C.qty)}${r})`, Math.abs(q) < 1e-6 ? '' : it.tot / q); x2.numFmt = '#,##0.00;[Red]\\-#,##0.00;""';
    const x3 = ws.getCell(r, C.td); setF(x3, blockTerms(it, D.amt, '">0"', '"<>Pending"').join('+') || '0', it.tot); x3.numFmt = AMT; x3.font = font({ bold: true });
    const x4 = ws.getCell(r, C.tm); setF(x4, blockTerms(it, D.amt, '">0"', CUTLAB).join('+') || '0', it.tmv); x4.numFmt = AMT;
    const grey = { color: { argb: 'FF595959' } };
    ws.getCell(r, C.nw).value = it.isNew ? 'New' : null; ws.getCell(r, C.nw).font = font(grey);
    const x5 = ws.getCell(r, C.pos); x5.value = pos.length || null; x5.numFmt = NUM0; x5.font = font({ bold: true }); x5.alignment = { horizontal: 'center' };
    ws.getCell(r, C.subs).value = subs.length ? subs.slice(0, 2).join(' · ') + (subs.length > 2 ? ' +' + (subs.length - 2) : '') : null; ws.getCell(r, C.subs).font = font(grey);
    ws.getCell(r, C.fp).value = monLab(cds[0]) || null; ws.getCell(r, C.lp).value = monLab(cds[cds.length - 1]) || null; ws.getCell(r, C.fp).font = font(grey); ws.getCell(r, C.lp).font = font(grey);
    ws.getCell(r, C.id).value = it.id;
    const inc = ws.getCell(r, C.inc); inc.value = it.inc; inc.fill = fill(YELLOW); inc.font = font({ bold: true }); inc.border = box; inc.alignment = { horizontal: 'center' };
    ws.getCell(r, C.key).value = it.key; ws.getCell(r, C.key).font = font({ size: 8, color: { argb: 'FF' + GREY } });
    tdSum += it.tot; if (full) { fullSum += it.tot; nFull++; } else { if (none) nNot++; else nPart++; tdNot += it.tot; tmNot += it.tmv; }
    if (it.inc === 'No') nEx++; if (it.isNew) nNew++; if (pos.length > 1) n2po++; for (const k of Object.keys(miss)) if (!it[k]) miss[k]++;
  });
  // a navy line where a new Type of works starts (as in the Subcontract report)
  b.items.forEach((it, i) => { if (i && it.vals[0] === b.items[i - 1].vals[0]) return; for (let c = 1; c <= C.key; c++) { const x = ws.getCell(it.crow, c); x.border = { ...(x.border || {}), top: { style: 'medium', color: { argb: 'FF' + NAVY } } }; } });
  // ---- band (rows 1-2)
  const band = [[1, 'Services still to code', `COUNTIF(${rg(C.st)},"Not coded")+COUNTIF(${rg(C.st)},"Partly coded")`, nNot + nPart, NUM0],
    [2, 'Fully coded', `COUNTIF(${rg(C.st)},"Coded")&" of "&(COUNTIF(${rg(C.st)},"Coded")+COUNTIF(${rg(C.st)},"Partly coded")+COUNTIF(${rg(C.st)},"Not coded"))`, `${nFull} of ${nFull + nPart + nNot}`, 'General'],
    [5, 'DIV missing', `COUNTIFS(${rg(C.div)},"",${rg(C.id)},">0")`, miss.div, NUM0], [6, 'PKG missing', `COUNTIFS(${rg(C.pkg)},"",${rg(C.id)},">0")`, miss.pkg, NUM0],
    [7, 'MNL missing', `COUNTIFS(${rg(C.mnl)},"",${rg(C.id)},">0")`, miss.mnl, NUM0], [8, 'Cost element missing', `COUNTIFS(${rg(C.ce)},"",${rg(C.id)},">0")`, miss.ce, NUM0],
    [9, 'Coded – share of To date', `IFERROR(SUMIFS(${rg(C.td)},${rg(C.st)},"Coded")/SUM(${rg(C.td)}),0)`, tdSum ? fullSum / tdSum : 0, '0.0%;[Red]\\-0.0%;"-"'],
    [C.td, 'To date not fully coded', `SUMIFS(${rg(C.td)},${rg(C.st)},"Partly coded")+SUMIFS(${rg(C.td)},${rg(C.st)},"Not coded")`, r2(tdNot), AMT],
    [C.tm, 'This month not fully coded', `SUMIFS(${rg(C.tm)},${rg(C.st)},"Partly coded")+SUMIFS(${rg(C.tm)},${rg(C.st)},"Not coded")`, r2(tmNot), AMT],
    [C.nw, 'New', `COUNTIF(${rg(C.nw)},"New")`, nNew, NUM0], [C.pos, '2+ POs', `COUNTIF(${rg(C.pos)},">1")`, n2po, NUM0]];
  for (const [c, l, f, v, nf] of band) { const a = ws.getCell(1, c); a.value = l; navy(a, 9); const x = ws.getCell(2, c); setF(x, f, v); x.numFmt = nf; x.font = font({ bold: true, size: 13, color: { argb: 'FF' + NAVY } }); x.alignment = { horizontal: 'center' }; x.border = box; }
  ws.mergeCells(1, 2, 1, 3); ws.mergeCells(2, 2, 2, 3); ws.getRow(1).height = 30; ws.getRow(2).height = 24;
  ws.addConditionalFormatting({ ref: 'A2', rules: [{ type: 'cellIs', operator: 'greaterThan', formulae: ['0'], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFFCE4D6' } } }, priority: 1 }, { type: 'cellIs', operator: 'equal', formulae: ['0'], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFE2EFDA' } } }, priority: 2 }] });
  ws.addConditionalFormatting({ ref: 'E2:H2', rules: [{ type: 'cellIs', operator: 'greaterThan', formulae: ['0'], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFFCE4D6' } } }, priority: 3 }, { type: 'cellIs', operator: 'equal', formulae: ['0'], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFE2EFDA' } } }, priority: 4 }] });
  // ---- note + header (rows 3-4)
  const nt = ws.getCell(3, 1); nt.value = 'Live – the band follows the codes typed below · a service = one Service code + description · type DIV, PKG, MNL and Cost element once per service (yellow); every line on "' + nDat + '" reads its code from here · Include = No takes the service out of all totals.'; nt.font = font({ size: 9, color: { argb: 'FF595959' } });
  const hd = ['Type of works (SAP)', 'Service', 'Description', 'Unit', 'DIV', 'PKG', 'MNL', 'Cost element', 'Status', 'Include', 'Qty to date', 'Rate', 'To date', null, 'New', 'POs', 'Subcontractors', 'First certified', 'Last certified', 'ID', 'Item key'];
  hd.forEach((h, i) => { const x = ws.getCell(4, i + 1); if (h === null) setF(x, `"This month · "&${CUTLAB}`, 'This month · ' + rep); else x.value = h; navy(x); if (i + 1 >= C.div && i + 1 <= C.ce || i + 1 === C.inc) x.fill = fill(GOLD); });
  ws.getRow(4).height = 30;
  // ---- formats, widths, filter, freeze, CF
  [26, 11, 46, 7, 11, 9, 8, 14, 13, 8, 12, 11, 14, 14, 6, 6, 30, 10, 10, 6, 18].forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  ws.views = [{ showGridLines: false, state: 'frozen', xSplit: 4, ySplit: 4 }]; ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: lastR, column: C.key } };
  ws.dataValidations.add(`${colL(C.inc)}${R1}:${colL(C.inc)}${lastR}`, { type: 'list', allowBlank: true, formulae: ['"Yes,No"'] });
  ws.dataValidations.add(`${colL(C.div)}${R1}:${colL(C.div)}${lastR}`, { type: 'list', allowBlank: true, showErrorMessage: false, formulae: ['"' + [...DIVS.map((d) => 'DIV ' + d), 'DIV 0302', 'INDIRECT'].join(',') + '"'] });
  const cf = (ref, f, c, pr) => ws.addConditionalFormatting({ ref, rules: [{ type: 'expression', formulae: [f], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FF' + c } } }, priority: pr }] });
  cf(`${colL(C.div)}${R1}:${colL(C.ce)}${lastR}`, `AND($${colL(C.id)}${R1}<>"",LEN(TRIM(${colL(C.div)}${R1}))=0)`, 'F8CBAD', 5);
  const st = colL(C.st);
  cf(`${st}${R1}:${st}${lastR}`, `$${st}${R1}="Coded"`, 'E2EFDA', 6); cf(`${st}${R1}:${st}${lastR}`, `$${st}${R1}="Partly coded"`, 'FFF2CC', 7); cf(`${st}${R1}:${st}${lastR}`, `$${st}${R1}="Not coded"`, 'FCE4D6', 8);
  ws.addConditionalFormatting({ ref: `A${R1}:${colL(C.key)}${lastR}`, rules: [{ type: 'expression', formulae: [`$${colL(C.inc)}${R1}="No"`], style: { font: { color: { argb: 'FFA6A6A6' }, strike: true } }, priority: 9 }] });
  return { tdSum, fullSum, nFull, nPart, nNot, nEx };
}

module.exports = { divOfService, VATM, VATF, CUT, CUTLAB, applyCodes, bucketSheets, revenueSheet, ExcelJS, AMT0, AMT2, QTY, PCT, NAVY, GOLD, GREY, YELLOW, RED, BAND, fill, font, box, q, setF, title, header, itemOf, descOf, DATA_H, DATA_1, COD_1, PM_H, PM_1, dlayout, D: D0, UE_FILL };
