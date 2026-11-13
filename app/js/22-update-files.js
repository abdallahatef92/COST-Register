// =====================================================================================  Update the register with new SAP files (from inside the register)
// Drop the new files on the open register (or Side navigation › Add new files…). The files of the last build come from the data file;
// a new file replaces an old one of its kind when it covers the same months (snapshots and ZSCPRG01: always), else both are kept (merged:
// CJI3 a line once, ZINTC1 order + month newest). One box says what each file does; Update builds again – the old build stays in the data file.
const UPD_SNAP = new Set(['zscsrv1', 'mb52', 'me2n', 'zscprg01']), UPD_NAME = { cji3: 'CJI3', zscprg01: 'ZSCPRG01', zscsrv1: 'ZSCSRV1', zintc1: 'ZINTC1', mb52: 'MB52', me2n: 'ME2N' };
const ymL = (ym) => (ym ? MON[+ym.slice(5, 7) - 1] + '-' + ym.slice(2, 4) : '');
const span = (a, b) => (a ? ymL(a) + (b && b !== a ? ' – ' + ymL(b) : '') : '');
function updBox(html) { let m = $('updm'); if (!m) { m = document.createElement('div'); m.id = 'updm'; m.className = 'updm'; document.body.appendChild(m); } m.innerHTML = `<div class="ub">${html}</div>`; m.style.display = 'flex'; return m; }
const updClose = () => { const m = $('updm'); if (m) m.style.display = 'none'; };
async function updStart(fileList) {
  const list = [...fileList]; if (!list.length) return;
  const db = list.find((f) => /\.db$/i.test(f.name)); if (db) { toast('To open another data file: Side navigation › Data file › Open another data file…'); return; }
  if (!DBF.db) { updBox(`<h3>Keep your work in a data file first</h3><div class="sub">New files go into the data file with your builds and codes – then next month you drop only the new ones.</div><div class="bt"><button data-upd="x">Cancel</button><button class="pri" data-upd="mk">Create data file…</button></div>`); return; }
  updBox('<h3>Reading the new files…</h3><div class="sub">a few seconds for a big CJI3</div>'); await new Promise((r) => setTimeout(r, 60));
  const nw = []; for (const f of list) { const o = { name: f.name, data: new Uint8Array(await f.arrayBuffer()) }; const si = Engine.sniffInfo(o); o.kind = si.kind; o.proj = si.proj; nw.push(o); }
  for (const o of nw) if (['cji3', 'zintc1', 'zscprg01'].includes(o.kind)) { await new Promise((r) => setTimeout(r, 20)); Object.assign(o, Engine.peek(o, o.kind)); }
  const last = latestId(), old = dbBuildFiles(last).filter((f) => f.role !== 'replaced'), good = nw.filter((o) => UPD_NAME[o.kind]), bad = nw.filter((o) => !UPD_NAME[o.kind]);
  // which old file each new one replaces
  const repl = new Map(); for (const f of old) { const by = good.find((o) => o.kind === f.kind && (UPD_SNAP.has(f.kind) || (o.first && f.first && o.first <= f.first && o.last >= f.last))); if (by) repl.set(f.fid, by); }
  const kept = old.filter((f) => !repl.has(f.fid));
  const what = (o) => { const gone = old.filter((f) => repl.get(f.fid) === o), oldMax = old.filter((f) => f.kind === o.kind && !repl.has(f.fid)).map((f) => f.last || '').sort().pop() || '';
    if (gone.length) return 'replaces ' + gone.map((f) => (f.first ? span(f.first, f.last) : esc(f.name))).join(', ') + (o.first ? ' · now ' + span(o.first, o.last) : '');
    if (o.first && oldMax && o.last > oldMax) return 'adds ' + span(o.first > oldMax ? o.first : ymNext(oldMax), o.last);
    return o.first ? 'adds ' + span(o.first, o.last) + ' (a line in both counts once)' : 'added'; };
  const wrong = good.filter((o) => o.proj && o.proj !== META.project), noCji = !kept.concat(good).some((f) => f.kind === 'cji3');
  R.upd = { good, kept, repl, last };
  updBox(`<h3>Update the register with ${good.length} new file${good.length === 1 ? '' : 's'}</h3><div class="sub">${esc(DBF.name)} · last build cut ${esc((dbBuilds()[0] || {}).cut || '')}</div>
    <ul>${good.map((o) => `<li><b>${UPD_NAME[o.kind]}</b><span class="n" dir="auto">${esc(o.name)}${o.proj && o.proj !== META.project ? ` <span class="bad">· project ${esc(o.proj)}</span>` : ''}</span><span class="d">${what(o)}</span></li>`).join('')}
      ${bad.map((o) => `<li><b class="bad">?</b><span class="n">${esc(o.name)}</span><span class="d bad">not a SAP file the Tool reads – left out</span></li>`).join('')}</ul>
    <div class="k">${kept.length ? 'Kept from the data file: ' + kept.map((f) => `${UPD_NAME[f.kind] || f.kind}${f.first ? ' ' + span(f.first, f.last) : ''}`).join(' · ') + ' · your codes' : 'No SAP files in the data file yet (built before v3.4) – drop every file once; your codes come from the data file.'}</div>
    ${wrong.length ? `<div class="k bad">${wrong.length} file${wrong.length > 1 ? 's are' : ' is'} another project than ${esc(META.project)} – remove ${wrong.length > 1 ? 'them' : 'it'}, or Update anyway.</div>` : ''}
    ${noCji ? '<div class="k bad">A CJI3 is needed – none in the data file or in the new files.</div>' : ''}
    <div class="bt"><button data-upd="x">Cancel</button><button class="pri" data-upd="go"${good.length && !noCji ? '' : ' disabled'}>Update</button></div>`); }
const ymNext = (ym) => { let [y, m] = ym.split('-').map(Number); if (++m > 12) { m = 1; y++; } return y + '-' + String(m).padStart(2, '0'); };
async function updGo() { const U = R.upd; if (!U) return; updBox('<h3>Updating the register…</h3><div class="sub">about 20–30 seconds · the old build stays in the data file</div>'); await new Promise((r) => setTimeout(r, 60));
  try { await dbSave();   // your latest codes go with the update
    const files = {}, put = (k, f) => (files[k] || (files[k] = [])).push(f);
    U.kept.forEach((f) => put(f.kind, { name: f.name, data: dbFileData(f.fid) })); U.good.forEach((o) => put(o.kind, o));
    files.prev = { name: 'codes from ' + DBF.name + '.json', data: new TextEncoder().encode(JSON.stringify(snapshot())) };
    const data = Engine.build(files, {}), id = await dbAddBuild(data, '__VER__'), cov = new Map(((data.META.dlog || {}).files || []).map((f) => [f.name, f]));
    await dbStoreFiles(id, [...U.kept.map((f) => ({ fid: f.fid, role: 'kept' })), ...U.good.map((o) => ({ ...o, role: 'new', first: o.first || (cov.get(o.name) || {}).first, last: o.last || (cov.get(o.name) || {}).last })), ...[...U.repl.keys()].map((fid) => ({ fid, role: 'replaced' }))]);
    dbLog('update', `${U.good.length} new file(s): ${U.good.map((o) => o.name).join(', ')} · ${U.repl.size} replaced · cut ${data.META.cut}`, id);
    const okW = await dbWrite(); try { await idbSet('dbCache', { name: DBF.name, id, data }); } catch (e) { /* none */ } if (!okW) dbDownload();
    sessionStorage.setItem('crOpen', ''); location.reload(); }
  catch (e) { console.error(e); updBox(`<h3>Could not update</h3><div class="sub bad">${esc(String(e.message || e))}</div><div class="bt"><button data-upd="x">Close</button></div>`); } }
document.addEventListener('click', (e) => { const b = e.target.closest('[data-upd]'); if (!b) return; const k = b.dataset.upd; if (k === 'x') { updClose(); R.upd = null; } else if (k === 'go') updGo(); else if (k === 'mk') { updClose(); asPick(); } });
// drop SAP files anywhere on the register (the start page has its own drop box)
document.addEventListener('dragover', (e) => { if ($('start').style.display !== 'none' || !e.dataTransfer || ![...e.dataTransfer.types].includes('Files')) return; e.preventDefault(); document.body.classList.add('dropping'); });
document.addEventListener('dragleave', (e) => { if (!e.relatedTarget) document.body.classList.remove('dropping'); });
document.addEventListener('drop', (e) => { if ($('start').style.display !== 'none' || !e.dataTransfer || !e.dataTransfer.files.length) return; e.preventDefault(); document.body.classList.remove('dropping'); updStart(e.dataTransfer.files); });
$('bAdd').onclick = () => { const i = document.createElement('input'); i.type = 'file'; i.multiple = true; i.accept = '.xlsx,.xls,.xlsm'; i.onchange = () => updStart(i.files); i.click(); };
globalThis.__UPD = { start: updStart };   // for the checks
