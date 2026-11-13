'use strict';
// Browser entry of the register engine: SAP files in (ArrayBuffers), app data out. Bundled by tools/build-app.js.
const { prepare } = require('../src/prepare');
const { toAppData } = require('../src/appdata');
const { BUCKETS } = require('../src/model');
const { sniff, sniffInfo, KINDS } = require('../src/sniff');
// a saved codes file (JSON from the app) as "last report": same shape as readPrev()
function prevFromJson(s) {
  const coding = new Map(), lines = new Map(Object.entries(s.lines || {})); let items = 0;
  for (const [b, m] of Object.entries(s.codes || {})) { const mm = new Map(); for (const [k, c] of Object.entries(m)) { mm.set(k, { pkg: c.pkg || '', mnl: c.mnl || '', ce: c.ce || '', inc: c.inc || '', ...(c.div !== undefined ? { div: c.div } : {}) }); items++; } coding.set(b, mm); }
  return { coding, over: new Map(BUCKETS.map((b) => [b.id, lines])), items, typed: lines.size, file: 'codes', rules: s.rules || [], uns: s.uns || null, unsc: s.unsc || null, pk: s.pk || null, depx: s.depx || null, crules: s.crules || null, log: s.log || null };
}
// the months a CJI3 / ZINTC1 / ZSCPRG01 file covers (to tell which old file a new one replaces)
function peek(f, kind) { const ym = (d) => String(d || '').slice(0, 7);
  if (kind === 'cji3') {   // + the cost per month, to tell a part download (fewer WBS) from a full one
    const c = require('../src/cji3').readCji3([f]), x = c.files[0], cov = {};
    Object.entries(c.cov).forEach(([m, v]) => { cov[m] = v.amt; });
    return { first: ym(x.first), last: ym(x.last), cov, wbs: new Set(c.lines.map((l) => l.wbs)).size };
  }
  if (kind === 'zintc1') { const x = require('../src/zintc1').readZint([f]).files[0]; return { first: x.first, last: x.last }; }
  if (kind === 'zscprg01') { const x = require('../src/subcontract').readProg([f]).files[0]; return { first: ym(x.first), last: ym(x.last) }; }
  return { first: '', last: '' }; }
globalThis.Engine = {
  peek(f, kind) { try { return peek(f, kind); } catch (e) { return { first: '', last: '', err: String(e.message || e) }; } },
  KINDS, sniff(f) { try { return sniff(f); } catch (e) { return 'ignore'; } },
  sniffInfo(f) { try { return sniffInfo(f); } catch (e) { return { kind: 'ignore', proj: '' }; } },
  build(files, opts = {}) {   // files: { cji3, mb52, zscprg01, zscsrv1, prev } each { name, data }
    const o = { project: opts.project || '', ...files, step: opts.step, log: opts.log, ...(opts.rules ? { rules: opts.rules } : {}) };
    if (files.prev && /\.json$/i.test(files.prev.name)) { o.prevObj = prevFromJson(JSON.parse(new TextDecoder().decode(files.prev.data))); delete o.prev; }
    return toAppData(prepare(o), o);
  },
};
