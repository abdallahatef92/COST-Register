// ---- Excel-like filter popup (value list for every column)
let popK = null;
function openPop(k, btn) {
  const D = R.D, S0 = vs(), c = D.cols.find((x) => x.k === k), f = S0.f[k] || {}, r = btn.getBoundingClientRect(), pop = $('pop'); popK = k;
  const others = D.rows.filter((row) => D.cols.every((cc) => cc.k === k || passF(cc, row, S0.f[cc.k]))), cnt = new Map();
  others.forEach((x) => { const vv = c.v(x); (Array.isArray(vv) ? vv : [vv]).forEach((v0) => { const v = keyOf(c, v0); cnt.set(v, (cnt.get(v) || 0) + 1); }); });
  const vals = [...cnt.keys()].sort((a, b) => (c.num ? keyNum(a) - keyNum(b) : a.localeCompare(b))), shown = vals.slice(0, 2000);
  pop.innerHTML = `<div class="row"><button data-a="asc">${c.num ? 'Smallest → largest' : 'Sort A → Z'}</button><button data-a="desc">${c.num ? 'Largest → smallest' : 'Sort Z → A'}</button></div><input type="search" id="pS" placeholder="Search values"><div class="vals"><label><input type="checkbox" id="pAll" ${!f.set ? 'checked' : ''}> <b>(Select all)</b></label>${shown.map((v) => `<label data-v="${esc(v.toLowerCase())}"><input type="checkbox" class="pv" value="${esc(v)}" ${!f.set || f.set.has(v) ? 'checked' : ''}> <span dir="auto">${esc(v)}</span><span class="cn">${cnt.get(v)}</span></label>`).join('')}${vals.length > shown.length ? `<div class="help">… ${vals.length - shown.length} more – use the search box</div>` : ''}</div><div class="row" style="margin:0"><button class="pri" data-a="ok">OK</button><button class="clr" data-a="clr">✕ Clear filter</button></div>`;
  pop.classList.add('show'); pop.style.left = Math.max(($('nav') ? $('nav').getBoundingClientRect().right : 0) + 6, Math.min(window.innerWidth - 280, r.left - 210)) + 'px'; pop.style.top = r.bottom + 4 + 'px';
  const s = $('pS'); s.oninput = () => { const qq = s.value.toLowerCase(); pop.querySelectorAll('.vals label[data-v]').forEach((l) => { l.style.display = l.dataset.v.includes(qq) ? '' : 'none'; }); }; s.focus();
  $('pAll').onchange = () => pop.querySelectorAll('.pv').forEach((x) => { if (x.closest('label').style.display !== 'none') x.checked = $('pAll').checked; });
}
$('pop').addEventListener('click', (e) => { const a = e.target.dataset.a; if (!a) return; const S0 = vs();
  if (a === 'asc' || a === 'desc') S0.sort = { k: popK, d: a === 'asc' ? 1 : -1 }; if (a === 'clr') delete S0.f[popK];
  if (a === 'ok') { const all = [...document.querySelectorAll('#pop .pv')], srch = $('pS').value.trim(), boxes = srch ? all.filter((x) => x.closest('label').style.display !== 'none') : all, on = boxes.filter((x) => x.checked).map((x) => x.value); S0.f[popK] = !srch && on.length === all.length ? {} : { set: new Set(on) }; }
  $('pop').classList.remove('show'); render(); });
document.addEventListener('mousedown', (e) => { if (!e.target.closest('#pop') && !e.target.closest('.fb')) $('pop').classList.remove('show'); });
