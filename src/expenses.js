'use strict';
// Expenses: the coded actual cost by PKG › Bucket › Item, as a DYNAMIC list (Excel 365).
//  _Stack (hidden): one row per item (links to the per Month sheets, counted lines) + one block per bucket that collects
//                   the hand-coded lines (typed over on a Data sheet) by item × PKG × MNL × Cost element code (a spill each).
//  Expenses:        one formula builds the list PKG heading › bucket heading › items (+ TOTAL); it rebuilds itself as you code.
//                   'Show PKG' picks one package or All.
const W = require('./workbook');
const { r2, colL } = require('./util');
const { fill, font, box, q, setF, title, header, itemOf, descOf, AMT0, NAVY, GREY, RED, GOLD, YELLOW } = W;

const R_SHOW = 4, L_H = 6, L_1 = 7;                                       // Show PKG cell, list header, list anchor
const HC_ROWS = 250;                                                      // room for hand-coded combinations per bucket
const NO_PKG = '(no PKG yet)';
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
  title(ws, 'Expenses — ' + opts.project + ' — coded actual cost by PKG › Bucket › Item', 'Live (Excel 365): one list that rebuilds itself as you code (PKG, MNL, Cost element code on the bucket Coding sheets; lines typed over on a Data sheet show under the PKG typed). Follows the cut date on Summary. PKGs A→Z, "(no PKG yet)" last; TOTAL = counted cost.');
  // ---- Show PKG
  const lab = ws.getCell(R_SHOW, 1); lab.value = 'Show PKG  ▸'; lab.font = font({ bold: true, size: 12, color: { argb: 'FF' + NAVY } }); lab.alignment = { horizontal: 'right' };
  const sh = ws.getCell(R_SHOW, 2); sh.value = 'All'; sh.fill = fill(YELLOW); sh.font = font({ bold: true, size: 12 }); sh.border = box; sh.alignment = { horizontal: 'center' };
  const nt = ws.getCell(R_SHOW, 4); nt.value = 'Pick one PKG (▼) to see only its block, or All.'; nt.font = font({ size: 9, color: { argb: 'FF595959' } });
  ws.getRow(R_SHOW).height = 22;
  // ---- JS: what the formula returns (Show PKG = All)
  const rowsAll = st.rows.filter((x) => x.nz === 1), pdOf = (x) => (x.pkg === '' ? NO_PKG : x.pkg);
  const lower = (t) => String(t).toLowerCase(), cmp = (a, b) => (lower(a) < lower(b) ? -1 : lower(a) > lower(b) ? 1 : 0);
  const amtsOf = (x) => [...x.per, x.td, x.tm], add = (acc, v) => v.forEach((n, i) => { acc[i] += n; });
  const uP = new Map(), uB = new Map();
  for (const x of rowsAll) { const pd = pdOf(x), kp = lower(pd); if (!uP.has(kp)) uP.set(kp, { pd, sum: Array(np + 2).fill(0) }); add(uP.get(kp).sum, amtsOf(x));
    const kb = kp + '|' + lower(x.bucket); if (!uB.has(kb)) uB.set(kb, { pd: uP.get(kp).pd, bucket: x.bucket, bno: x.bno, n: 0, sum: Array(np + 2).fill(0) }); const b = uB.get(kb); b.n++; add(b.sum, amtsOf(x)); }
  const gOf = (pd) => (pd === NO_PKG ? 1 : 0);
  const recs = [];
  for (const u of uP.values()) recs.push({ k: [gOf(u.pd), u.pd, 0, 0, 0], pd: u.pd, out: [u.pd, '', '', '', '', ...u.sum.map(r2)], lev: 1 });
  for (const b of uB.values()) recs.push({ k: [gOf(b.pd), b.pd, b.bno, 1, 0], pd: b.pd, out: ['   ' + b.bucket, b.n + ' items', '', '', '', ...b.sum.map(r2)], lev: 2 });
  for (const x of rowsAll) { const pd = pdOf(x); recs.push({ k: [gOf(pd), pd, x.bno, 2, x.seq], pd, out: ['      ' + x.item, x.desc, x.mnl, x.ce, x.kind === 'Hand-coded' ? 'Hand-coded' : '', ...amtsOf(x)], lev: 3 }); }
  recs.sort((a, b) => a.k[0] - b.k[0] || cmp(a.k[1], b.k[1]) || a.k[2] - b.k[2] || a.k[3] - b.k[3] || a.k[4] - b.k[4]);
  const us = [...uP.values()].map((u) => u.pd).sort((a, b) => gOf(a) - gOf(b) || cmp(a, b)), idxOf = (pd) => (pd === NO_PKG ? 0 : us.findIndex((v) => lower(v) === lower(pd)) + 1);
  const tot = Array(np + 2).fill(0); rowsAll.forEach((x) => add(tot, amtsOf(x)));
  const outRows = recs.map((r) => [...r.out, r.lev, idxOf(r.pd)]); outRows.push(['TOTAL counted', '', '', '', '', ...tot.map(r2), 0, 0]);
  // ---- the formula
  const C = (a, ...i) => `_xlfn.CHOOSECOLS(${a},${i.join(',')})`, perCols = Array.from({ length: np }, (_, p) => cPer(p)).join(','), NP2 = np + 2;
  const lf = `_xlfn.LET(_xlpm.s,_Stack!$A$2:$${st.cols.LC}$${st.END},_xlpm.p0,${C('_xlpm.s', 4)},_xlpm.d0,IF(_xlpm.p0="","${NO_PKG}",_xlpm.p0),`
    + `_xlpm.f,_xlfn._xlws.FILTER(_xlpm.s,(${C('_xlpm.s', cNZ)}=1)*((($B$${R_SHOW}="All")+(_xlpm.d0=$B$${R_SHOW}&""))>0)),`
    + `_xlpm.pk,${C('_xlpm.f', 4)},_xlpm.pd,IF(_xlpm.pk="","${NO_PKG}",_xlpm.pk),_xlpm.bk,${C('_xlpm.f', 1)},_xlpm.bn,${C('_xlpm.f', cBno)},`
    + `_xlpm.am,${C('_xlpm.f', perCols, cTD, cTM)},_xlpm.n,ROWS(_xlpm.f),_xlpm.one,_xlfn.SEQUENCE(_xlpm.n,1,1,0),`
    // PKG headings
    + `_xlpm.u,_xlfn.UNIQUE(_xlpm.pd),_xlpm.ug,--(_xlpm.u="${NO_PKG}"),_xlpm.nu,ROWS(_xlpm.u),`
    + `_xlpm.h1,_xlfn.HSTACK(_xlpm.u,IF(_xlpm.ug,"",""),IF(_xlpm.ug,"",""),IF(_xlpm.ug,"",""),IF(_xlpm.ug,"",""),MMULT(--(_xlpm.u=TRANSPOSE(_xlpm.pd)),_xlpm.am),IF(_xlpm.ug,1,1),_xlpm.ug,_xlpm.u,0*_xlpm.ug,0*_xlpm.ug,0*_xlpm.ug),`
    // bucket headings
    + `_xlpm.ub,_xlfn.UNIQUE(_xlfn.HSTACK(_xlpm.pd,_xlpm.bk,_xlpm.bn)),_xlpm.bp,${C('_xlpm.ub', 1)},_xlpm.bm,--(_xlpm.bp&"|"&${C('_xlpm.ub', 2)}=TRANSPOSE(_xlpm.pd&"|"&_xlpm.bk)),`
    + `_xlpm.h2,_xlfn.HSTACK("   "&${C('_xlpm.ub', 2)},MMULT(_xlpm.bm,_xlpm.one)&" items",IF(${C('_xlpm.ub', 3)},""),IF(${C('_xlpm.ub', 3)},""),IF(${C('_xlpm.ub', 3)},""),MMULT(_xlpm.bm,_xlpm.am),IF(${C('_xlpm.ub', 3)},2),--(_xlpm.bp="${NO_PKG}"),_xlpm.bp,${C('_xlpm.ub', 3)},IF(${C('_xlpm.ub', 3)},1),IF(${C('_xlpm.ub', 3)},0)),`
    // items
    + `_xlpm.h3,_xlfn.HSTACK("      "&${C('_xlpm.f', 2)},${C('_xlpm.f', 3)},${C('_xlpm.f', 5)},${C('_xlpm.f', 6)},IF(${C('_xlpm.f', cKind)}="Hand-coded","Hand-coded",""),_xlpm.am,IF(_xlpm.one,3),--(_xlpm.pd="${NO_PKG}"),_xlpm.pd,_xlpm.bn,IF(_xlpm.one,2),${C('_xlpm.f', cSeq)}),`
    + `_xlpm.a,_xlfn.VSTACK(_xlpm.h1,_xlpm.h2,_xlpm.h3),_xlpm.L,${6 + NP2},`
    + `_xlpm.o,_xlfn.SORTBY(_xlpm.a,${C('_xlpm.a', `_xlpm.L+1`)},1,${C('_xlpm.a', `_xlpm.L+2`)},1,${C('_xlpm.a', `_xlpm.L+3`)},1,${C('_xlpm.a', `_xlpm.L+4`)},1,${C('_xlpm.a', `_xlpm.L+5`)},1),`
    + `_xlpm.us,_xlfn.SORTBY(_xlpm.u,_xlpm.ug,1,_xlpm.u,1),_xlpm.op,${C('_xlpm.o', `_xlpm.L+2`)},`
    + `_xlpm.ix,IF(_xlpm.op="${NO_PKG}",0,_xlfn.XMATCH(_xlpm.op,_xlpm.us)),`
    + `IFERROR(_xlfn.VSTACK(_xlfn.HSTACK(_xlfn.TAKE(_xlpm.o,,_xlpm.L),_xlpm.ix),_xlfn.HSTACK("TOTAL counted","","","","",MMULT(TRANSPOSE(_xlpm.one),_xlpm.am),0,0)),"Nothing to show for this PKG"))`;
  const heads = ['PKG / Bucket / Item', 'Description', 'MNL', 'Cost element code', 'Line', ...P, 'To date', 'This month', 'Level', 'Colour'], nc = heads.length, c0 = 6, cLev = nc - 1, cIdx = nc;
  for (let c = c0; c <= c0 + NP2 - 1; c++) ws.getColumn(c).numFmt = AMT0;
  header(ws, L_H, heads); ws.getCell(L_H, c0 + np - 1).fill = fill('C55A11'); ws.getCell(L_H, c0 + np + 1).fill = fill(GOLD);
  for (let p = 0; p < np - 1; p++) { const a = colL(c0 + p); ws.addConditionalFormatting({ ref: `${a}${L_H}`, rules: [{ type: 'expression', formulae: [`${a}$${L_H}=Summary!$D$4`], style: { fill: cfFill(GOLD) }, priority: 60 + p }] }); }
  outRows.forEach((vals, j) => vals.forEach((val, c) => { const cell = ws.getCell(L_1 + j, c + 1); if (j === 0 && c === 0) setF(cell, lf, val); else if (!process.env.NO_RESULT) cell.value = val; }));
  const lastL = L_1 + outRows.length - 1, MAXL = L_1 + Math.max(8000, outRows.length + 3000);
  st.anchors.push({ sheet: 'Expenses', cell: `A${L_1}`, ref: `A${L_1}:${colL(nc)}${lastL}` });
  // Show PKG list: All + the PKGs in use (A→Z), a small spill on _Lists
  const lists = wb.addWorksheet('_Lists', { state: 'hidden' }), lv = ['All', ...us];
  const lfl = `_xlfn.LET(_xlpm.p,${R(4)},_xlpm.z,${R(cNZ)},_xlpm.d,_xlfn._xlws.FILTER(IF(_xlpm.p="","${NO_PKG}",_xlpm.p),_xlpm.z=1),_xlpm.u,_xlfn.UNIQUE(_xlpm.d),_xlfn.VSTACK("All",_xlfn.SORTBY(_xlpm.u,--(_xlpm.u="${NO_PKG}"),1,_xlpm.u,1)))`;
  lv.forEach((v, i) => { const cell = lists.getCell(1 + i, 1); if (i === 0) setF(cell, lfl, v); else if (!process.env.NO_RESULT) cell.value = v; });
  st.anchors.push({ sheet: '_Lists', cell: 'A1', ref: `A1:A${lv.length}` });
  sh.dataValidation = { type: 'list', allowBlank: false, formulae: ['_Lists!$A$1:$A$300'], showErrorMessage: true, errorTitle: 'Show PKG', error: 'Pick one from the list.' };
  // widths, hidden helper columns, freeze
  [26, 44, 7, 14, 11].forEach((w, i) => { ws.getColumn(i + 1).width = w; }); for (let c = c0; c <= c0 + NP2 - 1; c++) ws.getColumn(c).width = 13;
  ws.getColumn(cLev).hidden = true; ws.getColumn(cIdx).hidden = true;
  ws.views = [{ showGridLines: false, state: 'frozen', xSplit: 1, ySplit: L_H }];
  // print-ready: landscape A3, fit to the page width, header rows repeat
  ws.pageSetup = { orientation: 'landscape', paperSize: 8, fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: `${L_H}:${L_H}`, margins: { left: 0.3, right: 0.3, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } };
  ws.headerFooter = { oddFooter: '&L' + opts.project + ' · Expenses&RPage &P of &N' };
  // colours: level 1 PKG heading (strong), 2 bucket heading (lighter), 3 items (lightest); (no PKG yet) amber; TOTAL navy
  const LV = `$${colL(cLev)}${L_1}`, IX = `$${colL(cIdx)}${L_1}`, area = `A${L_1}:${colL(nc - 2)}${MAXL}`;
  const rule = (f, style, pr) => ws.addConditionalFormatting({ ref: area, rules: [{ type: 'expression', formulae: [f], style, priority: pr }] });
  const thinB = { style: 'thin', color: { argb: 'FFD9D9D9' } };
  rule(`AND($A${L_1}<>"",${LV}=0)`, { fill: cfFill(NAVY), font: { bold: true, color: { argb: 'FFFFFFFF' } } }, 1);
  rule(`$E${L_1}="Hand-coded"`, { font: { italic: true, color: { argb: 'FFC55A11' } } }, 2);
  [[1, 'FFE699', true], [2, 'FFF2CC', true], [3, 'FFFAEB', false]].forEach(([lv2, c, b], i) => rule(`AND(${LV}=${lv2},${IX}=0)`, { fill: cfFill(c), font: { bold: b } }, 3 + i));
  for (let k = 0; k < STRONG.length; k++) [[1, STRONG[k], true], [2, tint(STRONG[k], 0.45), true], [3, tint(STRONG[k], 0.82), false]].forEach(([lv2, c, b], i) =>
    rule(`AND(${LV}=${lv2},${IX}>0,MOD(${IX}-1,${STRONG.length})=${k})`, { fill: cfFill(c), font: { bold: b } }, 10 + k * 3 + i));
  rule(`$A${L_1}<>""`, { border: { top: thinB, bottom: thinB, left: thinB, right: thinB } }, 100);
  // reading aids that follow the cut date: the cut month column tinted gold down the list, months after it greyed
  for (let p = 1; p < np - 1; p++) {
    const a = colL(c0 + p), ref = `${a}${L_1}:${a}${MAXL}`, ym = model.months[p - 1], me = new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7), 1)).toISOString().slice(0, 10);
    ws.addConditionalFormatting({ ref, rules: [
      { type: 'expression', formulae: [`AND($A${L_1}<>"",${LV}=3,${a}$${L_H}=Summary!$D$4)`], style: { fill: cfFill('FFF2CC') }, priority: 7 },
      { type: 'expression', formulae: [`AND($A${L_1}<>"",DATE(${me.slice(0, 4)},${+me.slice(5, 7)},1)>Summary!$B$4)`], style: { font: { color: { argb: 'FFBFBFBF' } } }, priority: 8 }] });
  }
  const excF = infos.map((inf) => `${q(inf.nPm)}!${colL(inf.amtCol(np))}${inf.rExc}`).join('+');
  const excTo = r2(infos.flatMap((inf) => inf.b.items.flatMap((it) => it.lines)).filter((l) => l.inc === 'No').reduce((s, l) => s + l.amt, 0));
  return { stack: st, anchors: st.anchors, rng: R, bk: R(1), cTo: cTD, cTm: cTM, cPend: cPer(np - 1), cPer, excRef: excF, total: r2(tot[np]), pending: r2(tot[np - 1]), excTo, np, shownN: outRows.length };
}
module.exports = { writeExpenses, NO_PKG, L_1 };
