/* Shared helpers: used by the worker, the page and the Node tests (UMD, no DOM). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CRU = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // header caption -> comparison form: trimmed, spaces collapsed, lower case
  const normH = (s) => String(s == null ? '' : s).replace(/ /g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();

  // any cell -> trimmed text, or null when empty. SAP numbers used as codes (PO, material, cost element) become plain text.
  function toText(v) {
    if (v == null) return null;
    if (typeof v === 'number') return isFinite(v) ? String(v) : null;
    if (v instanceof Date) return isNaN(v) ? null : v.toISOString().slice(0, 10);
    const s = String(v).replace(/ /g, ' ').trim();
    return s === '' ? null : s;
  }

  // any cell -> number | null (empty) | NaN (not a number).
  // Handles thousands separators, a trailing minus (SAP: "1,234.50-") and (1,234) negatives.
  function toNum(v) {
    if (v == null) return null;
    if (typeof v === 'number') return isFinite(v) ? v : NaN;
    let s = String(v).replace(/[\s ]/g, '');
    if (s === '') return null;
    let neg = false;
    if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
    if (s.endsWith('-')) { neg = !neg; s = s.slice(0, -1); }
    else if (s.startsWith('-')) { neg = !neg; s = s.slice(1); }
    else if (s.startsWith('+')) s = s.slice(1);
    s = s.replace(/,/g, '');
    if (!/^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(s)) return NaN;
    const n = parseFloat(s);
    return neg ? -n : n;
  }

  const pad = (n, w) => String(n).padStart(w || 2, '0');
  const isoOf = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
  const validYMD = (y, m, d) => y >= 1900 && y <= 2200 && m >= 1 && m <= 12 && d >= 1 && d <= 31;

  // Excel serial, ISO text, dd.mm.yyyy / dd/mm/yyyy / dd-mm-yyyy, yyyymmdd -> 'YYYY-MM-DD' | null
  function toDate(v) {
    if (v == null || v === '') return null;
    if (v instanceof Date) return isNaN(v) ? null : isoOf(v.getFullYear(), v.getMonth() + 1, v.getDate());
    if (typeof v === 'number') {
      if (!(v >= 1 && v < 2958466)) return null;
      const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(v) * 864e5);
      return isoOf(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
    }
    const s = String(v).trim();
    let m;
    if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/.exec(s))) return validYMD(+m[1], +m[2], +m[3]) ? isoOf(+m[1], +m[2], +m[3]) : null;
    if ((m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(s))) return validYMD(+m[3], +m[2], +m[1]) ? isoOf(+m[3], +m[2], +m[1]) : null;
    if ((m = /^(\d{4})(\d{2})(\d{2})$/.exec(s))) return validYMD(+m[1], +m[2], +m[3]) ? isoOf(+m[1], +m[2], +m[3]) : null;
    if (/^\d+(\.\d+)?$/.test(s)) return toDate(parseFloat(s));
    return null;
  }

  // time of day: Excel fraction -> 'HH:MM:SS'; text is kept
  function toTime(v) {
    if (v == null || v === '') return null;
    if (typeof v === 'number') {
      if (!(v >= 0 && v < 1.0000001)) return null;
      const t = Math.round((v % 1) * 86400);
      return `${pad(Math.floor(t / 3600) % 24)}:${pad(Math.floor(t / 60) % 60)}:${pad(t % 60)}`;
    }
    return toText(v);
  }

  // WBS element: no spaces, upper case (I-SUTH.IN-03-3)
  const toWbs = (v) => { const s = toText(v); return s == null ? null : s.replace(/\s+/g, '').toUpperCase(); };

  // join helper: trimmed; purely numeric codes lose their leading zeros so '0001' matches '1'
  function joinKey(v) {
    const s = toText(v);
    if (s == null) return null;
    return /^\d+$/.test(s) ? (s.replace(/^0+/, '') || '0') : s.toUpperCase();
  }

  // project key: the code after the first dash of a WBS root or a plant, upper case. I-SUTH.IN-03 -> SUTH, R-SBAY -> SBAY, SUTH -> SUTH
  function projectKey(v) {
    const s = toText(v);
    if (s == null) return null;
    const root = s.split('.')[0].toUpperCase();
    const m = /^[A-Z]-(.+)$/.exec(root);
    return m ? m[1] : root;
  }

  // column name from a SAP caption: ascii, lower case, underscores
  function slug(s) {
    const t = String(s).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    return t || 'col';
  }

  // the data date of a file: a date in its name (30-9-2026, 2026-09-30, 30.09.2026), else its modified date
  function dataDateOf(fileName, modifiedMs) {
    const n = String(fileName || '');
    let m;
    if ((m = /(\d{4})[-_.](\d{1,2})[-_.](\d{1,2})/.exec(n)) && validYMD(+m[1], +m[2], +m[3])) return isoOf(+m[1], +m[2], +m[3]);
    if ((m = /(?:^|[^\d])(\d{1,2})[-_.](\d{1,2})[-_.](\d{4})(?!\d)/.exec(n)) && validYMD(+m[3], +m[2], +m[1])) return isoOf(+m[3], +m[2], +m[1]);
    if (modifiedMs) { const d = new Date(modifiedMs); return isoOf(d.getFullYear(), d.getMonth() + 1, d.getDate()); }
    return null;
  }

  const ymOf = (iso) => (iso && /^\d{4}-\d{2}/.test(iso) ? iso.slice(0, 7) : null);

  return { normH, toText, toNum, toDate, toTime, toWbs, joinKey, projectKey, slug, dataDateOf, ymOf };
});
