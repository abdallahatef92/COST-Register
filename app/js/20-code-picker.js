// =====================================================================================  pick list under a PKG / cost element box
// your codes with their names: type to filter, ↑ ↓ to choose, Enter or a click takes it. A new code can still be typed.
const PKL = { t: null, rows: [], hi: -1, el: null };
const pklHide = () => { if (PKL.el) PKL.el.hidden = true; PKL.t = null; PKL.hi = -1; };
function pklRows(t) { const f = t.dataset.f, tr = t.closest('tr'), r = tr && tr.dataset.k ? rowOf(tr) : null, sg = t.dataset.sug || '', q = t.value.trim().toUpperCase(); let all = [];
  if (f === 'pkg') all = (R.pkgs || []).map((c) => [c, isIndPkg(c) ? 'Indirect cost (G&A, site, equipment, fleet, house rent)' : pkgLabel(c)]);
  else { let pkg = ''; if (r && r.it) { const o = r.i !== undefined ? OVR[L.id[r.i]] : null; pkg = (o && o.pkg !== undefined ? o.pkg : r.it.pkg) || (r.i === undefined ? (sugOf(r.it) || {}).pkg : '') || ''; } if (pkg) { const x = ceCodes(pkg); all = x.list.map((c) => [c, ceLabel(x.p, c)]); } else all = ceAll().map((x) => [x.c, ceLabel(x.p, x.c), x.p]); }
  const hit = (c, n) => (!q ? 2 : c.toUpperCase().startsWith(q) ? 2 : (c + ' ' + (n || '')).toUpperCase().includes(q) ? 1 : 0);
  const rows = all.map(([c, n, p]) => ({ c, n: n || '', p: p || '', h: hit(c, n), sg: !q && c === sg })).filter((x) => x.h).sort((a, b) => b.sg - a.sg || b.h - a.h);
  if (!q && sg && !rows.some((x) => x.sg)) rows.unshift({ c: sg, n: '', h: 2, sg: true });
  return rows; }
function pklShow(t) { const rows = pklRows(t); PKL.t = t; PKL.rows = rows; if (PKL.hi >= rows.length) PKL.hi = -1;
  if (!PKL.el) { PKL.el = document.createElement('div'); PKL.el.id = 'pkl'; document.body.appendChild(PKL.el);
    PKL.el.addEventListener('mousedown', (e) => { e.preventDefault(); const d = e.target.closest('[data-i]'); if (d && PKL.t) pklTake(PKL.rows[+d.dataset.i]); }); }
  if (!rows.length) { PKL.el.hidden = true; return; }
  PKL.el.innerHTML = rows.map((x, i) => `<div data-i="${i}" class="${i === PKL.hi || (PKL.hi < 0 && x.sg) ? 'on' : ''}"><b>${esc(x.c)}</b><span dir="auto">${esc(x.n) || '<i>no name yet</i>'}</span>${x.sg ? '<em>suggested ↵</em>' : x.p ? `<em class="pk">${esc(x.p)}</em>` : ''}</div>`).join('') + `<div class="ft">${t.dataset.f === 'pkg' ? 'your PKG list' : rows.some((x) => x.p) ? 'no PKG on this row yet – picking a cost element fills its PKG too' : 'cost elements of this PKG'} · type to filter · ↑ ↓ to choose</div>`;
  PKL.el.hidden = false; const rc = t.getBoundingClientRect(), h = PKL.el.offsetHeight, w = PKL.el.offsetWidth; PKL.el.style.left = Math.max(4, Math.min(rc.left, innerWidth - w - 8)) + 'px'; PKL.el.style.top = (rc.bottom + h + 6 > innerHeight && rc.top - h - 4 > 0 ? rc.top - h - 4 : rc.bottom + 3) + 'px';
  const on = PKL.el.querySelector('.on'); if (on && PKL.hi >= 0) on.scrollIntoView({ block: 'nearest' }); }
// take a code from the list: save it (with its PKG when the row has none), then go on to the next empty box of the row, or the same box of the next row
function pklTake(x) { const t = PKL.t; if (!t) return; const f = t.dataset.f, tr = t.closest('tr'), k = tr && tr.dataset.k, r = k ? rowOf(tr) : null, ix = [...document.querySelectorAll(`#tb input[data-f="${f}"]`)].indexOf(t); pklHide();
  const noPkg = r && x.p && !(r.i !== undefined ? (OVR[L.id[r.i]] && OVR[L.id[r.i]].pkg !== undefined ? OVR[L.id[r.i]].pkg : r.it.pkg) : r.it.pkg);
  if (noPkg) change(r.i !== undefined ? [lineCh(r.i, 'pkg', x.p), lineCh(r.i, 'ce', x.c)] : [{ t: 'item', bi: r.it.bi, ii: r.it.ii, f: 'pkg', v: x.p }, { t: 'item', bi: r.it.bi, ii: r.it.ii, f: 'ce', v: x.c }], 'PKG ' + x.p + ' · cost element ' + x.c + ' · ' + itemCode(r.it));
  else { t.value = x.c; t.dispatchEvent(new Event('change', { bubbles: true })); }
  setTimeout(() => { const row = k && document.querySelector(`#tb tr[data-k="${k}"]`), nx = (row && [...row.querySelectorAll('input[data-f]')].find((y) => !y.value.trim())) || [...document.querySelectorAll(`#tb input[data-f="${f}"]`)][row ? ix + 1 : ix]; if (nx) { nx.focus(); nx.select(); } }, 0); }
const pklIs = (t) => !!(t && t.matches && t.matches('#tb input[data-f="pkg"], #tb input[data-f="ce"]'));
document.addEventListener('focusin', (e) => { if (pklIs(e.target)) { PKL.hi = -1; pklShow(e.target); } });
document.addEventListener('focusout', (e) => { if (e.target === PKL.t) pklHide(); });
document.addEventListener('input', (e) => { if (pklIs(e.target)) { PKL.hi = -1; pklShow(e.target); } });
document.addEventListener('keydown', (e) => { const t = e.target; if (!pklIs(t)) return;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); e.stopPropagation(); if (PKL.t !== t || PKL.el.hidden) { PKL.hi = -1; pklShow(t); } const n = PKL.rows.length; if (!n) return; PKL.hi = e.key === 'ArrowDown' ? (PKL.hi + 1) % n : (PKL.hi <= 0 ? n : PKL.hi) - 1; pklShow(t); return; }
  if (e.key === 'Enter' && PKL.t === t && PKL.hi >= 0 && PKL.rows[PKL.hi]) { e.preventDefault(); e.stopPropagation(); pklTake(PKL.rows[PKL.hi]); }
}, true);
$('wrap').addEventListener('scroll', pklHide);
