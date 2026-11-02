'use strict';
// Expenses: the coded actual cost by PKG › Bucket › Item, as a DYNAMIC list (Excel 365).
//  _Stack (hidden): one row per item (links to the per Month sheets, counted lines) + one block per bucket that collects
//                   the hand-coded lines (typed over on a Data sheet) by item × PKG × MNL × Cost element code (a spill each).
//  Expenses:        the PKG list (typed once, yellow) with its totals, the choices (PKG, Bucket, Lines, Sort) and the list –
//                   one formula (FILTER + SORTBY) that keeps itself sorted PKG › Bucket › Item whatever is coded.
const W = require('./workbook');
const { r2, colL } = require('./util');
const { fill, font, box, q, setF, title, header, itemOf, descOf, AMT0, NAVY, GREY, RED, GOLD, YELLOW } = W;

const PK_H = 5, PK_1 = 6, PK_N = 20, PK_Z = PK_1 + PK_N - 1;            // PKG list rows 6..25
const R_NO = PK_Z + 1, R_OUT = PK_Z + 2, R_TOT = PK_Z + 3, R_EXC = PK_Z + 4;
const R_CTL = R_EXC + 4, L_H = R_CTL + 2, L_1 = L_H + 1;                 // choices row, list header, list anchor
const HC_ROWS = 1000;                                                     // room for hand-coded combinations per bucket
const NO_PKG = '(no PKG yet)';
const SHOWS = ['All lines', 'Hand-coded lines', 'Not fully coded', 'Moved this month'];
const SORTS = ['PKG › Bucket › Item', 'To date, largest first', 'This month, largest first'];
const STRONG = ['A4CDEA', 'EAC1A4', 'C8EAA4', 'D8A4EA', 'A4EAD8', 'EAD8A4', 'EAA4B8', 'A4C3EA', 'EAA4D8', 'C1A4EA', 'A4EAA4', 'EAA4A4'];
const tint = (hex, t) => [0, 2, 4].map((i) => Math.round(parseInt(hex.slice(i, i + 2), 16) + (255 - parseInt(hex.slice(i, i + 2), 16)) * t).toString(16).padStart(2, '0')).join('').toUpperCase();
const cfFill = (c) => ({ type: 'pattern', pattern: 'solid', bgColor: { argb: 'FF' + c } });
const X = (f) => f;   // formulas below are written with the _xlfn prefixes Excel 365 stores

// item / description of a coding row as a formula over a sheet range row (per Month or Coding) – same as itemOf/descOf
function itemDescF(def, cell) {   // cell(colIndex) -> reference text
  if (def.id === 'Material') return [`${cell(4)}&""`, `${cell(5)}&""`];
  if (def.id === 'Subcontractor') return [`${cell(2)}&""`, `${cell(3)}&""`];
  if (def.id === 'G&A') return [`${cell(1)}&" · "&${cell(2)}`, null];
  return def.cols.length > 1 ? [`${cell(1)}&""`, `${cell(2)}&""`] : [`${cell(1)}&""`, null];
}
const sv = (v) => (v === null || v === undefined ? '' : String(v));

function stackSheets(wb, model, infos, opts, prev) {
  const P = model.periods, np = P.length, rep = model.reportLabel;
  const cPer = (p) => 7 + p, cTD = 7 + np, cTM = 8 + np, cKind = 9 + np, cBno = 10 + np, cSeq = 11 + np, cNZ = 12 + np, LC = colL(cNZ), lastPer = colL(6 + np);
  const ws = wb.addWorksheet('_Stack', { state: 'hidden' });
  ['Bucket', 'Item', 'Description', 'PKG', 'MNL', 'Cost element code', ...P, 'To date', 'This month', 'Line', 'Bucket no', 'Seq', 'NZ'].forEach((h, i) => { ws.getCell(1, i + 1).value = h; });
  const H = `_Stack!$G$1:$${lastPer}$1`, rows = [];
  // ---- one row per item (counted lines, not typed over) – links to the per Month sheet
  let r = 2, seq = 0;
  infos.forEach((inf, bi) => {
    const def = inf.def, pm = q(inf.nPm);
    for (const it of inf.b.items) {
      const ls = it.lines.filter((l) => l.inc === 'Yes' && l.s === 0), per = P.map((p) => r2(ls.filter((l) => l.per === p).reduce((s, l) => s + l.amt, 0)));
      const td = r2(per.slice(0, np - 1).reduce((s, v) => s + v, 0)), tm = r2(per[P.indexOf(rep)] || 0), nz = per.reduce((s, v) => s + Math.abs(v), 0) > 0.005 ? 1 : 0;
      const [fi, fd] = itemDescF(def, (c) => `${pm}!$${colL(c)}$${it.pmRow}`);
      const row = { bucket: def.id, item: sv(itemOf(def, it)), desc: sv(descOf(def, it)), pkg: sv(it.pkg), mnl: sv(it.mnl), ce: sv(it.ce), per, td, tm, kind: 'Item', bno: bi + 1, seq: ++seq, nz };
      rows.push(row);
      ws.getCell(r, 1).value = def.id; setF(ws.getCell(r, 2), fi, row.item); setF(ws.getCell(r, 3), fd || '""', row.desc);
      [['pkg', 1], ['mnl', 2], ['ce', 3]].forEach(([k, o], j) => setF(ws.getCell(r, 4 + j), `${pm}!$${colL(inf.k + o)}$${it.pmRow}&""`, row[k]));
      for (let p = 0; p < np; p++) setF(ws.getCell(r, cPer(p)), `${pm}!$${colL(inf.amtCol(p))}$${it.pmRow}`, per[p]);
      setF(ws.getCell(r, cTD), `SUM(G${r}:${colL(cPer(np - 2))}${r})`, td);
      setF(ws.getCell(r, cTM), `SUMIF($G$1:$${lastPer}$1,Summary!$D$4,G${r}:${lastPer}${r})`, tm);
      ws.getCell(r, cKind).value = 'Item'; ws.getCell(r, cBno).value = bi + 1; ws.getCell(r, cSeq).value = seq;
      setF(ws.getCell(r, cNZ), `IF(SUMPRODUCT(ABS(G${r}:${lastPer}${r}))>0.005,1,0)`, nz);
      r++;
    }
  });
  const lastItemRow = r - 1, HB = r + 1, END = HB + infos.length * HC_ROWS - 1, anchors = [];
  // ---- hand-coded lines: one spill per bucket, rows HB + i*HC_ROWS
  infos.forEach((inf, bi) => {
    const def = inf.def, D = inf.D, dr = (c) => `${q(inf.nDat)}!$${colL(c)}$5:$${colL(c)}$${inf.lastD}`, cr = (c) => `${q(inf.nCod)}!$${colL(c)}$7:$${colL(c)}$${inf.lastC}`;
    const ar = HB + bi * HC_ROWS, n = 'h' + bi;
    // JS: the same grouping (first occurrence in Data row order, case-insensitive keys like UNIQUE)
    const hc = inf.b.items.flatMap((it) => it.lines.map((l) => ({ l, it }))).filter(({ l }) => l.inc === 'Yes' && l.s === 1).sort((a, b) => a.l.row - b.l.row);
    const grp = new Map();
    for (const { l, it } of hc) { const key = [it.id, sv(l.pkg), sv(l.mnl), sv(l.cec)].map((s) => String(s).toLowerCase()).join('\u0001'); let g = grp.get(key); if (!g) { g = { it, pkg: sv(l.pkg), mnl: sv(l.mnl), ce: sv(l.cec), per: P.map(() => 0) }; grp.set(key, g); } g.per[P.indexOf(l.per)] += l.amt; }
    const out = grp.size ? [...grp.values()] : [{ it: null, pkg: '', mnl: '', ce: '', per: P.map(() => 0) }];
    const blk = out.map((g, j) => { const per = g.per.map(r2); return { bucket: def.id, item: g.it ? sv(itemOf(def, g.it)) : '', desc: g.it ? sv(descOf(def, g.it)) : '', pkg: g.pkg, mnl: g.mnl, ce: g.ce, per,
      td: r2(per.slice(0, np - 1).reduce((s, v) => s + v, 0)), tm: r2(per[P.indexOf(rep)] || 0), kind: 'Hand-coded', bno: bi + 1, seq: 100000 + j + 1, nz: per.reduce((s, v) => s + Math.abs(v), 0) > 0.005 ? 1 : 0 }; });
    // formula
    const v = (s) => `_xlpm.${s}${bi}`, cc = (a, ...i) => `_xlfn.CHOOSECOLS(${a},${i.join(',')})`, L = v('L'), K = v('K'), A = v('A'), N = v('N');
    const [fi, fd] = itemDescF(def, (c) => cr(c));
    const look = (expr) => `_xlfn.XLOOKUP(${cc(K, 1)},${cr(inf.C.id)},${expr},"")`;
    const f = `_xlfn.LET(_xlpm.h,${H},_xlpm.wt,TRANSPOSE(--(_xlpm.h<>"Pending")),_xlpm.wm,TRANSPOSE(--(_xlpm.h=Summary!$D$4)),_xlpm.one,_xlfn.SEQUENCE(${np},1,1,0),`
      + `${L},_xlfn._xlws.FILTER(_xlfn.HSTACK(${dr(D.cid)},${dr(D.pkg)}&"",${dr(D.mnl)}&"",${dr(D.cec)}&"",${dr(D.per)},${dr(D.amt)}),${dr(D.flag)}=2,_xlfn.HSTACK(-1,"","","","",0)),`
      + `${K},_xlfn.UNIQUE(${cc(L, 1, 2, 3, 4)}),`
      + `${A},MMULT((${cc(K, 1)}=TRANSPOSE(${cc(L, 1)}))*(${cc(K, 2)}=TRANSPOSE(${cc(L, 2)}))*(${cc(K, 3)}=TRANSPOSE(${cc(L, 3)}))*(${cc(K, 4)}=TRANSPOSE(${cc(L, 4)})),(${cc(L, 5)}=_xlpm.h)*${cc(L, 6)}),`
      + `${N},_xlfn.SEQUENCE(ROWS(${K})),`
      + `_xlfn.HSTACK(IF(${N},"${def.id}"),${look(fi.replace(/&""$/, '&""'))},${fd ? look(fd) : `IF(${N},"")`},${cc(K, 2, 3, 4)},${A},MMULT(${A},_xlpm.wt),MMULT(${A},_xlpm.wm),IF(${N},"Hand-coded"),IF(${N},${bi + 1}),100000+${N},--(MMULT(ABS(${A}),_xlpm.one)>0.005)))`;
    // cached values
    blk.forEach((x, j) => { const vals = [x.bucket, x.item, x.desc, x.pkg, x.mnl, x.ce, ...x.per, x.td, x.tm, x.kind, x.bno, x.seq, x.nz];
      vals.forEach((val, c) => { const cell = ws.getCell(ar + j, c + 1); if (j === 0 && c === 0) setF(cell, f, val); else if (!process.env.NO_RESULT) cell.value = val; }); });
    anchors.push({ sheet: '_Stack', cell: `A${ar}`, ref: `A${ar}:${LC}${ar + blk.length - 1}` });
    rows.push(...blk);
  });
  return { ws, rows, END, lastItemRow, HB, anchors, cols: { cPer, cTD, cTM, cKind, cBno, cSeq, cNZ, LC }, rng: (c) => `_Stack!$${colL(c)}$2:$${colL(c)}$${END}` };
}

function writeExpenses(ws, model, infos, opts, prev, wb) {
  const P = model.periods, np = P.length, rep = model.reportLabel;
  const st = stackSheets(wb, model, infos, opts, prev), { cPer, cTD, cTM, cKind, cBno, cSeq, cNZ } = st.cols, R = st.rng;
  const list = (prev && prev.pkgList) || [];
  title(ws, 'Expenses — ' + opts.project + ' — coded actual cost by PKG', 'Live (Excel 365). Type your PKG codes and names once in the yellow cells below; code items on the bucket Coding sheets. The list underneath sorts itself PKG › Bucket › Item, follows the cut date on Summary and shows hand-coded lines under the PKG you typed.');
  // ---------------- 1. PKG list and totals
  const sec = (r, t) => { const c = ws.getCell(r, 1); c.value = t; c.font = font({ bold: true, size: 12, color: { argb: 'FF' + NAVY } }); };
  sec(PK_H - 1, '1 · PKG list and totals  –  type PKG and Name once (yellow); each PKG takes the colour of its row');
  // the list area's number format first (column level), the table cells below set their own
  for (let c = 8; c <= 9 + np; c++) ws.getColumn(c).numFmt = AMT0;
  // columns: A PKG · B:D Name · E Items · F Opening · G Previous · H This month · I To date · J % of total · K Pending
  const COL = { n: 5, op: 6, pv: 7, tm: 8, td: 9, pc: 10, pe: 11 }, LT = (k) => colL(COL[k]), LASTC = 11;
  [[1, 'PKG'], [2, 'Name'], [5, 'Items'], [6, 'Opening'], [7, 'Previous'], [8, 'This month'], [9, 'To date'], [10, '% of total'], [11, 'Pending']].forEach(([c, h]) => { const x = ws.getCell(PK_H, c); x.value = h; });
  for (let c = 1; c <= LASTC; c++) { const x = ws.getCell(PK_H, c); x.font = font({ bold: true, color: { argb: 'FFFFFFFF' } }); x.fill = fill(c === COL.tm ? GOLD : NAVY); x.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }; x.border = box; }
  ws.mergeCells(PK_H, 2, PK_H, 4); ws.getRow(PK_H).height = 30;
  const rowsAll = st.rows.filter((x) => x.nz === 1), sumBy = (f, k) => r2(rowsAll.filter(f).reduce((s, x) => s + (k === 'n' ? 1 : k === 'op' ? x.per[0] : k === 'pe' ? x.per[np - 1] : x[k]), 0));
  const TOT = { n: rowsAll.length, op: sumBy(() => true, 'op'), tm: sumBy(() => true, 'tm'), td: sumBy(() => true, 'td'), pe: sumBy(() => true, 'pe') };
  const pkF = (crit) => ({ n: `SUMPRODUCT((${R(4)}${crit})*(${R(cNZ)}=1))`, op: `SUMPRODUCT((${R(4)}${crit})*${R(cPer(0))})`, tm: `SUMPRODUCT((${R(4)}${crit})*${R(cTM)})`, td: `SUMPRODUCT((${R(4)}${crit})*${R(cTD)})`, pe: `SUMPRODUCT((${R(4)}${crit})*${R(cPer(np - 1))})` });
  const putRow = (rr, vals, F, o = {}) => {   // vals {n,op,tm,td,pe}; F formulas or null
    for (const k of ['n', 'op', 'tm', 'td', 'pe']) { const x = ws.getCell(rr, COL[k]); if (F && F[k]) setF(x, F[k], vals[k]); else x.value = vals[k]; x.numFmt = k === 'n' ? '#,##0' : AMT0; }
    const g = (f) => (o.blank ? `IF($A${rr}="","",${f})` : f);
    setF(ws.getCell(rr, COL.pv), g(`${LT('td')}${rr}-${LT('tm')}${rr}`), o.empty ? '' : r2(vals.td - vals.tm)); ws.getCell(rr, COL.pv).numFmt = AMT0;
    setF(ws.getCell(rr, COL.pc), g(`IF($${LT('td')}$${R_TOT}=0,"",${LT('td')}${rr}/$${LT('td')}$${R_TOT})`), o.empty ? '' : TOT.td ? vals.td / TOT.td : ''); ws.getCell(rr, COL.pc).numFmt = '0.0%';
    ws.getCell(rr, COL.tm).fill = fill('FFF2CC'); ws.mergeCells(rr, 2, rr, 4);
    for (let c = 1; c <= LASTC; c++) { const x = ws.getCell(rr, c); x.border = box; if (c > 4) x.font = font(); }
  };
  let listed = { n: 0, op: 0, tm: 0, td: 0, pe: 0 };
  for (let i = 0; i < PK_N; i++) {
    const rr = PK_1 + i, code = list[i] ? list[i].code : '', name = list[i] ? list[i].name : '', a = ws.getCell(rr, 1), b = ws.getCell(rr, 2);
    a.value = code || null; b.value = name || null; a.fill = fill(code ? STRONG[i % STRONG.length] : YELLOW); b.fill = fill(YELLOW); a.font = font({ bold: true }); b.font = font();
    const lc = code.toLowerCase(), mine = (x) => x.pkg.toLowerCase() === lc && lc !== '';
    const vals = code ? { n: sumBy(mine, 'n'), op: sumBy(mine, 'op'), tm: sumBy(mine, 'tm'), td: sumBy(mine, 'td'), pe: sumBy(mine, 'pe') } : { n: '', op: '', tm: '', td: '', pe: '' };
    if (code) for (const k of Object.keys(listed)) listed[k] += vals[k];
    const F = pkF(`=$A${rr}&""`), FB = {}; for (const k of Object.keys(F)) FB[k] = `IF($A${rr}="","",${F[k]})`;
    putRow(rr, vals, FB, { blank: true, empty: !code });
  }
  const noV = { n: sumBy((x) => x.pkg === '', 'n'), op: sumBy((x) => x.pkg === '', 'op'), tm: sumBy((x) => x.pkg === '', 'tm'), td: sumBy((x) => x.pkg === '', 'td'), pe: sumBy((x) => x.pkg === '', 'pe') };
  ws.getCell(R_NO, 1).value = NO_PKG; ws.getCell(R_NO, 2).value = 'not coded yet – code the items on the bucket Coding sheets'; putRow(R_NO, noV, pkF('=""'));
  const outV = {}; for (const k of Object.keys(TOT)) outV[k] = r2(TOT[k] - listed[k] - noV[k]);
  ws.getCell(R_OUT, 1).value = 'Not in the list'; ws.getCell(R_OUT, 2).value = 'PKG typed on a Coding / Data sheet but missing above';
  const outF = {}; for (const k of ['n', 'op', 'tm', 'td', 'pe']) outF[k] = `${LT(k)}${R_TOT}-SUM(${LT(k)}${PK_1}:${LT(k)}${PK_Z})-${LT(k)}${R_NO}`;
  putRow(R_OUT, outV, outF);
  ws.getCell(R_TOT, 1).value = 'TOTAL counted'; const totF = { n: `SUM(${R(cNZ)})`, op: `SUM(${R(cPer(0))})`, tm: `SUM(${R(cTM)})`, td: `SUM(${R(cTD)})`, pe: `SUM(${R(cPer(np - 1))})` };
  putRow(R_TOT, TOT, totF);
  for (let c = 1; c <= LASTC; c++) { const x = ws.getCell(R_TOT, c); x.fill = fill(NAVY); x.font = font({ bold: true, color: { argb: 'FFFFFFFF' } }); }
  ws.getCell(R_NO, 1).fill = fill('FFE699'); ws.getCell(R_NO, 1).font = font({ bold: true }); ws.getCell(R_OUT, 1).font = font({ bold: true });
  // excluded (memo)
  const excTo = r2(infos.flatMap((inf) => inf.b.items.flatMap((it) => it.lines)).filter((l) => l.inc === 'No').reduce((s, l) => s + l.amt, 0));
  ws.getCell(R_EXC, 1).value = 'Excluded by user (memo – not in the total, incl. pending)'; ws.getCell(R_EXC, 1).font = font({ italic: true, color: { argb: 'FF' + GREY } });
  const xe = ws.getCell(R_EXC, COL.td); setF(xe, infos.map((inf) => `${q(inf.nPm)}!${colL(inf.amtCol(np))}${inf.rExc}`).join('+'), excTo); xe.numFmt = AMT0; xe.font = font({ italic: true, color: { argb: 'FF' + GREY } });
  // CF: the "Not in the list" row turns red when it holds money; duplicate PKG codes red
  ws.addConditionalFormatting({ ref: `A${R_OUT}:${colL(LASTC)}${R_OUT}`, rules: [{ type: 'expression', formulae: [`ABS($${LT('td')}$${R_OUT})+ABS($${LT('pe')}$${R_OUT})>0.005`], style: { fill: cfFill('FFC7CE'), font: { color: { argb: 'FF9C0006' }, bold: true } }, priority: 1 }] });
  ws.addConditionalFormatting({ ref: `A${PK_1}:A${PK_Z}`, rules: [{ type: 'expression', formulae: [`AND($A${PK_1}<>"",COUNTIF($A$${PK_1}:$A$${PK_Z},$A${PK_1})>1)`], style: { fill: cfFill('FF0000'), font: { color: { argb: 'FFFFFFFF' } } }, priority: 2 }] });
  // colour of a PKG row follows its position (also when typed later in Excel)
  for (let i = 0; i < PK_N; i++) ws.addConditionalFormatting({ ref: `A${PK_1 + i}`, rules: [{ type: 'expression', formulae: [`$A${PK_1 + i}<>""`], style: { fill: cfFill(STRONG[i % STRONG.length]) }, priority: 10 + i }] });

  // ---------------- 2. choices + list
  sec(R_CTL - 1, '2 · Expenses list  –  pick what to show (▼); the list filters and sorts itself');
  const lists = wb.addWorksheet('_Lists', { state: 'hidden' });
  lists.getCell('A1').value = 'All'; lists.getCell('A2').value = NO_PKG; for (let i = 0; i < PK_N; i++) setF(lists.getCell(3 + i, 1), `IF(Expenses!$A$${PK_1 + i}="","",Expenses!$A$${PK_1 + i}&"")`, list[i] ? list[i].code : '');
  lists.getCell('B1').value = 'All'; infos.forEach((inf, i) => { lists.getCell(2 + i, 2).value = inf.def.id; });
  SHOWS.forEach((s, i) => { lists.getCell(1 + i, 3).value = s; }); SORTS.forEach((s, i) => { lists.getCell(1 + i, 4).value = s; });
  const ctl = [[1, 'PKG ▸', 2, 'All', `_Lists!$A$1:$A$${2 + PK_N}`], [3, 'Bucket ▸', 4, 'All', `_Lists!$B$1:$B$${1 + infos.length}`], [5, 'Lines ▸', 6, SHOWS[0], `_Lists!$C$1:$C$${SHOWS.length}`], [7, 'Sort ▸', 8, SORTS[0], `_Lists!$D$1:$D$${SORTS.length}`]];
  for (const [lc, lab, vc, val, src] of ctl) { const l = ws.getCell(R_CTL, lc); l.value = lab; l.font = font({ bold: true, color: { argb: 'FF' + NAVY } }); l.alignment = { horizontal: 'right' };
    const v = ws.getCell(R_CTL, vc); v.value = val; v.fill = fill(YELLOW); v.font = font({ bold: true }); v.border = box; v.alignment = { horizontal: 'center' };
    v.dataValidation = { type: 'list', allowBlank: false, formulae: [src], showErrorMessage: true, errorTitle: lab.replace(' ▸', ''), error: 'Pick one from the list.' }; }
  ws.mergeCells(R_CTL, 8, R_CTL, 9); ws.getRow(R_CTL).height = 20;
  const heads = ['PKG', 'Bucket', 'Item', 'Description', 'MNL', 'Cost element code', 'Line', ...P, 'To date', 'This month'];
  header(ws, L_H, heads); const nc = heads.length, c0 = 8;    // first period column in the list
  ws.getCell(L_H, c0 + np - 1).fill = fill('C55A11'); ws.getCell(L_H, nc).fill = fill(GOLD);
  for (let p = 0; p < np - 1; p++) { const a = colL(c0 + p); ws.addConditionalFormatting({ ref: `${a}${L_H}`, rules: [{ type: 'expression', formulae: [`${a}$${L_H}=Summary!$D$4`], style: { fill: cfFill(GOLD) }, priority: 60 + p }] }); }
  // the list formula
  const s = `_Stack!$A$2:$${st.cols.LC}$${st.END}`, C = (a, ...i) => `_xlfn.CHOOSECOLS(${a},${i.join(',')})`;
  const perCols = Array.from({ length: np }, (_, p) => cPer(p)).join(',');
  const lf = `_xlfn.LET(_xlpm.s,${s},_xlpm.pk,${C('_xlpm.s', 4)},_xlpm.pd,IF(_xlpm.pk="","${NO_PKG}",_xlpm.pk),`
    + `_xlpm.ok,(${C('_xlpm.s', cNZ)}=1)*((($B$${R_CTL}="All")+(_xlpm.pd=$B$${R_CTL}&""))>0)*((($D$${R_CTL}="All")+(${C('_xlpm.s', 1)}=$D$${R_CTL}))>0)`
    + `*IF($F$${R_CTL}="${SHOWS[1]}",${C('_xlpm.s', cKind)}="Hand-coded",IF($F$${R_CTL}="${SHOWS[2]}",((_xlpm.pk="")+(${C('_xlpm.s', 5)}="")+(${C('_xlpm.s', 6)}=""))>0,IF($F$${R_CTL}="${SHOWS[3]}",${C('_xlpm.s', cTM)}<>0,1))),`
    + `_xlpm.f,_xlfn._xlws.FILTER(_xlpm.s,_xlpm.ok),_xlpm.fp,${C('_xlpm.f', 4)},_xlpm.po,IF(_xlpm.fp="",100000,IFERROR(_xlfn.XMATCH(_xlpm.fp,$A$${PK_1}:$A$${PK_Z}&""),50000)),`
    + `_xlpm.o,IF($H$${R_CTL}="${SORTS[1]}",_xlfn.SORTBY(_xlpm.f,${C('_xlpm.f', cTD)},-1,${C('_xlpm.f', cBno)},1,${C('_xlpm.f', cSeq)},1),IF($H$${R_CTL}="${SORTS[2]}",_xlfn.SORTBY(_xlpm.f,${C('_xlpm.f', cTM)},-1,${C('_xlpm.f', cBno)},1,${C('_xlpm.f', cSeq)},1),_xlfn.SORTBY(_xlpm.f,_xlpm.po,1,${C('_xlpm.f', cBno)},1,${C('_xlpm.f', cSeq)},1))),`
    + `_xlpm.op,${C('_xlpm.o', 4)},IFERROR(_xlfn.HSTACK(IF(_xlpm.op="","${NO_PKG}",_xlpm.op),${C('_xlpm.o', 1, 2, 3, 5, 6, cKind, perCols, cTD, cTM)}),"Nothing matches the choices above"))`;
  // JS: default choices (All / All / All lines / PKG order)
  const lc = list.map((x) => x.code.toLowerCase()), po = (x) => (x.pkg === '' ? 100000 : lc.indexOf(x.pkg.toLowerCase()) >= 0 ? lc.indexOf(x.pkg.toLowerCase()) + 1 : 50000);
  const shown = rowsAll.slice().sort((a, b) => po(a) - po(b) || a.bno - b.bno || a.seq - b.seq);
  shown.forEach((x, j) => { const vals = [x.pkg === '' ? NO_PKG : x.pkg, x.bucket, x.item, x.desc, x.mnl, x.ce, x.kind, ...x.per, x.td, x.tm];
    vals.forEach((val, c) => { const cell = ws.getCell(L_1 + j, c + 1); if (j === 0 && c === 0) setF(cell, lf, val); else if (!process.env.NO_RESULT) cell.value = val; }); });
  const lastL = L_1 + Math.max(shown.length, 1) - 1, MAXL = L_1 + Math.max(8000, shown.length + 3000);
  st.anchors.push({ sheet: 'Expenses', cell: `A${L_1}`, ref: `A${L_1}:${colL(nc)}${lastL}` });
  // formats for the whole list area (it grows and shrinks)
  [14, 22, 14, 40, 8, 14, 11].forEach((w, i) => { ws.getColumn(i + 1).width = w; }); for (let c = c0; c <= nc; c++) ws.getColumn(c).width = 13;
  ws.getColumn(nc - 1).width = 14;
  // colours: PKG cell strong, rest of the row a light tint of the same colour (position of the PKG in the list); not coded = amber; not in the list = pink
  const A = `$A${L_1}`, area = `A${L_1}:${colL(nc)}${MAXL}`, pkArea = `A${L_1}:A${MAXL}`;
  ws.addConditionalFormatting({ ref: area, rules: [{ type: 'expression', formulae: [`$G${L_1}="Hand-coded"`], style: { font: { italic: true, color: { argb: 'FFC55A11' } } }, priority: 100 }] });
  ws.addConditionalFormatting({ ref: area, rules: [{ type: 'expression', formulae: [`${A}="${NO_PKG}"`], style: { fill: cfFill('FFF2CC') }, priority: 101 }] });
  ws.addConditionalFormatting({ ref: pkArea, rules: [{ type: 'expression', formulae: [`${A}="${NO_PKG}"`], style: { fill: cfFill('FFE699'), font: { bold: true } }, priority: 102 }] });
  for (let i = 0; i < PK_N; i++) {
    const m = `AND(${A}<>"",${A}&""=$A$${PK_1 + i}&"")`, c = STRONG[i % STRONG.length];
    ws.addConditionalFormatting({ ref: pkArea, rules: [{ type: 'expression', formulae: [m], style: { fill: cfFill(c), font: { bold: true } }, priority: 110 + i }] });
    ws.addConditionalFormatting({ ref: `B${L_1}:${colL(nc)}${MAXL}`, rules: [{ type: 'expression', formulae: [m], style: { fill: cfFill(tint(c, 0.55)) }, priority: 150 + i }] });
  }
  ws.addConditionalFormatting({ ref: area, rules: [{ type: 'expression', formulae: [`AND(${A}<>"",${A}<>"${NO_PKG}",ISNA(MATCH(${A}&"",$A$${PK_1}:$A$${PK_Z}&"",0)),${A}<>"Nothing matches the choices above")`], style: { fill: cfFill('FFC7CE') }, priority: 200 }] });
  const thinB = { style: 'thin', color: { argb: 'FFD9D9D9' } };
  ws.addConditionalFormatting({ ref: area, rules: [{ type: 'expression', formulae: [`${A}<>""`], style: { border: { top: thinB, bottom: thinB, left: thinB, right: thinB } }, priority: 300 }] });
  ws.views = [{ showGridLines: false, state: 'frozen', xSplit: 3, ySplit: L_H }];
  return { stack: st, anchors: st.anchors, rng: R, bk: R(1), cTo: cTD, cTm: cTM, cPend: cPer(np - 1), cPer, excRef: `Expenses!$I$${R_EXC}`, total: TOT.td, pending: TOT.pe, excTo, np, R_TOT, shownN: shown.length, outTd: outV.td };
}
module.exports = { writeExpenses, PK_1, PK_N, PK_H, NO_PKG, L_1 };
