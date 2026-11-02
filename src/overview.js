'use strict';
// Summary, Expenses (every item of every bucket), Checks, Rules.
const W = require('./workbook');
const { r2, colL } = require('./util');
const { RULES, GA } = require('./rules');
const { fill, font, box, q, setF, title, header, itemOf, descOf, AMT0, AMT2, PCT, NAVY, GREY, RED, GOLD, YELLOW } = W;
const E_H = 6, E_1 = 7;

function writeExpenses(ws, model, infos, opts) {
  const np = model.periods.length, cTo = 6 + np + 1, cTm = 6 + np + 2, P = model.periods, rep = model.reportLabel, nm = (ls, f) => r2(ls.filter(f).reduce((s, l) => s + l.amt, 0));
  title(ws, 'Expenses — ' + opts.project + ' — coded actual cost', 'Every item of every bucket, with its codes, by posting month. Live links to the "per Month" sheets; counted lines only. To date = up to the cut date on Summary; later postings sit in Pending. Filter by Bucket, PKG, MNL or Cost element code.');
  header(ws, E_H, ['Bucket', 'Item', 'Description', 'PKG', 'MNL', 'Cost element code', ...P, 'To date', 'This month']);
  let row = E_1, excTo = 0; const colSum = Array(np + 2).fill(0), lastP = colL(6 + np), thisF = (r) => `SUMIF($G$${E_H}:$${lastP}$${E_H},${W.CUTLAB},G${r}:${lastP}${r})`;
  const put = (r, vals) => vals.forEach((v, c) => { const x = ws.getCell(r, c + 1); if (v && v.formula) setF(x, v.formula, v.result); else x.value = v; x.border = box; x.font = font(); });
  const cellsFor = (pm, inf, src, ls) => {
    const cells = [];
    for (let p = 0; p <= np; p++) cells.push({ formula: `${pm}!${colL(inf.amtCol(p))}${src}`, result: nm(ls, (l) => (p < np ? l.per === P[p] : l.per !== 'Pending')) });
    cells.push({ formula: thisF(row), result: nm(ls, (l) => l.per === rep) });
    return cells;
  };
  for (const inf of infos) {
    const pm = q(inf.nPm), all = inf.b.items.flatMap((it) => it.lines);
    for (const it of inf.b.items) {
      const cells = cellsFor(pm, inf, it.pmRow, it.lines.filter((l) => l.inc === 'Yes' && l.s === 0));
      put(row, [inf.def.id, itemOf(inf.def, it), descOf(inf.def, it), { formula: `${pm}!${colL(inf.k + 1)}${it.pmRow}`, result: it.pkg }, { formula: `${pm}!${colL(inf.k + 2)}${it.pmRow}`, result: it.mnl }, { formula: `${pm}!${colL(inf.k + 3)}${it.pmRow}`, result: it.ce }, ...cells]);
      cells.forEach((c, j) => { colSum[j] += c.result; });
      for (let c = 7; c <= cTm; c++) ws.getCell(row, c).numFmt = AMT0; ws.getCell(row, cTo).font = font({ bold: true }); row++;
    }
    const cells = cellsFor(pm, inf, inf.rHand, all.filter((l) => l.inc === 'Yes' && l.s === 1)); cells.forEach((c, j) => { cells[j] = c; });
    for (let p = 0; p <= np; p++) cells[p].formula = `${pm}!${colL(inf.amtCol(p))}${inf.rHand}`;
    put(row, [inf.def.id, 'Hand-coded lines', 'typed over on the ' + inf.nDat + ' sheet', null, null, null, ...cells]);
    cells.forEach((c, j) => { colSum[j] += c.result; }); for (let c = 7; c <= cTm; c++) ws.getCell(row, c).numFmt = AMT0; ws.getCell(row, 2).font = font({ italic: true, color: { argb: 'FF' + GREY } }); row++;
  }
  const last = row - 1; row++; const tot = row, exc = row + 1;
  ws.getCell(tot, 1).value = 'TOTAL counted'; ws.getCell(tot, 1).font = font({ bold: true, color: { argb: 'FF' + NAVY } });
  ws.getCell(exc, 1).value = 'Excluded by user (memo – not in the total)'; ws.getCell(exc, 1).font = font({ color: { argb: 'FF' + GREY } });
  const allLines = infos.flatMap((inf) => inf.b.items.flatMap((it) => it.lines));
  for (let c = 7; c <= cTm; c++) {
    const cl = colL(c), t = ws.getCell(tot, c), x = ws.getCell(exc, c);
    setF(t, `SUM(${cl}${E_1}:${cl}${last})`, r2(colSum[c - 7])); t.numFmt = AMT0; t.font = font({ bold: true }); t.border = box; t.fill = fill('DDEBF7');
    const ev = nm(allLines, (l) => l.inc === 'No' && (c === cTo ? true : c === cTm ? l.per === rep : l.per === P[c - 7]));
    if (c === cTo) excTo = ev;
    if (c === cTm) setF(x, thisF(exc), ev); else setF(x, infos.map((inf) => `${q(inf.nPm)}!${colL(inf.amtCol(c <= cTo ? c - 7 : np))}${inf.rExc}`).join('+'), ev);
    x.numFmt = AMT0; x.font = font({ color: { argb: 'FF' + GREY } }); x.border = box;
  }
  [24, 16, 44, 12, 8, 16].forEach((w, i) => { ws.getColumn(i + 1).width = w; }); for (let c = 7; c <= cTm; c++) ws.getColumn(c).width = 14;
  ws.views = [{ showGridLines: false, state: 'frozen', xSplit: 3, ySplit: E_H }]; ws.autoFilter = { from: { row: E_H, column: 1 }, to: { row: last, column: cTm } };
  return { tot, exc, last, cTo, cTm, total: r2(colSum[np]), excTo, pending: r2(colSum[np - 1]), np };
}

function writeSummary(ws, model, infos, ex, opts, revInfo, stats) {
  const np = model.periods.length, P = model.periods, ed = 'Expenses!';
  title(ws, 'Project Cost Register — ' + opts.project, 'Actual cost from CJI3 (' + stats.file + ') posted ' + model.periods[1] + ' → ' + model.reportLabel + ', EGP. CJI3 is the single source of truth; every sheet below reconciles to it.');
  // ---- cut date: the report follows it (postings after it are Pending)
  ws.getCell('A3').value = 'Cut date (type a date – later postings go to Pending)'; ws.getCell('A3').font = font({ bold: true });
  const cd = ws.getCell('B3'); cd.value = new Date(model.cut + 'T00:00:00Z'); cd.numFmt = 'dd-mmm-yyyy'; cd.fill = fill(YELLOW); cd.font = font({ bold: true, size: 11 }); cd.border = box; cd.alignment = { horizontal: 'center' };
  ws.getCell('C3').value = 'Report month'; ws.getCell('C3').font = font({ color: { argb: 'FF' + GREY } }); ws.getCell('C3').alignment = { horizontal: 'right' };
  const rm = ws.getCell('D3'); setF(rm, `CHOOSE(MONTH(B3),"Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec")&"-"&RIGHT(YEAR(B3),2)`, model.reportLabel); rm.font = font({ bold: true, size: 11, color: { argb: 'FF' + NAVY } }); rm.alignment = { horizontal: 'center' }; rm.fill = fill('FFF2CC'); rm.border = box;
  const cji = stats.cost, rng = (c) => `'Revenue Data'!$${c}$5:$${c}$${revInfo ? revInfo.last : 5}`;
  const clientDed = r2(model.lines.filter((l) => l.bucket === 'Revenue' && l.ce[0] !== '4').reduce((s, l) => s + l.amt, 0));
  const counted = ex.total, excl = ex.excTo, pend = ex.pending;
  const cards = [['CJI3 cost (cost elements not 4xxxxxxx)', cji, null], ['Expenses – counted to the cut date', counted, `${ed}${colL(ex.cTo)}${ex.tot}`], ['Excluded by user', excl, `${ed}${colL(ex.cTo)}${ex.exc}`],
    ['Client deductions (shown with revenue)', clientDed, revInfo ? `SUMIFS(${rng('M')},${rng('F')},"<>4*")` : null], ['Pending (posted after the cut date)', pend, `${ed}${colL(6 + np)}${ex.tot}`]];
  cards.forEach(([l, v, f], i) => { const c = 1 + i * 2; ws.mergeCells(4, c, 4, c + 1); ws.mergeCells(5, c, 5, c + 1); const a = ws.getCell(4, c), x = ws.getCell(5, c); a.value = l; a.font = font({ size: 9, color: { argb: 'FF' + GREY } }); a.fill = fill('DDEBF7'); a.alignment = { horizontal: 'center', wrapText: true };
    if (f) setF(x, f, v); else x.value = v; x.numFmt = AMT0; x.font = font({ size: 14, bold: true, color: { argb: 'FF' + NAVY } }); x.fill = fill('DDEBF7'); x.alignment = { horizontal: 'center' }; });
  ws.mergeCells(4, 11, 4, 12); ws.mergeCells(5, 11, 5, 12); const a = ws.getCell(4, 11), x = ws.getCell(5, 11); a.value = 'Difference to CJI3 (must be 0)'; a.font = font({ size: 9, bold: true, color: { argb: 'FF' + RED } }); a.fill = fill('FDE9E7'); a.alignment = { horizontal: 'center' };
  setF(x, 'ROUND(A5-C5-E5-G5-I5,2)', r2(cji - counted - excl - clientDed - pend)); x.numFmt = AMT2; x.font = font({ size: 14, bold: true, color: { argb: 'FF' + RED } }); x.fill = fill('FDE9E7'); x.alignment = { horizontal: 'center' };
  ws.getRow(4).height = 28;
  // ---- bucket table (from the Expenses sheet, so the cut date flows through)
  const H = 8; header(ws, H, ['Bucket', 'Lines', 'Opening', 'Activity', 'To date', 'This month', 'Pending', 'Coded share', 'Excluded (memo)', 'Check (must be 0)']);
  let r = H + 1; const first = r, t = { lines: 0, op: 0, td: 0, tm: 0, pe: 0, ex: 0 };
  const sx = (col, id) => `SUMIFS(${ed}$${col}$${E_1}:$${col}$${ex.last},${ed}$A$${E_1}:$A$${ex.last},"${id}")`;
  for (const inf of infos) {
    const lines = inf.b.items.flatMap((it) => it.lines), yes = lines.filter((l) => l.inc === 'Yes'), s = (f) => r2(yes.filter(f).reduce((a2, l) => a2 + l.amt, 0));
    const op = s((l) => l.per === 'Opening'), td = s((l) => l.per !== 'Pending'), tm = s((l) => l.per === model.reportLabel), pe = s((l) => l.per === 'Pending'), exv = r2(lines.filter((l) => l.inc === 'No').reduce((a2, l) => a2 + l.amt, 0));
    const pm = q(inf.nPm), id = inf.def.id;
    const cells = [id, inf.b.count, { f: sx('G', id), v: op }, { f: `E${r}-C${r}`, v: r2(td - op) }, { f: sx(colL(ex.cTo), id), v: td }, { f: sx(colL(ex.cTm), id), v: tm }, { f: sx(colL(6 + np), id), v: pe },
      { f: `${q(inf.nCod)}!E4`, v: 0 }, { f: `${pm}!${colL(inf.amtCol(np))}${inf.rExc}`, v: exv }, { f: `${pm}!${colL(inf.amtCol(np))}${inf.rDiff}`, v: 0 }];
    cells.forEach((c, i) => { const y = ws.getCell(r, i + 1); if (c && c.f) setF(y, c.f, c.v); else y.value = c; y.border = box; y.font = font({ bold: i === 0 }); if (i >= 2) y.numFmt = i === 7 ? PCT : AMT0; });
    setF(ws.getCell(r, 1), `HYPERLINK("#'${inf.nCod}'!A1","${id}")`, id); ws.getCell(r, 1).font = font({ bold: true, color: { argb: 'FF2F5597' }, underline: true });
    t.lines += inf.b.count; t.op += op; t.td += td; t.tm += tm; t.pe += pe; t.ex += exv; r++;
  }
  const last = r - 1; ws.getCell(r, 1).value = 'TOTAL'; ws.getCell(r, 1).font = font({ bold: true }); ws.getCell(r, 1).fill = fill('DDEBF7'); ws.getCell(r, 1).border = box;
  [[2, t.lines, '#,##0'], [3, t.op, AMT0], [4, r2(t.td - t.op), AMT0], [5, t.td, AMT0], [6, t.tm, AMT0], [7, t.pe, AMT0], [9, t.ex, AMT0], [10, 0, AMT2]].forEach(([c, v, nf]) => { const y = ws.getCell(r, c); setF(y, `SUM(${colL(c)}${first}:${colL(c)}${last})`, r2(v)); y.numFmt = nf; y.font = font({ bold: true }); y.border = box; y.fill = fill('DDEBF7'); });
  // ---- reconciliation + revenue
  r += 2; ws.getCell(r, 1).value = 'Reconciliation to CJI3'; ws.getCell(r, 1).font = font({ bold: true, color: { argb: 'FF' + NAVY }, size: 11 }); r++;
  const rec = [['CJI3 cost, all cost elements except 4xxxxxxx (from the file)', null, cji], ['– Expenses counted to the cut date', 'C5', counted], ['– Pending (posted after the cut date)', 'I5', pend], ['– Excluded by user (memo, listed on each per Month sheet)', 'E5', excl], ['– Client deductions (shown with revenue)', 'G5', clientDed]];
  rec.forEach(([l, f, v]) => { ws.getCell(r, 1).value = l; ws.getCell(r, 1).font = font(); const y = ws.getCell(r, 5); if (f) setF(y, f, v); else y.value = v; y.numFmt = AMT0; r++; });
  ws.getCell(r, 1).value = 'Difference (must be 0)'; ws.getCell(r, 1).font = font({ bold: true, color: { argb: 'FF' + RED } }); setF(ws.getCell(r, 5), `ROUND(E${r - 5}-E${r - 4}-E${r - 3}-E${r - 2}-E${r - 1},2)`, r2(cji - counted - pend - excl - clientDed)); ws.getCell(r, 5).numFmt = AMT2; ws.getCell(r, 5).font = font({ bold: true, color: { argb: 'FF' + RED } });
  r += 2; ws.getCell(r, 1).value = 'Revenue (kept apart, never netted) – to the cut date'; ws.getCell(r, 1).font = font({ bold: true, color: { argb: 'FF' + NAVY }, size: 11 }); r++;
  if (revInfo) {
    const rv = model.lines.filter((l) => l.bucket === 'Revenue' && l.per !== 'Pending'), rev4 = r2(-rv.filter((l) => l.ce[0] === '4').reduce((s, l) => s + l.amt, 0)), cdv = r2(rv.filter((l) => l.ce[0] !== '4').reduce((s, l) => s + l.amt, 0)), rpend = r2(-model.lines.filter((l) => l.bucket === 'Revenue' && l.per === 'Pending').reduce((s, l) => s + l.amt, 0));
    [['Revenue (cost elements 4xxxxxxx)', `-SUMIFS(${rng('M')},${rng('F')},"4*",${rng('C')},"<>Pending")`, rev4], ['Client deductions', `-SUMIFS(${rng('M')},${rng('F')},"<>4*",${rng('C')},"<>Pending")`, -cdv]].forEach(([l, f, v]) => { ws.getCell(r, 1).value = l; ws.getCell(r, 1).font = font(); setF(ws.getCell(r, 5), f, v); ws.getCell(r, 5).numFmt = AMT0; r++; });
    ws.getCell(r, 1).value = 'Net revenue'; ws.getCell(r, 1).font = font({ bold: true }); setF(ws.getCell(r, 5), `E${r - 2}+E${r - 1}`, r2(rev4 - cdv)); ws.getCell(r, 5).numFmt = AMT0; ws.getCell(r, 5).font = font({ bold: true }); r++;
    ws.getCell(r, 1).value = 'Revenue posted after the cut date (pending)'; ws.getCell(r, 1).font = font({ color: { argb: 'FF' + GREY } }); setF(ws.getCell(r, 5), `-SUMIFS(${rng('M')},${rng('C')},"Pending")`, rpend); ws.getCell(r, 5).numFmt = AMT0;
  }
  [44, 10, 16, 16, 16, 16, 14, 12, 16, 16, 14, 8].forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  ws.views = [{ showGridLines: false }];
}

function writeChecks(ws, model, infos, ex, opts, stats) {
  title(ws, 'Checks — ' + opts.project, 'Everything here should read OK. A CHECK means the register and CJI3 disagree somewhere.');
  header(ws, 4, ['Check', 'Value', 'Status', 'What it means']);
  const rows = [];
  const add = (name, f, v, ok, note) => rows.push([name, f, v, ok, note]);
  add('CJI3 lines vs the grand-total row of the file', null, r2(stats.sum - stats.grand), 'abs', 'Sum of all lines minus the file\'s own grand-total row.');
  add('Duplicate line keys (document | row | year)', null, stats.dupes, 'zero', 'A key that appears twice would be double-counted.');
  add('Lines with no bucket (Unclassified)', null, model.lines.filter((l) => l.bucket === 'Unclassified').length, 'zero', 'A cost element without a rule – add one in the rule table.');
  add('Register vs CJI3 cost – difference', `Summary!K5`, 0, 'abs', 'Expenses counted + excluded + client deductions − CJI3 cost.');
  for (const inf of infos) add(inf.def.id + ': per Month total vs Data sheet', `${q(inf.nPm)}!${colL(inf.amtCol(model.periods.length))}${inf.rDiff}`, 0, 'abs', 'Must be 0.');
  for (const inf of infos) add(inf.def.id + ': items not fully coded', `COUNTIFS(${q(inf.nCod)}!${colL(inf.C.st)}7:${colL(inf.C.st)}${inf.lastC},"<>Fully coded",${q(inf.nCod)}!${colL(inf.C.id)}7:${colL(inf.C.id)}${inf.lastC},">0")`, inf.nStatus.nPart + inf.nStatus.nNot, 'info', 'Items still to code.');
  for (const inf of infos) add(inf.def.id + ': lines typed over', `SUM(${q(inf.nDat)}!${colL(inf.D.over)}5:${colL(inf.D.over)}${inf.lastD})`, inf.b.items.flatMap((it) => it.lines).filter((l) => l.s === 1).length, 'info', 'Lines coded differently from their item.');
  add('ZY accrual-reversal lines paired to a bucket', null, stats.zyPaired, 'info', 'Equal-and-opposite pairs take the bucket of the original.');
  if (stats.noGroup !== undefined) add('Materials without a material group', null, stats.noGroup, 'info', 'Load MB52 / ME2N to give them a family and division.');
  rows.forEach(([n, f, v, ok, note], i) => { const r = 5 + i; ws.getCell(r, 1).value = n; const x = ws.getCell(r, 2); if (f) setF(x, f, v); else x.value = v; x.numFmt = '#,##0.00';
    const s = ws.getCell(r, 3); const test = ok === 'abs' ? `IF(ABS(B${r})<0.01,"OK","CHECK")` : ok === 'zero' ? `IF(B${r}=0,"OK","CHECK")` : `"info"`;
    setF(s, test, ok === 'abs' ? (Math.abs(v) < 0.01 ? 'OK' : 'CHECK') : ok === 'zero' ? (v === 0 ? 'OK' : 'CHECK') : 'info'); ws.getCell(r, 4).value = note;
    [1, 2, 3, 4].forEach((c) => { ws.getCell(r, c).border = box; ws.getCell(r, c).font = font({ bold: c === 3 }); }); });
  const e = 4 + rows.length; ws.addConditionalFormatting({ ref: `C5:C${e}`, rules: [{ type: 'expression', formulae: ['$C5="OK"'], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFC6EFCE' } } }, priority: 1 }, { type: 'expression', formulae: ['$C5="CHECK"'], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFFFC7CE' } } }, priority: 2 }] });
  [58, 16, 10, 70].forEach((w, i) => { ws.getColumn(i + 1).width = w; }); ws.views = [{ showGridLines: false, state: 'frozen', ySplit: 4 }];
}

function writeRules(ws, opts) {
  title(ws, 'Rules — how every CJI3 line gets its bucket', 'First match wins. The rules live in src/rules.js; this table is the readable copy. A new cost element that matches no rule lands in Unclassified and shows on Checks.');
  header(ws, 4, ['#', 'When the line…', 'It goes to', 'Note']);
  RULES.forEach((r, i) => { r.forEach((v, c) => { const x = ws.getCell(5 + i, c + 1); x.value = v; x.border = box; x.font = font(); x.alignment = { wrapText: true, vertical: 'top' }; }); });
  let row = 6 + RULES.length; ws.getCell(row, 1).value = 'G&A sub-groups (cost element names)'; ws.getCell(row, 1).font = font({ bold: true, color: { argb: 'FF' + NAVY }, size: 11 }); row++;
  for (const [sub, list] of Object.entries(GA)) { ws.getCell(row, 2).value = sub; ws.getCell(row, 2).font = font({ bold: true }); ws.getCell(row, 3).value = list.join(', '); ws.getCell(row, 3).alignment = { wrapText: true }; ws.getCell(row, 3).font = font(); row++; }
  [5, 62, 50, 40].forEach((w, i) => { ws.getColumn(i + 1).width = w; }); ws.views = [{ showGridLines: false }];
}
module.exports = { writeExpenses, writeSummary, writeChecks, writeRules };
