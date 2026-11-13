// =====================================================================================  Check › Data log + saving to the data file (SQLite .db)
// The log of this build comes with the build (META.dlog). The data file adds the earlier builds: what changed since the last one.
const DLSRC = { cji3: 'CJI3', zscprg01: 'ZSCPRG01', zscsrv1: 'ZSCSRV1', zintc1: 'ZINTC1', mb52: 'MB52', me2n: 'ME2N', prev: 'Last report' };
const DLWHAT = { cji3: 'actual cost line items', zscprg01: 'subcontract certificates', zscsrv1: 'PO services', zintc1: 'order charges (equipment, fuel, fleet, house rent)', mb52: 'stock – material groups', me2n: 'purchase orders – material groups', prev: 'your codes of last month' };
const ymLbl = (ym) => (ym ? MON[+ym.slice(5, 7) - 1] + '-' + ym.slice(2, 4) : '');
const latestId = () => { const r = DBF.db && dbOne('SELECT max(id) AS id FROM builds'); return r ? r.id : 0; };
// codes into the data file: the codes of this build (JSON, as the Save file) and, for the latest build, the codes as tables for SQL
async function dbSave() { if (!DBF.db || DBF.ro) return; if (DBF.busy) { DBF.again = true; return DBF.busy; } let done; DBF.busy = new Promise((r) => { done = r; });
  try { const s = snapshot(); DBF.db.run('BEGIN'); DBF.db.run('UPDATE builds SET codes = ?, codes_at = ? WHERE id = ?', [JSON.stringify(s), s.at, DBF.cur]);
    if (DBF.cur === latestId()) { DBF.db.run('DELETE FROM codes'); const st = DBF.db.prepare('INSERT INTO codes VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
      BK.forEach((b) => b.items.forEach((it) => st.run([b.id, it.k, itemCode(it), itemDesc(it), it.div || '', it.pkg || '', it.mnl || '', it.ce || '']))); st.free();
      DBF.db.run('DELETE FROM line_codes'); const so = DBF.db.prepare('INSERT INTO line_codes VALUES (?, ?, ?, ?)'); Object.entries(OVR).forEach(([id, o]) => { if (o && (o.pkg || o.mnl || o.ce)) so.run([id, o.pkg || null, o.mnl || null, o.ce || null]); }); so.free(); }
    DBF.db.run('COMMIT'); } catch (e) { try { DBF.db.run('ROLLBACK'); } catch (x) { /* none */ } console.error(e); }
  if (await dbWrite()) setDirty(0); DBF.busy = false; done(); if (DBF.again) { DBF.again = false; return dbSave(); } renderStatus(); navBadges(); }   // a change made while saving is saved right after
// the lines of this build (the latest) as a table, and what changed in closed months against the build before
function dbFillLines() { if (!DBF.db || DBF.ro || DBF.cur !== latestId() || dbOne('SELECT 1 AS x FROM lines WHERE build_id = ? LIMIT 1', [DBF.cur])) return;
  const prev = dbOne('SELECT DISTINCT l.build_id AS id, b.cut FROM lines l JOIN builds b ON b.id = l.build_id WHERE l.build_id < ? ORDER BY l.build_id DESC LIMIT 1', [DBF.cur]);
  const ds = (d) => (d ? String(d).replace(/^(\d{4})(\d\d)(\d\d)$/, '$1-$2-$3') : '');
  DBF.db.run('BEGIN');
  if (prev) { const pm = new Map(); dbRows('SELECT line_id, month, amount, source FROM lines WHERE build_id = ?', [prev.id]).forEach((r) => pm.set(r.line_id, r)); const pc = String(prev.cut).slice(0, 7), seen = new Set();
    const ch = DBF.db.prepare('INSERT INTO changes VALUES (?, ?, ?, ?, ?, ?)');
    for (let i = 0; i < N; i++) { const id = String(L.id[i]), ym = ds(L.d[i]).slice(0, 7); if (!ym || ym > pc) continue; const o = pm.get(id), src = S[L.src[i]] || 'CJI3'; seen.add(id);
      if (!o) ch.run([DBF.cur, src, 'new in a closed month', ym, id, r2(L.amt[i])]); else if (Math.abs(o.amount - L.amt[i]) >= 0.01) ch.run([DBF.cur, src, 'amount changed', ym, id, r2(L.amt[i] - o.amount)]); }
    for (const [id, o] of pm) if (o.month && o.month <= pc && !seen.has(id)) ch.run([DBF.cur, o.source, 'gone', o.month, id, -o.amount]);
    ch.free(); }
  DBF.db.run('DELETE FROM lines');   // the lines table holds the latest build; older builds stay complete in builds.data
  const st = DBF.db.prepare('INSERT INTO lines VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  for (let i = 0; i < N; i++) { const it = BK[L.b[i]].items[L.it[i]], d = ds(L.d[i]); st.run([DBF.cur, String(L.id[i]), d, d.slice(0, 7), BK[L.b[i]].id, it.k, itemCode(it), S[L.desc[i]] || itemDesc(it), S[L.ce[i]], S[L.cen[i]], L.amt[i], L.qty[i], S[L.wbs[i]], S[L.po[i]], S[L.ty[i]], S[L.src[i]] || 'CJI3']); }
  st.free(); DBF.db.run('COMMIT'); }
// the Tool opens from the data file: codes of this build (when newer than this browser), lines table, status
function dbStart() { AS.ready = true;
  const c = dbCodes(DBF.cur);   // newer than what this browser had before opening (the automatic first-time changes do not count)
  if (c && c.codes && (DBF.ro || !AS.locAt || (c.at || '') > AS.locAt)) { applySnap(c, true); undo = []; redo = []; if (!DBF.ro) persist(); compute(); }
  try { dbFillLines(); } catch (e) { console.error(e); }
  if (!DBF.ro && !dbOne('SELECT codes FROM builds WHERE id = ? AND codes IS NOT NULL', [DBF.cur])) dbSave(); else dbWrite().then(() => renderStatus());
  render(); }
document.addEventListener('click', (e) => { const g = e.target.closest('[data-dbgo]'); if (!g) return; const k = g.dataset.dbgo;
  if (k === 'dl') { dbDownload(); setDirty(0); renderStatus(); return; }
  if (k === 'latest' || k === 'open') { sessionStorage.setItem('crOpen', k === 'open' ? g.dataset.id : ''); location.reload(); return; }
  if (k === 'more') { const t = g.closest('.dlcard').querySelector('.dlmore'); if (t) t.hidden = !t.hidden; } });

function renderDlog() {
  const D = META.dlog || { files: [], cov: {}, ovl: [] }, el = $('dlog'), cutYm = String(ST.cut).slice(0, 7);
  const tag = (c) => `<span class="dtg ${/^Cumulative/.test(c) ? 'cum' : /^Fiscal/.test(c) ? 'fy' : /^One month/.test(c) ? 'mon' : 'snap'}">${esc(c)}</span>`;
  const covers = (f) => (f.src === 'zscprg01' ? `${ymLbl(f.first)} – ${ymLbl(f.last)} · ${fmt(f.pos)} POs · ${fmt(f.certs)} certificates` : f.first ? `${ymLbl(f.first)} – ${ymLbl(f.last)}` : f.src === 'prev' ? '' : 'as of the download');
  const ovOf = (f) => (D.ovl || []).filter((o) => o.src === f.src && (o.a === f.name || String(o.b).includes(f.name)));
  const chk = (f) => { const o = ovOf(f); if (o.length) return `<span class="bad" title="${esc(o.map((x) => `${ymLbl(x.from)}${x.to !== x.from ? '–' + ymLbl(x.to) : ''}: ${x.rule}`).join('\n'))}">⚠ overlap ${o.map((x) => ymLbl(x.from) + (x.to !== x.from ? '–' + ymLbl(x.to) : '')).join(', ')} · ${esc(o[0].rule)}</span>`;
    if (f.note) return `<span class="help">${esc(f.note)}</span>`; if (f.last && f.last > cutYm && f.src !== 'zscprg01') return `<span class="help">${ymLbl(f.last)} after the cut</span>`; return '<span class="ok">✓</span>'; };
  const rows = D.files.map((f) => `<tr><td class="src">${DLSRC[f.src] || esc(f.src)}</td><td dir="auto">${esc(f.name)}</td><td>${covers(f)}</td><td>${tag(f.cut)}</td><td class="n">${f.rows == null ? '–' : fmt(f.rows)}</td><td class="n">${f.used == null ? '–' : fmt(f.used)}</td><td class="n">${f.amt == null ? '–' : fmt(f.amt)}</td><td class="mg">${esc(f.merge)}</td><td>${chk(f)}</td></tr>`);
  const have = new Set(D.files.map((f) => f.src)); ['zscprg01', 'zscsrv1', 'zintc1', 'mb52', 'me2n', 'prev'].filter((k) => !have.has(k)).forEach((k) => rows.push(`<tr class="nl"><td class="src">${DLSRC[k]}</td><td>not loaded</td><td colspan="6" class="help">${DLWHAT[k]}</td><td class="help">optional</td></tr>`));
  const ok = Math.abs(R.diff) < 0.01;
  let h = `<div class="dlcard"><div class="dlh"><h3>This build – ${esc(META.built)}</h3><span class="help">which file gave what · how each source is cut and merged</span><span class="sp"></span><b class="${ok ? 'ok' : 'bad'}">Difference to CJI3: ${ok ? '0.00' : fmt2(R.diff)}</b></div>
    <table class="dlt"><tr><th>Source</th><th>File</th><th>Covers</th><th>Cut type (found)</th><th class="n">Rows</th><th class="n">Used</th><th class="n">Amount</th><th>How it is merged</th><th>Check</th></tr>${rows.join('')}</table></div>`;
  // coverage by month
  const srcs = ['cji3', 'zscprg01', 'zintc1'].filter((k) => D.cov && D.cov[k] && Object.keys(D.cov[k]).length);
  if (srcs.length) { const all = srcs.flatMap((k) => Object.keys(D.cov[k])).sort(), months = []; let [y, m] = all[0].split('-').map(Number); const z = all[all.length - 1];
    for (let g = 0; g < 120; g++) { const ym = y + '-' + String(m).padStart(2, '0'); months.push(ym); if (ym >= z) break; if (++m > 12) { m = 1; y++; } }
    const COL = ['#5B8BD9', '#C9A227', '#9A7BD0', '#2A9D8F', '#E07A5F', '#6D7B8D'], fl = (k) => D.files.filter((f) => f.src === k);
    const lab = (k, i) => { const f = fl(k)[i]; return f && /^Fiscal year (\d{4})/.test(f.cut) ? f.cut.slice(-4) : String(i + 1); };
    const cell = (k, ym) => { const c = D.cov[k][ym], cut = ym === cutYm ? ' cut' : '';
      if (!c) return `<td><div class="cl x${cut}">–</div></td>`;
      if (k === 'zscprg01') return `<td><div class="cl b${cut}" title="${c.n} certificates dated ${ymLbl(ym)} · ${fmt(c.amt)}">${c.n}</div></td>`;
      if (c.f.length > 1) return `<td><div class="cl ov${cut}" title="${esc(c.f.map((i) => fl(k)[i].name).join(' + '))}">${c.f.map((i) => lab(k, i)).join('+')}</div></td>`;
      const i = c.f[0]; return `<td><div class="cl${cut}" style="background:${COL[(k === 'zintc1' ? 1 + i : i) % COL.length]}" title="${esc(fl(k)[i].name)} · ${fmt(c.n)} lines · ${fmt(c.amt)}">${lab(k, i)}</div></td>`; };
    const lg = [...srcs.filter((k) => k !== 'zscprg01').flatMap((k) => fl(k).map((f, i) => `<span><i style="background:${COL[(k === 'zintc1' ? 1 + i : i) % COL.length]}"></i>${DLSRC[k]} ${lab(k, i)} = ${esc(f.name)}</span>`)),
      ...(srcs.includes('zscprg01') ? ['<span><i style="background:#7FB069"></i>ZSCPRG01: number = certificates dated in that month, all POs (each PO has its own serial 1, 2, 3 …)</span>'] : []), '<span><i style="background:#B42318"></i>two files for the same month</span>', '<span><i style="background:#E5E7EB"></i>no data</span>'];
    h += `<div class="dlcard"><div class="dlh"><h3>Coverage by month</h3><span class="help">each box = the file that gave that month · red = two files for the same month · grey = missing · gold line = cut month</span></div>
      <div class="dlsc"><table class="dlcov"><tr><td></td>${months.map((ym) => `<td class="help${ym === cutYm ? ' cm' : ''}">${ymLbl(ym)}${ym === cutYm ? ' ▼' : ''}</td>`).join('')}</tr>
      ${srcs.map((k) => `<tr><td class="src">${DLSRC[k]}</td>${months.map((ym) => cell(k, ym)).join('')}</tr>`).join('')}</table></div><div class="dlg">${lg.join('')}</div></div>`; }
  // against the last build (data file only)
  const prev = DBF.db ? dbOne('SELECT id, built, cut FROM builds WHERE id < ? ORDER BY id DESC LIMIT 1', [DBF.cur]) : null;
  if (!DBF.db) h += `<div class="dlcard"><div class="dlh"><h3>Against the last build</h3></div><div class="dln">No data file yet – the earlier builds are kept in a data file on your computer. <a class="lk" data-asgo="pick">Create the data file</a> and next month this card shows what changed since this build.</div></div>`;
  else if (!prev) h += `<div class="dlcard"><div class="dlh"><h3>Against the last build</h3><span class="help">${esc(DBF.name)}</span></div><div class="dln">This is the first build in the data file – next month this card shows what changed since this build.</div></div>`;
  else { const pc = String(prev.cut).slice(0, 7), sum = (id, src, w) => (dbOne(`SELECT coalesce(sum(amount), 0) AS a, coalesce(sum(n), 0) AS n FROM coverage WHERE build_id = ? AND source = ?${w || ''}`, w ? [id, src, pc] : [id, src]) || { a: 0, n: 0 });
    const ln = []; const add = (src, a, b, nw, closed, note) => ln.push(`<tr><td class="src">${src}</td><td class="n">${a}</td><td class="n">${b}</td><td class="n">${nw}</td><td class="n ${closed && closed !== '0' ? 'bad' : 'ok'}">${closed || '0'}</td><td>${note}</td></tr>`);
    const chg = dbRows('SELECT source, kind, month, line_id, amount FROM changes WHERE build_id = ? ORDER BY abs(amount) DESC', [DBF.cur]);
    ['cji3', 'zintc1'].forEach((k) => { const a = sum(prev.id, k).a, b = sum(DBF.cur, k).a; if (!a && !b) return; const ca = sum(prev.id, k, ' AND month <= ?').a, cb = sum(DBF.cur, k, ' AND month <= ?').a, d = r2(cb - ca);
      add(DLSRC[k], fmt(a), fmt(b), fmt(b - cb), Math.abs(d) >= 1 ? fmt(d) : '0', Math.abs(d) >= 1 ? `<span class="bad">⚠ closed months changed${k === 'cji3' && chg.length ? ` – ${chg.length} lines` : ''}</span>` : '<span class="ok">✓ closed months unchanged</span>'); });
    const cp = dbRows('SELECT po, serial, amount FROM certificates WHERE build_id = ?', [prev.id]), cn = dbRows('SELECT po, serial, amount, cert_date FROM certificates WHERE build_id = ?', [DBF.cur]);
    if (cp.length || cn.length) { const pm = new Map(cp.map((c) => [c.po + '|' + c.serial, c.amount])), rev = cn.filter((c) => pm.has(c.po + '|' + c.serial) && Math.abs(pm.get(c.po + '|' + c.serial) - c.amount) >= 1), nw = cn.filter((c) => !pm.has(c.po + '|' + c.serial));
      add('ZSCPRG01', fmt(cp.length) + ' certificates', fmt(cn.length) + ' certificates', '+' + nw.length, rev.length ? rev.length + ' revised' : '0', rev.length ? `<span class="bad">⚠ ${rev.slice(0, 3).map((c) => `PO ${esc(c.po)} certificate ${esc(c.serial)}`).join(', ')}${rev.length > 3 ? ' …' : ''} changed</span>` : '<span class="ok">✓ no certificate changed</span>'); }
    h += `<div class="dlcard"><div class="dlh"><h3>Against the last build</h3><span class="help">${esc(prev.built)} · cut ${esc(prev.cut)} – from ${esc(DBF.name)}</span><span class="sp"></span><button data-dbgo="open" data-id="${prev.id}">Open that build (read only)</button></div>
      <table class="dlt"><tr><th>Source</th><th class="n">Last build</th><th class="n">This build</th><th class="n">New months (after ${ymLbl(pc)})</th><th class="n">Earlier months changed</th><th>Note</th></tr>${ln.join('')}</table>
      <div class="dln">Cumulative sources: the month = this build − last build. A change in a closed month is shown, never hidden.${chg.length ? ` <a class="lk" data-dbgo="more">Show the ${chg.length} lines ›</a>` : ''}</div>
      ${chg.length ? `<div class="dlmore" hidden><table class="dlt"><tr><th>Source</th><th>What</th><th>Month</th><th>Line</th><th class="n">Amount</th></tr>${chg.slice(0, 300).map((c) => `<tr><td>${esc(c.source)}</td><td>${esc(c.kind)}</td><td>${ymLbl(c.month)}</td><td>${esc(c.line_id)}</td><td class="n">${fmt2(c.amount)}</td></tr>`).join('')}</table></div>` : ''}</div>`; }
  // builds in the data file
  if (DBF.db) { const bs = dbBuilds();
    h += `<div class="dlcard"><div class="dlh"><h3>Builds in the data file</h3><span class="help">${esc(DBF.name)} keeps every build, your codes and this log – open it in DB Browser for SQLite or Power BI (view <b>expenses</b>)</span></div>
      <table class="dlt"><tr><th>Built</th><th>Cut</th><th>Project</th><th class="n">Files</th><th class="n">CJI3 cost</th><th>Codes saved</th><th>Tool</th><th></th></tr>${bs.map((b) => `<tr${b.id === DBF.cur ? ' class="cur"' : ''}><td>${esc(b.built)}${b.id === DBF.cur ? ' · <b>open now</b>' : ''}</td><td>${esc(b.cut)}</td><td>${esc(b.project)}</td><td class="n">${b.files}</td><td class="n">${fmt(b.cji3_cost)}</td><td>${b.codes_at ? esc(new Date(b.codes_at).toLocaleString()) : '–'}</td><td>${esc(b.app || '')}</td>
        <td>${b.id === DBF.cur ? '' : b.id === bs[0].id ? '<button data-dbgo="latest">Open (latest)</button>' : `<button data-dbgo="open" data-id="${b.id}">Open (read only)</button>`}</td></tr>`).join('')}</table></div>`; }
  el.innerHTML = h;
}
globalThis.__DL = { fill: dbFillLines, save: dbSave, render: renderDlog, data: DATA };   // for the checks (test/run.js)
