// =====================================================================================  start
$('hsub').textContent = META.project; $('hsub').parentNode.title = `CJI3 ${META.cji3} · ${N.toLocaleString('en-US')} lines · built ${META.built}`;
restore(); ST.tab = 'cod'; ST.next = true; if (ST.bk < 0) ST.bk = 0; const NRULE = applyCRules(true); if (NRULE) { setDirty(DIRTY + 1); persist(); setTimeout(() => toast(NRULE + ' new item' + (NRULE > 1 ? 's' : '') + ' coded by your coding rules'), 600); } $('cut').value = ST.cut; $('vat').value = ST.vat; $('vatFrom').value = ST.vatFrom; $('vatFrom').style.display = ST.vat === 'Include VAT before date' ? '' : 'none';
compute(); render();
{ const ch = indPresetChanges(); if (ch.length) { const d0 = DIRTY; AS.boot = true; change(ch, 'Indirect presets (SAP GL → indirect code)'); AS.boot = false; setDirty(d0); persist(); render(); setTimeout(() => toast(ch.filter((c) => c.f === 'ce').length + ' indirect items (G&A, equipment, fleet, house rent…) got their code automatically from their SAP GL – see Check › Rules · Ctrl+Z to undo'), 900); } }
{ const ch = []; BK.forEach((b) => b.items.forEach((it) => CODEF.forEach((f) => { const v = it[f]; if (typeof v === 'string' && v && canon(f, v) !== v) ch.push({ t: 'item', bi: it.bi, ii: it.ii, f, v: canon(f, v) }); })));   // codes typed in lowercase before: in capitals once
  const ix = new Map(); L.id.forEach((id, i) => ix.set(String(id), i)); Object.entries(OVR).forEach(([id, o]) => ['pkg', 'mnl', 'ce'].forEach((f) => { const v = o && o[f]; if (typeof v === 'string' && v && canon(f, v) !== v && ix.has(id)) ch.push({ t: 'line', i: ix.get(id), f, v: canon(f, v) }); }));
  canonCfg(); if (ch.length) { const d0 = DIRTY; AS.boot = true; change(ch, 'Codes in capitals (e.g. sf-02 → SF-02)'); AS.boot = false; setDirty(d0); persist(); render(); setTimeout(() => toast(ch.length + ' code' + (ch.length > 1 ? 's' : '') + ' written in capitals (e.g. sf-02 → SF-02) – Ctrl+Z to undo'), 1600); } }
asStart();
$('bNew').onclick = () => showStart(true);
$('bHelp').onclick = () => { GUIDE_OFF = !GUIDE_OFF; try { localStorage.setItem('crt:guideOff', GUIDE_OFF ? '1' : '0'); } catch (e) { /* none */ } if (!GUIDE_OFF && ST.tab !== 'cod') { ST.tab = 'cod'; render(); } else renderGuide(); };
}

