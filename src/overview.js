'use strict';
// Summary, Expenses (every item of every bucket), Checks, Rules.
const W = require('./workbook');
const { r2, colL } = require('./util');
const { RULES, GA } = require('./rules');
const { fill, font, box, q, setF, title, header, itemOf, descOf, AMT0, AMT2, PCT, NAVY, GREY, RED, GOLD } = W;
const E_H = 6, E_1 = 7;

function writeExpenses(ws, model, infos, opts, extra) {
  const np = model.periods.length, cTo = 6 + np + 1, cTm = 6 + np + 2;
  title(ws, 'Expenses — ' + opts.project + ' — coded actual cost', 'Every item of every bucket, with its codes, by posting month. Live links to the "per Month" sheets; counted lines only. Filter by Bucket, PKG, MNL or Cost element code.');
  header(ws, E_H, ['Bucket', 'Item', 'Description', 'PKG', 'MNL', 'Cost element code', ...model.periods, 'To date', 'This month · ' + model.reportLabel]);
  let row = E_1, excTo = 0; const rows = []; const colSum = Array(np + 2).fill(0);
  const put = (r, vals) => vals.forEach((v, c) => { const x = ws.getCell(r, c + 1); if (v && v.formula) setF(x, v.formula, v.result); else x.value = v; x.border = box; x.font = font(); });
  for (const inf of infos) {
    const pm = q(inf.nPm), all = inf.b.items.flatMap((it) => it.lines);
    inf.b.items.forEach((it, i) => {
      const src = 6 + i, own = it.lines.filter((l) => l.inc === 'Yes' && l.s === 0);
      const cells = [];
      for (let p = 0; p <= np; p++) cells.push({ formula: `${pm}!${colL(inf.amtCol(p))}${src}`, result: r2(own.filter((l) => (p < np ? l.per === model.periods[p] : true)).reduce((s, l) => s + l.amt, 0)) });
      cells.push({ formula: `${pm}!${colL(inf.amtCol(np - 1))}${src}`, result: cells[np - 1].result });
      put(row, [inf.def.id, itemOf(inf.def, it), descOf(inf.def, it), { formula: `${pm}!${colL(inf.k + 1)}${src}`, result: it.pkg }, { formula: `${pm}!${colL(inf.k + 2)}${src}`, result: it.mnl }, { formula: `${pm}!${colL(inf.k + 3)}${src}`, result: it.ce }, ...cells]);
      cells.forEach((c, j) => { if (j <= np - 1) colSum[j] += c.result; else if (j === np) colSum[np] += c.result; else colSum[np + 1] += c.result; });
      for (let c = 7; c <= cTm; c++) ws.getCell(row, c).numFmt = AMT0; ws.getCell(row, cTo).font = font({ bold: true });
      rows.push(row); row++;
    });
    const hand = all.filter((l) => l.inc === 'Yes' && l.s === 1), cells = [];
    for (let p = 0; p <= np; p++) cells.push({ formula: `${pm}!${colL(inf.amtCol(p))}${inf.rHand}`, result: r2(hand.filter((l) => (p < np ? l.per === model.periods[p] : true)).reduce((s, l) => s + l.amt, 0)) });
    cells.push({ formula: `${pm}!${colL(inf.amtCol(np - 1))}${inf.rHand}`, result: cells[np - 1].result });
    put(row, [inf.def.id, 'Hand-coded lines', 'typed over on the ' + inf.nDat + ' sheet', null, null, null, ...cells]);
    cells.forEach((c, j) => { colSum[j] += c.result; }); for (let c = 7; c <= cTm; c++) ws.getCell(row, c).numFmt = AMT0; ws.getCell(row, 2).font = font({ italic: true, color: { argb: 'FF' + GREY } }); rows.push(row); row++;
  }
  const last = row - 1; row++;
  const tot = row, exc = row + 1;
  ws.getCell(tot, 1).value = 'TOTAL counted'; ws.getCell(tot, 1).font = font({ bold: true, color: { argb: 'FF' + NAVY } });
  ws.getCell(exc, 1).value = 'Excluded by user (memo – not in the total)'; ws.getCell(exc, 1).font = font({ color: { argb: 'FF' + GREY } });
  for (let c = 7; c <= cTm; c++) {
    const cl = colL(c), t = ws.getCell(tot, c), x = ws.getCell(exc, c);
    setF(t, `SUM(${cl}${E_1}:${cl}${last})`, r2(colSum[c - 7])); t.numFmt = AMT0; t.font = font({ bold: true }); t.border = box; t.fill = fill('DDEBF7');
    const pcol = (inf) => (c <= cTo ? inf.amtCol(c - 7) : inf.amtCol(np - 1));
    let ev = 0; for (const inf of infos) ev += r2(inf.b.items.flatMap((it) => it.lines).filter((l) => l.inc === 'No' && (c === cTo ? true : c === cTm ? l.per === model.reportLabel : l.per === model.periods[c - 7])).reduce((s, l) => s + l.amt, 0));
    if (c === cTo) excTo = r2(ev);
    setF(x, infos.map((inf) => `${q(inf.nPm)}!${colL(pcol(inf))}${inf.rExc}`).join('+'), r2(ev)); x.numFmt = AMT0; x.font = font({ color: { argb: 'FF' + GREY } }); x.border = box;
  }
  const widths = [24, 16, 44, 12, 8, 16]; widths.forEach((w, i) => { ws.getColumn(i + 1).width = w; }); for (let c = 7; c <= cTm; c++) ws.getColumn(c).width = 14;
  ws.views = [{ showGridLines: false, state: 'frozen', xSplit: 3, ySplit: E_H }]; ws.autoFilter = { from: { row: E_H, column: 1 }, to: { row: last, column: cTm } };
  return { tot, exc, last, cTo, cTm, total: r2(colSum[np]), excTo };
}

function writeSummary(ws, model, infos, ex, opts, revInfo, stats) {
  const np = model.periods.length;
  title(ws, 'Project Cost Register — ' + opts.project, 'Actual cost from CJI3 (' + stats.file + ') posted ' + model.firstLabel + ' → ' + model.reportLabel + ', EGP. CJI3 is the single source of truth; every sheet below reconciles to it.');
  const cji = stats.cost, ed = "'Expenses'!";
  const clientDed = r2(model.lines.filter((l) => l.bucket === 'Revenue' && l.ce[0] !== '4').reduce((s, l) => s + l.amt, 0));
  const counted = ex.total, excl = ex.excTo;
  const cards = [['CJI3 cost (cost elements not 4xxxxxxx)', cji, null, AMT0], ['Expenses – counted', counted, `${ed}${colL(ex.cTo)}${ex.tot}`, AMT0], ['Excluded by user', excl, `${ed}${colL(ex.cTo)}${ex.exc}`, AMT0],
    ['Client deductions (shown with revenue)', clientDed, revInfo ? `SUMIFS('Revenue Data'!$M$5:$M$${revInfo.last},'Revenue Data'!$F$5:$F$${revInfo.last},"<>4*")` : null, AMT0]];
  cards.forEach(([l, v, f, nf], i) => { const c = 1 + i * 2; ws.mergeCells(4, c, 4, c + 1); ws.mergeCells(5, c, 5, c + 1); const a = ws.getCell(4, c), x = ws.getCell(5, c); a.value = l; a.font = font({ size: 9, color: { argb: 'FF' + GREY } }); a.fill = fill('DDEBF7'); a.alignment = { horizontal: 'center' };
    if (f) setF(x, f, v); else x.value = v; x.numFmt = nf; x.font = font({ size: 14, bold: true, color: { argb: 'FF' + NAVY } }); x.fill = fill('DDEBF7'); x.alignment = { horizontal: 'center' }; });
  const dc = 9; ws.mergeCells(4, dc, 4, dc + 1); ws.mergeCells(5, dc, 5, dc + 1);
  const a = ws.getCell(4, dc), x = ws.getCell(5, dc); a.value = 'Difference to CJI3 (must be 0)'; a.font = font({ size: 9, bold: true, color: { argb: 'FF' + RED } }); a.fill = fill('FDE9E7'); a.alignment = { horizontal: 'center' };
  setF(x, 'ROUND(A5-C5-E5-G5,2)', r2(cji - counted - excl - clientDed)); x.numFmt = AMT2; x.font = font({ size: 14, bold: true, color: { argb: 'FF' + RED } }); x.fill = fill('FDE9E7'); x.alignment = { horizontal: 'center' };
  // bucket table
  const H = 8; header(ws, H, ['Bucket', 'Lines', 'Opening', 'Activity', 'To date', 'This month · ' + model.reportLabel, 'Coded share', 'Excluded (memo)', 'Check (must be 0)']);
  let r = H + 1; const first = r;
  const t = { lines: 0, op: 0, td: 0, tm: 0, ex: 0 };
  for (const inf of infos) {
    const pm = q(inf.nPm), at = (p) => `${pm}!${colL(inf.amtCol(p))}${inf.rTot}`, all = inf.b.items.flatMap((it) => it.lines).filter((l) => l.inc === 'Yes');
    const op = r2(all.filter((l) => l.per === 'Opening').reduce((s, l) => s + l.amt, 0)), td = r2(all.reduce((s, l) => s + l.amt, 0)), tm = r2(all.filter((l) => l.per === model.reportLabel).reduce((s, l) => s + l.amt, 0));
    const exv = r2(inf.b.items.flatMap((it) => it.lines).filter((l) => l.inc === 'No').reduce((s, l) => s + l.amt, 0));
    const share = inf.nStatus.nFull ? 0 : 0; void share;
    const cells = [inf.def.id, inf.b.count, { f: at(0), v: op }, { f: `E${r}-C${r}`, v: r2(td - op) }, { f: at(np), v: td }, { f: at(np - 1), v: tm }, { f: `${q(inf.nCod)}!E4`, v: null }, { f: `${pm}!${colL(inf.amtCol(np))}${inf.rExc}`, v: exv }, { f: `${pm}!${colL(inf.amtCol(np))}${inf.rDiff}`, v: 0 }];
    cells.forEach((c, i) => { const y = ws.getCell(r, i + 1); if (c && c.f) setF(y, c.f, c.v === null ? 0 : c.v); else y.value = c; y.border = box; y.font = font({ bold: i === 0 }); if (i >= 2 && i !== 6) y.numFmt = AMT0; if (i === 6) y.numFmt = PCT; });
    ws.getCell(r, 1).value = { text: inf.def.id, hyperlink: '#' + q(inf.nCod) + '!A1' }; ws.getCell(r, 1).font = font({ bold: true, color: { argb: 'FF2F5597' }, underline: true });
    t.lines += inf.b.count; t.op += op; t.td += td; t.tm += tm; t.ex += exv; r++;
  }
  const last = r - 1; ws.getCell(r, 1).value = 'TOTAL'; ws.getCell(r, 1).font = font({ bold: true });
  [[2, t.lines, '#,##0'], [3, t.op, AMT0], [4, r2(t.td - t.op), AMT0], [5, r2(t.td), AMT0], [6, r2(t.tm), AMT0], [8, r2(t.ex), AMT0]].forEach(([c, v, nf]) => { const y = ws.getCell(r, c); setF(y, `SUM(${colL(c)}${first}:${colL(c)}${last})`, v); y.numFmt = nf; y.font = font({ bold: true }); y.border = box; y.fill = fill('DDEBF7'); });
  setF(ws.getCell(r, 9), `SUM(I${first}:I${last})`, 0); ws.getCell(r, 9).font = font({ bold: true }); ws.getCell(r, 9).numFmt = AMT2; ws.getCell(r, 9).border = box;
  ws.getCell(r, 1).fill = fill('DDEBF7'); ws.getCell(r, 1).border = box;
  // reconciliation + revenue
  r += 2; const rec = [['CJI3 cost, all cost elements except 4xxxxxxx (from the file)', cji], ['– Expenses counted (this register)', counted], ['– Excluded by user (memo, listed on each per Month sheet)', excl], ['– Client deductions (cost element Client-Deductions, shown with revenue)', clientDed]];
  ws.getCell(r, 1).value = 'Reconciliation to CJI3'; ws.getCell(r, 1).font = font({ bold: true, color: { argb: 'FF' + NAVY }, size: 11 }); r++;
  rec.forEach(([l, v], i) => { ws.getCell(r, 1).value = l; ws.getCell(r, 1).font = font(); const y = ws.getCell(r, 5); if (i === 0) y.value = v; else setF(y, ['', 'C5', 'E5', 'G5'][i] ? ['', 'C5', 'E5', 'G5'][i] : '0', v); y.numFmt = AMT0; r++; });
  ws.getCell(r, 1).value = 'Difference (must be 0)'; ws.getCell(r, 1).font = font({ bold: true, color: { argb: 'FF' + RED } }); setF(ws.getCell(r, 5), `ROUND(E${r - 4}-E${r - 3}-E${r - 2}-E${r - 1},2)`, r2(cji - counted - excl - clientDed)); ws.getCell(r, 5).numFmt = AMT2; ws.getCell(r, 5).font = font({ bold: true, color: { argb: 'FF' + RED } });
  r += 2; ws.getCell(r, 1).value = 'Revenue (kept apart, never netted)'; ws.getCell(r, 1).font = font({ bold: true, color: { argb: 'FF' + NAVY }, size: 11 }); r++;
  if (revInfo) {
    const rv = model.lines.filter((l) => l.bucket === 'Revenue'), rev4 = r2(-rv.filter((l) => l.ce[0] === '4').reduce((s, l) => s + l.amt, 0)), rng = (c) => `'Revenue Data'!$${c}$5:$${c}$${revInfo.last}`;
    [['Revenue (cost elements 4xxxxxxx)', `-SUMIFS(${rng('M')},${rng('F')},"4*")`, rev4], ['Client deductions', `-SUMIFS(${rng('M')},${rng('F')},"<>4*")`, -clientDed]].forEach(([l, f, v]) => { ws.getCell(r, 1).value = l; ws.getCell(r, 1).font = font(); setF(ws.getCell(r, 5), f, v); ws.getCell(r, 5).numFmt = AMT0; r++; });
    ws.getCell(r, 1).value = 'Net revenue'; ws.getCell(r, 1).font = font({ bold: true }); setF(ws.getCell(r, 5), `E${r - 2}+E${r - 1}`, r2(rev4 - clientDed)); ws.getCell(r, 5).numFmt = AMT0; ws.getCell(r, 5).font = font({ bold: true });
  }
  [34, 10, 16, 16, 16, 18, 12, 16, 16].forEach((w, i) => { ws.getColumn(i + 1).width = w; }); ws.getColumn(1).width = 44;
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
  add('Register vs CJI3 cost – difference', `Summary!I5`, 0, 'abs', 'Expenses counted + excluded + client deductions − CJI3 cost.');
  for (const inf of infos) add(inf.def.id + ': per Month total vs Data sheet', `${q(inf.nPm)}!${colL(inf.amtCol(model.periods.length))}${inf.rDiff}`, 0, 'abs', 'Must be 0.');
  for (const inf of infos) add(inf.def.id + ': items not fully coded', `COUNTIF(${q(inf.nCod)}!${colL(inf.C.st)}7:${colL(inf.C.st)}${inf.lastC},"<>Fully coded")`, inf.nStatus.nPart + inf.nStatus.nNot, 'info', 'Items still to code.');
  for (const inf of infos) add(inf.def.id + ': lines typed over', `SUM(${q(inf.nDat)}!S5:S${inf.lastD})`, inf.b.items.flatMap((it) => it.lines).filter((l) => l.s === 1).length, 'info', 'Lines coded differently from their item.');
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
