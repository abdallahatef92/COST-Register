'use strict';
const { buildModel } = require('./model');
const { classify } = require('./rules');
const { readCji3 } = require('./cji3');
const { readGroups } = require('./groups');
const { readPrev } = require('./prev');
const SC = require('./subcontract');
const { r2 } = require('./util');

// everything up to the model (no Excel): also used by the HTML app generator
function prepare(opts) {
  const t0 = Date.now(), log = opts.log || (() => {}), step = opts.step || (() => {});
  step('Reading CJI3');
  const cji = readCji3(opts.cji3); log(`CJI3: ${cji.files.length} file(s), ${cji.lines.length} lines (${cji.dropped} found in more than one file, ${cji.conflicts.length} conflicts), ${cji.subtotals} subtotal rows skipped`);
  const dupes = cji.within;   // the same key twice inside one file
  const zyPaired = classify(cji.lines);
  step('Material groups (MB52)');
  const groups = readGroups({ me2n: opts.me2n, mb52: opts.mb52 }); log(`Material groups: ${groups.map.size} materials (ME2N ${groups.src.me2n}, MB52 ${groups.src.mb52})`);
  const costAll = r2(cji.lines.filter((l) => l.ce[0] !== '4').reduce((x, l) => x + l.amt, 0));
  let lines = cji.lines, subRes = null, serv = null;
  const vm = String(opts.vat || 'exclude').toLowerCase(), vatOpt = { mode: vm.startsWith('before') || vm.includes('before') ? 'Include VAT before date' : vm.startsWith('incl') ? 'Include VAT' : 'Exclude VAT', from: opts.vatfrom || '' };
  if (vatOpt.mode === 'Include VAT before date' && !vatOpt.from) throw new Error('--vat before needs --vatfrom yyyy-mm-dd');
  opts.vatOpt = vatOpt;
  if (opts.zscprg01) {
    step('Certificates (ZSCPRG01, ZSCSRV1)');
    const prog = SC.readProg(opts.zscprg01); serv = opts.zscsrv1 ? SC.readServ(opts.zscsrv1) : null;
    const ceNames = new Map(cji.lines.map((l) => [l.ce, l.cen]));
    subRes = SC.buildSubcontractor(cji.lines.filter((l) => l.bucket === 'Subcontractor'), prog, serv, ceNames, vatOpt);
    lines = cji.lines.filter((l) => l.bucket !== 'Subcontractor').concat(subRes.lines);
    const st = subRes.stats; log(`Subcontractor: ${prog.lines.length} certificate lines; ${st.docs} of ${st.cjiDocs} CJI3 documents explained; certificates ${st.certPosted}; opening ${st.openRep} (CJI3 ${st.cjiOpen}, difference ${st.openDiff}); ${st.docAdjN} documents differ by 1 EGP or more (${st.docAdj}), ${st.roundN} by cents; ${st.cjiOnlyN} CJI3-only lines`);
  }
  for (const l of lines) if (l.bucket === 'Material') l.issue = l.amt === 0 && l.qty === 0 ? 'No value' : l.amt < 0 || l.qty < 0 ? 'Return' : l.amt === 0 ? 'No value' : 'Issue';
  step('Last report');
  const prev = opts.prevObj || readPrev(opts.prev); if (prev) log(`Last report: ${prev.items} coded items, ${prev.typed} typed-over lines carried over`);
  const monthEnd = (iso) => { const [y, m] = iso.split('-'); return new Date(Date.UTC(+y, +m, 0)).toISOString().slice(0, 10); };
  const lastDate = lines.map((l) => l.date).filter(Boolean).sort().pop();
  const model = buildModel(lines, { groups: groups.map, prev, cut: monthEnd(opts.cut || lastDate) });
  log(`Cut date ${model.cut} (report month ${model.reportLabel})`);
  return { t0, log, cji, dupes, zyPaired, groups, costAll, lines, subRes, serv, vatOpt, prev, model, lastDate, monthEnd };
}

module.exports = { prepare };
