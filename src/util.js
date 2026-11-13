'use strict';
const r2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100;
const r3 = (x) => Math.round((x + Number.EPSILON) * 1000) / 1000;
const str = (v) => (v === null || v === undefined ? '' : String(v).trim());
const num = (v) => {
  if (typeof v === 'number') return v;
  const n = parseFloat(String(v === null || v === undefined ? '' : v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
};
function colL(n) {
  let s = '';
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const ymLabel = (ym) => MON[+ym.slice(5, 7) - 1] + '-' + ym.slice(2, 4);
const nextYm = (ym) => {
  let y = +ym.slice(0, 4),
    m = +ym.slice(5, 7) + 1;
  if (m > 12) {
    m = 1;
    y++;
  }
  return y + '-' + String(m).padStart(2, '0');
};
const isoDate = (v) => {
  if (v instanceof Date) return new Date(v.getTime() + 12 * 3600e3).toISOString().slice(0, 10);
  const s = str(v);
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : '';
};
module.exports = { r2, r3, str, num, colL, ymLabel, nextYm, isoDate, MON };
