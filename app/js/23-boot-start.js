// =====================================================================================  start
$('hsub').textContent = `${META.project} · CJI3 ${META.cji3} · ${N.toLocaleString('en-US')} lines · built ${META.built}`;
restore(); ST.tab = 'sum'; const NRULE = applyCRules(true); if (NRULE) { setDirty(DIRTY + 1); persist(); setTimeout(() => toast(NRULE + ' new item' + (NRULE > 1 ? 's' : '') + ' coded by your coding rules'), 600); } $('cut').value = ST.cut; $('vat').value = ST.vat; $('vatFrom').value = ST.vatFrom; $('vatFrom').style.display = ST.vat === 'Include VAT before date' ? '' : 'none';
compute(); render();
{ const ch = indPresetChanges(); if (ch.length) { const d0 = DIRTY; AS.boot = true; change(ch, 'Indirect presets (SAP GL → indirect code)'); AS.boot = false; setDirty(d0); persist(); render(); setTimeout(() => toast(ch.filter((c) => c.f === 'ce').length + ' indirect items (G&A, equipment, fleet, house rent…) got their code automatically from their SAP GL – see Code › Rules · Ctrl+Z to undo'), 900); } }
asStart();
$('bNew').onclick = () => showStart(true);
$('bHelp').onclick = () => { GUIDE_OFF = !GUIDE_OFF; try { localStorage.setItem('crt:guideOff', GUIDE_OFF ? '1' : '0'); } catch (e) { /* none */ } if (!GUIDE_OFF && ST.tab !== 'cod') { ST.tab = 'cod'; render(); } else renderGuide(); };
}

