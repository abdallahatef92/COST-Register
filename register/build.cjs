/* Project Cost Register.
 *   node register/build.cjs --cji3 <cji3.xlsx> [--zintc1 <file> ...] --out <register.xlsx> [--preview] [--cache <lines.json>]
 *
 * The workflow this encodes:
 *   1. CJI3 is the single source of truth for actuals. It is read once and kept compact (bucket x cost element x month).
 *   2. Every other report is detail for one bucket. Each bucket sheet shows CJI3 against its detail report; where a detail report is
 *      loaded it REPLACES the CJI3 lines it explains, and the difference is one visible adjustment line, so the sheet always ties to CJI3.
 *   3. Each bucket sheet is a coded table: one row per item, with PKG / MNL / Cost element code typed once per item.
 *   4. The Expenses sheet collects the coded tables of all buckets (SUMIFS-free: SUMPRODUCT on the bucket tables) into one coded sheet.
 *      Analysis of Expenses is outside this workbook.
 * Providers (detail readers) are plugged in below; Subcontractor and Material are shells until their report output is plugged in.
 */
'use strict';
const fs = require('fs');
const XLSX = require('xlsx'), ExcelJS = require('exceljs');
const R = require('../src/reports.js'), U = require('../src/util.js'), B = require('./buckets.js');

// ------------------------------------------------------------------ command line
const argv = process.argv.slice(2), opt = (k) => { const out = []; argv.forEach((a, i) => { if (a === k) out.push(argv[i + 1]); }); return out; };
const CJI3_FILE = opt('--cji3')[0], OUT = opt('--out')[0], ZINTC1_FILES = opt('--zintc1'), CACHE = opt('--cache')[0], PREVIEW = argv.includes('--preview');
if (!CJI3_FILE || !OUT) { console.error('usage: node register/build.cjs --cji3 <file> [--zintc1 <file>]... --out <file> [--preview] [--cache <json>]'); process.exit(2); }

const readSheet = (file, id) => {
  const wb = XLSX.read(fs.readFileSync(file), { type: 'buffer', dense: true, cellFormula: false, cellStyles: false, cellNF: false, cellHTML: false });
  const aoa = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: null });
  const hit = R.detect(aoa);
  if (!hit || hit.def.id !== id) throw new Error(`${file} is not a ${id.toUpperCase()} export`);
  const o = R.prepare(hit.def, aoa, hit.headerRow, { sourceFile: file });
  return { def: hit.def, o, ix: Object.fromEntries(hit.def.all.map((c, i) => [c.col, i])) };
};

// ------------------------------------------------------------------ 1. CJI3: the source of truth
function loadCji3() {
  if (CACHE && fs.existsSync(CACHE)) return JSON.parse(fs.readFileSync(CACHE, 'utf8'));
  console.log('reading CJI3', CJI3_FILE);
  const { o, ix } = readSheet(CJI3_FILE, 'cji3');
  const lines = o.rows.map((v) => { const g = (k) => v[ix[k]], ym = g('period_ym') || '';
    return { pk: ym ? +ym.slice(0, 4) * 100 + +ym.slice(5, 7) : 0, open: g('is_opening'), dt: g('document_type') || '', ce: g('cost_element') || '', ceName: g('cost_element_name') || '',
      wbs: g('wbs_element') || '', ptype: g('partner_object_type') || '', amt: g('amount'), date: g('posting_date') }; });
  const out = { lines, footer: o.footer, project: R.projectOf(o.proj), subtotals: o.blankRows };
  if (CACHE) fs.writeFileSync(CACHE, JSON.stringify(out));
  return out;
}
const SRC = loadCji3(), LINES = SRC.lines;
for (const l of LINES) { const c = B.classify({ dt: l.dt, ceName: l.ceName, ce: l.ce }); l.bucket = c.bucket; l.nature = c.nature; }
const MONTHS = [...new Set(LINES.map((l) => l.pk))].sort((a, b) => a - b);         // every month of the project, in CJI3
const MC = MONTHS.length, LASTPK = MONTHS[MC - 1], REPY = Math.floor(LASTPK / 100), CUTPK = LASTPK;
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const mLab = (pk) => MON[(pk % 100) - 1] + '-' + String(Math.floor(pk / 100)).slice(2);
const monthEnd = (pk) => new Date(Date.UTC(Math.floor(pk / 100), pk % 100, 0));
const PROJECT = SRC.project ? 'I-' + SRC.project : 'Project';
console.log(LINES.length, 'CJI3 lines,', MC, 'months', mLab(MONTHS[0]), '-', mLab(LASTPK));

// ------------------------------------------------------------------ 2. providers: detail reports, each explains a part of CJI3
// covers(line) = the CJI3 lines this report explains. rows = coded detail rows { bucket, item, sapce, pkg, mnl, cec, m: {pk: amt} }
const ORDER_BUCKET = { 'Corrective Maintenance Order': 'Equipment / fuel', 'Equipment Charges Order': 'Equipment / fuel', 'Fuel Charging Order': 'Equipment / fuel',
  'Fleet Charges Order Projects': 'Fleet / transportation', 'Transportation Management Charges': 'Fleet / transportation', 'House rent': 'House rent' };
const PROVIDERS = [];
if (ZINTC1_FILES.length) {
  const rows = new Map(); let used = 0, beyond = 0, unsettled = 0, unknown = 0, loadedFrom = null, loadedTo = null, lines = 0;
  for (const f of ZINTC1_FILES) {
    const { o, ix } = readSheet(f, 'zintc1'); lines += o.rows.length;
    for (const v of o.rows) {
      const g = (k) => v[ix[k]], pk = (g('year') || 0) * 100 + (g('month') || 0), amt = g('actual') || 0;
      if (g('category') !== 'WBS') { unsettled++; continue; }                       // CTR = still on a cost centre, not on the project
      const bucket = ORDER_BUCKET[g('order_type_description')]; if (!bucket) { unknown++; continue; }
      if (pk > LASTPK) { beyond++; continue; }                                        // detail after the CJI3 data date is not actuals yet
      const item = g('cost_element_descriptio') || g('order_type_description'), pkg = B.wbsGroup(g('wbs')), ce = g('cost_element') || '', mnl = bucket === 'House rent' ? 'OTHER' : 'EQU';
      const key = [bucket, item, ce, pkg].join('\u0001');
      let r = rows.get(key); if (!r) rows.set(key, (r = { bucket, item, sapce: ce, pkg, mnl, cec: ce, m: {}, open: 0 }));
      r.m[pk] = (r.m[pk] || 0) + amt; used++; loadedFrom = Math.min(loadedFrom || pk, pk); loadedTo = Math.max(loadedTo || pk, pk);
    }
  }
  PROVIDERS.push({ id: 'ZINTC1', label: 'ZINTC1 internal order lines', buckets: ['Equipment / fuel', 'Fleet / transportation', 'House rent'], covers: (l) => l.ptype === 'Order',
    rows: [...rows.values()], from: loadedFrom, to: loadedTo, note: `${lines.toLocaleString('en-US')} lines read, ${used.toLocaleString('en-US')} used; ${unsettled} not settled to the project (cost centre) and ${beyond} after the CJI3 data date are left out${unknown ? `; ${unknown} of an unknown order type` : ''}` });
  console.log('ZINTC1:', PROVIDERS[0].note);
}
const SHELLS = [   // detail reports whose output is not plugged in yet: shown as shells with their status
  { bucket: 'Subcontractor', source: 'ZSCPRG01 + ZSCSRV1 (Subcontract Cost Report logic)', covers: 'document type SC' },
  { bucket: 'Material', source: 'MB51 + ME2N + MB52 (Material Cost Report logic)', covers: 'document type WA' },
  { bucket: 'Labor', source: 'Labour allocation form (offline)', covers: '' },
  { bucket: 'Asset depreciation', source: 'Asset movement sheet (offline)', covers: '' },
  { bucket: 'G&A', source: 'No detail report (Finance / HR)', covers: '' },
];
const providerOf = (bucket) => PROVIDERS.find((p) => p.buckets.includes(bucket));

// ------------------------------------------------------------------ 3. the coded table of every bucket
// row = { item, source, sapce, pkg, mnl, cec, open, m: {pk: amount}, adj? }
const cell0 = () => ({ open: 0, m: {} });
const addAmt = (o, l, amt) => { if (l.open) o.open += amt; else o.m[l.pk] = (o.m[l.pk] || 0) + amt; };
const TAB = new Map();            // bucket -> { rows, c3, covered, detail, provider }
for (const s of B.SHEETS) TAB.set(s.bucket, { rows: [], c3: cell0(), cov: cell0(), det: cell0(), provider: providerOf(s.bucket) });
{
  const derived = new Map();
  for (const l of LINES) {
    const t = TAB.get(l.bucket); addAmt(t.c3, l, l.amt);
    const covered = t.provider && t.provider.covers(l);
    if (covered) { addAmt(t.cov, l, l.amt); continue; }                              // replaced by the detail report
    const isRev = l.bucket === 'Revenue', pkg = isRev ? '' : B.wbsGroup(l.wbs), mnl = isRev ? '' : B.mnlOf(l.nature);
    const key = [l.bucket, l.ceName, l.ce, pkg].join('\u0001');
    let r = derived.get(key); if (!r) derived.set(key, (r = { bucket: l.bucket, item: l.ceName || '(no name)', source: 'CJI3', sapce: l.ce, pkg, mnl, cec: isRev ? '' : l.ce, open: 0, m: {} }));
    addAmt(r, l, l.amt);
  }
  for (const r of derived.values()) TAB.get(r.bucket).rows.push(r);
  for (const p of PROVIDERS) for (const d of p.rows) { const t = TAB.get(d.bucket); t.rows.push(Object.assign({ source: p.id }, d)); for (const [pk, a] of Object.entries(d.m)) t.det.m[pk] = (t.det.m[pk] || 0) + a; }
  // the adjustment: what the detail does not explain, so that the bucket still equals CJI3
  for (const t of TAB.values()) if (t.provider) {
    const adj = { item: 'Not explained by detail (CJI3 less ' + t.provider.id + ')', source: 'Adjustment', sapce: '', pkg: '(adjustment)', mnl: null, cec: '(adjustment)', open: t.cov.open - t.det.open, m: {}, adj: true };
    for (const pk of MONTHS) { const v = (t.cov.m[pk] || 0) - (t.det.m[pk] || 0); if (Math.abs(v) > 1e-9) adj.m[pk] = v; }
    adj.mnl = t.rows.find((r) => r.mnl) ? t.rows.find((r) => r.mnl).mnl : 'OTHER'; t.rows.push(adj);
  }
  const mo = new Map(B.MNLS.map((m, i) => [m[0], i]));
  for (const t of TAB.values()) t.rows.sort((a, b) => (a.adj ? 1 : 0) - (b.adj ? 1 : 0) || (a.source === 'CJI3' ? 0 : -1) - (b.source === 'CJI3' ? 0 : -1) || (mo.get(a.mnl) ?? 9) - (mo.get(b.mnl) ?? 9) || a.item.localeCompare(b.item, 'en', { numeric: true }) || a.pkg.localeCompare(b.pkg, 'en', { numeric: true }));
}
const COSTS = B.SHEETS.filter((s) => s.cost);
const sum = (o) => (o.open || 0) + Object.values(o.m).reduce((x, y) => x + y, 0);

// ------------------------------------------------------------------ 4. workbook helpers (same visual standard as the Material / Subcontract reports)
const C = { navy: '1F3864', blue: '2F5597', gold: 'BF8F00', light: 'DDEBF7', edit: 'FFFFCC', grid: 'BFBFBF', ok: 'E2EFDA', bad: 'F8CBAD', muted: '595959', rev: '548235', white: 'FFFFFF' };
const F = { amt: '#,##0;[Red]-#,##0;"-"', amt2: '#,##0.00;[Red]-#,##0.00;"-"', pct: '0.0%;[Red]-0.0%;"-"', date: 'dd-mmm-yyyy', int: '#,##0;-#,##0;"-"' };
const font = (o) => Object.assign({ name: 'Arial', size: 10 }, o || {});
const fill = (c) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + c } });
const thin = { style: 'thin', color: { argb: 'FF' + C.grid } }, box = { top: thin, left: thin, bottom: thin, right: thin };
const col = (n) => { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
const wb = new ExcelJS.Workbook(); wb.creator = 'Cost register'; wb.created = new Date(); wb.calcProperties.fullCalcOnLoad = !PREVIEW;
const dn = (name, ref) => wb.definedNames.add(ref, name);
const addWs = (name, tab, opts) => wb.addWorksheet(name, Object.assign({ properties: { tabColor: { argb: 'FF' + tab } } }, opts || {}));
const head = (c, v, bg, fg) => { c.value = v; c.font = font({ bold: true, color: { argb: 'FF' + (fg || 'FFFFFF') } }); c.fill = fill(bg || C.navy); c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }; c.border = box; };
const title = (ws, t, sub, color) => { ws.getCell('A1').value = t; ws.getCell('A1').font = font({ size: 14, bold: true, color: { argb: 'FF' + (color || C.navy) } });
  if (sub) { ws.getCell('A2').value = sub; ws.getCell('A2').font = font({ size: 9, color: { argb: 'FF' + C.muted } }); } };
const note = (ws, a, t, o) => { const c = ws.getCell(a); c.value = t; c.font = font(Object.assign({ size: 9, italic: true, color: { argb: 'FF' + C.muted } }, o || {})); return c; };
const num = (c, v, f, o) => { c.value = v; c.numFmt = f || F.amt; c.font = font(o); c.border = box; return c; };
const fx = (c, formula, result, f, o) => { c.value = { formula, result }; c.numFmt = f || F.amt; c.font = font(o); c.border = box; return c; };

const wsSum = addWs('Summary', C.navy, { views: [{ showGridLines: false }] });
const wsExp = addWs('Expenses', C.navy, { views: [{ showGridLines: false, state: 'frozen', xSplit: 4, ySplit: 5 }] });
const wsC3 = addWs('CJI3', C.rev, { views: [{ showGridLines: false, state: 'frozen', xSplit: 3, ySplit: 5 }] });

// ------------------------------------------------------------------ 5. bucket sheets: reconciliation block + coded table
// columns: A item | B source | C SAP cost element | D PKG | E MNL | F CE code | G opening | H.. months | total
const COL = { item: 1, src: 2, sap: 3, pkg: 4, mnl: 5, ce: 6, open: 7, m0: 8 }, TOT = COL.m0 + MC, LM = COL.m0 + MC - 1;
const R_HDR = 5, R_PK = 6, R_C3 = 7, R_COV = 8, R_DET = 9, R_ADJ = 10, R_COD = 11, R_DIF = 12, T_HDR = 14, T0 = 15;
const monthVal = (o, pk) => o.m[pk] || 0;
for (const s of B.SHEETS) {
  const t = TAB.get(s.bucket), p = t.provider, shell = SHELLS.find((x) => x.bucket === s.bucket), coded = s.cost;
  const ws = addWs(s.sheet, s.tab, { views: [{ showGridLines: true, state: 'frozen', xSplit: 1, ySplit: 0 }] });
  t.ws = ws;
  const n = Math.max(T0, T0 - 1 + t.rows.length), nRows = t.rows.length;
  [46, 12, 11, 17, 8, 13, 14].concat(new Array(MC).fill(12), [15]).forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  title(ws, `${s.bucket} – coded detail`, null, s.tab === 'C55A11' ? s.tab : C.navy);
  // detail source status
  const status = p ? `Detail source: ${p.label} – loaded (${mLab(p.from)} to ${mLab(p.to)}). ${p.note}.`
    : shell ? `Detail source: ${shell.source} – not loaded yet. Coded rows below come from CJI3 by cost element and WBS package.`
      : s.bucket === 'Revenue' ? 'Revenue (cost elements 4xxxxxxx), shown as posted (negative). Not part of Expenses and never netted against cost.' : 'Coded rows below come from CJI3 by cost element and WBS package.';
  ws.getCell('A2').value = status; ws.getCell('A2').font = font({ size: 10, bold: true, color: { argb: 'FF' + (p ? '548235' : 'C55A11') } });
  note(ws, 'A3', coded ? 'Yellow cells are yours: code each item once (PKG, MNL, Cost element code). The Expenses sheet follows.' : '');
  // reconciliation block
  head(ws.getCell(R_HDR, 1), 'Reconciliation to CJI3', C.navy); for (let c = 2; c <= 6; c++) head(ws.getCell(R_HDR, c), '', C.navy);
  head(ws.getCell(R_HDR, COL.open), 'Opening', C.gold); MONTHS.forEach((pk, i) => head(ws.getCell(R_HDR, COL.m0 + i), mLab(pk), C.blue)); head(ws.getCell(R_HDR, TOT), 'Total', C.navy);
  ws.getCell(R_PK, 1).value = 'period key'; ws.getCell(R_PK, 1).font = font({ size: 8, color: { argb: 'FF8C8C8C' } });
  num(ws.getCell(R_PK, COL.open), 0, '0', { size: 8, color: { argb: 'FF8C8C8C' } }); MONTHS.forEach((pk, i) => num(ws.getCell(R_PK, COL.m0 + i), pk, '0', { size: 8, color: { argb: 'FF8C8C8C' } }));
  const tcol = (c) => `${col(c)}${T0}:${col(c)}${n}`;
  const lab = (r, text, o) => { const c = ws.getCell(r, 1); c.value = text; c.font = font(o); ws.mergeCells(r, 1, r, 6); };
  const rowVals = (r, get, o) => { for (let c = COL.open; c <= LM; c++) { const pk = c === COL.open ? null : MONTHS[c - COL.m0]; num(ws.getCell(r, c), get(pk), F.amt, o); } };
  lab(R_C3, 'CJI3 actual – source of truth (every line of this bucket)', { bold: true }); rowVals(R_C3, (pk) => (pk == null ? t.c3.open : monthVal(t.c3, pk)), { bold: true });
  if (p) {
    lab(R_COV, `…of which explained by ${p.id} (CJI3 lines with an internal order)`); rowVals(R_COV, (pk) => (pk == null ? t.cov.open : monthVal(t.cov, pk)));
    lab(R_DET, `${p.id} detail amount (rows below)`);
    for (let c = COL.open; c <= LM; c++) { const pk = c === COL.open ? null : MONTHS[c - COL.m0]; fx(ws.getCell(R_DET, c), `SUMIFS(${tcol(c)},$B${T0}:$B${n},"${p.id}")`, pk == null ? t.det.open : monthVal(t.det, pk)); }
    lab(R_ADJ, 'Adjustment: not explained by detail (shown as a row below, so the sheet ties to CJI3)', { color: { argb: 'FFC55A11' } });
    for (let c = COL.open; c <= LM; c++) { const pk = c === COL.open ? null : MONTHS[c - COL.m0]; fx(ws.getCell(R_ADJ, c), `${col(c)}${R_COV}-${col(c)}${R_DET}`, (pk == null ? t.cov.open - t.det.open : monthVal(t.cov, pk) - monthVal(t.det, pk)), F.amt, { color: { argb: 'FFC55A11' } }); }
  } else { lab(R_COV, 'No detail report loaded: the rows below are CJI3 by cost element and WBS package.', { italic: true, color: { argb: 'FF' + C.muted } }); }
  lab(R_COD, 'Coded total on this sheet', { bold: true });
  for (let c = COL.open; c <= LM; c++) { const pk = c === COL.open ? null : MONTHS[c - COL.m0]; fx(ws.getCell(R_COD, c), `SUBTOTAL(9,${tcol(c)})`, pk == null ? sum({ open: t.rows.reduce((x, r) => x + r.open, 0), m: {} }) : t.rows.reduce((x, r) => x + monthVal(r, pk), 0), F.amt, { bold: true }); }
  lab(R_DIF, 'Difference to CJI3 (must be nil)', { bold: true });
  for (let c = COL.open; c <= LM; c++) fx(ws.getCell(R_DIF, c), `ROUND(${col(c)}${R_C3}-${col(c)}${R_COD},2)`, 0, F.amt, { bold: true });
  // totals column of the block
  const totOf = { [R_C3]: sum(t.c3), [R_COV]: sum(t.cov), [R_DET]: sum(t.det), [R_ADJ]: sum(t.cov) - sum(t.det), [R_COD]: t.rows.reduce((x, r) => x + sum(r), 0), [R_DIF]: 0 };
  for (const r of [R_C3, R_COV, R_DET, R_ADJ, R_COD, R_DIF]) { if (!p && (r === R_COV || r === R_DET || r === R_ADJ)) continue; fx(ws.getCell(r, TOT), `SUM(${col(COL.open)}${r}:${col(LM)}${r})`, totOf[r], F.amt, { bold: true }); }
  ws.addConditionalFormatting({ ref: `${col(COL.open)}${R_DIF}:${col(TOT)}${R_DIF}`, rules: [{ type: 'cellIs', operator: 'equal', formulae: ['0'], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFE2EFDA' } } } }, { type: 'cellIs', operator: 'notEqual', formulae: ['0'], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFF8CBAD' } } } }] });
  // table
  ['Item', 'Source', 'SAP cost element', 'PKG', 'MNL', 'Cost element code', 'Opening'].forEach((h, i) => head(ws.getCell(T_HDR, i + 1), h, i >= 3 && i <= 5 && coded ? C.gold : i === 6 ? C.gold : C.navy));
  MONTHS.forEach((pk, i) => head(ws.getCell(T_HDR, COL.m0 + i), mLab(pk), C.blue)); head(ws.getCell(T_HDR, TOT), 'Total', C.navy); ws.getRow(T_HDR).height = 28;
  const rows = PREVIEW ? t.rows.slice(0, 22) : t.rows;
  rows.forEach((r, i) => {
    const rw = T0 + i, row = ws.getRow(rw);
    const put = (c, v) => { const x = row.getCell(c); x.value = v; x.font = font(r.adj ? { italic: true, color: { argb: 'FFC55A11' } } : {}); return x; };
    put(COL.item, r.item); put(COL.src, r.source); put(COL.sap, r.sapce || null);
    if (coded) { put(COL.pkg, r.pkg || null); put(COL.mnl, r.mnl || null); put(COL.ce, r.cec || null); for (const c of [COL.pkg, COL.mnl, COL.ce]) row.getCell(c).fill = fill(C.edit); }
    const v = (c, a, f) => { const x = row.getCell(c); if (f) x.value = { formula: f, result: a }; else if (a) x.value = a; x.numFmt = F.amt; x.font = font(r.adj ? { italic: true, color: { argb: 'FFC55A11' } } : {}); };
    v(COL.open, r.open, r.adj ? `${col(COL.open)}${R_ADJ}` : null);
    MONTHS.forEach((pk, k) => v(COL.m0 + k, monthVal(r, pk), r.adj ? `${col(COL.m0 + k)}${R_ADJ}` : null));
    row.getCell(TOT).value = { formula: `${col(COL.open)}${rw}+SUM(${col(COL.m0)}${rw}:${col(LM)}${rw})`, result: sum(r) }; row.getCell(TOT).numFmt = F.amt; row.getCell(TOT).font = font({ bold: true });
  });
  if (!PREVIEW) ws.autoFilter = { from: { row: T_HDR, column: 1 }, to: { row: n, column: TOT } };
  if (coded) {
    ws.addConditionalFormatting({ ref: `${col(COL.pkg)}${T0}:${col(COL.ce)}${n}`, rules: [{ type: 'expression', formulae: [`AND(LEN($A${T0})>0,LEN(${col(COL.pkg)}${T0})=0)`], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFF8CBAD' } } } }] });
    ws.dataValidations.add(`${col(COL.mnl)}${T0}:${col(COL.mnl)}${n}`, { type: 'list', allowBlank: true, formulae: ['"' + B.MNLS.map((m) => m[0]).join(',') + '"'], showErrorMessage: false });
  }
  const nm = (k, a, b, r1, r2) => dn(`${s.code}_${k}`, `'${s.sheet}'!$${col(a)}$${r1}:$${col(b)}$${r2}`);
  nm('Src', COL.src, COL.src, T0, n); nm('Item', COL.item, COL.item, T0, n);
  nm('Open', COL.open, COL.open, T0, n); nm('Blk', COL.m0, LM, T0, n); nm('Hdr', COL.m0, LM, R_PK, R_PK); nm('HdrAll', COL.open, LM, R_PK, R_PK);
  if (coded) { nm('PKG', COL.pkg, COL.pkg, T0, n); nm('MNL', COL.mnl, COL.mnl, T0, n); nm('CE', COL.ce, COL.ce, T0, n); }
  for (const [k, r] of [['C3', R_C3], ['Cod', R_COD], ['Det', R_DET], ['Cov', R_COV], ['Adj', R_ADJ]]) nm(k, COL.open, LM, r, r);
  nm('CodM', COL.m0, LM, R_COD, R_COD);
  if (PREVIEW) ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, printArea: `A1:${col(TOT)}${T0 + 22}` };
}

// ------------------------------------------------------------------ 6. CJI3 sheet: the compact source of truth
{
  const ws = wsC3;
  [22, 12, 34, 14].concat(new Array(MC).fill(12), [15]).forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  title(ws, 'CJI3 – actual cost, the source of truth', `${LINES.length.toLocaleString('en-US')} posting lines, compact: bucket x cost element x month. Nothing on this sheet is typed; every other sheet is checked against it.`, C.rev);
  ['Bucket', 'Cost element', 'Cost element name', 'Opening'].forEach((h, i) => head(ws.getCell(5, i + 1), h, i === 3 ? C.gold : C.navy));
  MONTHS.forEach((pk, i) => head(ws.getCell(5, 5 + i), mLab(pk), C.blue)); head(ws.getCell(5, 5 + MC), 'Total', C.navy); ws.getRow(5).height = 26;
  let r = 6; const bucketTotal = new Map();
  for (const s of B.SHEETS) {
    const byCe = new Map();
    for (const l of LINES) if (l.bucket === s.bucket) { let o = byCe.get(l.ce + '|' + l.ceName); if (!o) byCe.set(l.ce + '|' + l.ceName, (o = { ce: l.ce, name: l.ceName, open: 0, m: {} })); addAmt(o, l, l.amt); }
    const list = [...byCe.values()].sort((a, b) => a.ce.localeCompare(b.ce));
    const hr = r++, first = r, last = r + list.length - 1;
    ws.getCell(hr, 1).value = { text: s.bucket, hyperlink: `#'${s.sheet}'!A1` }; ws.getCell(hr, 1).font = font({ bold: true, underline: true, color: { argb: 'FF' + (s.cost ? C.navy : C.rev) } });
    for (let c = 1; c <= 5 + MC; c++) { ws.getCell(hr, c).fill = fill(s.cost ? C.light : C.ok); ws.getCell(hr, c).border = box; }
    const tt = TAB.get(s.bucket).c3; bucketTotal.set(s.bucket, hr);
    for (let c = 4; c <= 4 + MC + 1; c++) { const pk = c === 4 ? null : c <= 4 + MC ? MONTHS[c - 5] : 'T'; const res = pk === 'T' ? sum(tt) : pk == null ? tt.open : monthVal(tt, pk);
      fx(ws.getCell(hr, c), `SUBTOTAL(9,${col(c)}${first}:${col(c)}${last})`, res, F.amt, { bold: true }); ws.getCell(hr, c).fill = fill(s.cost ? C.light : C.ok); }
    list.forEach((o) => { const rw = r++; ws.getRow(rw).outlineLevel = 1; ws.getCell(rw, 2).value = o.ce; ws.getCell(rw, 3).value = o.name;
      num(ws.getCell(rw, 4), o.open || null); MONTHS.forEach((pk, i) => num(ws.getCell(rw, 5 + i), monthVal(o, pk) || null)); fx(ws.getCell(rw, 5 + MC), `D${rw}+SUM(E${rw}:${col(4 + MC)}${rw})`, sum(o), F.amt, { bold: true });
      for (let c = 1; c <= 3; c++) { ws.getCell(rw, c).font = font(); ws.getCell(rw, c).border = box; } });
  }
  ws.properties.outlineProperties = { summaryBelow: false }; ws.properties.outlineLevelRow = 1;
  const rEnd = r - 1, rTc = r + 1;
  ws.getCell(rTc, 1).value = 'Cost (all buckets except Revenue)'; ws.getCell(rTc + 1, 1).value = 'Revenue (shown as posted)'; ws.getCell(rTc + 2, 1).value = 'Grand total (cost + revenue) = CJI3 export total';
  const costHdr = COSTS.map((s) => bucketTotal.get(s.bucket)), revHdr = bucketTotal.get('Revenue');
  for (let c = 4; c <= 5 + MC; c++) {
    const pk = c === 4 ? null : c <= 4 + MC ? MONTHS[c - 5] : 'T', val = (b) => { const tt = TAB.get(b).c3; return pk === 'T' ? sum(tt) : pk == null ? tt.open : monthVal(tt, pk); };
    const cs = COSTS.reduce((x, s) => x + val(s.bucket), 0), rv = val('Revenue');
    fx(ws.getCell(rTc, c), costHdr.map((h) => `${col(c)}${h}`).join('+'), cs, F.amt, { bold: true }); fx(ws.getCell(rTc + 1, c), `${col(c)}${revHdr}`, rv, F.amt, { bold: true, color: { argb: 'FF' + C.rev } });
    fx(ws.getCell(rTc + 2, c), `${col(c)}${rTc}+${col(c)}${rTc + 1}`, cs + rv, F.amt, { bold: true });
  }
  for (let rr = rTc; rr <= rTc + 2; rr++) ws.getCell(rr, 1).font = font({ bold: true });
  dn('C3_CostTotal', `'CJI3'!$${col(5 + MC)}$${rTc}`); dn('C3_RevTotal', `'CJI3'!$${col(5 + MC)}$${rTc + 1}`); dn('C3_GrandTotal', `'CJI3'!$${col(5 + MC)}$${rTc + 2}`);
  if (PREVIEW) ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, printArea: `A1:${col(5 + MC)}${Math.min(rEnd + 6, 45)}` };
}

// ------------------------------------------------------------------ 7. Expenses: every bucket's coded table, collected
const slotOf = (isOpen, pk) => (isOpen ? 0 : pk < REPY * 100 + 1 ? 1 : Math.floor(pk / 100) === REPY && pk <= CUTPK ? 1 + (pk % 100) : null);
const zero14 = () => new Array(14).fill(0);
const combos = new Map();
for (const s of COSTS) for (const r of TAB.get(s.bucket).rows) {
  const k = [r.pkg, r.mnl, r.cec].join('\u0001'); let c = combos.get(k); if (!c) combos.set(k, (c = { pkg: r.pkg, mnl: r.mnl, cec: r.cec, names: new Map(), v: zero14() }));
  c.names.set(r.item, (c.names.get(r.item) || 0) + Math.abs(sum(r)));
  c.v[0] += r.open; for (const [pk, a] of Object.entries(r.m)) { const sl = slotOf(false, +pk); if (sl != null) c.v[sl] += a; }
}
const comboList = [...combos.values()].map((c) => Object.assign(c, { name: [...c.names].sort((a, b) => b[1] - a[1])[0][0] }));
const mnlOrder = new Map(B.MNLS.map((m, i) => [m[0], i]));
comboList.sort((a, b) => (mnlOrder.get(a.mnl) ?? 99) - (mnlOrder.get(b.mnl) ?? 99) || a.pkg.localeCompare(b.pkg, 'en', { numeric: true }) || a.cec.localeCompare(b.cec, 'en', { numeric: true }));
const sumTerms = (f) => COSTS.map((s) => f(s.code)).join('+');
const sum14 = (v) => v.reduce((x, y) => x + y, 0);
let expTotal = 0;
{
  const ws = wsExp;
  [20, 8, 13, 32, 14, 14].concat(new Array(12).fill(11.5), [15, 8]).forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  title(ws, 'Expenses – the coded actuals of the project', null);
  ws.getCell('A2').value = { formula: '"Collected from the coded tables of all cost buckets · cut date "&TEXT(CutDate,"dd-mmm-yyyy")&" · every amount follows the PKG, MNL and Cost element code typed on the bucket sheets"', result: `Collected from the coded tables of all cost buckets · cut date ${monthEnd(CUTPK).toISOString().slice(8, 10)}-${MON[(CUTPK % 100) - 1]}-${REPY}` };
  ws.getCell('A2').font = font({ size: 9, color: { argb: 'FF' + C.muted } });
  ws.getRow(3).hidden = true; for (let m = 1; m <= 12; m++) ws.getCell(3, 6 + m).value = { formula: `RepYear*100+${m}`, result: REPY * 100 + m };
  ['PKG', 'MNL', 'Cost element code', 'Largest item', 'Opening balance', 'Previous'].forEach((h, i) => head(ws.getCell(4, i + 1), h, i === 4 ? C.gold : C.navy));
  for (let m = 1; m <= 12; m++) head(ws.getCell(4, 6 + m), { formula: `TEXT(DATE(RepYear,${m},1),"mmm-yy")`, result: mLab(REPY * 100 + m) }, C.blue);
  head(ws.getCell(4, 19), 'To date', C.navy); head(ws.getCell(4, 20), 'Share', C.navy); ws.getRow(4).height = 28;
  const DR0 = 6; let r = DR0; const groups = [], mnlName = new Map(B.MNLS);
  const setN = (row, c, f, res, bold, bg) => { const x = ws.getCell(row, c); x.value = { formula: f, result: res }; x.numFmt = F.amt; x.font = font({ bold }); x.border = box; if (bg) x.fill = fill(bg); };
  const monthRes = (v, mm) => (REPY * 100 + mm > CUTPK ? '' : v[1 + mm]);
  for (const m of B.MNLS.map((x) => x[0])) {
    const cs = comboList.filter((c) => c.mnl === m); if (!cs.length) continue;
    const gr = r++, first = r, last = r + cs.length - 1, gv = zero14(); cs.forEach((c) => c.v.forEach((x, i) => { gv[i] += x; }));
    ws.getCell(gr, 1).value = `${m} · ${mnlName.get(m)}`; ws.getCell(gr, 2).value = m; groups.push({ gr, m, v: gv });
    for (let c = 5; c <= 19; c++) setN(gr, c, `SUBTOTAL(9,${col(c)}${first}:${col(c)}${last})`, c === 5 ? gv[0] : c === 6 ? gv[1] : c === 19 ? sum14(gv) : monthRes(gv, c - 6), true, C.light);
    for (let c = 1; c <= 4; c++) { const x = ws.getCell(gr, c); x.font = font({ bold: true, color: { argb: 'FF' + C.navy } }); x.fill = fill(C.light); x.border = box; }
    cs.forEach((cmb) => {
      const row = r++; ws.getRow(row).outlineLevel = 1;
      [cmb.pkg, cmb.mnl, cmb.cec, cmb.name].forEach((v, i) => { const x = ws.getCell(row, i + 1); x.value = v; x.font = font(); x.border = box; });
      const t = (p, body) => `SUMPRODUCT(${body(p)}*(${p}_PKG=$A${row})*(${p}_MNL=$B${row})*(${p}_CE=$C${row})*${p}_Blk)`, v = cmb.v;
      setN(row, 5, sumTerms((p) => `SUMIFS(${p}_Open,${p}_PKG,$A${row},${p}_MNL,$B${row},${p}_CE,$C${row})`), v[0]);
      setN(row, 6, sumTerms((p) => t(p, (q) => `(${q}_Hdr<RepYear*100+1)`)), v[1]);
      for (let mm = 1; mm <= 12; mm++) setN(row, 6 + mm, `IF(${col(6 + mm)}$3>CutPK,"",${sumTerms((p) => t(p, (q) => `(${q}_Hdr=${col(6 + mm)}$3)`))})`, monthRes(v, mm));
      setN(row, 19, `E${row}+F${row}+SUM(G${row}:R${row})`, sum14(v), true);
    });
  }
  const lastRow = r - 1, gt = zero14(); comboList.forEach((c) => c.v.forEach((x, i) => { gt[i] += x; })); expTotal = sum14(gt);
  ws.getCell(5, 1).value = 'TOTAL EXPENSES'; for (let c = 1; c <= 4; c++) { const x = ws.getCell(5, c); x.font = font({ bold: true, color: { argb: 'FFFFFFFF' } }); x.fill = fill(C.navy); x.border = box; }
  for (let c = 5; c <= 19; c++) { setN(5, c, `SUBTOTAL(9,${col(c)}${DR0}:${col(c)}${lastRow})`, c === 5 ? gt[0] : c === 6 ? gt[1] : c === 19 ? sum14(gt) : monthRes(gt, c - 6), true, C.navy); ws.getCell(5, c).font = font({ bold: true, color: { argb: 'FFFFFFFF' } }); }
  const share = (rw, res) => { const x = ws.getCell(rw, 20); x.value = { formula: `IF($S$5=0,"",S${rw}/$S$5)`, result: res }; x.numFmt = F.pct; x.font = font({ bold: rw === 5 }); x.border = box; };
  share(5, 1); groups.forEach((g) => share(g.gr, expTotal ? sum14(g.v) / expTotal : ''));
  const cR = lastRow + 2;
  ws.getCell(cR, 1).value = 'Control: coded totals of the bucket sheets'; ws.getCell(cR, 1).font = font({ bold: true, color: { argb: 'FF' + C.muted } });
  ws.getCell(cR + 1, 1).value = 'Difference (must be nil)'; ws.getCell(cR + 1, 1).font = font({ bold: true });
  for (let c = 5; c <= 19; c++) {
    let f; if (c === 5) f = sumTerms((p) => `INDEX(${p}_Cod,1,1)`); else if (c === 6) f = sumTerms((p) => `SUMPRODUCT((${p}_Hdr<RepYear*100+1)*${p}_CodM)`);
    else if (c === 19) f = `E${cR}+F${cR}+SUM(G${cR}:R${cR})`; else f = `IF(${col(c)}$3>CutPK,"",${sumTerms((p) => `SUMPRODUCT((${p}_Hdr=${col(c)}$3)*${p}_CodM)`)})`;
    fx(ws.getCell(cR, c), f, c === 5 ? gt[0] : c === 6 ? gt[1] : c === 19 ? sum14(gt) : monthRes(gt, c - 6), F.amt, { color: { argb: 'FF' + C.muted } });
    fx(ws.getCell(cR + 1, c), `ROUND(N(${col(c)}5)-N(${col(c)}${cR}),2)`, 0, F.amt, { bold: true });
  }
  ws.addConditionalFormatting({ ref: `E${cR + 1}:S${cR + 1}`, rules: [{ type: 'cellIs', operator: 'equal', formulae: ['0'], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFE2EFDA' } } } }, { type: 'cellIs', operator: 'notEqual', formulae: ['0'], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFF8CBAD' } } } }] });
  ws.properties.outlineProperties = { summaryBelow: false }; ws.properties.outlineLevelRow = 1;
  ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: lastRow, column: 20 } }; dn('Exp_Total', `'Expenses'!$S$5`);
  if (PREVIEW) ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, printArea: `A1:T${Math.min(lastRow, 60)}` };
  console.log('Expenses:', comboList.length, 'PKG+MNL+CE rows, total', expTotal.toFixed(2));
}

// ------------------------------------------------------------------ 8. Summary: the big picture
{
  const ws = wsSum; [28, 28, 14, 14, 14, 14, 14, 13].forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  ws.getCell('A1').value = 'Project Cost Register'; ws.getCell('A1').font = font({ size: 16, bold: true, color: { argb: 'FF' + C.navy } });
  ws.getCell('A2').value = `${PROJECT} · EGP`; ws.getCell('A2').font = font({ size: 11, bold: true });
  const posted = LINES.map((l) => l.date).filter(Boolean).sort();
  note(ws, 'A3', `Actuals from CJI3 (${LINES.length.toLocaleString('en-US')} lines, posted ${posted[0]} to ${posted[posted.length - 1]}) are the source of truth. Detail reports explain each bucket; Expenses is the coded result.`);
  const a4 = ws.getCell('A4'); a4.value = 'Cut date  ▸'; a4.font = font({ size: 12, bold: true, color: { argb: 'FF' + C.navy } }); a4.alignment = { horizontal: 'right', vertical: 'middle' };
  const b4 = ws.getCell('B4'); b4.value = monthEnd(CUTPK); b4.numFmt = F.date; b4.font = font({ size: 12, bold: true }); b4.fill = fill(C.edit); b4.alignment = { horizontal: 'left', vertical: 'middle' }; b4.border = box;
  b4.dataValidation = { type: 'list', allowBlank: false, formulae: [`_Cal!$A$1:$A$${MC}`], showErrorMessage: true, errorTitle: 'Cut date', error: 'Pick a month end from the list.' };
  note(ws, 'C4', 'Pick the cut date from the list (▼): Summary and Expenses follow.');
  ws.getCell('A5').value = 'Report year'; ws.getCell('B5').value = { formula: 'YEAR(B4)', result: REPY }; ws.getCell('A6').value = 'Cut period key'; ws.getCell('B6').value = { formula: 'YEAR(B4)*100+MONTH(B4)', result: CUTPK };
  for (const a of ['A5', 'A6', 'B5', 'B6']) { ws.getCell(a).font = font({ size: 8, color: { argb: 'FF8C8C8C' } }); ws.getCell(a).alignment = { horizontal: 'left' }; }
  dn('CutDate', "'Summary'!$B$4"); dn('RepYear', "'Summary'!$B$5"); dn('CutPK', "'Summary'!$B$6");
  const NEED = COSTS.filter((s) => !['Unclassified', 'Opening balance'].includes(s.bucket)).length;     // buckets that can have a detail report
  const toDate = (p, name, res) => ({ f: `SUMPRODUCT((${p}_HdrAll<=CutPK)*${p}_${name})`, r: res });
  const sumTo = (o) => (o.open || 0) + Object.entries(o.m).filter(([pk]) => +pk <= CUTPK).reduce((x, [, a]) => x + a, 0);
  // KPI band
  const costC3 = COSTS.reduce((x, s) => x + sumTo(TAB.get(s.bucket).c3), 0), revC3 = sumTo(TAB.get('Revenue').c3);
  const kp = [['Cost to date (CJI3)', COSTS.map((s) => toDate(s.code, 'C3').f).join('+'), costC3, C.navy], ['Revenue to date', `-(${toDate('REV', 'C3').f})`, -revC3, C.rev],
    ['Expenses (coded) to date', 'Exp_Total', expTotal, C.navy], ['Buckets with a detail report', `${PROVIDERS.reduce((x, p) => x + p.buckets.length, 0)}&" of "&${NEED}`, `${PROVIDERS.reduce((x, p) => x + p.buckets.length, 0)} of ${NEED}`, C.gold]];
  const spans = [[1, 1], [2, 2], [3, 4], [5, 6]];
  kp.forEach(([lab, f, res, bg], i) => { const [c1, c2] = spans[i]; ws.mergeCells(8, c1, 8, c2); ws.mergeCells(9, c1, 9, c2);
    const l = ws.getCell(8, c1), v = ws.getCell(9, c1); l.value = lab; l.font = font({ size: 9, bold: true, color: { argb: 'FFFFFFFF' } }); l.fill = fill(bg); l.alignment = { horizontal: 'center', vertical: 'middle' };
    v.value = { formula: f, result: res }; v.numFmt = F.amt; v.font = font({ size: 14, bold: true, color: { argb: 'FF' + C.navy } }); v.alignment = { horizontal: 'center', vertical: 'middle' }; v.fill = fill(i === 1 ? C.ok : C.white);
    for (let c = c1; c <= c2; c++) { ws.getCell(8, c).fill = fill(bg); ws.getCell(8, c).border = box; ws.getCell(9, c).border = box; } });
  ws.getRow(8).height = 22; ws.getRow(9).height = 30;
  // reconciliation table: one row per cost bucket
  const H = 12; ['Bucket', 'Detail source', 'CJI3 to date', 'Detail explains', 'Adjustment', 'Coded (Expenses)', 'Difference', 'Status'].forEach((h, i) => head(ws.getCell(H, i + 1), h, i === 0 ? C.navy : C.blue));
  ws.mergeCells(H, 8, H, 12); for (let c = 9; c <= 12; c++) head(ws.getCell(H, c), '', C.blue);
  ws.getRow(H).height = 26;
  let totals = { c3: 0, det: 0, adj: 0, cod: 0 };
  COSTS.forEach((s, i) => {
    const rw = H + 1 + i, t = TAB.get(s.bucket), p = t.provider, shell = SHELLS.find((x) => x.bucket === s.bucket);
    const c3 = sumTo(t.c3), det = p ? sumTo(t.det) : 0, adj = p ? sumTo(t.cov) - sumTo(t.det) : 0, cod = t.rows.reduce((x, r) => x + sumTo(r), 0);
    totals.c3 += c3; totals.det += det; totals.adj += adj; totals.cod += cod;
    ws.getCell(rw, 1).value = { text: s.bucket, hyperlink: `#'${s.sheet}'!A1` }; ws.getCell(rw, 1).font = font({ color: { argb: 'FF' + C.blue }, underline: true }); ws.getCell(rw, 1).border = box;
    const src = p ? p.label : shell ? shell.source : 'CJI3 only'; const sc = ws.getCell(rw, 2); sc.value = src; sc.font = font({ size: 9 }); sc.border = box; sc.alignment = { wrapText: true, vertical: 'middle' };
    fx(ws.getCell(rw, 3), toDate(s.code, 'C3').f, c3); fx(ws.getCell(rw, 4), p ? toDate(s.code, 'Det').f : '0', det); fx(ws.getCell(rw, 5), p ? toDate(s.code, 'Adj').f : '0', adj);
    fx(ws.getCell(rw, 6), toDate(s.code, 'Cod').f, cod); fx(ws.getCell(rw, 7), `ROUND(C${rw}-F${rw},2)`, 0);
    const ratio = Math.abs(sumTo(t.cov)) > 0 ? det / sumTo(t.cov) : null;
    const stat = p ? (ratio == null ? 'Detail loaded' : Math.abs(ratio - 1) < 0.005 ? 'Detail loaded · ties to CJI3' : `Detail loaded · detail is ${(100 * ratio).toFixed(0)}% of the CJI3 lines it explains`) : shell && shell.covers ? 'Detail not loaded · using CJI3' : shell && /offline/.test(shell.source) ? 'Offline sheet not loaded · using CJI3' : 'CJI3 only';
    ws.mergeCells(rw, 8, rw, 12); const st = ws.getCell(rw, 8); st.value = stat; st.font = font({ size: 9, color: { argb: 'FF' + (p ? '548235' : 'C55A11') } }); for (let c = 8; c <= 12; c++) ws.getCell(rw, c).border = box;
  });
  const rT = H + 1 + COSTS.length;
  ws.getCell(rT, 1).value = 'Total'; for (let c = 1; c <= 8; c++) { ws.getCell(rT, c).fill = fill(C.light); ws.getCell(rT, c).border = box; ws.getCell(rT, c).font = font({ bold: true, color: { argb: 'FF' + C.navy } }); }
  for (let c = 9; c <= 12; c++) { ws.getCell(rT, c).fill = fill(C.light); ws.getCell(rT, c).border = box; }
  [[3, totals.c3], [4, totals.det], [5, totals.adj], [6, totals.cod], [7, 0]].forEach(([c, res]) => { fx(ws.getCell(rT, c), `SUM(${col(c)}${H + 1}:${col(c)}${rT - 1})`, res, F.amt, { bold: true, color: { argb: 'FF' + C.navy } }); ws.getCell(rT, c).fill = fill(C.light); });
  ws.addConditionalFormatting({ ref: `G${H + 1}:G${rT}`, rules: [{ type: 'cellIs', operator: 'equal', formulae: ['0'], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFE2EFDA' } } } }, { type: 'cellIs', operator: 'notEqual', formulae: ['0'], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFF8CBAD' } } } }] });
  // month table of expenses by bucket
  const H2 = rT + 3; ws.getCell(H2 - 1, 1).value = 'Coded actuals by bucket and month (what Expenses collects)'; ws.getCell(H2 - 1, 1).font = font({ bold: true, color: { argb: 'FF' + C.navy } });
  head(ws.getCell(H2, 1), 'Bucket', C.navy); head(ws.getCell(H2, 2), 'Opening', C.gold);
  MONTHS.forEach((pk, i) => head(ws.getCell(H2, 3 + i), mLab(pk), C.blue)); head(ws.getCell(H2, 3 + MC), 'Total', C.navy);
  for (let c = 8; c <= 3 + MC; c++) ws.getColumn(c).width = 13;
  COSTS.forEach((s, i) => { const rw = H2 + 1 + i, t = TAB.get(s.bucket); ws.getCell(rw, 1).value = s.bucket; ws.getCell(rw, 1).font = font(); ws.getCell(rw, 1).border = box;
    const codOpen = t.rows.reduce((x, r) => x + r.open, 0); fx(ws.getCell(rw, 2), `INDEX(${s.code}_Cod,1,1)`, codOpen);
    MONTHS.forEach((pk, k) => fx(ws.getCell(rw, 3 + k), `INDEX(${s.code}_Cod,1,${k + 2})`, t.rows.reduce((x, r) => x + monthVal(r, pk), 0)));
    fx(ws.getCell(rw, 3 + MC), `SUM(B${rw}:${col(2 + MC)}${rw})`, sum({ open: codOpen, m: Object.fromEntries(MONTHS.map((pk) => [pk, t.rows.reduce((x, r) => x + monthVal(r, pk), 0)])) }), F.amt, { bold: true }); });
  const rT2 = H2 + 1 + COSTS.length; ws.getCell(rT2, 1).value = 'Total cost'; for (let c = 1; c <= 3 + MC; c++) { ws.getCell(rT2, c).fill = fill(C.light); ws.getCell(rT2, c).border = box; ws.getCell(rT2, c).font = font({ bold: true, color: { argb: 'FF' + C.navy } }); }
  for (let c = 2; c <= 3 + MC; c++) { const pk = c === 2 ? null : c <= 2 + MC ? MONTHS[c - 3] : 'T'; const tot = COSTS.reduce((x, s) => { const t = TAB.get(s.bucket); return x + (pk === 'T' ? t.rows.reduce((y, r) => y + sum(r), 0) : pk == null ? t.rows.reduce((y, r) => y + r.open, 0) : t.rows.reduce((y, r) => y + monthVal(r, pk), 0)); }, 0);
    fx(ws.getCell(rT2, c), `SUM(${col(c)}${H2 + 1}:${col(c)}${rT2 - 1})`, tot, F.amt, { bold: true, color: { argb: 'FF' + C.navy } }); ws.getCell(rT2, c).fill = fill(C.light); }
  const rv = rT2 + 2; ws.getCell(rv, 1).value = 'Revenue (not netted)'; ws.getCell(rv, 1).font = font({ bold: true, color: { argb: 'FF' + C.rev } });
  const rvt = TAB.get('Revenue'); fx(ws.getCell(rv, 2), `-INDEX(REV_Cod,1,1)`, -rvt.rows.reduce((x, r) => x + r.open, 0), F.amt, { color: { argb: 'FF' + C.rev } });
  MONTHS.forEach((pk, k) => fx(ws.getCell(rv, 3 + k), `-INDEX(REV_Cod,1,${k + 2})`, -rvt.rows.reduce((x, r) => x + monthVal(r, pk), 0), F.amt, { color: { argb: 'FF' + C.rev } }));
  fx(ws.getCell(rv, 3 + MC), `SUM(B${rv}:${col(2 + MC)}${rv})`, -rvt.rows.reduce((x, r) => x + sum(r), 0), F.amt, { bold: true, color: { argb: 'FF' + C.rev } });
  ws.getCell(rv + 2, 1).value = 'Sheets'; ws.getCell(rv + 2, 1).font = font({ bold: true, color: { argb: 'FF' + C.navy } });
  ['CJI3', 'Expenses', 'Checks', 'Lists', 'Notes'].forEach((n, i) => { const x = ws.getCell(rv + 3 + i, 1); x.value = { text: n, hyperlink: `#'${n}'!A1` }; x.font = font({ color: { argb: 'FF' + C.blue }, underline: true }); });
  if (PREVIEW) ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 1 };
}

// ------------------------------------------------------------------ 9. Checks, Lists, Notes, _Cal
{
  const ws = addWs('Checks', 'C55A11', { views: [{ showGridLines: false }] }); [60, 20, 20, 14, 10].forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  title(ws, 'Checks', 'Expected = read from the CJI3 export when this workbook was made. In the workbook = live formula.', 'C55A11');
  ['Check', 'Expected', 'In the workbook', 'Difference', 'Status'].forEach((h, i) => head(ws.getCell(4, i + 1), h, 'C55A11'));
  const costTot = COSTS.reduce((x, s) => x + sum(TAB.get(s.bucket).c3), 0), revTot = sum(TAB.get('Revenue').c3);
  const items = [
    ['CJI3 export grand total (cost + revenue)', SRC.footer, 'C3_GrandTotal', costTot + revTot],
    ['CJI3 sheet cost = sum of the bucket sheets\' CJI3 rows', null, 'C3_CostTotal', costTot, COSTS.map((s) => `SUM(${s.code}_C3)`).join('+')],
    ['Every bucket sheet: coded total = CJI3 (sum of absolute differences)', 0, B.SHEETS.map((s) => `SUMPRODUCT(ABS(${s.code}_C3-${s.code}_Cod))`).join('+'), 0],
    ['Expenses total (all periods) = CJI3 cost', costTot, 'SUM(' + COSTS.map((s) => `${s.code}_Cod`).join(',') + ')', expTotal],
    ['Expenses sheet total to the cut date = coded totals to the cut date', null, 'Exp_Total', expTotal, COSTS.map((s) => `SUMPRODUCT((${s.code}_HdrAll<=CutPK)*${s.code}_Cod)`).join('+')],
  ];
  items.forEach(([lab, exp, f, res, ctl], i) => { const r = 5 + i; ws.getCell(r, 1).value = lab; ws.getCell(r, 1).font = font();
    if (ctl) fx(ws.getCell(r, 2), ctl, res, F.amt2); else num(ws.getCell(r, 2), exp, F.amt2);
    fx(ws.getCell(r, 3), f, res, F.amt2); fx(ws.getCell(r, 4), `ROUND(C${r}-B${r},2)`, Math.round((res - (ctl ? res : exp)) * 100) / 100, F.amt2);
    const s = ws.getCell(r, 5); s.value = { formula: `IF(D${r}=0,"OK","CHECK")`, result: 'OK' }; s.font = font({ bold: true }); s.alignment = { horizontal: 'center' }; s.border = box; });
  ws.addConditionalFormatting({ ref: `E5:E${4 + items.length}`, rules: [{ type: 'cellIs', operator: 'equal', formulae: ['"OK"'], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFE2EFDA' } } } }, { type: 'cellIs', operator: 'equal', formulae: ['"CHECK"'], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFF8CBAD' } } } }] });
  ws.getCell(12, 1).value = 'Detail reports'; ws.getCell(12, 1).font = font({ bold: true, color: { argb: 'FF' + C.navy } });
  PROVIDERS.forEach((p, i) => { ws.getCell(13 + i, 1).value = `${p.label}: ${p.note}`; ws.getCell(13 + i, 1).font = font({ size: 9 }); });
}
{
  const ws = addWs('Lists', C.gold, { views: [{ showGridLines: false }] }); [22, 4, 12, 18, 4, 14].forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  title(ws, 'Lists – the codes in use', 'PKG, MNL and Cost element code are free codes: type any new code on an item.', C.gold);
  head(ws.getCell(4, 1), 'PKG', C.gold); head(ws.getCell(4, 3), 'MNL', C.gold); head(ws.getCell(4, 4), 'MNL name', C.gold); head(ws.getCell(4, 6), 'Cost element code', C.gold);
  [...new Set(comboList.map((c) => c.pkg))].sort((a, b) => a.localeCompare(b, 'en', { numeric: true })).forEach((p, i) => { ws.getCell(5 + i, 1).value = p; });
  B.MNLS.forEach(([c, n], i) => { ws.getCell(5 + i, 3).value = c; ws.getCell(5 + i, 4).value = n; });
  [...new Set(comboList.map((c) => c.cec))].sort((a, b) => a.localeCompare(b, 'en', { numeric: true })).forEach((p, i) => { ws.getCell(5 + i, 6).value = p; });
}
{
  const ws = addWs('Notes', '7F7F7F', { views: [{ showGridLines: false }] }); ws.getColumn(1).width = 130; title(ws, 'How this register works', null, C.navy);
  ['1. CJI3 is the single source of truth for actuals. Cost = all cost elements except 4xxxxxxx; revenue (4xxxxxxx) is its own sheet and is never netted against cost.',
    '2. Months come from the posting date. Go-live opening balances (document types UE, ZB, MD, HT) are the Opening column, not month activity.',
    '3. Every other report is detail for one bucket. Where a detail report is loaded, it replaces the CJI3 lines it explains; the difference is one visible Adjustment row, so the bucket sheet always equals CJI3.',
    '4. Detail dated after the CJI3 data date is left out: CJI3 decides what is actual.',
    '5. Each bucket sheet is a coded table: PKG, MNL and Cost element code are typed once per item (yellow). Until the project\'s own code lists are used, PKG is the WBS work-package group, MNL comes from the bucket, and the cost element code is the SAP number.',
    '6. Expenses collects the coded tables of all cost buckets into one coded sheet. Analysis of Expenses is done outside this workbook.',
    '7. Shells: Subcontractor and Material show their CJI3 rows until their Subcontract / Material report output is plugged in. Labor, Depreciation and G&A have no SAP detail report; they stay on CJI3 rows unless an offline sheet is plugged in.'].forEach((t, i) => { const c = ws.getCell(3 + i, 1); c.value = t; c.font = font(); c.alignment = { wrapText: true, vertical: 'top' }; ws.getRow(3 + i).height = 30; });
}
{ const ws = wb.addWorksheet('_Cal', { state: 'hidden' }); MONTHS.forEach((pk, i) => { const c = ws.getCell(i + 1, 1); c.value = monthEnd(pk); c.numFmt = F.date; }); }

wb.xlsx.writeFile(OUT).then(() => console.log('written', OUT, (fs.statSync(OUT).size / 1e6).toFixed(1) + ' MB'));
