'use strict';
// MB51 (material movements): says what each goods issue was – to the project, to a subcontractor, scrap … Several exports are merged by document + item.
const XLSX = require('xlsx');
const { str, num, r2 } = require('./util');
const { indexHeader } = require('./cji3');
const ISSUE = { '221': 'Project', '222': 'Project', '281': 'Project', '282': 'Project', Z21: 'To subcontractors', Z22: 'To subcontractors', '551': 'Scrap', '552': 'Scrap', '553': 'Scrap', '554': 'Scrap', '555': 'Scrap', '556': 'Scrap' };
const TEXT = { '221': 'GI to project', '222': 'GI to project reversal', '281': 'GI to network', '282': 'GI to network reversal', Z21: 'GI to subcontractor', Z22: 'GI to subcontractor reversal', '551': 'Scrapping', '552': 'Scrapping reversal' };

function readMb51(files) {
  const byDoc = new Map(), seen = new Set(); let lines = 0;
  for (const f of files) {
    const wb = XLSX.readFile(f); const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: null });
    const h = rows.findIndex((r) => r.some((c) => str(c) === 'Material Document')); if (h < 0) throw new Error('MB51: "Material Document" column not found in ' + f);
    const ix = indexHeader(rows[h]), g = (r, n) => (ix.has(n) ? r[ix.get(n)] : null);
    for (const r of rows.slice(h + 1)) {
      const doc = str(g(r, 'Material Document')); if (!doc) continue; const k = doc + '|' + str(g(r, 'Material Doc.Item')) + '|' + str(g(r, 'Material Doc. Year'));
      if (seen.has(k)) continue; seen.add(k); lines++;
      const mvt = str(g(r, 'Movement Type')), o = { mat: str(g(r, 'Material')), mvt, mvtText: str(g(r, 'Movement Type Text')) || TEXT[mvt] || '', amt: r2(-num(g(r, 'Amt.in Loc.Cur.'))), wbs: str(g(r, 'WBS Element')),
        supplier: str(g(r, 'Supplier')), order: str(g(r, 'Order')), text: str(g(r, 'Text')) || str(g(r, 'Document Header Text')), issue: ISSUE[mvt] || '' };
      (byDoc.get(doc) || byDoc.set(doc, []).get(doc)).push(o);
    }
  }
  return { byDoc, lines };
}
// the MB51 line behind a CJI3 goods-issue line: same document and material, the amount that matches
function attach(lines, mb) {
  let hit = 0;
  const used = new Set();
  for (const l of lines) {
    if (l.bucket !== 'Material' || !l.refDoc) continue;
    const c = (mb.byDoc.get(l.refDoc) || []).filter((o) => o.mat === l.mat && o.wbs); if (!c.length) continue;
    let m = c.find((o) => !used.has(o) && Math.abs(o.amt - l.amt) < 0.005) || c.find((o) => Math.abs(o.amt - l.amt) < 0.005) || c[0];
    used.add(m); l.issue = m.issue; l.mvt = m.mvt; l.mvtText = m.mvtText; l.supplier = m.supplier; hit++;
  }
  return hit;
}
module.exports = { readMb51, attach };
