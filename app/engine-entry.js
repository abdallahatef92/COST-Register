'use strict';
// Browser entry of the register engine: SAP files in (ArrayBuffers), app data out. Bundled by tools/build-app.js.
const { prepare } = require('../src/prepare');
const { toAppData } = require('../src/appdata');
const { BUCKETS } = require('../src/model');
// a saved codes file (JSON from the app) as "last report": same shape as readPrev()
function prevFromJson(s) {
  const coding = new Map(), lines = new Map(Object.entries(s.lines || {})); let items = 0;
  for (const [b, m] of Object.entries(s.codes || {})) { const mm = new Map(); for (const [k, c] of Object.entries(m)) { mm.set(k, { pkg: c.pkg || '', mnl: c.mnl || '', ce: c.ce || '', inc: c.inc || '', ...(c.div !== undefined ? { div: c.div } : {}) }); items++; } coding.set(b, mm); }
  return { coding, over: new Map(BUCKETS.map((b) => [b.id, lines])), items, typed: lines.size, file: 'codes' };
}
globalThis.Engine = {
  build(files, opts = {}) {   // files: { cji3, mb52, zscprg01, zscsrv1, prev } each { name, data }
    const o = { project: opts.project || 'SUTH', ...files, step: opts.step, log: opts.log };
    if (files.prev && /\.json$/i.test(files.prev.name)) { o.prevObj = prevFromJson(JSON.parse(new TextDecoder().decode(files.prev.data))); delete o.prev; }
    return toAppData(prepare(o), o);
  },
};
