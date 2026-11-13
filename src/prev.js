'use strict';
// Last month's register: the codes (Coding sheets, by item key) and the codes/include typed over on Data sheets (by line id) carry over.
const { XLSX, readBook } = require('./io');
const { str } = require('./util');
const { BUCKETS } = require('./model');
const CODING_H = 6,
  DATA_H = 4;

function readPrev(file) {
  if (!file) return null;
  const wb = readBook(file, { cellFormula: true });
  const coding = new Map(),
    over = new Map();
  let items = 0,
    typed = 0;
  for (const b of BUCKETS) {
    const sc = wb.Sheets[b.short + ' Coding'];
    if (sc) {
      const rows = XLSX.utils.sheet_to_json(sc, { header: 1, raw: true, defval: null, blankrows: false });
      const hi = rows.findIndex((r) => r.includes('Item key'));
      if (hi >= 0) {
        const ix = (n) => rows[hi].indexOf(n);
        const m = new Map();
        for (const r of rows.slice(hi + 1)) {
          const k = str(r[ix('Item key')]);
          if (!k) continue;
          const ceI = ix('Cost element code') >= 0 ? ix('Cost element code') : ix('Cost element'),
            o = { pkg: str(r[ix('PKG')]), mnl: str(r[ix('MNL')]), ce: str(r[ceI]), inc: str(r[ix('Include')]) };
          if (ix('DIV') >= 0) o.div = str(r[ix('DIV')]);
          m.set(k, o);
          items++;
        }
        coding.set(b.id, m);
      }
    }
    const sd = wb.Sheets[b.short + ' Data'];
    if (sd) {
      const rng = XLSX.utils.decode_range(sd['!ref']);
      let hdr = -1;
      const col = {};
      for (let R = rng.s.r; R <= rng.s.r + 12; R++) {
        for (let C = rng.s.c; C <= rng.e.c; C++) {
          const c = sd[XLSX.utils.encode_cell({ r: R, c: C })];
          if (c && c.v === 'Line ID') hdr = R;
        }
        if (hdr >= 0) break;
      }
      if (hdr >= 0) {
        for (let C = rng.s.c; C <= rng.e.c; C++) {
          const c = sd[XLSX.utils.encode_cell({ r: hdr, c: C })];
          if (c) col[c.v] = C;
        }
        const m = new Map();
        for (let R = hdr + 1; R <= rng.e.r; R++) {
          const at = (n) => sd[XLSX.utils.encode_cell({ r: R, c: col[n] })];
          const id = at('Line ID');
          if (!id || !id.v) continue;
          const o = {};
          for (const [n, f] of [
            ['PKG', 'pkg'],
            ['MNL', 'mnl'],
            ['Cost element code', 'ce'],
            ['Include', 'inc'],
          ]) {
            const c = at(n);
            if (c && !c.f && str(c.v) !== '') o[f] = str(c.v);
          }
          // a typed-over Include only counts when it is "No" (Yes is the default); codes only when they were really typed
          if (Object.keys(o).length) {
            m.set(str(id.v), o);
            typed++;
          }
        }
        over.set(b.id, m);
      }
    }
  }
  const ls = wb.Sheets.Lines;
  if (ls) {
    const rows = XLSX.utils.sheet_to_json(ls, { header: 1, raw: true, defval: '' }),
      hi = rows.findIndex((r) => r.includes('Line ID') && r.includes('Item PKG'));
    if (hi >= 0) {
      const h = rows[hi],
        c = (n) => h.indexOf(n);
      for (const r of rows.slice(hi + 1)) {
        const b = str(r[c('Bucket')]),
          id = str(r[c('Line ID')]);
        if (!b || !id) continue;
        const o = {};
        [
          ['PKG', 'Item PKG', 'pkg'],
          ['MNL', 'Item MNL', 'mnl'],
          ['Cost element code', 'Item CE', 'ce'],
          ['Include', 'Item Include', 'inc'],
        ].forEach(([n, ni, f]) => {
          if (str(r[c(n)]) !== str(r[c(ni)])) o[f] = str(r[c(n)]);
        });
        if (Object.keys(o).length) {
          const m = over.get(b) || over.set(b, new Map()).get(b);
          m.set(id, { ...(m.get(id) || {}), ...o });
          typed++;
        }
      }
    }
  }
  // lines typed over in the HTML app (its export has a "Line overrides" sheet: Bucket, Line ID, PKG, MNL, Cost element code, Include)
  const lo = wb.Sheets['Line overrides'];
  if (lo)
    for (const r of XLSX.utils.sheet_to_json(lo, { defval: '' })) {
      const b = str(r.Bucket),
        id = str(r['Line ID']);
      if (!b || !id) continue;
      const m = over.get(b) || over.set(b, new Map()).get(b),
        o = m.get(id) || {};
      [
        ['PKG', 'pkg'],
        ['MNL', 'mnl'],
        ['Cost element code', 'ce'],
        ['Include', 'inc'],
      ].forEach(([n, f]) => {
        if (str(r[n]) !== '') o[f] = str(r[n]);
      });
      m.set(id, o);
      typed++;
    }
  const ru = wb.Sheets['Your rules'],
    rules = [];
  if (ru)
    for (const r of XLSX.utils.sheet_to_json(ru, { defval: '' })) {
      const o = {
        ce: str(r['Cost element']),
        cen: str(r['Cost element name']),
        type: str(r['Document type']),
        wbs: str(r['WBS starts with']),
        bucket: str(r.Bucket),
        sub: str(r['G&A sub-group']),
      };
      if (o.bucket && (o.ce || o.cen || o.type || o.wbs)) rules.push(o);
    }
  return { coding, over, items, typed, file, rules };
}
module.exports = { readPrev, CODING_H, DATA_H };
