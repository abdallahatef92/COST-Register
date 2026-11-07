'use strict';
// The HTML app's data: the model of a register build, packed column-wise with a string dictionary.
// Used by tools/proto-app.js (Node) and by the app itself when it builds from SAP files in the browser.
const { applyCodes } = require('./codes');
const { ymLabel } = require('./util');
const { baseName } = require('./io');
function toAppData(P, o) {
  const M = P.model;
  for (const b of M.buckets) applyCodes(b, P.prev && P.prev.over);
  // string dictionary (keeps the file small)
  const S = [], SI = new Map(), s = (v) => { v = v === null || v === undefined ? '' : String(v); let i = SI.get(v); if (i === undefined) { i = S.length; S.push(v); SI.set(v, i); } return i; };
  const months = M.months.map(ymLabel), monIx = new Map(M.months.map((m, i) => [m, i + 1]));
  const isoInt = (d) => (d ? +d.replace(/-/g, '') : 0);
  // buckets + items
  const BK = M.buckets.map((b) => ({ id: b.def.id, short: b.def.short, mnl: b.def.mnl, qty: !!b.def.qty, tree: !!b.def.tree, zint: !!b.def.zint, cols: b.def.cols.map((c) => c[0]),
    items: b.items.map((it) => ({ k: it.key, v: it.vals.map(s), pkg: it.pkg || '', mnl: it.mnl || '', ce: it.ce || '', inc: it.inc || 'Yes', div: it.div, nw: it.isNew ? 1 : 0,
      g: b.def.id === 'Material' || b.def.zint ? s(it.headLabel || it.dk || '') : b.def.id === 'Subcontractor' ? s(it.vals[0]) : 0, ...(it.uns ? { uns: 1 } : {}) })) }));
  // lines, column-wise
  const L = { ord: [], uns: [], hdr: [], pot: [], off: [], b: [], it: [], d: [], m: [], amt: [], qty: [], vat: [], cd: [], src: [], doc: [], ty: [], ce: [], cen: [], desc: [], wbs: [], po: [], sup: [], cert: [], id: [], name: [], ovr: {} };
  M.buckets.forEach((b, bi) => b.items.forEach((it, ii) => it.lines.forEach((l) => {
    L.b.push(bi); L.it.push(ii); L.d.push(isoInt(l.date)); L.m.push(l.open ? 0 : l.ym && monIx.has(l.ym) ? monIx.get(l.ym) : -1); L.uns.push(l.uns ? 1 : 0); L.ord.push(s(l.order || ''));
    L.amt.push(b.def.id === 'Subcontractor' ? Math.round((l.net !== undefined ? l.net : l.amt) * 100) / 100 : l.amt); L.qty.push(l.qty || 0);
    L.vat.push(l.offsetVat ? -1 : l.vat || 0); L.cd.push(isoInt(l.cdate)); L.src.push(s(l.source || '')); L.doc.push(s(l.doc)); L.ty.push(s(l.type)); L.ce.push(s(l.ce)); L.cen.push(s(l.cen));
    L.desc.push(s(b.def.id === 'Material' ? l.matDesc : l.desc || l.poText || l.name || l.header)); L.wbs.push(s(l.wbs)); L.po.push(s(l.po)); L.sup.push(s(l.sup)); L.cert.push(s(l.cert)); L.id.push(l.id); L.name.push(s(l.name)); L.hdr.push(s(l.header)); L.pot.push(s(l.poText)); L.off.push(s(l.offset));
    if (l.typed && Object.keys(l.typed).length) { const ov = {}; if (l.typed.pkg) ov.pkg = l.pkg; if (l.typed.mnl) ov.mnl = l.mnl; if (l.typed.cec) ov.ce = l.cec; if (l.typed.inc) ov.inc = l.inc; L.ovr[l.id] = ov; }
  })));
  // revenue lines (for the Summary revenue block and the reconciliation)
  const REV = M.lines.filter((l) => l.bucket === 'Revenue').map((l) => [isoInt(l.date), l.open ? 0 : l.ym ? monIx.get(l.ym) || 0 : -1, l.amt, l.ce[0] === '4' ? 1 : 0, s(l.ce), s(l.cen), s(l.wbs)]);
  // WBS names (CO Object Name of the CJI3 lines – the most frequent per WBS element)
  const wn = new Map(); for (const l of P.cji.lines) { if (!l.wbs || !l.wbsName) continue; const m = wn.get(l.wbs) || wn.set(l.wbs, new Map()).get(l.wbs); m.set(l.wbsName, (m.get(l.wbsName) || 0) + 1); }
  const WBSN = {}; for (const [k, m] of wn) WBSN[k] = [...m].sort((x, y) => y[1] - x[1])[0][0];
  // cut dates: month ends from two months before the first posting to two months after the last
  const me = (y, m) => new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10), CUTS = [];
  { const f = M.months[0], z = M.months[M.months.length - 1]; let [y, m] = f.split('-').map(Number); m -= 2; while (m < 1) { m += 12; y--; } let [ey, em] = z.split('-').map(Number); em += 2; while (em > 12) { em -= 12; ey++; }
    for (; y < ey || (y === ey && m <= em);) { CUTS.push(me(y, m)); m++; if (m > 12) { m = 1; y++; } } }
  const st = P.subRes ? P.subRes.stats : null, serv = P.serv;
  const SUB = st ? { cjiTotal: st.cjiTotal, cjiOpen: st.cjiOpen, roundN: st.roundN, unposted: st.unposted, unpostedN: st.unpostedN, notApproved: st.notApproved, notApprovedN: st.notApprovedN, vatOnPosted: st.vatOnPosted, vatOnOpening: st.vatOnOpening,
    dupRows: st.dup.rows, dupAmt: st.dup.amt, zero: st.zero, cjiDocs: st.cjiDocs, docs: st.docs, unpostedByPo: Object.fromEntries(st.unpostedByPo),
    po: Object.fromEntries([...st.certByPo].map(([k, v]) => [k, { n: v.n.size, first: v.first, last: v.last, contract: v.contract }])),
    title: serv ? Object.fromEntries(serv.poTitle) : {}, type: serv ? Object.fromEntries(serv.poType) : {}, supn: serv ? Object.fromEntries(serv.poSup) : {} } : null;
  const META = { buildId: new Date().toISOString() + '|' + [].concat(o.cji3).map(baseName).join('+') + '|' + L.b.length, project: o.project, cut: M.cut, cuts: CUTS, months, built: new Date().toISOString().slice(0, 16).replace('T', ' '), files: Object.fromEntries(['cji3', 'mb52', 'me2n', 'zscprg01', 'zscsrv1', 'zintc1', 'prev'].map((k) => [k, [].concat(o[k] || []).map(baseName)])), cji3: [].concat(o.cji3).map(baseName).join(' + '), cjiFiles: P.cji.files, cjiDropped: P.cji.dropped, cjiConflicts: P.cji.conflicts.slice(0, 200), cjiConflictN: P.cji.conflicts.length, cost: P.costAll, grand: P.cji.grand, sum: P.cji.sum, dupes: P.dupes, zy: P.zyPaired,
    unclassified: M.lines.filter((l) => l.bucket === 'Unclassified').length, rules: P.rules || [], ruleTable: require('./rules').RULES, bucketIds: require('./rules').BUCKET_IDS,
    gaSubs: Object.keys(require('./rules').GA).concat(['Other labour / payroll']),
    unclass: (() => { const m = new Map(); for (const l of M.lines) { if (l.bucket !== 'Unclassified') continue; const k = l.ce + '|' + l.type; const x = m.get(k) || m.set(k, { ce: l.ce, cen: l.cen, type: l.type, n: 0, amt: 0, wbs: new Map() }).get(k); x.n++; x.amt += l.amt; x.wbs.set(l.wbs, (x.wbs.get(l.wbs) || 0) + 1); }
      return [...m.values()].map((x) => ({ ce: x.ce, cen: x.cen, type: x.type, n: x.n, amt: Math.round(x.amt * 100) / 100, wbs: [...x.wbs].sort((a, b) => b[1] - a[1]).slice(0, 3).map((y) => y[0]) })).sort((a, b) => Math.abs(b.amt) - Math.abs(a.amt)); })(),
    yours: M.lines.filter((l) => l.rule === 'yours').length, grpNames: require('./groupnames.json'), zint: P.zRes ? { ...P.zRes.stats, files: P.zRes.files } : null, unsState: (P.prev && P.prev.uns) || null, unscState: (P.prev && P.prev.unsc) || null, depState: (P.prev && P.prev.depx) || null, pkState: (P.prev && P.prev.pk) || null, wbsNames: WBSN, vat: P.vatOpt };
  return { META, S, BK, L, REV, SUB };
}
module.exports = { toAppData };
