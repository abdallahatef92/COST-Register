'use strict';
const W = require('./workbook');
const O = require('./overview');
const { buildModel } = require('./model');
const { classify } = require('./rules');
const { readCji3 } = require('./cji3');
const { readGroups, NO_GRP } = require('./groups');
const { readPrev } = require('./prev');
const SC = require('./subcontract');
const { poSheets } = require('./posheets');
const { r2 } = require('./util');
const { fitWidths } = require('./fit');

// everything up to the model (no Excel): also used by the HTML app generator
function prepare(opts) {
  const t0 = Date.now(), log = opts.log || (() => {});
  const cji = readCji3(opts.cji3); log(`CJI3: ${cji.lines.length} lines, ${cji.subtotals} subtotal rows skipped, grand total row ${cji.grand}`);
  const dupes = cji.lines.length - new Set(cji.lines.map((l) => l.id)).size;
  const zyPaired = classify(cji.lines);
  const groups = readGroups({ me2n: opts.me2n, mb52: opts.mb52 }); log(`Material groups: ${groups.map.size} materials (ME2N ${groups.src.me2n}, MB52 ${groups.src.mb52})`);
  const costAll = r2(cji.lines.filter((l) => l.ce[0] !== '4').reduce((x, l) => x + l.amt, 0));
  let lines = cji.lines, subRes = null, serv = null;
  const vm = String(opts.vat || 'exclude').toLowerCase(), vatOpt = { mode: vm.startsWith('before') || vm.includes('before') ? 'Include VAT before date' : vm.startsWith('incl') ? 'Include VAT' : 'Exclude VAT', from: opts.vatfrom || '' };
  if (vatOpt.mode === 'Include VAT before date' && !vatOpt.from) throw new Error('--vat before needs --vatfrom yyyy-mm-dd');
  opts.vatOpt = vatOpt;
  if (opts.zscprg01) {
    const prog = SC.readProg(opts.zscprg01); serv = opts.zscsrv1 ? SC.readServ(opts.zscsrv1) : null;
    const ceNames = new Map(cji.lines.map((l) => [l.ce, l.cen]));
    subRes = SC.buildSubcontractor(cji.lines.filter((l) => l.bucket === 'Subcontractor'), prog, serv, ceNames, vatOpt);
    lines = cji.lines.filter((l) => l.bucket !== 'Subcontractor').concat(subRes.lines);
    const st = subRes.stats; log(`Subcontractor: ${prog.lines.length} certificate lines; ${st.docs} of ${st.cjiDocs} CJI3 documents explained; certificates ${st.certPosted}; opening ${st.openRep} (CJI3 ${st.cjiOpen}, difference ${st.openDiff}); ${st.docAdjN} documents differ by 1 EGP or more (${st.docAdj}), ${st.roundN} by cents; ${st.cjiOnlyN} CJI3-only lines`);
  }
  for (const l of lines) if (l.bucket === 'Material') l.issue = l.amt === 0 && l.qty === 0 ? 'No value' : l.amt < 0 || l.qty < 0 ? 'Return' : l.amt === 0 ? 'No value' : 'Issue';
  const prev = readPrev(opts.prev); if (prev) log(`Last report: ${prev.items} coded items, ${prev.typed} typed-over lines carried over`);
  const monthEnd = (iso) => { const [y, m] = iso.split('-'); return new Date(Date.UTC(+y, +m, 0)).toISOString().slice(0, 10); };
  const lastDate = lines.map((l) => l.date).filter(Boolean).sort().pop();
  const model = buildModel(lines, { groups: groups.map, prev, cut: monthEnd(opts.cut || lastDate) });
  log(`Cut date ${model.cut} (report month ${model.reportLabel})`);
  return { t0, log, cji, dupes, zyPaired, groups, costAll, lines, subRes, serv, vatOpt, prev, model, lastDate, monthEnd };
}

async function build(opts) {
  const { t0, log, cji, dupes, zyPaired, groups, costAll, lines, subRes, serv, prev, model, lastDate, monthEnd } = prepare(opts);
  const wb = new W.ExcelJS.Workbook(); wb.creator = 'Cost Register'; wb.calcProperties = { fullCalcOnLoad: !!process.env.NO_RESULT };   // every formula carries its verified result: Excel opens without a full recalculation
  [['Summary!$B$4', 'CutDate'], ['Summary!$B$5', 'VatMode'], ['Summary!$C$5', 'VatFrom']].forEach(([r, n]) => wb.definedNames.add(r, n));
  const wsS = wb.addWorksheet('Summary', { properties: { tabColor: { argb: 'FF' + W.NAVY } } });
  const costBuckets = model.buckets.filter((b) => b.def.id !== 'Revenue');
  const infos = []; let poInfo = null; for (const b of costBuckets) { W.applyCodes(b, prev && prev.over); const inf = W.bucketSheets(wb, b, model, opts); infos.push(inf); log(`  ${b.def.id}: ${b.count} lines, ${b.items.length} items`);
    if (b.def.id === 'Subcontractor' && subRes) poInfo = poSheets(wb, inf, model, opts, { stats: subRes.stats, serv }); }
  const revInfo = W.revenueSheet(wb, model, opts);
  const wsR = wb.addWorksheet('Rules', { properties: { tabColor: { argb: 'FF' + W.GREY } } }), wsC = wb.addWorksheet('Checks', { properties: { tabColor: { argb: 'FF' + W.GREY } } });
  const stats = { file: require('path').basename(opts.cji3), grand: cji.grand, sum: cji.sum, dupes, zyPaired, cost: costAll, sub: subRes ? subRes.stats : null, poInfo: null,
    noGroup: model.buckets.find((b) => b.def.id === 'Material') ? model.buckets.find((b) => b.def.id === 'Material').items.filter((it) => !it.group).length : undefined };
  const ex = null;   // Expenses sheet removed for now (src/expenses.js kept for later)
  stats.poInfo = poInfo; stats.diffRef = O.writeSummary(wsS, model, infos, ex, opts, revInfo, stats).diffRef; O.writeChecks(wsC, model, infos, ex, opts, stats); O.writeRules(wsR, opts);
  // cut-date list: month ends from two months before the first posting to two months after the last
  const cal = wb.addWorksheet('_Cal', { state: 'hidden' }); cal.getCell('A1').value = 'Cut dates'; const ms = []; { const f = lines.map((l) => l.date).filter(Boolean).sort()[0].slice(0, 7), z = lastDate.slice(0, 7); let [y, m] = f.split('-').map(Number); m -= 2; while (m < 1) { m += 12; y--; } let [ey, em] = z.split('-').map(Number); em += 2; while (em > 12) { em -= 12; ey++; }
    for (; y < ey || (y === ey && m <= em); ) { ms.push(monthEnd(y + '-' + String(m).padStart(2, '0'))); m++; if (m > 12) { m = 1; y++; } } }
  ms.forEach((d, i) => { const c = cal.getCell(i + 2, 1); c.value = new Date(d + 'T00:00:00Z'); c.numFmt = 'dd-mmm-yyyy'; });
  wsS.getCell('B4').dataValidation = { type: 'list', allowBlank: false, formulae: [`_Cal!$A$2:$A$${ms.length + 1}`], showErrorMessage: true, errorTitle: 'Cut date', error: 'Pick a month-end from the list.', showInputMessage: true, promptTitle: 'Cut date', prompt: 'Pick the month-end the report should run to. Later postings go to Pending.' };
  const meta = wb.addWorksheet('_Meta', { state: 'hidden' });
  [['Project', opts.project], ['Report month', model.reportLabel], ['CJI3', stats.file], ['CJI3 lines', cji.lines.length], ['CJI3 grand total', cji.grand], ['MB52', opts.mb52 ? require('path').basename(opts.mb52) : ''], ['ME2N', opts.me2n ? require('path').basename(opts.me2n) : ''], ['Generated', new Date().toISOString()]].forEach((r, i) => { meta.getCell(i + 1, 1).value = r[0]; meta.getCell(i + 1, 2).value = r[1]; });
  log(`Column widths widened where a number or date would show ####: ${fitWidths(wb)} columns`);
  await wb.xlsx.writeFile(opts.out);
  log(`Written ${opts.out} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  return { model, infos, stats, ex };
}
module.exports = { build, prepare };
