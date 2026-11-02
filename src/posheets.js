'use strict';
// PO per Month, PO Register and the bridge from the certificate report to CJI3 – the views the Subcontract report has beside Service per Month.
const W = require('./workbook');
const { r2, colL } = require('./util');
const { fill, font, box, q, setF, title, header, AMT0, NAVY, GREY, GOLD, RED, CUT, CUTLAB } = W;
const H = 5, R1 = 6;

function poSheets(wb, inf, model, opts, sub) {
  const nDat = inf.nDat, D = inf.D, lastD = inf.lastD, periods = model.periods, np = periods.length, rep = model.reportLabel;
  const dr = (col) => `${q(nDat)}!$${colL(col)}$5:$${colL(col)}$${lastD}`;
  const lines = inf.b.items.flatMap((it) => it.lines), counted = (l) => l.inc === 'Yes';
  const pos = new Map(); for (const l of lines) { const x = pos.get(l.po) || { po: l.po, tow: '', sup: '', tot: 0, lines: [] }; x.lines.push(l); x.tot += l.amt; if (!x.tow && l.tow) x.tow = l.tow; if (!x.sup && l.sup) x.sup = l.sup; pos.set(l.po, x); }
  for (const [po] of sub.stats.unpostedByPo) if (!pos.has(po)) pos.set(po, { po, tow: (sub.serv && sub.serv.poType.get(po)) || '', sup: (sub.serv && sub.serv.poSup.get(po)) || '', tot: 0, lines: [] });   // approved but not posted yet: still listed
  const list = [...pos.values()].sort((a, b) => Math.abs(b.tot) - Math.abs(a.tot) || (a.po < b.po ? -1 : 1));
  const title0 = (ws, t, n) => { title(ws, t + ' — ' + opts.project, n); ws.views = [{ showGridLines: false, state: 'frozen', xSplit: 4, ySplit: H }]; };
  const sumL = (ls, f) => r2(ls.filter(counted).filter(f).reduce((s, l) => s + l.amt, 0));
  const poTitle = (po) => (sub.serv && sub.serv.poTitle.get(po)) || '';

  // ---------------- PO per Month
  const ws = wb.addWorksheet('PO per Month', { properties: { tabColor: { argb: 'FF2F5597' } } });
  title0(ws, 'PO per Month', 'Live: the counted lines of the Subcontractor Data sheet by PO and posting month (cut date on Summary). Every PO with its subcontractor and type of works.');
  header(ws, H, ['PO', 'PO title', 'Subcontractor', 'Type of works', ...periods, 'To date']);
  ws.mergeCells(H - 1, 5, H - 1, 4 + np + 1); const band = ws.getCell(H - 1, 5); band.value = 'Amount (EGP)'; band.font = font({ bold: true, color: { argb: 'FFFFFFFF' } }); band.fill = fill(NAVY); band.alignment = { horizontal: 'center' };
  ws.getCell(H, 4 + np).fill = fill('C55A11');
  for (let p = 0; p < np - 1; p++) { const a = colL(5 + p); ws.addConditionalFormatting({ ref: `${a}${H}`, rules: [{ type: 'expression', formulae: [`${a}$${H}=${CUTLAB}`], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FF' + GOLD } } }, priority: 1 + p }] }); }
  list.forEach((x, i) => {
    const r = R1 + i; [x.po, poTitle(x.po), x.sup, x.tow].forEach((v, c) => { const y = ws.getCell(r, c + 1); y.value = v; y.border = box; y.font = font({ bold: c === 0 }); });
    for (let p = 0; p <= np; p++) { const y = ws.getCell(r, 5 + p); y.numFmt = AMT0; y.border = box; y.font = font({ bold: p === np });
      if (p < np) setF(y, `SUMIFS(${dr(D.amt)},${dr(D.po)},$A${r},${dr(D.flag)},">0",${dr(D.per)},${colL(5 + p)}$${H})`, sumL(x.lines, (l) => l.per === periods[p]));
      else setF(y, `SUM(${colL(5)}${r}:${colL(4 + np - 1)}${r})`, sumL(x.lines, (l) => l.per !== 'Pending')); }
  });
  const last = R1 + list.length - 1, tr = last + 2;
  ws.getCell(tr, 1).value = 'TOTAL'; ws.getCell(tr + 1, 1).value = 'Data sheet total, counted lines (check)'; ws.getCell(tr + 2, 1).value = 'Difference (must be 0)';
  [tr, tr + 1, tr + 2].forEach((r, k) => { const y = ws.getCell(r, 1); y.font = font({ bold: k !== 1, color: { argb: 'FF' + (k === 2 ? RED : k === 1 ? GREY : NAVY) } }); });
  for (let p = 0; p <= np; p++) { const cl = colL(5 + p), crit = p < np ? `,${dr(D.per)},${cl}$${H}` : `,${dr(D.per)},"<>Pending"`, v = sumL(lines, (l) => (p < np ? l.per === periods[p] : l.per !== 'Pending'));
    const t = ws.getCell(tr, 5 + p); setF(t, `SUM(${cl}${R1}:${cl}${last})`, v); t.numFmt = AMT0; t.font = font({ bold: true }); t.fill = fill('DDEBF7'); t.border = box;
    const d = ws.getCell(tr + 1, 5 + p); setF(d, `SUMIFS(${dr(D.amt)},${dr(D.flag)},">0"${crit})`, v); d.numFmt = AMT0; d.font = font({ color: { argb: 'FF' + GREY } });
    const f = ws.getCell(tr + 2, 5 + p); setF(f, `ROUND(${cl}${tr}-${cl}${tr + 1},2)`, 0); f.numFmt = AMT0; f.font = font({ bold: true, color: { argb: 'FF' + RED } }); }
  [11, 40, 28, 28].forEach((w, i) => { ws.getColumn(i + 1).width = w; }); for (let c = 5; c <= 5 + np; c++) ws.getColumn(c).width = 14;
  ws.autoFilter = { from: { row: H, column: 1 }, to: { row: last, column: 5 + np } };
  const diffRow = tr + 2, toDateCol = 5 + np;

  // ---------------- PO Register
  const wr = wb.addWorksheet('PO Register', { properties: { tabColor: { argb: 'FF2F5597' } } });
  title0(wr, 'PO Register', 'One row per PO: who, what, how much certified (counted, to the cut date) and what is approved but not yet in CJI3. Live from the Subcontractor Data sheet.');
  wr.getCell('A2').font = font({ color: { argb: 'FF' + GREY } });
  const heads = ['PO', 'PO title', 'Subcontractor', 'Type of works', 'Contract', 'Certificates', 'First certificate', 'Last certificate', 'Opening', 'Previous', 'This month', 'To date', 'Pending', 'Approved, not yet in CJI3'];
  header(wr, H, heads); wr.views = [{ showGridLines: false, state: 'frozen', xSplit: 4, ySplit: H }];
  list.forEach((x, i) => {
    const r = R1 + i, c = sub.stats.certByPo.get(x.po), un = sub.stats.unpostedByPo.get(x.po) || 0;
    const base = (extra) => `SUMIFS(${dr(D.amt)},${dr(D.po)},$A${r},${dr(D.flag)},">0",${extra})`;
    const ov = sumL(x.lines, (l) => l.per === 'Opening'), td = sumL(x.lines, (l) => l.per !== 'Pending'), tm = sumL(x.lines, (l) => l.per === rep), pe = sumL(x.lines, (l) => l.per === 'Pending');
    [x.po, poTitle(x.po), x.sup, x.tow, c ? (c.contract === 'A2' ? 'Incl. VAT (A2)' : c.contract === 'A1' ? 'Excl. VAT (A1)' : c.contract) : '', c ? c.n.size : null, c && c.first ? new Date(c.first + 'T00:00:00Z') : null, c && c.last ? new Date(c.last + 'T00:00:00Z') : null].forEach((v, k) => {
      const y = wr.getCell(r, k + 1); y.value = v; y.border = box; y.font = font({ bold: k === 0 }); if (k >= 6) y.numFmt = 'yyyy-mm-dd'; });
    setF(wr.getCell(r, 9), base(`${dr(D.per)},"Opening"`), ov); setF(wr.getCell(r, 11), base(`${dr(D.per)},${CUTLAB}`), tm); setF(wr.getCell(r, 12), base(`${dr(D.per)},"<>Pending"`), td);
    setF(wr.getCell(r, 10), `L${r}-K${r}`, r2(td - tm)); setF(wr.getCell(r, 13), base(`${dr(D.per)},"Pending"`), pe); wr.getCell(r, 14).value = un || null;
    for (let k = 9; k <= 14; k++) { const y = wr.getCell(r, k); y.numFmt = AMT0; y.border = box; y.font = font({ bold: k === 12 }); } wr.getCell(r, 11).fill = fill('FFF2CC');
  });
  const lr = R1 + list.length - 1, trr = lr + 1; wr.getCell(trr, 1).value = 'TOTAL';
  for (let c = 1; c <= 14; c++) { const y = wr.getCell(trr, c); y.fill = fill('DDEBF7'); y.font = font({ bold: true }); y.border = box; }
  [[9, (l) => l.per === 'Opening'], [11, (l) => l.per === rep], [12, (l) => l.per !== 'Pending'], [13, (l) => l.per === 'Pending']].forEach(([c, f]) => { const y = wr.getCell(trr, c); setF(y, `SUM(${colL(c)}${R1}:${colL(c)}${lr})`, sumL(lines, f)); y.numFmt = AMT0; });
  setF(wr.getCell(trr, 10), `SUM(J${R1}:J${lr})`, r2(sumL(lines, (l) => l.per !== 'Pending') - sumL(lines, (l) => l.per === rep))); wr.getCell(trr, 10).numFmt = AMT0;
  const un = wr.getCell(trr, 14); setF(un, `SUM(N${R1}:N${lr})`, sub.stats.unposted); un.numFmt = AMT0;
  [11, 40, 28, 28, 14, 10, 12, 12, 14, 14, 14, 15, 14, 16].forEach((w, i) => { wr.getColumn(i + 1).width = w; });
  wr.autoFilter = { from: { row: H, column: 1 }, to: { row: lr, column: 14 } };

  // ---------------- Bridge
  const wbz = wb.addWorksheet('Subcontractor Bridge', { properties: { tabColor: { argb: 'FF2F5597' } } });
  title(wbz, 'Subcontractor Bridge — ' + opts.project, 'From the certificate report (ZSCPRG01, net of VAT) to the Subcontractor bucket in CJI3. CJI3 is the truth: what the certificates do not explain is shown, never hidden.'); wbz.views = [{ showGridLines: false }];
  header(wbz, 4, ['Step', 'Lines', 'EGP', 'What it is']);
  const st = sub.stats, src = (name) => `SUMIFS(${dr(D.amt)},${dr(D.source)},"${name}")`, cnt = (name) => `COUNTIFS(${dr(D.source)},"${name}")`, n = (name) => lines.filter((l) => l.source === name).length, a = (name) => r2(lines.filter((l) => l.source === name).reduce((s, l) => s + l.amt, 0));
  let r = 5; const put = (label, nn, formulaN, v, formulaV, note, bold) => { wbz.getCell(r, 1).value = label; const c2 = wbz.getCell(r, 2), c3 = wbz.getCell(r, 3); if (formulaN) setF(c2, formulaN, nn); else c2.value = nn; if (formulaV) setF(c3, formulaV, v); else c3.value = v; c2.numFmt = '#,##0'; c3.numFmt = '#,##0.00;[Red]\\-#,##0.00;"-"'; wbz.getCell(r, 4).value = note;
    for (let k = 1; k <= 4; k++) { const y = wbz.getCell(r, k); y.border = box; y.font = font({ bold }); } r++; };
  const s0 = r; wbz.getCell(r, 1).value = 'A. Certificates → CJI3 Subcontractor bucket'; wbz.getCell(r, 1).font = font({ bold: true, color: { argb: 'FF' + NAVY } }); r++;
  const first = r;
  put('Certificate lines posted in CJI3', n('Certificate'), cnt('Certificate'), a('Certificate'), src('Certificate'), 'Approved certificate lines whose invoice document is in CJI3 (month = CJI3 posting date), net of VAT.');
  put('Opening certificates (flag X)', n('Opening certificate'), cnt('Opening certificate'), a('Opening certificate'), src('Opening certificate'), 'Initial invoices from before go-live: the detail of the CJI3 opening balance.');
  put('+ Opening difference to CJI3', n('Opening difference'), cnt('Opening difference'), a('Opening difference'), src('Opening difference'), 'CJI3 opening (UE) minus the opening certificates. To confirm – VAT is the likely cause.');
  put('+ Documents that differ (1 EGP or more)', n('Document difference'), cnt('Document difference'), a('Document difference'), src('Document difference'), 'One row per document where CJI3 and the certificate report really differ.');
  put('+ Rounding (under 1 EGP per document)', n('Rounding'), cnt('Rounding'), a('Rounding'), src('Rounding'), st.roundN + ' documents, cents only: one row per month.');
  put('+ CJI3 lines no certificate explains', n('CJI3 only'), cnt('CJI3 only'), a('CJI3 only'), src('CJI3 only'), 'Reversal pairs (ZY) and other subcontractor documents with no certificate lines.');
  const lastS = r - 1; wbz.getCell(r, 1).value = '= Subcontractor bucket (register)'; const tt = wbz.getCell(r, 3); setF(tt, `SUM(C${first}:C${lastS})`, a('Certificate') + a('Opening certificate') + a('Opening difference') + a('Document difference') + a('Rounding') + a('CJI3 only')); tt.numFmt = '#,##0.00'; setF(wbz.getCell(r, 2), `SUM(B${first}:B${lastS})`, lines.length); wbz.getCell(r, 2).numFmt = '#,##0';
  for (let k = 1; k <= 4; k++) { const y = wbz.getCell(r, k); y.fill = fill('DDEBF7'); y.font = font({ bold: true }); y.border = box; } r++;
  wbz.getCell(r, 1).value = 'Subcontractor bucket in CJI3 (the file)'; wbz.getCell(r, 3).value = st.cjiTotal; wbz.getCell(r, 3).numFmt = '#,##0.00'; for (let k = 1; k <= 4; k++) { wbz.getCell(r, k).border = box; wbz.getCell(r, k).font = font(); } r++;
  wbz.getCell(r, 1).value = 'Difference (must be 0)'; setF(wbz.getCell(r, 3), `ROUND(C${r - 2}-C${r - 1},2)`, 0); wbz.getCell(r, 3).numFmt = '#,##0.00'; for (let k = 1; k <= 4; k++) { wbz.getCell(r, k).font = font({ bold: true, color: { argb: 'FF' + RED } }); wbz.getCell(r, k).border = box; }
  const bridgeDiff = `'Subcontractor Bridge'!C${r}`; r += 2;
  wbz.getCell(r, 1).value = 'B. Not in the register (information)'; wbz.getCell(r, 1).font = font({ bold: true, color: { argb: 'FF' + NAVY } }); r++;
  put('Approved certificates not yet in CJI3', st.unpostedN, null, st.unposted, null, 'Approved, not an opening invoice, but no CJI3 document yet. Will arrive in CJI3 when finance posts them (see PO Register, last column).');
  put('Certificates not approved', st.notApprovedN, null, st.notApproved, null, 'Pending in the Subcontract report; not cost yet.');
  put('VAT on the certificate lines above', null, null, st.vatPosted, null, 'CJI3 never contains VAT, so every figure here is net of VAT.');
  put('WBS repeats removed', st.dup.rows, null, st.dup.amt, null, 'SAP repeats a certificate line on every WBS with the full amount: kept once (as the Subcontract report does).');
  put('Zero lines removed', st.zero, null, 0, null, 'PO lines on a certificate with no progress.');
  r++; wbz.getCell(r, 1).value = 'C. Documents'; wbz.getCell(r, 1).font = font({ bold: true, color: { argb: 'FF' + NAVY } }); r++;
  put('CJI3 subcontractor documents', st.cjiDocs, null, null, null, 'Documents of type SC in the Subcontractor bucket.');
  put('… explained by certificate lines', st.docs, null, null, null, 'DocumentNo in ZSCPRG01 = Ref. document number in CJI3.');
  [34, 9, 20, 110].forEach((w, i) => { wbz.getColumn(i + 1).width = w; });
  return { poDiff: `'PO per Month'!${colL(toDateCol)}${diffRow}`, bridgeDiff, nPo: list.length };
}
module.exports = { poSheets };
