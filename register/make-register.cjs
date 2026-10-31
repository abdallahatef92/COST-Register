/* CJI3 export -> project cost register workbook (live Excel).
 *   node register/make-register.cjs <cji3.xlsx> <out.xlsx> [--preview] [--cache lines.json]
 *
 * One sheet per cost bucket holds that bucket's CJI3 lines, each with PKG / MNL / Cost element code. The Expenses sheet is the overall
 * project cost: one row per PKG + MNL + Cost element, allocated per month (Opening, Previous, Jan..Dec, To date), all SUMIFS on the bucket
 * sheets and driven by the cut date on the Summary. Revenue is its own sheet and is never netted against cost.
 */
'use strict';
const fs = require('fs');
const XLSX = require('xlsx'), ExcelJS = require('exceljs');
const R = require('../src/reports.js'), B = require('./buckets.js');

const args = process.argv.slice(2).filter((a) => !a.startsWith('--') && !/\.json$/.test(a));
const [inFile, outFile] = args, PREVIEW = process.argv.includes('--preview');
const cacheIx = process.argv.indexOf('--cache'), CACHE = cacheIx > 0 ? process.argv[cacheIx + 1] : null;
if (!inFile || !outFile) { console.error('usage: node register/make-register.cjs <cji3.xlsx> <out.xlsx> [--preview] [--cache lines.json]'); process.exit(2); }

// ------------------------------------------------------------------ 1. read CJI3
function readLines() {
  if (CACHE && fs.existsSync(CACHE)) return JSON.parse(fs.readFileSync(CACHE, 'utf8'));
  console.log('reading', inFile);
  const wb = XLSX.read(fs.readFileSync(inFile), { type: 'buffer', dense: true, cellFormula: false, cellStyles: false, cellNF: false, cellHTML: false });
  const aoa = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: null });
  const hit = R.detect(aoa);
  if (!hit || hit.def.id !== 'cji3') throw new Error('the file is not a CJI3 export');
  const def = hit.def, o = R.prepare(def, aoa, hit.headerRow, { sourceFile: inFile });
  const ix = Object.fromEntries(def.all.map((c, i) => [c.col, i]));
  const lines = o.rows.map((v) => {
    const g = (k) => v[ix[k]], ym = g('period_ym') || '';
    return { id: `${g('document_number')}|${g('posting_row')}|${g('fiscal_year')}`, date: g('posting_date'), pk: ym ? +ym.slice(0, 4) * 100 + +ym.slice(5, 7) : 0, open: g('is_opening'), kind: g('kind'),
      dt: g('document_type') || '', doc: g('document_number'), ce: g('cost_element') || '', ceName: g('cost_element_name') || '', wbs: g('wbs_element') || '',
      text: g('name') || g('document_header_text') || '', vendor: g('name_of_offsetting_account') || '', po: g('purchasing_document') || '', mat: g('material') || '',
      qty: g('total_quantity'), unit: g('posted_unit_of_meas') || '', amt: g('amount') };
  });
  const out = { lines, footer: o.footer, project: R.projectOf(o.proj), subtotals: o.blankRows, sum: o.sumAmount };
  if (CACHE) fs.writeFileSync(CACHE, JSON.stringify(out));
  return out;
}
const SRC = readLines(), LINES = SRC.lines;
console.log(LINES.length, 'lines, project', SRC.project);

// ------------------------------------------------------------------ 2. bucket + coding of every line
const bySheet = new Map(B.SHEETS.map((s) => [s.bucket, []]));
for (const l of LINES) {
  const c = B.classify({ dt: l.dt, ceName: l.ceName, ce: l.ce });
  l.bucket = c.bucket; l.nature = c.nature;
  const isRev = l.bucket === 'Revenue';
  l.pkg = isRev ? '' : B.wbsGroup(l.wbs); l.mnl = isRev ? '' : B.mnlOf(l.nature); l.cec = isRev ? '' : l.ce; l.source = isRev ? '' : 'Rule';
  bySheet.get(l.bucket).push(l);
}
for (const arr of bySheet.values()) arr.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0) || String(a.doc).localeCompare(String(b.doc)));
const costLines = LINES.filter((l) => l.bucket !== 'Revenue');
const months = [...new Set(costLines.map((l) => l.pk))].sort((a, b) => a - b);
const lastPK = months[months.length - 1], REPY = Math.floor(lastPK / 100), CUTPK = lastPK;
const monthEnd = (pk) => new Date(Date.UTC(Math.floor(pk / 100), pk % 100, 0));
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const mLab = (pk) => MON[(pk % 100) - 1] + '-' + String(Math.floor(pk / 100)).slice(2);
const PROJECT = SRC.project ? 'I-' + SRC.project : 'Project';

// ------------------------------------------------------------------ 3. aggregates (cached results written next to every formula)
// bucket of an amount: 0 opening, 1 previous (before the report year), 2..13 months of the report year, null = after the cut / other year
function slot(l) { if (l.open) return 0; if (l.pk < REPY * 100 + 1) return 1; if (Math.floor(l.pk / 100) === REPY && l.pk <= CUTPK) return 1 + (l.pk % 100); return null; }
const zero = () => new Array(14).fill(0);
const addTo = (arr, l) => { const s = slot(l); if (s != null) arr[s] += l.amt; };
const byBucket = new Map(B.SHEETS.map((s) => [s.bucket, zero()]));
const combos = new Map();
for (const l of LINES) {
  addTo(byBucket.get(l.bucket), l);
  if (l.bucket === 'Revenue') continue;
  const k = [l.pkg, l.mnl, l.cec].join('\u0001');
  let c = combos.get(k); if (!c) combos.set(k, (c = { pkg: l.pkg, mnl: l.mnl, cec: l.cec, names: new Map(), v: zero() }));
  c.names.set(l.ceName, (c.names.get(l.ceName) || 0) + Math.abs(l.amt)); addTo(c.v, l);
}
const sumArr = (a) => a.reduce((x, y) => x + y, 0);

// ------------------------------------------------------------------ 4. workbook helpers (same visual standard as the Material / Subcontract reports)
const C = { navy: '1F3864', blue: '2F5597', gold: 'BF8F00', light: 'DDEBF7', cur: 'FFF2CC', grid: 'BFBFBF', edit: 'FFFFCC', ok: 'E2EFDA', warn: 'FCE4D6', muted: '595959', band: 'F2F2F2', white: 'FFFFFF' };
const F = { amt: '#,##0;[Red]-#,##0;"-"', amt2: '#,##0.00;[Red]-#,##0.00;"-"', qty: '#,##0.00;[Red]-#,##0.00;""', pct: '0.0%;[Red]-0.0%;"-"', date: 'dd-mmm-yyyy', int: '#,##0;-#,##0;"-"' };
const font = (o) => Object.assign({ name: 'Arial', size: 10 }, o || {});
const fill = (c) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + c } });
const thin = { style: 'thin', color: { argb: 'FF' + C.grid } };
const box = { top: thin, left: thin, bottom: thin, right: thin };
const col = (n) => { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
const wb = new ExcelJS.Workbook();
wb.creator = 'Cost register'; wb.created = new Date(); wb.calcProperties.fullCalcOnLoad = !PREVIEW;
const dn = (name, ref) => wb.definedNames.add(ref, name);
function title(ws, t, sub, color) {
  ws.getCell('A1').value = t; ws.getCell('A1').font = font({ size: 14, bold: true, color: { argb: 'FF' + (color || C.navy) } });
  if (sub) { ws.getCell('A2').value = sub; ws.getCell('A2').font = font({ size: 9, color: { argb: 'FF' + C.muted } }); }
}
function head(c, text, bg, fg) { c.value = text; c.font = font({ bold: true, color: { argb: 'FF' + (fg || 'FFFFFF') } }); c.fill = fill(bg || C.navy); c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }; c.border = box; }

const sheetMap = new Map();         // bucket -> { ws, code, n (last data row) }
const addWs = (name, tab, opts) => wb.addWorksheet(name, Object.assign({ properties: { tabColor: { argb: 'FF' + tab } } }, opts || {}));
const wsSummary = addWs('Summary', C.navy, { views: [{ showGridLines: false }] });
const wsExp = addWs('Expenses', C.navy, { views: [{ showGridLines: false, state: 'frozen', xSplit: 4, ySplit: 5 }] });

// ------------------------------------------------------------------ 5. bucket sheets: the CJI3 lines, coded
const LC = [   // [key, header, width, band, format]
  ['id', 'Line ID', 20, 'Line'], ['date', 'Posting date', 12, 'Line', F.date], ['month', 'Month', 8, 'Line'], ['pk', 'Period key', 9, 'Line'], ['open', 'Opening', 8, 'Line'],
  ['dt', 'Doc type', 7, 'CJI3'], ['doc', 'Document', 12, 'CJI3'], ['ce', 'Cost element', 11, 'CJI3'], ['ceName', 'Cost element name', 24, 'CJI3'], ['wbs', 'WBS element', 18, 'CJI3'],
  ['text', 'Description', 34, 'CJI3'], ['vendor', 'Vendor / offsetting account', 26, 'CJI3'], ['po', 'PO', 12, 'CJI3'], ['mat', 'Material', 11, 'CJI3'],
  ['qty', 'Qty', 10, 'Amount', F.qty], ['unit', 'Unit', 6, 'Amount'], ['amt', 'Amount (EGP)', 15, 'Amount', F.amt2],
  ['pkg', 'PKG', 17, 'Coding'], ['mnl', 'MNL', 8, 'Coding'], ['cec', 'Cost element code', 13, 'Coding'], ['coded', 'Coded', 7, 'Coding'], ['source', 'Source', 8, 'Coding'],
];
const CI = Object.fromEntries(LC.map((c, i) => [c[0], i + 1]));
const BAND = { Line: '44546A', CJI3: C.navy, Amount: C.blue, Coding: C.gold };
const FIRST = 5;

for (const s of B.SHEETS) {
  const arr = bySheet.get(s.bucket), n = Math.max(FIRST, FIRST - 1 + arr.length), coded = s.cost;
  const ws = addWs(s.sheet, s.tab, { views: [{ state: 'frozen', xSplit: 3, ySplit: 4, showGridLines: true }] });
  sheetMap.set(s.bucket, { ws, code: s.code, n });
  LC.forEach((c, i) => { ws.getColumn(i + 1).width = c[2]; });
  const rng = (k) => `${col(CI[k])}${FIRST}:${col(CI[k])}${n}`;
  title(ws, `${s.bucket} – CJI3 lines`, null, s.tab === 'C55A11' ? s.tab : C.navy);
  const totalAmt = arr.reduce((x, l) => x + l.amt, 0), uncoded = coded ? arr.filter((l) => !(l.pkg && l.mnl && l.cec)).length : 0;
  ws.getCell('A2').value = { formula: `"Lines: "&TEXT(COUNTA(${rng('id')}),"#,##0")&"    Amount: "&TEXT(SUBTOTAL(9,${rng('amt')}),"#,##0.00")&"    Not fully coded: "&COUNTIF(${rng('coded')},0)`,
    result: `Lines: ${arr.length.toLocaleString('en-US')}    Amount: ${totalAmt.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}    Not fully coded: ${uncoded}` };
  ws.getCell('A2').font = font({ size: 10, bold: true, color: { argb: 'FF' + C.muted } });
  ws.getCell('A3').value = coded ? 'Yellow cells are yours: type or change PKG, MNL and Cost element code on any line. Every other sheet follows.' : 'Revenue (cost elements 4xxxxxxx), shown as posted (negative). It is never netted against cost.';
  ws.getCell('A3').font = font({ size: 9, italic: true, color: { argb: 'FF' + C.muted } });
  // band row 3 over the headers is merged text; keep row 3 free for the note, bands go on the header colours instead
  LC.forEach((c, i) => head(ws.getCell(4, i + 1), c[1], BAND[c[3]]));
  ws.getRow(4).height = 30;
  const rows = PREVIEW ? arr.slice(0, 40) : arr;
  rows.forEach((l, i) => {
    const r = FIRST + i, row = ws.getRow(r);
    const put = (k, v, f) => { const c = row.getCell(CI[k]); c.value = v; if (f) c.numFmt = f; return c; };
    put('id', l.id); put('date', l.date ? new Date(l.date + 'T00:00:00Z') : null, F.date); put('month', l.pk ? mLab(l.pk) : ''); put('pk', l.pk || null).font = font({ color: { argb: 'FF8C8C8C' } });
    put('open', l.open || 0).font = font({ color: { argb: 'FF8C8C8C' } });
    put('dt', l.dt); put('doc', l.doc); put('ce', l.ce); put('ceName', l.ceName); put('wbs', l.wbs); put('text', l.text); put('vendor', l.vendor); put('po', l.po); put('mat', l.mat);
    put('qty', l.qty, F.qty); put('unit', l.unit); put('amt', l.amt, F.amt2);
    if (coded) {
      put('pkg', l.pkg || null); put('mnl', l.mnl || null); put('cec', l.cec || null);
      row.getCell(CI.coded).value = { formula: `IF(AND(LEN(${col(CI.pkg)}${r})>0,LEN(${col(CI.mnl)}${r})>0,LEN(${col(CI.cec)}${r})>0),1,0)`, result: l.pkg && l.mnl && l.cec ? 1 : 0 };
      put('source', l.source);
      for (const k of ['pkg', 'mnl', 'cec']) row.getCell(CI[k]).fill = fill(C.edit);
    }
  });
  if (!PREVIEW) ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: n, column: LC.length } };
  if (coded) {
    ws.addConditionalFormatting({ ref: `${col(CI.pkg)}${FIRST}:${col(CI.cec)}${n}`, rules: [{ type: 'expression', formulae: [`LEN(${col(CI.pkg)}${FIRST})=0`], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFF8CBAD' } } } }] });
    ws.dataValidations.add(`${col(CI.mnl)}${FIRST}:${col(CI.mnl)}${n}`, { type: 'list', allowBlank: true, formulae: ['"' + B.MNLS.map((m) => m[0]).join(',') + '"'], showErrorMessage: false });
  }
  for (const [nm, k] of [['Amt', 'amt'], ['PK', 'pk'], ['Open', 'open'], ['ID', 'id']].concat(coded ? [['PKG', 'pkg'], ['MNL', 'mnl'], ['CE', 'cec'], ['Coded', 'coded']] : [])) {
    dn(`${s.code}_${nm}`, `'${s.sheet}'!$${col(CI[k])}$${FIRST}:$${col(CI[k])}$${n}`);
  }
  if (PREVIEW) ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, printArea: `A1:${col(LC.length)}${FIRST + 25}` };
}
const COST = B.SHEETS.filter((s) => s.cost);
const sumTerms = (f) => COST.map((s) => f(s.code)).join('+');

// ------------------------------------------------------------------ 6. Summary
{
  const ws = wsSummary;
  const W = [28, 9, 14, 14].concat(new Array(12).fill(12), [15, 8]);
  W.forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  ws.getCell('A1').value = 'Project Cost Register'; ws.getCell('A1').font = font({ size: 16, bold: true, color: { argb: 'FF' + C.navy } });
  ws.getCell('A2').value = `${PROJECT} · EGP · CJI3 actual cost line items`; ws.getCell('A2').font = font({ size: 11, bold: true });
  const posted = LINES.map((l) => l.date).filter(Boolean).sort();
  ws.getCell('A3').value = `Made ${new Date().toISOString().slice(0, 10)} from CJI3 (${LINES.length.toLocaleString('en-US')} lines, posted ${posted[0]} to ${posted[posted.length - 1]}). Cost and revenue are never netted; opening balances are their own column.`;
  ws.getCell('A3').font = font({ size: 9, color: { argb: 'FF' + C.muted } });
  const a4 = ws.getCell('A4'), b4 = ws.getCell('B4');
  a4.value = 'Cut date  ▸'; a4.font = font({ size: 12, bold: true, color: { argb: 'FF' + C.navy } }); a4.alignment = { horizontal: 'right', vertical: 'middle' };
  ws.mergeCells('B4:C4'); b4.value = monthEnd(CUTPK); b4.numFmt = F.date; b4.font = font({ size: 12, bold: true }); b4.fill = fill(C.edit); b4.alignment = { horizontal: 'center', vertical: 'middle' }; b4.border = box;
  b4.dataValidation = { type: 'list', allowBlank: false, formulae: [`_Cal!$A$1:$A$${months.length}`], showErrorMessage: true, errorTitle: 'Cut date', error: 'Pick a month end from the list.' };
  ws.getCell('D4').value = { formula: '"Report year "&B5&" · Pick the cut date from the list (▼): every sheet follows."', result: `Report year ${REPY} · Pick the cut date from the list (▼): every sheet follows.` };
  ws.getCell('D4').font = font({ size: 9, italic: true, color: { argb: 'FF' + C.muted } });
  ws.getCell('A5').value = 'Report year'; ws.getCell('B5').value = { formula: 'YEAR(B4)', result: REPY };
  ws.getCell('A6').value = 'Cut period key'; ws.getCell('B6').value = { formula: 'YEAR(B4)*100+MONTH(B4)', result: CUTPK };
  for (const a of ['A5', 'A6', 'B5', 'B6']) ws.getCell(a).font = font({ size: 8, color: { argb: 'FF8C8C8C' } });
  dn('CutDate', "'Summary'!$B$4"); dn('RepYear', "'Summary'!$B$5"); dn('CutPK', "'Summary'!$B$6");

  // table
  const T0 = 13;                                   // header row; row 12 holds the period keys
  const hdr = ['Bucket', 'Lines', 'Opening balance', 'Previous'].concat(MON.map((m, i) => 'm' + (i + 1)), ['To date', 'Share']);
  const pkRow = 12;
  ws.getRow(pkRow).hidden = true;
  for (let m = 1; m <= 12; m++) { const c = ws.getCell(pkRow, 4 + m); c.value = { formula: `RepYear*100+${m}`, result: REPY * 100 + m }; }
  hdr.forEach((h, i) => {
    const c = ws.getCell(T0, i + 1);
    if (i >= 4 && i <= 15) { head(c, { formula: `TEXT(DATE(RepYear,${i - 3},1),"mmm-yy")`, result: mLab(REPY * 100 + i - 3) }, C.navy); }
    else head(c, h, i === 1 ? C.navy : i === 16 ? C.navy : C.navy);
  });
  head(ws.getCell(T0, 3), 'Opening balance', C.gold); head(ws.getCell(T0, 17), 'To date', C.navy);
  ws.getRow(T0).height = 28;
  const r0 = T0 + 1;
  const monthSlots = (arr) => arr.slice(2, 14);
  COST.forEach((s, i) => {
    const r = r0 + i, v = byBucket.get(s.bucket), p = s.code;
    const cell = (c, f, res, fmt) => { const x = ws.getCell(r, c); x.value = { formula: f, result: res }; x.numFmt = fmt || F.amt; x.font = font(); x.border = box; return x; };
    const a = ws.getCell(r, 1); a.value = { text: s.bucket, hyperlink: `#'${s.sheet}'!A1` }; a.font = font({ color: { argb: 'FF' + C.blue }, underline: true }); a.border = box;
    cell(2, `COUNTA(${p}_ID)`, bySheet.get(s.bucket).length, F.int);
    cell(3, `SUMIFS(${p}_Amt,${p}_Open,1)`, v[0]);
    cell(4, `SUMIFS(${p}_Amt,${p}_Open,0,${p}_PK,"<"&(RepYear*100+1))`, v[1]);
    for (let m = 1; m <= 12; m++) cell(4 + m, `IF(${col(4 + m)}$${pkRow}>CutPK,"",SUMIFS(${p}_Amt,${p}_Open,0,${p}_PK,${col(4 + m)}$${pkRow}))`, v[1 + m] || (REPY * 100 + m > CUTPK ? '' : 0));
    cell(17, `C${r}+D${r}+SUM(E${r}:P${r})`, sumArr(v));
    ws.getCell(r, 17).font = font({ bold: true });
  });
  const rT = r0 + COST.length, rEnd = rT - 1;
  const totalRes = zero(); for (const s of COST) byBucket.get(s.bucket).forEach((x, i) => { totalRes[i] += x; });
  ws.getCell(rT, 1).value = 'Total expenses'; ws.getCell(rT, 2).value = { formula: `SUM(B${r0}:B${rEnd})`, result: costLines.length };
  ws.getCell(rT, 2).numFmt = F.int;
  for (let c = 3; c <= 17; c++) { if (c === 3 || c === 4 || c === 17 || (c >= 5 && c <= 16)) { const x = ws.getCell(rT, c); const m = c - 4; x.value = { formula: `SUM(${col(c)}${r0}:${col(c)}${rEnd})`, result: c === 3 ? totalRes[0] : c === 4 ? totalRes[1] : c === 17 ? sumArr(totalRes) : (REPY * 100 + m > CUTPK ? 0 : totalRes[1 + m]) }; x.numFmt = F.amt; } }
  for (let c = 1; c <= 17; c++) { const x = ws.getCell(rT, c); x.font = font({ bold: true, color: { argb: 'FF' + C.navy } }); x.fill = fill(C.light); x.border = box; }
  // share
  const grand = sumArr(totalRes);
  for (let r = r0; r <= rT; r++) { const x = ws.getCell(r, 18); x.value = { formula: `IF($Q$${rT}=0,"",Q${r}/$Q$${rT})`, result: grand ? sumArr(r === rT ? totalRes : byBucket.get(COST[r - r0].bucket)) / grand : '' }; x.numFmt = F.pct; x.font = font({ bold: r === rT }); x.border = box; }
  // revenue, apart
  const rRev = rT + 2, rv = byBucket.get('Revenue');
  ws.getCell(rRev, 1).value = { text: 'Revenue (not netted)', hyperlink: "#'Revenue'!A1" }; ws.getCell(rRev, 1).font = font({ color: { argb: 'FF548235' }, bold: true, underline: true });
  const rc = (c, f, res) => { const x = ws.getCell(rRev, c); x.value = { formula: f, result: res }; x.numFmt = F.amt; x.font = font({ color: { argb: 'FF548235' } }); x.border = box; };
  ws.getCell(rRev, 2).value = { formula: 'COUNTA(REV_ID)', result: bySheet.get('Revenue').length }; ws.getCell(rRev, 2).numFmt = F.int;
  rc(3, '-SUMIFS(REV_Amt,REV_Open,1)', -rv[0]); rc(4, '-SUMIFS(REV_Amt,REV_Open,0,REV_PK,"<"&(RepYear*100+1))', -rv[1]);
  for (let m = 1; m <= 12; m++) rc(4 + m, `IF(${col(4 + m)}$${pkRow}>CutPK,"",-SUMIFS(REV_Amt,REV_Open,0,REV_PK,${col(4 + m)}$${pkRow}))`, REPY * 100 + m > CUTPK ? '' : -rv[1 + m]);
  rc(17, `C${rRev}+D${rRev}+SUM(E${rRev}:P${rRev})`, -sumArr(rv));
  // KPI band (rows 8-9)
  const kp = [['Total expenses to date', `Q${rT}`, grand, F.amt, C.navy], ['Revenue to date', `Q${rRev}`, -sumArr(rv), F.amt, '548235'], ['This month\'s expenses', `IFERROR(INDEX(E${rT}:P${rT},MONTH(CutDate)),0)`, totalRes[1 + (CUTPK % 100)] || 0, F.amt, C.navy],
    ['Opening balances (in expenses)', `C${rT}`, totalRes[0], F.amt, C.gold], ['Share of expenses coded', `IF(Q${rT}=0,"",1-(${sumTerms((p) => `SUMIFS(${p}_Amt,${p}_Coded,0,${p}_PK,"<="&CutPK)`)})/Q${rT})`, 1 - costLines.filter((l) => !(l.pkg && l.mnl && l.cec) && slot(l) != null).reduce((x, l) => x + l.amt, 0) / grand, F.pct, C.gold]];
  // five cards over the columns A..R: A:B, C:D, E:G, H:J, K:M (merged label + value)
  const spans = [[1, 2], [3, 4], [5, 7], [8, 10], [11, 13]];
  kp.forEach(([lab, f, res, fmt, bg], i) => {
    const [c1, c2] = spans[i];
    ws.mergeCells(8, c1, 8, c2); ws.mergeCells(9, c1, 9, c2);
    const l = ws.getCell(8, c1), v = ws.getCell(9, c1);
    l.value = lab; l.font = font({ size: 9, bold: true, color: { argb: 'FFFFFFFF' } }); l.fill = fill(bg); l.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    v.value = { formula: f, result: res }; v.numFmt = fmt; v.font = font({ size: 14, bold: true, color: { argb: 'FF' + C.navy } }); v.alignment = { horizontal: 'center', vertical: 'middle' }; v.fill = fill(i === 1 ? 'E2EFDA' : C.white);
    for (let c = c1; c <= c2; c++) { ws.getCell(8, c).border = box; ws.getCell(9, c).border = box; ws.getCell(8, c).fill = fill(bg); }
  });
  ws.getRow(8).height = 24; ws.getRow(9).height = 30;
  ws.getCell(10, 1).value = 'Expenses = every cost line up to the cut date (all cost elements except 4xxxxxxx). The Expenses sheet allocates the same total by PKG, MNL and Cost element.'; ws.getCell(10, 1).font = font({ size: 9, italic: true, color: { argb: 'FF' + C.muted } });
  ws.views = [{ showGridLines: false, state: 'frozen', ySplit: 0 }];
  ws.getCell(rRev + 2, 1).value = 'Sheets'; ws.getCell(rRev + 2, 1).font = font({ bold: true, color: { argb: 'FF' + C.navy } });
  ['Expenses', 'Checks', 'Lists', 'Rules', 'Notes'].forEach((n, i) => { const x = ws.getCell(rRev + 3 + i, 1); x.value = { text: n, hyperlink: `#'${n}'!A1` }; x.font = font({ color: { argb: 'FF' + C.blue }, underline: true }); });
  if (PREVIEW) ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 1 };
}

// ------------------------------------------------------------------ 7. Expenses (the overall project cost, allocated per month)
const comboList = [...combos.values()].map((c) => Object.assign(c, { name: [...c.names].sort((a, b) => b[1] - a[1])[0][0] }));
const mnlOrder = new Map(B.MNLS.map((m, i) => [m[0], i]));
let gtTot = 0;
comboList.sort((a, b) => (mnlOrder.get(a.mnl) ?? 99) - (mnlOrder.get(b.mnl) ?? 99) || a.pkg.localeCompare(b.pkg, 'en', { numeric: true }) || a.cec.localeCompare(b.cec, 'en', { numeric: true }));
{
  const ws = wsExp;
  [20, 8, 13, 30, 14, 14].concat(new Array(12).fill(11.5), [15, 8]).forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  title(ws, 'Expenses – overall project cost', null);
  ws.getCell('A2').value = { formula: '"Allocated per month by PKG · MNL · Cost element · cut date "&TEXT(CutDate,"dd-mmm-yyyy")&" · every amount is a SUMIFS on the bucket sheets, so a code typed on a line moves its amount here"', result: `Allocated per month by PKG · MNL · Cost element · cut date ${monthEnd(CUTPK).toISOString().slice(8, 10)}-${MON[(CUTPK % 100) - 1]}-${REPY} · every amount is a SUMIFS on the bucket sheets, so a code typed on a line moves its amount here` };
  ws.getCell('A2').font = font({ size: 9, color: { argb: 'FF' + C.muted } });
  ws.getRow(3).hidden = true;
  for (let m = 1; m <= 12; m++) ws.getCell(3, 6 + m).value = { formula: `RepYear*100+${m}`, result: REPY * 100 + m };
  ['PKG', 'MNL', 'Cost element code', 'Cost element name', 'Opening balance', 'Previous'].forEach((h, i) => head(ws.getCell(4, i + 1), h, i === 4 ? C.gold : C.navy));
  for (let m = 1; m <= 12; m++) head(ws.getCell(4, 6 + m), { formula: `TEXT(DATE(RepYear,${m},1),"mmm-yy")`, result: mLab(REPY * 100 + m) }, C.blue);
  head(ws.getCell(4, 19), 'To date', C.navy); head(ws.getCell(4, 20), 'Share', C.navy);
  ws.getRow(4).height = 28;
  const DR0 = 6;                                       // first data row; row 5 = grand total
  let r = DR0; const groupRows = []; const detail = [];
  const mnlName = new Map(B.MNLS);
  for (const m of B.MNLS.map((x) => x[0])) {
    const cs = comboList.filter((c) => c.mnl === m); if (!cs.length) continue;
    const gr = r++; groupRows.push(gr);
    const first = r, last = r + cs.length - 1;
    const gv = zero(); cs.forEach((c) => c.v.forEach((x, i) => { gv[i] += x; }));
    ws.getCell(gr, 1).value = `${m} · ${mnlName.get(m)}`; ws.getCell(gr, 2).value = m;
    const setNum = (row, c, f, res, bold, bg) => { const x = ws.getCell(row, c); x.value = { formula: f, result: res }; x.numFmt = F.amt; x.font = font({ bold }); x.border = box; if (bg) x.fill = fill(bg); };
    for (let c = 5; c <= 19; c++) {
      const mm = c - 6, res = c === 5 ? gv[0] : c === 6 ? gv[1] : c === 19 ? sumArr(gv) : (REPY * 100 + mm > CUTPK ? '' : gv[1 + mm]);
      setNum(gr, c, `SUBTOTAL(9,${col(c)}${first}:${col(c)}${last})`, res, true, C.light);
    }
    for (let c = 1; c <= 4; c++) { const x = ws.getCell(gr, c); x.font = font({ bold: true, color: { argb: 'FF' + C.navy } }); x.fill = fill(C.light); x.border = box; }
    cs.forEach((cmb) => {
      const row = r++; ws.getRow(row).outlineLevel = 1;
      ws.getCell(row, 1).value = cmb.pkg; ws.getCell(row, 2).value = cmb.mnl; ws.getCell(row, 3).value = cmb.cec; ws.getCell(row, 4).value = cmb.name;
      for (let c = 1; c <= 4; c++) { ws.getCell(row, c).font = font(); ws.getCell(row, c).border = box; }
      const t = (p, extra) => `SUMIFS(${p}_Amt,${p}_PKG,$A${row},${p}_MNL,$B${row},${p}_CE,$C${row}${extra(p)})`;
      const v = cmb.v;
      setNum(row, 5, sumTerms((p) => t(p, (q) => `,${q}_Open,1`)), v[0]);
      setNum(row, 6, sumTerms((p) => t(p, (q) => `,${q}_Open,0,${q}_PK,"<"&(RepYear*100+1)`)), v[1]);
      for (let mm = 1; mm <= 12; mm++) setNum(row, 6 + mm, `IF(${col(6 + mm)}$3>CutPK,"",${sumTerms((p) => t(p, (q) => `,${q}_Open,0,${q}_PK,${col(6 + mm)}$3`))})`, REPY * 100 + mm > CUTPK ? '' : v[1 + mm]);
      setNum(row, 19, `E${row}+F${row}+SUM(G${row}:R${row})`, sumArr(v), true);
      detail.push(row);
    });
  }
  const lastRow = r - 1;
  // grand total (row 5, always visible)
  const gt = zero(); comboList.forEach((c) => c.v.forEach((x, i) => { gt[i] += x; }));
  ws.getCell(5, 1).value = 'TOTAL EXPENSES'; for (let c = 1; c <= 4; c++) { const x = ws.getCell(5, c); x.font = font({ bold: true, color: { argb: 'FFFFFFFF' } }); x.fill = fill(C.navy); x.border = box; }
  for (let c = 5; c <= 19; c++) { const mm = c - 6, x = ws.getCell(5, c); x.value = { formula: `SUBTOTAL(9,${col(c)}${DR0}:${col(c)}${lastRow})`, result: c === 5 ? gt[0] : c === 6 ? gt[1] : c === 19 ? sumArr(gt) : (REPY * 100 + mm > CUTPK ? '' : gt[1 + mm]) }; x.numFmt = F.amt; x.font = font({ bold: true, color: { argb: 'FFFFFFFF' } }); x.fill = fill(C.navy); x.border = box; }
  const shareRow = (rw, res) => { const x = ws.getCell(rw, 20); x.value = { formula: `IF($S$5=0,"",S${rw}/$S$5)`, result: res }; x.numFmt = F.pct; x.font = font({ bold: rw === 5 || groupRows.includes(rw) }); x.border = box; };
  gtTot = sumArr(gt);
  shareRow(5, 1); groupRows.forEach((gr, i) => { const m = B.MNLS.map((x) => x[0]).filter((mm) => comboList.some((c) => c.mnl === mm))[i]; shareRow(gr, gtTot ? comboList.filter((c) => c.mnl === m).reduce((x, c) => x + sumArr(c.v), 0) / gtTot : ''); });
  // control rows: independent of the PKG / MNL / CE codes
  const cR = lastRow + 2;
  ws.getCell(cR, 1).value = 'Control: all cost lines on the bucket sheets, whatever their codes'; ws.getCell(cR, 1).font = font({ bold: true, color: { argb: 'FF' + C.muted } });
  ws.getCell(cR + 1, 1).value = 'Difference (must be nil)'; ws.getCell(cR + 1, 1).font = font({ bold: true });
  for (let c = 5; c <= 19; c++) {
    const mm = c - 6, x = ws.getCell(cR, c);
    let f; if (c === 5) f = sumTerms((p) => `SUMIFS(${p}_Amt,${p}_Open,1)`); else if (c === 6) f = sumTerms((p) => `SUMIFS(${p}_Amt,${p}_Open,0,${p}_PK,"<"&(RepYear*100+1))`);
    else if (c === 19) f = `E${cR}+F${cR}+SUM(G${cR}:R${cR})`; else f = `IF(${col(c)}$3>CutPK,"",${sumTerms((p) => `SUMIFS(${p}_Amt,${p}_Open,0,${p}_PK,${col(c)}$3)`)})`;
    const res = c === 5 ? gt[0] : c === 6 ? gt[1] : c === 19 ? gtTot : (REPY * 100 + mm > CUTPK ? '' : gt[1 + mm]);
    x.value = { formula: f, result: res }; x.numFmt = F.amt; x.font = font({ color: { argb: 'FF' + C.muted } });
    const d = ws.getCell(cR + 1, c); d.value = { formula: `ROUND(N(${col(c)}5)-N(${col(c)}${cR}),2)`, result: 0 }; d.numFmt = F.amt; d.font = font({ bold: true });
  }
  ws.addConditionalFormatting({ ref: `E${cR + 1}:S${cR + 1}`, rules: [{ type: 'cellIs', operator: 'equal', formulae: ['0'], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFE2EFDA' } } } },
    { type: 'cellIs', operator: 'notEqual', formulae: ['0'], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFF8CBAD' } } } }] });
  ws.properties.outlineProperties = { summaryBelow: false }; ws.properties.outlineLevelRow = 1;
  ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: lastRow, column: 20 } };
  dn('Exp_Total', `'Expenses'!$S$5`);
  if (PREVIEW) ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, printArea: `A1:T${Math.min(lastRow, 60)}` };
  console.log('Expenses rows:', comboList.length, 'combos');
}

// ------------------------------------------------------------------ 8. Checks, Lists, Rules, Notes, _Cal
{
  const ws = addWs('Checks', 'C55A11', { views: [{ showGridLines: false }] });
  [46, 20, 20, 16, 12].forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  title(ws, 'Checks – the workbook against the CJI3 export', 'Expected = read from the export when this workbook was made. In the workbook = live formula.', 'C55A11');
  ['Check', 'CJI3 export', 'In the workbook', 'Difference', 'Status'].forEach((h, i) => head(ws.getCell(4, i + 1), h, 'C55A11'));
  const costTot = costLines.reduce((x, l) => x + l.amt, 0), revTot = -LINES.filter((l) => l.bucket === 'Revenue').reduce((x, l) => x + l.amt, 0);
  const rows = [
    ['Posting lines', LINES.length, 'SUM(' + B.SHEETS.map((s) => `COUNTA(${s.code}_ID)`).join(',') + ')', LINES.length, F.int],
    ['Cost, all periods (cost elements other than 4xxxxxxx)', costTot, sumTerms((p) => `SUM(${p}_Amt)`), costTot, F.amt2],
    ['Revenue, all periods (shown positive)', revTot, '-SUM(REV_Amt)', revTot, F.amt2],
    ['Export grand total (cost less revenue)', SRC.footer, `${sumTerms((p) => `SUM(${p}_Amt)`)}+SUM(REV_Amt)`, costTot - revTot, F.amt2],
    ['Expenses sheet total = cost lines up to the cut date', null, 'Exp_Total', gtTot, F.amt2, sumTerms((p) => `SUMIFS(${p}_Amt,${p}_PK,"<="&CutPK)`)],
  ];
  rows.forEach(([lab, exp, f, res, fmt, ctl], i) => {
    const r = 5 + i; ws.getCell(r, 1).value = lab; ws.getCell(r, 1).font = font();
    const e = ws.getCell(r, 2), w = ws.getCell(r, 3), d = ws.getCell(r, 4), s = ws.getCell(r, 5);
    if (ctl) e.value = { formula: ctl, result: res }; else e.value = exp;
    w.value = { formula: f, result: res }; d.value = { formula: `ROUND(C${r}-B${r},2)`, result: ctl ? 0 : Math.round((res - exp) * 100) / 100 };
    s.value = { formula: `IF(D${r}=0,"OK","CHECK")`, result: 'OK' };
    [e, w, d].forEach((x) => { x.numFmt = fmt; x.font = font(); }); s.font = font({ bold: true }); s.alignment = { horizontal: 'center' };
    for (let c = 1; c <= 5; c++) ws.getCell(r, c).border = box;
  });
  ws.addConditionalFormatting({ ref: 'E5:E9', rules: [{ type: 'cellIs', operator: 'equal', formulae: ['"OK"'], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFE2EFDA' } } } }, { type: 'cellIs', operator: 'equal', formulae: ['"CHECK"'], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFF8CBAD' } } } }] });
  ws.getCell(11, 1).value = 'For information'; ws.getCell(11, 1).font = font({ bold: true, color: { argb: 'FF' + C.navy } });
  const unc = bySheet.get('Unclassified');
  [['Lines not fully coded (PKG, MNL and Cost element code)', `SUM(${sumTerms((p) => `COUNTIF(${p}_Coded,0)`)})`, costLines.filter((l) => !(l.pkg && l.mnl && l.cec)).length, F.int],
    ['Unclassified bucket: lines (give them a bucket on the Rules sheet)', 'COUNTA(UNC_ID)', unc.length, F.int], ['Unclassified bucket: amount', 'SUM(UNC_Amt)', unc.reduce((x, l) => x + l.amt, 0), F.amt2]].forEach(([lab, f, res, fmt], i) => {
    ws.getCell(12 + i, 1).value = lab; ws.getCell(12 + i, 1).font = font(); const x = ws.getCell(12 + i, 3); x.value = { formula: f, result: res }; x.numFmt = fmt; x.font = font({ bold: true }); });
}
{
  const ws = addWs('Lists', C.gold, { views: [{ showGridLines: false }] });
  [22, 4, 12, 18, 4, 14].forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  title(ws, 'Lists – the codes in use', 'PKG, MNL and Cost element code are free codes: type any new code on a line. These lists feed the drop-downs.', C.gold);
  head(ws.getCell(4, 1), 'PKG', C.gold); head(ws.getCell(4, 3), 'MNL', C.gold); head(ws.getCell(4, 4), 'MNL name', C.gold); head(ws.getCell(4, 6), 'Cost element code', C.gold);
  [...new Set(comboList.map((c) => c.pkg))].sort((a, b) => a.localeCompare(b, 'en', { numeric: true })).forEach((p, i) => { ws.getCell(5 + i, 1).value = p; });
  B.MNLS.forEach(([c, n], i) => { ws.getCell(5 + i, 3).value = c; ws.getCell(5 + i, 4).value = n; });
  [...new Set(comboList.map((c) => c.cec))].sort((a, b) => a.localeCompare(b, 'en', { numeric: true })).forEach((p, i) => { ws.getCell(5 + i, 6).value = p; });
}
{
  const ws = addWs('Rules', C.gold, { views: [{ showGridLines: false }] });
  [9, 26, 12, 26, 18, 18].forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  title(ws, 'Rules – how lines were given a bucket and a first-pass coding', 'Used when this workbook was made. First match wins. The coding is a starting point: overwrite it on the lines.', C.gold);
  ['Order', 'Bucket (sheet)', 'Document type', 'Cost element name', 'Name starts with', 'Cost element starts with'].forEach((h, i) => head(ws.getCell(4, i + 1), h, C.gold));
  B.RULES.forEach(([b, r], i) => { [i + 1, b, r.doc_type || '', r.ce_name || '', r.ce_name_prefix || '', r.ce_prefix || ''].forEach((v, c) => { const x = ws.getCell(5 + i, c + 1); x.value = v; x.font = font(); x.border = box; }); });
  const r = 7 + B.RULES.length;
  ws.getCell(r, 1).value = 'First-pass coding'; ws.getCell(r, 1).font = font({ bold: true, color: { argb: 'FF' + C.navy } });
  [['PKG', 'The work-package group of the WBS element (I-SUTH.01-03-3-08 becomes I-SUTH.01-03). A stand-in until your own package list is used.'], ['MNL', 'From what the line is: Material = MAT, Subcontractor = SUB, Labor = LAB, Equipment / fuel and Fleet = EQU, everything else = OTHER.'],
    ['Cost element code', 'The SAP cost element number, until your own cost element codes are used.']].forEach(([k, t], i) => { ws.getCell(r + 1 + i, 1).value = k; ws.getCell(r + 1 + i, 1).font = font({ bold: true }); ws.getCell(r + 1 + i, 2).value = t; ws.getCell(r + 1 + i, 2).font = font(); });
}
{
  const ws = addWs('Notes', '7F7F7F', { views: [{ showGridLines: false }] });
  ws.getColumn(1).width = 120; title(ws, 'Notes', null, C.navy);
  ['Source: SAP CJI3 actual cost line items. Every posting line is on exactly one bucket sheet; subtotal rows of the export are left out.',
    'Cost = all cost elements except 4xxxxxxx. Revenue (4xxxxxxx) has its own sheet and is never netted against cost.',
    'Months come from the posting date. Go-live opening balances (document types UE, ZB, MD, HT) are the Opening balance column, not month activity.',
    'Expenses: one row per PKG + MNL + Cost element. Amounts are SUMIFS on the bucket sheets; pick another cut date on the Summary and everything follows.',
    'Coding: yellow cells on each line. Change a code and its amount moves to the matching Expenses row at once. A code combination that is not yet a row on Expenses shows up as a difference on the control line.',
    'Checks sheet: line count, cost, revenue and the export grand total are compared with the CJI3 export this workbook was made from.'].forEach((t, i) => { ws.getCell(3 + i, 1).value = t; ws.getCell(3 + i, 1).font = font(); ws.getCell(3 + i, 1).alignment = { wrapText: true }; });
}
{
  const ws = wb.addWorksheet('_Cal', { state: 'hidden' });
  months.forEach((pk, i) => { const c = ws.getCell(i + 1, 1); c.value = monthEnd(pk); c.numFmt = F.date; });
}

// order: Summary, Expenses, buckets..., Checks, Lists, Rules, Notes, _Cal (creation order already is)
wb.xlsx.writeFile(outFile).then(() => console.log('written', outFile, (fs.statSync(outFile).size / 1e6).toFixed(1) + ' MB'));
