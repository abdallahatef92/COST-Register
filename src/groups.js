'use strict';
// Material group -> family / division, as in the Material report: the family is the letters of the group code (M, P, SP ...),
// the division is the family plus two digits when the group has them (M03, P04).
const XLSX = require('xlsx');
const { str } = require('./util');
const { indexHeader } = require('./cji3');
const FAMILY = [['M', 'Materials'], ['P', 'Plant & tools'], ['SP', 'Spare parts, oils & fuel'], ['SM', 'Safety'], ['SH', 'Site housing'], ['CS', 'Consumables & buffet'],
  ['OS', 'Office supplies'], ['IT', 'IT'], ['G', 'General hardware'], ['A', 'Assets'], ['SR', 'Survey spares'], ['SC', 'Scrap'], ['S', 'Services'], ['MTEX', 'Vehicle maintenance'],
  ['L', 'Labour'], ['OVM', 'Overhead'], ['WST', 'Wastage']];
const FAM_NAME = new Map(FAMILY), FAM_RANK = new Map(FAMILY.map(([k], i) => [k, i]));
const NO_GRP = '(no material group)';
const famOf = (g) => { const m = /^[A-Z&]+/.exec(str(g)); return m ? m[0] : ''; };
const divOf = (g) => { const f = famOf(g); const m = new RegExp('^' + f + '(\\d{2})').exec(str(g)); return f && m ? f + m[1] : ''; };
const famLabel = (g) => (!g ? NO_GRP : famOf(g) ? famOf(g) + ' · ' + (FAM_NAME.get(famOf(g)) || famOf(g)) : g);
const divLabel = (g) => (!g ? NO_GRP : divOf(g) || famOf(g) + ' · no SAP division');
const treeKey = (g) => { const f = famOf(g); return [g ? (FAM_RANK.has(f) ? FAM_RANK.get(f) : 98) : 99, f, divOf(g), str(g)]; };
function treeCmp(a, b) { const x = treeKey(a), y = treeKey(b); for (let i = 0; i < 4; i++) { if (x[i] < y[i]) return -1; if (x[i] > y[i]) return 1; } return 0; }

// ME2N first (PO lines), MB52 for the materials that are on no PO line
function readGroups({ me2n, mb52 }) {
  const map = new Map(); const src = { me2n: 0, mb52: 0 };
  const read = (file, mCol, gCol, uCol, tag) => {
    if (!file) return;
    const wb = XLSX.readFile(file); const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: null });
    const h = rows.findIndex((r) => r.some((c) => str(c) === mCol)); if (h < 0) throw new Error(tag + ': column "' + mCol + '" not found');
    const ix = indexHeader(rows[h]);
    for (const r of rows.slice(h + 1)) { const m = str(r[ix.get(mCol)]); const gr = str(r[ix.get(gCol)]); if (!m || !gr) continue; if (!map.has(m)) { map.set(m, { group: gr, unit: uCol && ix.has(uCol) ? str(r[ix.get(uCol)]) : '', src: tag }); src[tag.toLowerCase()]++; } }
  };
  read(me2n, 'Material', 'Material Group', 'Order Unit', 'ME2N');
  read(mb52, 'Material', 'Material Group', 'Base Unit of Measure', 'MB52');
  return { map, src };
}
module.exports = { FAMILY, famOf, divOf, famLabel, divLabel, treeCmp, readGroups, NO_GRP };
