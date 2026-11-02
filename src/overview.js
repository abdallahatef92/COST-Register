'use strict';
// Summary, Expenses (every item of every bucket), Checks, Rules.
const W = require('./workbook');
const { r2, colL } = require('./util');
const { RULES, GA } = require('./rules');
const { fill, font, box, q, setF, title, header, itemOf, descOf, AMT0, AMT2, PCT, NAVY, GREY, RED, GOLD, YELLOW } = W;

function writeSummary(ws, model, infos, ex, opts, revInfo, stats) {
  const np = model.periods.length, P = model.periods, nm = np - 2, ed = 'Expenses!', rep = model.reportLabel, CUTC = 'Summary!$B$4';
  // figures come straight from each bucket's per Month sheet (TOTAL counted row): column c = 7+p period p · 7+np To date · 8+np This month
  const cTo = 7 + np, cTm = 8 + np, pmCell = (inf, p, row = inf.rTot) => `${q(inf.nPm)}!$${colL(inf.amtCol(p))}$${row}`;
  const sbI = (c, inf) => (c === cTo ? pmCell(inf, np) : c === cTm ? `(${P.slice(1, np - 1).map((lab, i) => `(${CUTC.replace('$B$4', '$D$4')}="${lab}")*${pmCell(inf, i + 1)}`).join('+')})` : pmCell(inf, c - 7));
  const sb = (c, id) => sbI(c, infos.find((i) => i.def.id === id)), sumB = (c) => infos.map((inf) => sbI(c, inf)).join('+'), NUM = '#,##0;[Red]\\-#,##0;"-"', PC = '0.0%;[Red]\\-0.0%;"-"';
  const counted = (inf) => inf.b.items.flatMap((it) => it.lines).filter((l) => l.inc === 'Yes'), sum = (ls) => r2(ls.reduce((s, l) => s + l.amt, 0));
  const pastel = (i) => W.BAND[i % W.BAND.length];
  const T = (c, v, o = {}) => { const x = ws.getCell(c); x.value = v; x.font = font(o); return x; };
  const sec = (r, t, note) => { T(`A${r}`, t, { bold: true, size: 12, color: { argb: 'FF' + NAVY } }); if (note) T(`B${r}`, note, { size: 9, color: { argb: 'FF595959' } }); ws.getRow(r).height = 15.6; };
  const head = (r, labels) => { labels.forEach((h, i) => { const c = ws.getCell(r, i + 1); c.value = h; c.font = font({ bold: true, color: { argb: 'FFFFFFFF' } }); c.fill = fill(NAVY); c.alignment = { horizontal: i ? 'center' : 'left', vertical: 'middle', wrapText: true }; }); ws.getRow(r).height = 28; };
  const cell = (r, c, v, f, o = {}) => { const x = ws.getCell(r, c); if (f) setF(x, f, v); else x.value = v; x.font = font(o.font || {}); if (o.fmt) x.numFmt = o.fmt; if (o.fill) x.fill = fill(o.fill); if (o.align) x.alignment = { horizontal: o.align }; return x; };
  ws.getCell('A1').value = 'Project Cost Register'; ws.getCell('A1').font = font({ bold: true, size: 16, color: { argb: 'FF' + NAVY } }); ws.getRow(1).height = 21;
  T('A2', opts.project + ' · EGP · actual cost from CJI3', { bold: true, size: 11 });
  T('A3', `CJI3 ${stats.file} · posted ${model.periods[1]} → ${model.periods[np - 2]} · made ${new Date().toISOString().slice(0, 10)} with Cost Register`, { size: 9, color: { argb: 'FF595959' } });
  // ---- cut date
  T('A4', 'Cut date  ▸', { bold: true, size: 12, color: { argb: 'FF' + NAVY } });
  const cd = ws.getCell('B4'); cd.value = new Date(model.cut + 'T00:00:00Z'); cd.numFmt = 'dd\\-mmm\\-yyyy'; cd.fill = fill(YELLOW); cd.font = font({ bold: true, size: 12 }); cd.border = box; cd.alignment = { horizontal: 'center' };
  T('C4', 'Month  ▸', { bold: true, size: 12, color: { argb: 'FF' + NAVY } }).alignment = { horizontal: 'right' };
  const rm = ws.getCell('D4'); setF(rm, `CHOOSE(MONTH(B4),"Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec")&"-"&RIGHT(YEAR(B4),2)`, rep); rm.font = font({ bold: true, size: 12, color: { argb: 'FF' + NAVY } }); rm.fill = fill('FFF2CC'); rm.alignment = { horizontal: 'center' }; rm.border = box;
  T('E4', 'Pick the cut date from the list (▼): later postings go to Pending and stay out of To date. Every sheet follows it.', { size: 9, color: { argb: 'FF595959' } });
  ws.getRow(4).height = 24;
  const subInf = infos.find((i) => i.def.id === 'Subcontractor'), vo = opts.vatOpt || { mode: 'Exclude VAT', from: '' };
  if (subInf && stats.sub) {   // VAT switch, as in the Subcontract report: Exclude / Include / Include before a date
    T('A5', 'VAT  ▸', { bold: true, size: 12, color: { argb: 'FF' + NAVY } });
    const vm = ws.getCell('B5'); vm.value = vo.mode; vm.fill = fill(YELLOW); vm.font = font({ bold: true, size: 11 }); vm.border = box; vm.alignment = { horizontal: 'center' };
    vm.dataValidation = { type: 'list', allowBlank: false, formulae: ['"Exclude VAT,Include VAT,Include VAT before date"'], showErrorMessage: true, errorTitle: 'VAT', error: 'Pick one from the list.', showInputMessage: true, promptTitle: 'VAT', prompt: 'Exclude VAT = net (as CJI3). Include VAT = + VAT on every certificate line. Include VAT before date = VAT on certificates dated before the date in C5, net from it on.' };
    const vd = ws.getCell('C5'); if (vo.from) vd.value = new Date(vo.from + 'T00:00:00Z'); vd.numFmt = 'dd\\-mmm\\-yyyy'; vd.fill = fill(YELLOW); vd.font = font({ bold: true, size: 11 }); vd.border = box; vd.alignment = { horizontal: 'center' };
    vd.dataValidation = { type: 'date', operator: 'greaterThan', allowBlank: true, formulae: [36526], showErrorMessage: true, errorTitle: 'VAT date', error: 'Type a date, e.g. 01-Jan-2026.' };
    const vt = vo.mode === 'Include VAT' ? 'Subcontractor amounts include VAT' : vo.mode === 'Include VAT before date' ? (vo.from ? 'Subcontractor amounts include VAT on certificates dated before ' + new Date(vo.from + 'T00:00:00Z').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).replace(/ /g, '-') + ' (opening invoices count as before)' : 'Type the date in C5 – VAT is not included until then') : 'Subcontractor amounts are net of VAT (as CJI3)';
    const E5 = ws.getCell('E5'); setF(E5, `IF(B5="Include VAT","Subcontractor amounts include VAT",IF(B5="Include VAT before date",IF(ISNUMBER(C5),"Subcontractor amounts include VAT on certificates dated before "&TEXT(C5,"dd-mmm-yyyy")&" (opening invoices count as before)","Type the date in C5 – VAT is not included until then"),"Subcontractor amounts are net of VAT (as CJI3)"))`, vt); E5.font = font({ size: 9, color: { argb: 'FF595959' } });
  }
  // ---- numbers
  const all = infos.flatMap((inf) => counted(inf)), toDate = sum(all.filter((l) => l.per !== 'Pending')), thisM = sum(all.filter((l) => l.per === rep)), pend = sum(all.filter((l) => l.per === 'Pending'));
  const excl = r2(infos.flatMap((inf) => inf.b.items.flatMap((it) => it.lines)).filter((l) => l.inc === 'No').reduce((s, l) => s + l.amt, 0));
  const clientDed = r2(model.lines.filter((l) => l.bucket === 'Revenue' && l.ce[0] !== '4').reduce((s, l) => s + l.amt, 0));
  // ---- KPI cards (row 6 labels, row 7 values)
  const cards = [['Previous (before this month)', r2(toDate - thisM), `C7-B7`, null], ['="This month · "&D4', thisM, sumB(cTm), 'FFF2CC'], ['To date (counted)', toDate, sumB(cTo), null],
    ['Pending – not in To date', pend, sumB(6 + np), null], ['Excluded by user', excl, infos.map((inf) => pmCell(inf, np, inf.rExc)).join('+'), null], ['Difference to CJI3 (must be 0)', 0, null, null]];
  cards.forEach(([l, v, f, bg], i) => { const c = i + 1, a = ws.getCell(6, c), x = ws.getCell(7, c);
    if (l[0] === '=') setF(a, l.slice(1), 'This month · ' + rep); else a.value = l;
    a.font = font({ bold: true, size: 9, color: { argb: 'FFFFFFFF' } }); a.fill = fill(i === 1 ? GOLD : i === 5 ? RED : NAVY); a.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    if (f) setF(x, f, v); x.numFmt = i === 5 ? '#,##0.00;[Red]\\-#,##0.00;"-"' : NUM; x.font = font({ bold: true, size: 14, color: { argb: 'FF' + (i === 5 ? RED : NAVY) } }); x.fill = fill(bg || 'FFFFFF'); x.alignment = { horizontal: 'center' }; x.border = box; });
  ws.getRow(6).height = 40; ws.getRow(7).height = 24;
  // ---- 1. cost per month
  let r = 9; sec(r, '1. Cost per month', 'live – months after the cut date stay empty; Pending is shown apart'); r++;
  const nb = infos.length, hc = nb + 4;   // month-end helper column
  head(r, ['Month', ...infos.map((i) => i.def.id), 'Total', 'Cumulative']); const hr = r; r++;
  const rowsM = []; const firstM = r;
  for (let p = 0; p <= nm; p++) {
    const lab = P[p], isOp = p === 0, ym = isOp ? null : model.months[p - 1], me = ym ? new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7), 0)) : null, inCut = isOp || me.toISOString().slice(0, 10) <= model.cut;
    cell(r, 1, lab, null, { font: { bold: isOp } }); if (!isOp) { const h = ws.getCell(r, hc); h.value = me; h.numFmt = 'dd-mmm-yy'; h.font = font({ size: 8, color: { argb: 'FFA6A6A6' } }); }
    let tot = 0;
    infos.forEach((inf, j) => { const v = inCut ? sum(counted(inf).filter((l) => l.per === lab)) : ''; if (v !== '') tot += v;
      const base = sb(6 + 1 + p, inf.def.id); cell(r, 2 + j, v, isOp ? base : `IF($${colL(hc)}${r}>${CUTC},"",${base})`, { fmt: NUM }); });
    const sumF = `SUM(${colL(2)}${r}:${colL(1 + nb)}${r})`; cell(r, 2 + nb, inCut ? r2(tot) : '', isOp ? sumF : `IF($${colL(hc)}${r}>${CUTC},"",${sumF})`, { fmt: NUM, font: { bold: true } });
    rowsM.push([r, inCut ? r2(tot) : '']); r++;
  }
  let cum = 0; rowsM.forEach(([rr, v], i) => { if (v !== '') cum += v; const cl = colL(2 + nb); cell(rr, 3 + nb, v === '' ? '' : r2(cum), i === 0 ? `${cl}${rr}` : `IF($${colL(hc)}${rr}>${CUTC},"",SUM(${cl}$${firstM}:${cl}${rr}))`, { fmt: NUM }); });
  const lastM = r - 1; ws.getCell(`A${r}`).value = 'Total (to date)'; for (let c = 1; c <= 3 + nb; c++) { const x = ws.getCell(r, c); x.fill = fill('DDEBF7'); x.font = font({ bold: true }); }
  infos.forEach((inf, j) => { const cl = colL(2 + j), v = sum(counted(inf).filter((l) => l.per !== 'Pending')); cell(r, 2 + j, v, `SUM(${cl}${firstM}:${cl}${lastM})`, { fmt: NUM, fill: 'DDEBF7', font: { bold: true } }); });
  cell(r, 2 + nb, toDate, `SUM(${colL(2 + nb)}${firstM}:${colL(2 + nb)}${lastM})`, { fmt: NUM, fill: 'DDEBF7', font: { bold: true } }); r++;
  ws.getCell(`A${r}`).value = 'Pending (after the cut date – not in To date)'; ws.getCell(`A${r}`).font = font({ color: { argb: 'FF595959' } });
  infos.forEach((inf, j) => cell(r, 2 + j, sum(counted(inf).filter((l) => l.per === 'Pending')), sb(6 + np, inf.def.id), { fmt: NUM, font: { color: { argb: 'FF595959' } } }));
  cell(r, 2 + nb, pend, `SUM(${colL(2)}${r}:${colL(1 + nb)}${r})`, { fmt: NUM, font: { color: { argb: 'FF595959' } } });
  ws.getColumn(hc).hidden = true; r += 2;
  // current-month column tint (follows the cut date)
  ws.addConditionalFormatting({ ref: `A${firstM + 1}:${colL(3 + nb)}${lastM}`, rules: [{ type: 'expression', formulae: [`$A${firstM + 1}=$D$4`], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFFFF2CC' } }, font: { bold: true } }, priority: 1 }] });
  // ---- 2. cost by bucket
  sec(r, '2. Cost by bucket', 'live – from each bucket\'s per Month sheet, so the cut date flows through; click a bucket to open its Coding sheet'); r++;
  head(r, ['Bucket', 'Lines', 'Opening', 'Previous', 'This month', 'To date', '% of to date', 'Pending', 'Coded share', 'Excluded (memo)', 'Check (must be 0)']); r++;
  const b0 = r, tot = infos.length + b0;
  infos.forEach((inf, i) => {
    const ls = counted(inf), id = inf.def.id, op = sum(ls.filter((l) => l.per === 'Opening')), td = sum(ls.filter((l) => l.per !== 'Pending')), tm = sum(ls.filter((l) => l.per === rep)), pe = sum(ls.filter((l) => l.per === 'Pending'));
    const exv = r2(inf.b.items.flatMap((it) => it.lines).filter((l) => l.inc === 'No').reduce((s, l) => s + l.amt, 0)), pm = q(inf.nPm);
    const a = ws.getCell(r, 1); setF(a, `HYPERLINK("#'${inf.nCod}'!A1","${id}")`, id); a.font = font({ bold: true, underline: true, color: { argb: 'FF2F5597' } }); a.fill = fill('DDE5EE');
    cell(r, 2, inf.b.count, null, { fmt: '#,##0' }); cell(r, 3, op, sb(7, id), { fmt: NUM }); cell(r, 4, r2(td - tm), `F${r}-E${r}`, { fmt: NUM }); cell(r, 5, tm, sb(cTm, id), { fmt: NUM, fill: 'FFF2CC' });
    cell(r, 6, td, sb(cTo, id), { fmt: NUM, font: { bold: true } }); cell(r, 7, 0, `IF($F$${tot}=0,"",F${r}/$F$${tot})`, { fmt: PC }); ws.getCell(r, 7).value = { formula: `IF($F$${tot}=0,"",F${r}/$F$${tot})`, result: toDate ? td / toDate : '' };
    cell(r, 8, pe, sb(6 + np, id), { fmt: NUM }); cell(r, 9, 0, inf.toolC ? `${q(inf.nCod)}!I2` : `${q(inf.nCod)}!E4`, { fmt: PC }); ws.getCell(r, 9).value = { formula: inf.toolC ? `${q(inf.nCod)}!I2` : `${q(inf.nCod)}!E4`, result: inf.coded }; cell(r, 10, exv, `${pm}!${colL(inf.amtCol(np))}${inf.rExc}`, { fmt: NUM, font: { color: { argb: 'FF595959' } } });
    cell(r, 11, 0, `${pm}!${colL(inf.amtCol(np))}${inf.rDiff}`, { fmt: '#,##0.00;[Red]\\-#,##0.00;"-"' }); for (let c = 1; c <= 11; c++) ws.getCell(r, c).border = box; r++;
  });
  ws.getCell(r, 1).value = 'Total'; for (let c = 1; c <= 11; c++) { const x = ws.getCell(r, c); x.fill = fill('DDEBF7'); x.font = font({ bold: true }); x.border = box; }
  const tv = [[2, infos.reduce((s, i) => s + i.b.count, 0), '#,##0'], [3, sum(all.filter((l) => l.per === 'Opening')), NUM], [4, r2(toDate - thisM), NUM], [5, thisM, NUM], [6, toDate, NUM], [8, pend, NUM], [10, excl, NUM], [11, 0, '#,##0.00;[Red]\\-#,##0.00;"-"']];
  tv.forEach(([c, v, f]) => cell(r, c, v, `SUM(${colL(c)}${b0}:${colL(c)}${r - 1})`, { fmt: f, fill: 'DDEBF7', font: { bold: true } })); cell(r, 7, 1, `IF($F$${r}=0,"",1)`, { fmt: PC, fill: 'DDEBF7', font: { bold: true } }); ws.getCell(r, 7).value = { formula: `SUM(G${b0}:G${r - 1})`, result: toDate ? 1 : '' };
  r += 2;
  // ---- 3. coding status
  sec(r, '3. Coding status', 'live – follows each Coding sheet: type PKG, MNL, Cost element code once per item'); r++;
  head(r, ['Bucket', 'Items', 'Fully coded', 'Partly coded', 'Not coded', 'Coded share of to date', 'Items excluded']); r++;
  infos.forEach((inf, i) => { const a = ws.getCell(r, 1); a.value = inf.def.id; a.font = font({ bold: true }); a.fill = fill('DDE5EE'); const st = inf.nStatus;
    const cg = (c) => `${q(inf.nCod)}!$${colL(c)}$${inf.cod1}:$${colL(c)}$${inf.lastC}`, stF = inf.toolC ? [`COUNT(${cg(inf.C.id)})`, `COUNTIF(${cg(inf.C.st)},"Coded")`, `COUNTIF(${cg(inf.C.st)},"Partly coded")`, `COUNTIF(${cg(inf.C.st)},"Not coded")`, `${q(inf.nCod)}!I2`, `COUNTIF(${cg(inf.C.inc)},"No")`] : ['A', 'B', 'C', 'D', 'E', 'F'].map((cc) => `${q(inf.nCod)}!${cc}4`);
    [[inf.n, '#,##0'], [st.nFull, '#,##0'], [st.nPart, '#,##0'], [st.nNot, '#,##0'], [inf.coded, PC], [st.nEx, '#,##0']].forEach(([v, f], j) => cell(r, 2 + j, v, stF[j], { fmt: f })); for (let c = 1; c <= 7; c++) ws.getCell(r, c).border = box; r++; });
  r++;
  // ---- 4. reconciliation
  sec(r, '4. Reconciliation to CJI3', 'CJI3 is the single source of truth – the difference must be 0'); r++;
  const rec0 = r, rec = [['CJI3 cost, all cost elements except 4xxxxxxx (from the file)', stats.cost, null], ['– Counted to the cut date (To date)', toDate, 'C7'], ['– Pending (posted after the cut date)', pend, 'D7'], ['– Excluded by user (memo, listed on each per Month sheet)', excl, 'E7'],
    ['– Client deductions (cost element Client-Deductions, shown with revenue)', clientDed, revInfo ? `SUMIFS('Revenue Data'!$M$5:$M$${revInfo.last},'Revenue Data'!$F$5:$F$${revInfo.last},"<>4*")` : null]];
  const vatTot = subInf && stats.sub ? stats.sub.vatCounted : 0;
  if (subInf && stats.sub) rec.push(['+ VAT included in the Subcontractor amounts (CJI3 has none – set by VAT B5)', vatTot, `SUM(${q(subInf.nDat)}!$${colL(subInf.D.vatin)}$5:$${colL(subInf.D.vatin)}$${subInf.lastD})`]);
  rec.forEach(([l, v, f]) => { T(`A${r}`, l); cell(r, 5, v, f, { fmt: NUM }); r++; });
  T(`A${r}`, 'Difference (must be 0)', { bold: true, color: { argb: 'FF' + RED } }); const dc = cell(r, 5, r2(stats.cost - toDate - pend - excl - clientDed + vatTot), `ROUND(E${rec0}-E${rec0 + 1}-E${rec0 + 2}-E${rec0 + 3}-E${rec0 + 4}${vatTot || (subInf && stats.sub) ? '+E' + (rec0 + 5) : ''},2)`, { fmt: '#,##0.00;[Red]\\-#,##0.00;"-"', font: { bold: true, color: { argb: 'FF' + RED } } });
  setF(ws.getCell('F7'), `E${r}`, r2(stats.cost - toDate - pend - excl - clientDed + vatTot)); void dc; const diffRow = r; r += 2;
  // ---- 5. revenue
  sec(r, '5. Revenue', 'kept apart, never netted against cost – to the cut date'); r++;
  if (revInfo) {
    const rng = (c) => `'Revenue Data'!$${c}$5:$${c}$${revInfo.last}`, rv = model.lines.filter((l) => l.bucket === 'Revenue' && l.per !== 'Pending'), rev4 = r2(-rv.filter((l) => l.ce[0] === '4').reduce((s, l) => s + l.amt, 0)), cdv = r2(rv.filter((l) => l.ce[0] !== '4').reduce((s, l) => s + l.amt, 0)), rpend = r2(-model.lines.filter((l) => l.bucket === 'Revenue' && l.per === 'Pending').reduce((s, l) => s + l.amt, 0));
    [['Revenue (cost elements 4xxxxxxx)', rev4, `-SUMIFS(${rng('M')},${rng('F')},"4*",${rng('C')},"<>Pending")`, false], ['Client deductions', -cdv, `-SUMIFS(${rng('M')},${rng('F')},"<>4*",${rng('C')},"<>Pending")`, false]].forEach(([l, v, f]) => { T(`A${r}`, l); cell(r, 5, v, f, { fmt: NUM }); r++; });
    T(`A${r}`, 'Net revenue', { bold: true }); for (let c = 1; c <= 5; c++) { ws.getCell(r, c).fill = fill('DDEBF7'); } cell(r, 5, r2(rev4 - cdv), `E${r - 2}+E${r - 1}`, { fmt: NUM, fill: 'DDEBF7', font: { bold: true } }); r++;
    T(`A${r}`, 'Revenue posted after the cut date (pending)', { color: { argb: 'FF595959' } }); cell(r, 5, rpend, `-SUMIFS(${rng('M')},${rng('C')},"Pending")`, { fmt: NUM, font: { color: { argb: 'FF595959' } } });
  }
  ws.getColumn(1).width = 44; for (let c = 2; c <= 13; c++) ws.getColumn(c).width = 15; ws.getColumn(hc).hidden = true;
  ws.views = [{ showGridLines: false }]; ws.properties.tabColor = { argb: 'FF' + NAVY };
  return { diffRef: `Summary!E${diffRow}` };
}
const colIx = (c) => c;

function writeChecks(ws, model, infos, ex, opts, stats) {
  title(ws, 'Checks — ' + opts.project, 'Everything here should read OK. A CHECK means the register and CJI3 disagree somewhere.');
  header(ws, 4, ['Check', 'Value', 'Status', 'What it means']);
  const rows = [];
  const add = (name, f, v, ok, note) => rows.push([name, f, v, ok, note]);
  add('CJI3 lines vs the grand-total row of the file', null, r2(stats.sum - stats.grand), 'abs', 'Sum of all lines minus the file\'s own grand-total row.');
  add('Duplicate line keys (document | row | year)', null, stats.dupes, 'zero', 'A key that appears twice would be double-counted.');
  add('Lines with no bucket (Unclassified)', null, model.lines.filter((l) => l.bucket === 'Unclassified').length, 'zero', 'A cost element without a rule – add one in the rule table.');
  add('Register vs CJI3 cost – difference', stats.diffRef, 0, 'abs', 'Expenses counted + excluded + client deductions − CJI3 cost.');
  for (const inf of infos) add(inf.def.id + ': per Month total vs Data sheet', `${q(inf.nPm)}!${colL(inf.amtCol(model.periods.length))}${inf.rDiff}`, 0, 'abs', 'Must be 0.');
  for (const inf of infos) add(inf.def.id + ': items not fully coded', `COUNTIFS(${q(inf.nCod)}!${colL(inf.C.st)}${inf.cod1}:${colL(inf.C.st)}${inf.lastC},"<>${inf.fullWord}",${q(inf.nCod)}!${colL(inf.C.id)}${inf.cod1}:${colL(inf.C.id)}${inf.lastC},">0")`, inf.nStatus.nPart + inf.nStatus.nNot, 'info', 'Items still to code.');
  for (const inf of infos) add(inf.def.id + ': lines typed over', `SUM(${q(inf.nDat)}!${colL(inf.D.over)}5:${colL(inf.D.over)}${inf.lastD})`, inf.b.items.flatMap((it) => it.lines).filter((l) => l.s === 1).length, 'info', 'Lines coded differently from their item.');
  add('ZY accrual-reversal lines paired to a bucket', null, stats.zyPaired, 'info', 'Equal-and-opposite pairs take the bucket of the original.');
  if (stats.sub && stats.poInfo) { add('Subcontractor: certificates → CJI3 bridge difference', stats.poInfo.bridgeDiff, 0, 'abs', 'Certificates + differences = Subcontractor bucket in CJI3.'); add('Subcontractor: PO per Month vs Data sheet', stats.poInfo.poDiff, 0, 'abs', 'Must be 0.');
    add('Subcontractor: CJI3 documents explained by certificates', null, stats.sub.docs, 'info', 'of ' + stats.sub.cjiDocs + ' CJI3 subcontractor documents.'); add('Subcontractor: documents that really differ (≥ 1 EGP)', null, stats.sub.docAdjN, 'info', 'One Document difference row each.');
    add('Subcontractor: opening difference to CJI3 (EGP)', null, stats.sub.openDiff, 'info', 'CJI3 opening minus the opening certificates, net of VAT – to confirm (VAT?).'); add('Subcontractor: approved certificates not yet in CJI3 (EGP)', null, stats.sub.unposted, 'info', stats.sub.unpostedN + ' lines.'); }
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
module.exports = { writeSummary, writeChecks, writeRules };
