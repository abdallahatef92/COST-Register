'use strict';
const W = require('./workbook');
const O = require('./overview');
const { buildModel } = require('./model');
const { classify } = require('./rules');
const { readCji3 } = require('./cji3');
const { readGroups, NO_GRP } = require('./groups');
const { readPrev } = require('./prev');
const { r2 } = require('./util');

async function build(opts) {
  const t0 = Date.now(), log = opts.log || (() => {});
  const cji = readCji3(opts.cji3); log(`CJI3: ${cji.lines.length} lines, ${cji.subtotals} subtotal rows skipped, grand total row ${cji.grand}`);
  const dupes = cji.lines.length - new Set(cji.lines.map((l) => l.id)).size;
  const zyPaired = classify(cji.lines);
  const groups = readGroups({ me2n: opts.me2n, mb52: opts.mb52 }); log(`Material groups: ${groups.map.size} materials (ME2N ${groups.src.me2n}, MB52 ${groups.src.mb52})`);
  const prev = readPrev(opts.prev); if (prev) log(`Last report: ${prev.items} coded items, ${prev.typed} typed-over lines carried over`);
  const model = buildModel(cji.lines, { groups: groups.map, prev });
  model.firstLabel = model.periods[1];
  const wb = new W.ExcelJS.Workbook(); wb.creator = 'Cost Register'; wb.calcProperties = { fullCalcOnLoad: true };
  const wsS = wb.addWorksheet('Summary', { properties: { tabColor: { argb: 'FF' + W.NAVY } } }), wsE = wb.addWorksheet('Expenses', { properties: { tabColor: { argb: 'FF' + W.NAVY } } });
  const costBuckets = model.buckets.filter((b) => b.def.id !== 'Revenue');
  const infos = []; for (const b of costBuckets) { W.applyCodes(b, prev && prev.over); infos.push(W.bucketSheets(wb, b, model, opts)); log(`  ${b.def.id}: ${b.count} lines, ${b.items.length} items`); }
  const revInfo = W.revenueSheet(wb, model, opts);
  const wsR = wb.addWorksheet('Rules', { properties: { tabColor: { argb: 'FF' + W.GREY } } }), wsC = wb.addWorksheet('Checks', { properties: { tabColor: { argb: 'FF' + W.GREY } } });
  const stats = { file: require('path').basename(opts.cji3), grand: cji.grand, sum: cji.sum, dupes, zyPaired, cost: r2(cji.lines.filter((l) => l.ce[0] !== '4').reduce((s, l) => s + l.amt, 0)),
    noGroup: model.buckets.find((b) => b.def.id === 'Material') ? model.buckets.find((b) => b.def.id === 'Material').items.filter((it) => !it.group).length : undefined };
  const ex = O.writeExpenses(wsE, model, infos, opts, {});
  O.writeSummary(wsS, model, infos, ex, opts, revInfo, stats); O.writeChecks(wsC, model, infos, ex, opts, stats); O.writeRules(wsR, opts);
  const meta = wb.addWorksheet('_Meta', { state: 'hidden' });
  [['Project', opts.project], ['Report month', model.reportLabel], ['CJI3', stats.file], ['CJI3 lines', cji.lines.length], ['CJI3 grand total', cji.grand], ['MB52', opts.mb52 ? require('path').basename(opts.mb52) : ''], ['ME2N', opts.me2n ? require('path').basename(opts.me2n) : ''], ['Generated', new Date().toISOString()]].forEach((r, i) => { meta.getCell(i + 1, 1).value = r[0]; meta.getCell(i + 1, 2).value = r[1]; });
  await wb.xlsx.writeFile(opts.out);
  log(`Written ${opts.out} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  return { model, infos, stats, ex };
}
module.exports = { build };
