'use strict';
// Last month's register: the codes (Coding sheets, by item key) and the codes/include typed over on Data sheets (by line id) carry over.
const XLSX = require('xlsx');
const { str } = require('./util');
const { BUCKETS } = require('./model');
const CODING_H = 6, DATA_H = 4;

function readPrev(file) {
  if (!file) return null;
  const wb = XLSX.readFile(file, { cellFormula: true });
  const coding = new Map(), over = new Map(); let items = 0, typed = 0;
  for (const b of BUCKETS) {
    const sc = wb.Sheets[b.short + ' Coding'];
    if (sc) {
      const rows = XLSX.utils.sheet_to_json(sc, { header: 1, raw: true, defval: null, blankrows: false });
      const hi = rows.findIndex((r) => r.includes('Item key')); if (hi >= 0) {
        const ix = (n) => rows[hi].indexOf(n); const m = new Map();
        for (const r of rows.slice(hi + 1)) { const k = str(r[ix('Item key')]); if (!k) continue; m.set(k, { pkg: str(r[ix('PKG')]), mnl: str(r[ix('MNL')]), ce: str(r[ix('Cost element code')]), inc: str(r[ix('Include')]) }); items++; }
        coding.set(b.id, m);
      }
    }
    const sd = wb.Sheets[b.short + ' Data'];
    if (sd) {
      const rng = XLSX.utils.decode_range(sd['!ref']); let hdr = -1; const col = {};
      for (let R = rng.s.r; R <= rng.s.r + 12; R++) { for (let C = rng.s.c; C <= rng.e.c; C++) { const c = sd[XLSX.utils.encode_cell({ r: R, c: C })]; if (c && c.v === 'Line ID') hdr = R; } if (hdr >= 0) break; }
      if (hdr >= 0) {
        for (let C = rng.s.c; C <= rng.e.c; C++) { const c = sd[XLSX.utils.encode_cell({ r: hdr, c: C })]; if (c) col[c.v] = C; }
        const m = new Map();
        for (let R = hdr + 1; R <= rng.e.r; R++) {
          const at = (n) => sd[XLSX.utils.encode_cell({ r: R, c: col[n] })];
          const id = at('Line ID'); if (!id || !id.v) continue; const o = {};
          for (const [n, f] of [['PKG', 'pkg'], ['MNL', 'mnl'], ['Cost element code', 'ce'], ['Include', 'inc']]) { const c = at(n); if (c && !c.f && str(c.v) !== '') o[f] = str(c.v); }
          // a typed-over Include only counts when it is "No" (Yes is the default); codes only when they were really typed
          if (Object.keys(o).length) { m.set(str(id.v), o); typed++; }
        }
        over.set(b.id, m);
      }
    }
  }
  return { coding, over, items, typed, file };
}
module.exports = { readPrev, CODING_H, DATA_H };
