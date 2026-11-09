// =====================================================================================  Auto-save: the codes go to a file the user chose once (Chrome / Edge); the file is linked per project, so next month's build finds it
const AS = { h: null, st: 'none', at: '', asked: false, ready: false, t: 0, ok: typeof window.showSaveFilePicker === 'function' };   // st: none | ok | perm | err
const asKey = () => 'codesFile:' + META.project, asName = () => (AS.h && AS.h.name) || META.project + '_codes.json';
async function asWrite() { if (!AS.h || AS.st !== 'ok') return; try { const w = await AS.h.createWritable(); await w.write(JSON.stringify(snapshot())); await w.close(); AS.at = new Date().toTimeString().slice(0, 5); setDirty(0); }
  catch (e) { AS.st = 'perm'; } renderStatus(); navBadges(); }
const asSoon = () => { if (!AS.h || AS.st !== 'ok') return; clearTimeout(AS.t); AS.t = setTimeout(asWrite, 800); };
async function asPick() {   // choose the file (needs a click)
  if (!AS.ok) { $('bSave').click(); return; }
  try { AS.h = await window.showSaveFilePicker({ suggestedName: META.project + '_codes.json', types: [{ description: 'Codes file', accept: { 'application/json': ['.json'] } }] }); }
  catch (e) { return; }   // cancelled
  AS.st = 'ok'; try { await idbSet(asKey(), AS.h); } catch (e) { /* kept for this session only */ } await asWrite(); toast('Auto-save on: every change goes to ' + asName());
}
async function asAllow() { if (!AS.h) return asPick(); try { const p = await AS.h.requestPermission({ mode: 'readwrite' }); if (p === 'granted') { AS.st = 'ok'; await asWrite(); } } catch (e) { AS.st = 'err'; } renderStatus(); }
// the Tool opens: find the linked file; when it holds newer codes than this browser (e.g. next month's build), load them
async function asStart() { let h = null; try { h = await idbGet(asKey()); } catch (e) { /* none */ } AS.ready = true; if (!h || !h.queryPermission) { renderStatus(); return; }
  AS.h = h; let p = 'prompt'; try { p = await h.queryPermission({ mode: 'readwrite' }); } catch (e) { /* ask */ } AS.st = p === 'granted' ? 'ok' : 'perm';
  if (AS.st === 'ok') { try { const f = JSON.parse(await (await h.getFile()).text()); let loc = null; try { loc = JSON.parse(localStorage.getItem(LSK) || 'null'); } catch (e) { /* none */ }
      if (f && f.codes && (!f.project || f.project === META.project) && (!loc || (f.at || '') > (loc.at || ''))) { const n = applySnap(f, true); undo = []; redo = []; persist(); compute(); render(); toast('Codes of ' + n + ' items loaded from ' + asName()); } }
    catch (e) { /* an empty / new file */ } }
  renderStatus(); }
// the first coding of a session, with no file linked yet: ask once
function asAsk() { if (!AS.ready || AS.h || AS.asked || !AS.ok) return; AS.asked = true; const m = document.createElement('div'); m.className = 'asm'; m.id = 'asm';
  m.innerHTML = `<div class="bx"><h3>Save your codes automatically?</h3>Choose a file <b>once</b>. The Tool then saves every change to it by itself – no Save button.
    <div class="f">📄 Name: <b>${esc(META.project)}_codes.json</b> &nbsp;·&nbsp; keep it next to the Tool (OneDrive or the project share).<br><span style="color:#4B5563">Next month the Tool reads your codes from this file.</span></div>
    <span style="color:#6B7280;font-size:13px">If you choose <b>Later</b>, your codes stay only in this browser.</span>
    <div class="bt"><button id="asLater">Later</button><button class="pri" id="asPick">Choose file…</button></div></div>`;
  document.body.appendChild(m); $('asLater').onclick = () => m.remove(); $('asPick').onclick = () => { m.remove(); asPick(); }; }
function applySnap(s, replaceLines) { let n = 0; BK.forEach((b) => { const m = s.codes && s.codes[b.id]; if (!m) return; b.items.forEach((it) => { const c = m[it.k]; if (!c) return; n++; ['pkg', 'mnl', 'ce', 'inc', 'div'].forEach((f) => { if (c[f] !== undefined && (f !== 'div' || isSub(it.bi))) it[f] = c[f]; }); }); });
  if (s.lines && replaceLines) { for (const k of Object.keys(OVR)) delete OVR[k]; Object.assign(OVR, s.lines); } if (Array.isArray(s.rules)) ST.rules = s.rules.map((r) => ({ ...r })); if (s.uns && s.uns.mode) ST.uns = { mode: s.uns.mode, pick: (s.uns.pick || []).map(String) }; if (s.unsc && s.unsc.mode) ST.unsc = { mode: s.unsc.mode, pick: (s.unsc.pick || []).map(String) }; if (Array.isArray(s.pk)) ST.pk = s.pk.map((x) => ({ c: String(x.c), n: x.n || '' })); if (s.depx && s.depx.mode) ST.depx = { mode: s.depx.mode, pick: (s.depx.pick || []).map(String) }; if (s.crules && typeof s.crules === 'object') ST.crules = { ...ST.crules, ...s.crules }; if (Array.isArray(s.log) && s.log.length >= ST.log.length) ST.log = s.log.slice(-3000); if (s.psg && Array.isArray(s.psg.direct)) ST.psg = s.psg; if (s.indOff !== undefined) ST.indOff = !!s.indOff; return n; }
function restore() { try { const s = JSON.parse(localStorage.getItem(LSK) || 'null'); if (!s) return; applySnap(s, true); if (s.cut && META.cuts.includes(s.cut) && (typeof CUTS === 'undefined' || CUTS.includes(s.cut))) ST.cut = s.cut; if (s.vat) { ST.vat = s.vat; ST.vatFrom = s.vatFrom || ''; } setSaved('Restored ' + new Date(s.at).toLocaleString()); } catch (e) {} }
