'use strict';
// Widen any column whose numbers or dates would not fit (Excel shows #### then). Text columns are left alone.
function fmtLen(v, fmt) {
  fmt = fmt || 'General';
  if (v instanceof Date) return /mmm/.test(fmt) ? 11 : /yy/.test(fmt) && !/yyyy/.test(fmt) ? 9 : 10;
  if (typeof v !== 'number' || !Number.isFinite(v)) return 0;
  let dec = 0, pct = false, x = v;
  if (/%/.test(fmt)) { pct = true; x = v * 100; const m = /0\.(0+)%/.exec(fmt); dec = m ? m[1].length : 0; }
  else { const m = /0\.([0#]+)/.exec(fmt); dec = m ? m[1].length : 0; if (fmt === 'General') dec = Math.min(6, (String(v).split('.')[1] || '').length); }
  const s = Math.abs(x).toFixed(dec), intLen = s.split('.')[0].length, commas = /,/.test(fmt) ? Math.floor((intLen - 1) / 3) : 0;
  return s.length + commas + (x < 0 ? 1 : 0) + (pct ? 1 : 0);
}
function fitWidths(wb) {
  let changed = 0;
  for (const ws of wb.worksheets) {
    if (ws.state === 'hidden') continue;
    const need = new Map();
    ws.eachRow({ includeEmpty: false }, (row) => row.eachCell({ includeEmpty: false }, (cell) => {
      let v = cell.value; if (v && typeof v === 'object' && !(v instanceof Date) && 'result' in v) v = v.result; if (v && typeof v === 'object' && !(v instanceof Date)) return;
      const len = fmtLen(v, cell.numFmt); if (!len) return;
      const f = cell.font || {}, size = f.size || 10, w = (len * (size / 10) * (f.bold ? 1.1 : 1)) + 2.5;
      if (w > (need.get(cell.col) || 0)) need.set(cell.col, w);
    }));
    for (const [col, w] of need) { const c = ws.getColumn(col); if (c.hidden) continue; const cur = c.width || 8.43, want = Math.min(Math.ceil(w), 40); if (want > cur) { c.width = want; changed++; } }
  }
  return changed;
}
module.exports = { fitWidths, fmtLen };
