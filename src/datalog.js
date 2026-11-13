'use strict';
// The data log of one build: every file read, what it covers, how its cut looks (cumulative / one month / fiscal year / snapshot),
// how it is merged, and which file gave each month. Stored with the build (META.dlog) and in the data file, so the next build can compare.
const { r2 } = require('./util');
const { baseName } = require('./io');

const ymOf = (d) => String(d || '').slice(0, 7);
// how a file is cut, from the months it covers
function cutType(first, last, earliest) {
  if (!first) return 'Snapshot';
  if (first === last) return 'One month';
  if (first.slice(0, 4) === last.slice(0, 4) && (first.endsWith('-01') || last.endsWith('-12'))) return 'Fiscal year ' + first.slice(0, 4);
  if (first === earliest) return 'Cumulative · project to date';
  return 'Period';
}
// overlaps: months that two or more files cover (the merge rule decides; the log shows it)
function overlapsOf(files) {
  const out = [];
  for (let i = 0; i < files.length; i++) for (let j = i + 1; j < files.length; j++) {
    const a = files[i], b = files[j]; if (!a.first || !b.first) continue;
    const f = a.first > b.first ? a.first : b.first, l = a.last < b.last ? a.last : b.last; if (f <= l) out.push({ a: a.name, b: b.name, from: f, to: l });
  }
  return out;
}

function dataLog(P, o) {
  const files = [], cov = {}, ovl = [];
  // CJI3
  const cf = P.cji.files.map((f) => ({ ...f, fm: ymOf(f.first), lm: ymOf(f.last) })), ce = cf.map((f) => f.fm).filter(Boolean).sort()[0] || '';
  cf.forEach((f) => files.push({ src: 'cji3', name: f.name, first: f.fm, last: f.lm, cut: cutType(f.fm, f.lm, ce), rows: f.lines, used: f.lines - f.dropped, amt: f.cost,
    merge: 'Document + posting row + fiscal year', note: f.conflicts ? f.conflicts + ' lines differ from another file (later file kept)' : '' }));
  cov.cji3 = P.cji.cov || {};
  overlapsOf(cf.map((f) => ({ name: f.name, first: f.fm, last: f.lm }))).forEach((x) => ovl.push({ src: 'cji3', ...x, rule: 'counted once (same document + row + year)' }));
  // ZSCPRG01 + ZSCSRV1
  if (P.prog) {
    (P.prog.files || []).forEach((f) => files.push({ src: 'zscprg01', name: f.name, first: ymOf(f.first), last: ymOf(f.last), cut: 'Cumulative · by certificate serial', rows: f.rows, used: f.used, certs: f.certs, pos: f.pos,
      merge: 'PO + serial + item + line · latest file wins', note: '' }));
    const c = {}; for (const x of P.prog.certs || []) { const ym = ymOf(x.date); if (!ym) continue; const e = c[ym] || (c[ym] = { n: 0, amt: 0 }); e.n++; e.amt += x.amt; }
    Object.values(c).forEach((e) => { e.amt = r2(e.amt); }); cov.zscprg01 = c;
  }
  if (P.serv) (P.serv.files || []).forEach((f) => files.push({ src: 'zscsrv1', name: f.name, first: '', last: '', cut: 'Snapshot · PO services', rows: f.rows, used: f.rows, pos: f.pos, merge: 'Titles, units and types of works per PO', note: '' }));
  // ZINTC1
  if (P.Z) {
    P.Z.files.forEach((f) => files.push({ src: 'zintc1', name: f.name, first: f.first, last: f.last, cut: cutType(f.first, f.last, ''), rows: f.rows, used: f.used, amt: f.amt,
      merge: 'Order + month · newest file wins', note: f.dropped ? f.dropped + ' rows dropped (a newer file has that order and month)' : '' }));
    cov.zintc1 = P.Z.cov || {}; (P.Z.overlaps || []).forEach((x) => ovl.push({ src: 'zintc1', from: x.ym, to: x.ym, a: x.kept, b: x.dropped.map((d) => d.name).join(', '), rule: 'newest file kept · ' + x.dropped.reduce((t, d) => t + d.n, 0) + ' rows dropped' }));
  }
  // material groups
  ((P.groups && P.groups.files) || []).forEach((f) => files.push({ src: f.kind, name: f.name, first: '', last: '', cut: f.kind === 'mb52' ? 'Snapshot · stock' : 'Snapshot · purchase orders', rows: f.rows, used: f.rows, merge: 'Material group per material (lookup)', note: '' }));
  // last report (codes)
  if (P.prev) files.push({ src: 'prev', name: baseName(o.prev) || (o.prevObj ? 'codes file' : P.prev.file || ''), first: '', last: '', cut: 'Your codes · last month', rows: P.prev.items, used: P.prev.items, merge: 'Codes carried to this build', note: P.prev.typed ? P.prev.typed + ' typed-over lines' : '' });
  // per month of each source, the CJI3 cost (to compare closed months with the next build)
  const certs = P.prog ? (P.prog.certs || []).map((c) => [c.po, c.serial, c.date, c.amt]) : [];
  return { files, cov, ovl, certs };
}
module.exports = { dataLog, cutType };
