'use strict';
// MB51 (material movements). With MB51 loaded, "Material Data" is the MB51 sheet itself: one row per goods issue charged to a WBS element, with all its columns.
// Where MB51 and CJI3 differ for a material in a month, ONE visible adjustment row brings the bucket back to CJI3 (CJI3 stays the truth).
const XLSX = require('xlsx');
const { str, num, r2, r3, isoDate } = require('./util');
const { indexHeader } = require('./cji3');
const ISSUE = { '221': 'Project', '222': 'Project', '281': 'Project', '282': 'Project', Z21: 'To subcontractors', Z22: 'To subcontractors', '551': 'Scrap', '552': 'Scrap', '553': 'Scrap', '554': 'Scrap', '555': 'Scrap', '556': 'Scrap' };
const TEXT = { '221': 'GI to project', '222': 'GI to project reversal', '281': 'GI to network', '282': 'GI to network reversal', Z21: 'GI to subcontractor', Z22: 'GI to subcontractor reversal', '551': 'Scrapping', '552': 'Scrapping reversal' };

function readMb51(files) {
  const rows = [], seen = new Set();
  for (const f of files) {
    const wb = XLSX.readFile(f, { cellDates: true }); const sh = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: null });
    const h = sh.findIndex((r) => r.some((c) => str(c) === 'Material Document')); if (h < 0) throw new Error('MB51: "Material Document" column not found in ' + f);
    const ix = indexHeader(sh[h]), g = (r, n) => (ix.has(n) ? r[ix.get(n)] : null);
    for (const r of sh.slice(h + 1)) {
      const doc = str(g(r, 'Material Document')); if (!doc) continue;
      const item = str(g(r, 'Material Doc.Item')), year = str(g(r, 'Material Doc. Year')), k = doc + '|' + item + '|' + year; if (seen.has(k)) continue; seen.add(k);
      const mvt = str(g(r, 'Movement Type'));
      rows.push({ key: k, doc, item, year, mat: str(g(r, 'Material')), desc: str(g(r, 'Material Description')), mvt, mvtText: str(g(r, 'Movement Type Text')) || TEXT[mvt] || '', date: isoDate(g(r, 'Posting Date')),
        sapQty: num(g(r, 'Qty in unit of entry')), sapAmt: r2(num(g(r, 'Amt.in Loc.Cur.'))), unitEntry: str(g(r, 'Unit of Entry')), entry: isoDate(g(r, 'Entry Date')), wbs: str(g(r, 'WBS Element')),
        order: str(g(r, 'Order')), resv: str(g(r, 'Reservation')) === '0' ? '' : str(g(r, 'Reservation')), user: str(g(r, 'User Name')), text: str(g(r, 'Text')), header: str(g(r, 'Document Header Text')),
        val: str(g(r, 'Valuation Type')), sloc: str(g(r, 'Storage Location')), supplier: str(g(r, 'Supplier')), issue: ISSUE[mvt] || '' });
    }
  }
  return { rows };
}

// The Material bucket from MB51: goods issues charged to the project up to the CJI3 horizon, each matched to its CJI3 line (document, cost element, base-unit quantity),
// plus adjustment rows where a material's month differs from CJI3.
function materialFromMb51(cjiMat, mb, horizon) {
  const pool = new Map(); cjiMat.forEach((l) => { const k = l.refDoc + '|' + l.mat; (pool.get(k) || pool.set(k, []).get(k)).push(l); });
  const used = new Set(), out = [], inScope = mb.rows.filter((r) => r.issue && r.wbs && r.date && r.date <= horizon);
  for (const r of inScope) {
    const cost = r2(-r.sapAmt), c = (pool.get(r.doc + '|' + r.mat) || []).filter((l) => !used.has(l) && Math.abs(l.amt - cost) < 0.005);
    const m = c.find((l) => Math.abs(l.qty - -r.sapQty) < 0.0005) || c[0]; if (m) used.add(m);
    out.push({ id: r.key, doc: m ? m.doc : '', row: '', fy: r.year, date: r.date, ym: r.date.slice(0, 7), type: m ? m.type : '', ce: m ? m.ce : '', cen: m ? m.cen : '', amt: cost, wbs: r.wbs, mat: r.mat, matDesc: r.desc || (m && m.matDesc) || '',
      qty: m ? m.qty : r3(-r.sapQty), unit: (m && m.unit) || r.unitEntry, name: '', header: r.header, poText: '', po: '', order: r.order, orderName: '', offset: '', refDoc: r.doc, bucket: 'Material', sub: '', open: false,
      mvt: r.mvt, mvtText: r.mvtText, issue: r.issue, supplier: r.supplier, mb: { sapQty: r.sapQty, sapAmt: r.sapAmt, unitEntry: r.unitEntry, entry: r.entry, resv: r.resv, user: r.user, text: r.text, val: r.val, sloc: r.sloc, item: r.item, year: r.year, noValue: cost === 0 } });
  }
  // adjustments: CJI3 minus what MB51 explains, per material and month
  const sum = (ls) => { const m = new Map(); for (const l of ls) { const k = l.mat + '|' + l.ym; const x = m.get(k) || m.set(k, { a: 0, q: 0, mat: l.mat, ym: l.ym, d: l.matDesc, u: l.unit }).get(k); x.a += l.amt; x.q += l.qty; } return m; };
  const A = sum(cjiMat), B = sum(out); let adj = 0, adjAmt = 0;
  for (const k of new Set([...A.keys(), ...B.keys()])) {
    const a = A.get(k) || { a: 0, q: 0 }, b = B.get(k) || { a: 0, q: 0 }, da = r2(a.a - b.a), dq = r3(a.q - b.q); if (Math.abs(da) < 0.005 && Math.abs(dq) < 0.0005) continue;
    const s = A.get(k) || B.get(k), [y, mo] = s.ym.split('-'), last = new Date(Date.UTC(+y, +mo, 0)).toISOString().slice(0, 10);
    out.push({ id: 'ADJ|' + s.mat + '|' + s.ym, doc: '(adjustment)', row: '', fy: y, date: last, ym: s.ym, type: '', ce: '', cen: '', amt: da, wbs: '', mat: s.mat, matDesc: s.d, qty: dq, unit: s.u, name: '', header: '', poText: '', po: '', order: '', orderName: '', offset: '', refDoc: '',
      bucket: 'Material', sub: '', open: false, mvt: '', mvtText: 'MB51 and CJI3 differ for this material and month – this row brings the bucket to CJI3', issue: 'Adjustment to CJI3', supplier: '', adj: true,
      mb: { sapQty: null, sapAmt: null, unitEntry: '', entry: '', resv: '', user: '', text: '', val: '', sloc: '', item: '', year: y, noValue: false } });
    adj++; adjAmt += da;
  }
  const after = mb.rows.filter((r) => r.issue && r.wbs && r.date > horizon);
  return { lines: out, used: inScope.length, matched: used.size, adj, adjAmt: r2(adjAmt), after: { n: after.length, amt: r2(-after.reduce((s, r) => s + r.sapAmt, 0)) } };
}
module.exports = { readMb51, materialFromMb51 };
