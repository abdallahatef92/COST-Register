/* Cost Register - page code: folder access, screens, the Store (the only door to the database worker). */
'use strict';
(() => {
  const R = window.CRR;
  const $ = (sel, el) => (el || document).querySelector(sel);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const q = (s) => '"' + String(s).replace(/"/g, '""') + '"';
  const b64 = (s) => Uint8Array.from(atob(s.trim()), (c) => c.charCodeAt(0));
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const ymLabel = (ym) => (ym ? MON[+ym.slice(5, 7) - 1] + '-' + ym.slice(2, 4) : '');
  const money = (n) => (n == null || isNaN(n) ? '' : Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  const short = (n) => { const a = Math.abs(n); return a >= 1e6 ? (n / 1e6).toFixed(2) + ' M' : a >= 1e3 ? (n / 1e3).toFixed(1) + ' K' : Number(n).toFixed(0); };
  const count = (n) => Number(n || 0).toLocaleString('en-US');
  const bytes = (n) => (n >= 1e6 ? (n / 1e6).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1e3)) + ' KB');
  const stamp = (ms) => { const d = new Date(ms); return d.toLocaleDateString('en-GB') + ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }); };
  const ls = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage blocked */ } } };

  // ================================================================== Store: the only module that talks to the database
  const Store = (() => {
    let worker = null, seq = 0; const pending = new Map();
    const call = (op, args, transfer, onProgress) => new Promise((res, rej) => {
      const id = ++seq; pending.set(id, { res, rej, onProgress });
      worker.postMessage({ id, op, args }, transfer || []);
    });
    return {
      start() {
        const src = new TextDecoder().decode(b64($('#worker-b64').textContent));
        worker = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
        worker.onmessage = (e) => {
          const m = e.data, p = pending.get(m.id);
          if (!p) return;
          if (m.type === 'progress') { if (p.onProgress) p.onProgress(m); return; }
          pending.delete(m.id);
          if (m.ok) p.res(m.result); else p.rej(new Error(m.error));
        };
        worker.onerror = (ev) => { for (const p of pending.values()) p.rej(new Error('The worker stopped: ' + (ev.message || 'unknown error'))); pending.clear(); };
        return call('init', { wasm: b64($('#wasm-b64').textContent) });
      },
      open: (buf) => call('open', { bytes: buf || null }, buf ? [buf] : []),
      summary: () => call('summary'),
      detect: (buf) => call('detect', { buf }, [buf]),
      upsert: (info, onProgress) => call('importFile', info, [info.buf], onProgress),     // key-based load of one report file (mode comes from its definition)
      noteFile: (info) => call('noteFile', info),
      query: (sql, params) => call('query', { sql, params }),
      ids: (a) => call('ids', a),
      rows: (a) => call('rows', a),
      rulesList: () => call('rulesList'),
      rulesSave: (rules) => call('rulesSave', { rules }),
      rulesReset: () => call('rulesReset'),
      exportXlsx: (sheets) => call('exportXlsx', { sheets }),
      async save() { const r = await call('exportDb'); await FS.write(S.dir, 'cost.db', new Uint8Array(r.bytes)); },
    };
  })();

  // ================================================================== FS: the project folder (File System Access API)
  const FS = {
    idb: () => new Promise((res, rej) => { const r = indexedDB.open('cost-register', 1); r.onupgradeneeded = () => r.result.createObjectStore('handles'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }),
    async saved() {
      try { const d = await FS.idb(); return await new Promise((res) => { const t = d.transaction('handles').objectStore('handles').get('last'); t.onsuccess = () => res(t.result || null); t.onerror = () => res(null); }); } catch (e) { return null; }
    },
    async remember(handle) {
      try { const d = await FS.idb(); await new Promise((res) => { const t = d.transaction('handles', 'readwrite').objectStore('handles').put({ handle, name: handle.name, at: Date.now() }, 'last'); t.onsuccess = t.onerror = () => res(); }); } catch (e) { /* not essential */ }
    },
    async permission(handle, ask) {
      const o = { mode: 'readwrite' };
      if ((await handle.queryPermission(o)) === 'granted') return true;
      return ask ? (await handle.requestPermission(o)) === 'granted' : false;
    },
    async list(dir, base) {
      base = base || ''; const out = [];
      for await (const [name, h] of dir.entries()) {
        if (h.kind === 'directory') { if (name.toLowerCase() === 'output' || name.startsWith('.')) continue; out.push(...(await FS.list(h, base + name + '/'))); }
        else if (/\.xlsx$/i.test(name) && !name.startsWith('~$')) { const f = await h.getFile(); out.push({ path: base + name, name, handle: h, size: f.size, modified: f.lastModified }); }
      }
      return out.sort((a, b) => a.path.localeCompare(b.path));
    },
    async readDb(dir) {
      try { const f = await (await dir.getFileHandle('cost.db')).getFile(); return f.size ? await f.arrayBuffer() : null; }
      catch (e) { if (e.name === 'NotFoundError') return null; throw e; }
    },
    async write(dir, name, data) {
      const w = await (await dir.getFileHandle(name, { create: true })).createWritable();
      try { await w.write(data); } finally { await w.close(); }
    },
    output: (dir) => dir.getDirectoryHandle('Output', { create: true }),
  };

  // ================================================================== state
  const S = { screen: 'connect', dir: null, dirName: '', saved: null, summary: null, items: [], busy: null, error: null, log: null, tab: 'overview', ready: false };
  const view = $('#view'), topbar = $('#top');
  const rid = (id) => R.byId[id];

  function setBusy(text, pct) {
    S.busy = text ? { text, pct: pct == null ? null : pct } : null;
    const el = $('#busy'); if (!el) return;
    el.classList.toggle('hidden', !S.busy);
    if (S.busy) { $('#busy-text', el).textContent = S.busy.text; const bar = $('.progress', el); bar.classList.toggle('indet', S.busy.pct == null); $('i', bar).style.width = S.busy.pct == null ? '' : S.busy.pct + '%'; }
  }
  const busyBox = () => `<div id="busy" class="notice ${S.busy ? '' : 'hidden'}" role="status" aria-live="polite"><div id="busy-text">${esc(S.busy ? S.busy.text : '')}</div><div class="progress ${S.busy && S.busy.pct != null ? '' : 'indet'}"><i></i></div></div>`;
  const fail = (e) => { console.error(e); S.error = String((e && e.message) || e); setBusy(null); render(); };

  // ================================================================== top bar + routing
  function renderTop() {
    const code = S.summary && S.summary.meta.project_code;
    const last = S.summary && S.summary.meta.last_import_at;
    topbar.innerHTML = `<span class="brand">Cost register</span>` + (S.dir ? `
      <span class="proj"><strong>${esc(S.dirName)}</strong><span class="muted small">${code ? 'Project ' + esc(code) + ' - ' : ''}${last ? 'last import ' + esc(stamp(Date.parse(last))) : 'nothing imported yet'}</span></span>
      <span class="spacer"></span>
      <button data-act="go-scan" ${S.screen === 'scan' ? 'disabled' : ''}>Files</button>
      <button data-act="go-ws" ${S.screen === 'workspace' || !hasData() ? 'disabled' : ''}>Workspace</button>
      <button data-act="go-connect">Change folder</button>` : '');
  }
  const hasData = () => !!(S.summary && Object.values(S.summary.tables).some((t) => t.rows > 0));

  function render() {
    renderTop();
    if (!('showDirectoryPicker' in window)) { view.innerHTML = `<div class="card"><h2>This browser cannot open project folders</h2><p>Cost register needs the File System Access API. Open this file in Chrome or Edge on a desktop computer (Firefox and Safari do not support it).</p></div>`; return; }
    if (!S.ready) { view.innerHTML = `<div class="card"><div class="skeleton">Starting the database engine...</div></div>`; return; }
    if (S.screen === 'connect') renderConnect();
    else if (S.screen === 'scan') renderScan();
    else renderWorkspace();
  }

  // ================================================================== screen 1: connect
  function renderConnect() {
    view.innerHTML = `
      <div class="card"><h2>Connect a project folder</h2>
        <p class="muted">One folder per project. Its name is the project name. The tool keeps <strong>cost.db</strong> and an <strong>Output</strong> folder inside it and never changes your SAP files.</p>
        <div class="row" style="margin-top:12px">
          <button class="primary" data-act="connect">Connect folder</button>
          ${S.saved ? `<button data-act="reconnect">Reconnect to ${esc(S.saved.name)}</button><span class="muted small">last opened ${esc(stamp(S.saved.at))}</span>` : ''}
        </div>
        <div class="notice">Choose the project's own folder (for example <em>Documents/SUTH</em>), not Desktop, Documents or Downloads: the browser blocks those top-level folders. Your data stays on this computer.</div>
        ${S.error ? `<div class="notice bad" role="alert">${esc(S.error)}</div>` : ''}
        ${busyBox()}
      </div>`;
  }

  async function connect() {
    S.error = null;
    let dir;
    try { dir = await window.showDirectoryPicker({ id: 'cost-register', mode: 'readwrite' }); }
    catch (e) {
      if (e.name === 'AbortError') return;
      return fail(new Error(e.name === 'SecurityError' ? 'The browser does not allow that folder. Pick a project subfolder instead of Desktop, Documents or Downloads.' : e.message));
    }
    await useFolder(dir);
  }
  async function reconnect() {
    S.error = null;
    try { if (!(await FS.permission(S.saved.handle, true))) return fail(new Error('Access to the folder was not granted.')); } catch (e) { return fail(new Error('The saved folder is no longer available. Connect it again.')); }
    await useFolder(S.saved.handle);
  }
  async function useFolder(dir) {
    try {
      S.dir = dir; S.dirName = dir.name; S.screen = 'scan'; S.log = null; S.items = []; render();
      await FS.remember(dir); S.saved = await FS.saved();
      setBusy('Opening cost.db ...');
      S.summary = await Store.open(await FS.readDb(dir));
      await scanFolder();
    } catch (e) { S.dir = null; S.screen = 'connect'; fail(e); }
  }

  // ================================================================== screen 2: scan + import
  const STATUS = { new: 'New', changed: 'Changed', unchanged: 'Unchanged', unrecognized: 'Unrecognized', other_project: 'Other project', error: 'Error' };
  const isImportable = (it) => it.status === 'new' || it.status === 'changed';

  async function scanFolder() {
    setBusy('Looking for .xlsx files ...');
    const found = await FS.list(S.dir);
    const known = new Map(S.summary.files.map((f) => [f.path, f]));
    const items = [];
    let k = 0;
    for (const f of found) {
      k++;
      const rec = known.get(f.path);
      const it = { path: f.path, name: f.name, handle: f.handle, size: f.size, modified: f.modified, reportId: null, project: '', status: 'new', note: '' };
      if (rec && rec.size === f.size && rec.modified === f.modified && ['imported', 'unrecognized', 'other_project'].includes(rec.status)) {
        it.reportId = rec.report_id; it.project = rec.project_code || ''; it.status = rec.status === 'imported' ? 'unchanged' : rec.status;
        if (rec.status === 'other_project') it.status = 'new';     // re-judged below against the expected project
        it.note = rec.note || '';
      } else {
        setBusy(`Reading file ${k} of ${found.length}: ${f.name}`, Math.round((k / found.length) * 100));
        try {
          const d = await Store.detect(await (await f.handle.getFile()).arrayBuffer());
          it.reportId = d.reportId; it.project = d.project || '';
          it.status = d.reportId ? (rec && rec.status === 'imported' ? 'changed' : 'new') : 'unrecognized';
          if (!d.reportId) it.note = 'The header row matches no known report';
        } catch (e) { it.status = 'error'; it.note = e.message; }
      }
      items.push(it);
    }
    // the project this folder is about: the database's, else the one named in the folder name, else the most common among the files
    let expected = S.summary.meta.project_code || '';
    const tally = new Map(); for (const it of items) if (it.reportId && it.project) tally.set(it.project, (tally.get(it.project) || 0) + 1);
    if (!expected) { for (const c of tally.keys()) if (S.dirName.toUpperCase().includes(c)) expected = c; }
    if (!expected && tally.size) expected = [...tally.entries()].sort((a, b) => b[1] - a[1])[0][0];
    S.expected = expected;
    for (const it of items) {
      if (it.reportId && it.project && expected && it.project !== expected && it.status !== 'unchanged') { it.status = 'other_project'; it.note = `Project ${it.project}, but this folder is project ${expected}`; }
      const rec = known.get(it.path);
      if ((it.status === 'unrecognized' || it.status === 'other_project') && (!rec || rec.status !== it.status)) await Store.noteFile({ path: it.path, size: it.size, modified: it.modified, reportId: it.reportId, status: it.status, note: it.note, project: it.project });
    }
    S.items = items; setBusy(null); render();
  }

  function renderScan() {
    const imp = S.items.filter(isImportable);
    const rows = S.items.map((it) => `<tr>
      <td>${esc(it.path)}<div class="muted small">${esc(it.note)}</div></td>
      <td>${it.reportId ? esc(rid(it.reportId).short) : '<span class="muted">-</span>'}</td>
      <td>${esc(it.project) || '<span class="muted">-</span>'}</td>
      <td class="num">${bytes(it.size)}</td><td>${esc(stamp(it.modified))}</td>
      <td><span class="badge ${it.status}">${STATUS[it.status]}</span></td></tr>`).join('');
    view.innerHTML = `
      <div class="card"><h2>Files in ${esc(S.dirName)}</h2>
        <p class="muted">Every .xlsx in the folder (and its subfolders, except <em>Output</em>) is recognised from its header row, never from its name. Nothing is imported until you press the button.</p>
        ${S.error ? `<div class="notice bad" role="alert">${esc(S.error)}</div>` : ''}
        ${busyBox()}
        ${S.items.length ? `<div class="scroll-x" style="margin-top:12px"><table class="t"><thead><tr><th>File</th><th>Report</th><th>Project</th><th class="num">Size</th><th>Modified</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table></div>`
          : (S.busy ? '' : '<div class="empty">No .xlsx files found in this folder.</div>')}
        <div class="row" style="margin-top:14px">
          <button class="primary" data-act="import" ${imp.length && !S.busy ? '' : 'disabled'}>Import ${imp.length} file${imp.length === 1 ? '' : 's'}</button>
          <button data-act="rescan" ${S.busy ? 'disabled' : ''}>Scan again</button>
          ${hasData() ? '<button data-act="go-ws">Open workspace</button>' : ''}
        </div>
      </div>${S.log ? renderLog(S.log) : ''}`;
  }

  async function runImport() {
    const todo = S.items.filter(isImportable).sort((a, b) => (a.reportId === 'cji3' ? -1 : 0) - (b.reportId === 'cji3' ? -1 : 0) || a.path.localeCompare(b.path));
    const log = { added: 0, updatedFiles: 0, skipped: S.items.length - todo.length, inserted: 0, updated: 0, replaced: 0, rejected: 0, results: [] };
    S.error = null; S.log = null; setBusy('Starting import ...'); render();
    try {
      for (let i = 0; i < todo.length; i++) {
        const it = todo[i], base = Math.round((i / todo.length) * 100);
        setBusy(`File ${i + 1} of ${todo.length}: reading ${it.name}`, base);
        try {
          const file = await it.handle.getFile(), buf = await file.arrayBuffer();
          const res = await Store.upsert({ name: it.name, path: it.path, buf, size: file.size, modified: file.lastModified },
            (m) => setBusy(`File ${i + 1} of ${todo.length}: ${m.text}`, m.pct == null ? base : Math.round(((i + m.pct / 100) / todo.length) * 100)));
          log.results.push({ it, res });
          if (res.skipped) { log.skipped++; continue; }
          if (it.status === 'changed') log.updatedFiles++; else log.added++;
          log.inserted += res.inserted; log.updated += res.updated; log.replaced += res.replaced; log.rejected += res.rejected;
        } catch (e) { log.results.push({ it, error: e.message }); log.skipped++; }
      }
      if (log.added + log.updatedFiles) { setBusy('Saving cost.db ...'); await Store.save(); }
      S.summary = await Store.summary();
      S.log = log; S.ws = null;
      await scanFolder();
    } catch (e) { fail(e); }
  }

  function renderLog(l) {
    const parts = l.results.map(({ it, res, error }) => {
      if (error) return `<div class="res"><strong>${esc(it.name)}</strong> <span class="badge error">Not imported</span><div class="notice bad">${esc(error)}</div></div>`;
      if (res.skipped) return `<div class="res"><strong>${esc(it.name)}</strong> <span class="badge">Skipped</span><div class="muted">${esc(res.skipped)}</div></div>`;
      const m = res.mode === 'upsert' ? `${count(res.inserted)} new, ${count(res.updated)} updated in place` : res.mode === 'replace_period' ? `${count(res.inserted)} rows loaded, replacing ${count(res.replaced)} rows of the same months` : `${count(res.inserted)} rows loaded, replacing the previous snapshot (${count(res.replaced)} rows)`;
      return `<div class="res"><strong>${esc(it.name)}</strong> <span class="badge">${esc(rid(res.reportId).short)}</span> <span class="muted">${m}${res.from ? ' - ' + ymLabel(res.from) + ' to ' + ymLabel(res.to) : ''} - ${(res.ms / 1000).toFixed(1)} s</span>
        <ul class="checks">${res.checks.map((c) => `<li class="${c.ok === false ? 'bad' : c.ok ? 'ok' : ''}">${esc(c.text)}</li>`).join('')}${res.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul></div>`;
    }).join('');
    return `<div class="card"><h2>Import result</h2>
      <p>Files added: <strong>${l.added}</strong> &nbsp; updated: <strong>${l.updatedFiles}</strong> &nbsp; skipped: <strong>${l.skipped}</strong><br>
      Rows inserted: <strong>${count(l.inserted)}</strong> &nbsp; updated: <strong>${count(l.updated)}</strong> &nbsp; rejected: <strong>${count(l.rejected)}</strong>${l.replaced ? ` &nbsp; replaced: <strong>${count(l.replaced)}</strong>` : ''}</p>${parts}</div>`;
  }

  // ================================================================== screen 3: workspace
  const TABS = [['overview', 'Overview'], ['explore', 'Explore'], ['export', 'Export'], ['mapping', 'Mapping']];
  function renderWorkspace() {
    view.innerHTML = `<div class="tabs" role="tablist">${TABS.map(([id, l]) => `<button role="tab" data-act="tab" data-tab="${id}" aria-selected="${S.tab === id}">${l}</button>`).join('')}</div><div id="tabbody"></div>`;
    ({ overview: loadOverview, explore: mountExplore, export: mountExport, mapping: mountMapping })[S.tab]();
  }

  // ---------------------------------------------------------------- overview
  const GROUPS = [{ title: null, items: ['Subcontractor', 'Material', 'Labor'] }, { title: 'Order settlement', items: ['Equipment / fuel', 'Fleet / transportation', 'House rent'] }, { title: null, items: ['Asset depreciation', 'G&A', 'Unclassified'] }];
  const DETAIL = { 'Subcontractor': { reports: ['zscprg01', 'zscsrv1'] }, 'Material': { reports: ['mb51', 'me2n', 'mb52'] }, 'Labor': { offline: 'Labour allocation form (offline)' },
    'Equipment / fuel': { reports: ['zintc1'] }, 'Fleet / transportation': { reports: ['zintc1'] }, 'House rent': { reports: ['zintc1'] }, 'Asset depreciation': { offline: 'Asset movement sheet (offline)' }, 'G&A': { none: 'No detail report (Finance / HR)' } };
  let charts = [];

  function coverage(id) {
    const t = S.summary.tables[id], d = rid(id);
    if (!t.rows) return `<span class="muted">${d.short}: not loaded</span>`;
    return `${d.short}: ${t.from ? ymLabel(t.from) + ' to ' + ymLabel(t.to) : count(t.rows) + ' rows'}`;
  }

  async function loadOverview() {
    const body = $('#tabbody');
    charts.forEach((c) => c.destroy()); charts = [];
    if (!S.summary.tables.cji3.rows) { body.innerHTML = `<div class="card empty">No CJI3 data yet. Add a CJI3 export to the project folder and import it on the Files screen.<br><br><button class="primary" data-act="go-scan">Go to Files</button></div>`; return; }
    body.innerHTML = `<div class="card"><div class="skeleton">Calculating from ${count(S.summary.tables.cji3.rows)} CJI3 lines ...</div></div>`;
    try {
      const [k, mo, wbs, bu, un] = await Promise.all([
        Store.query(`SELECT SUM(CASE WHEN kind='cost' THEN amount END), -SUM(CASE WHEN kind='revenue' THEN amount END), SUM(CASE WHEN kind='cost' AND is_opening=1 THEN amount END),
                     -SUM(CASE WHEN kind='revenue' AND is_opening=1 THEN amount END), COUNT(*), MIN(posting_date), MAX(posting_date) FROM cji3`),
        Store.query(`SELECT period_ym, SUM(CASE WHEN is_opening=0 THEN amount ELSE 0 END), SUM(CASE WHEN is_opening=1 THEN amount ELSE 0 END) FROM cji3 WHERE kind='cost' GROUP BY period_ym ORDER BY period_ym`),
        Store.query(`SELECT wbs_element, SUM(amount) c FROM cji3 WHERE kind='cost' GROUP BY wbs_element ORDER BY c DESC LIMIT 12`),
        Store.query(`SELECT bucket, SUM(amount), COUNT(*) FROM cji3 GROUP BY bucket`),
        Store.query(`SELECT cost_element_name, COALESCE(document_type,'(blank)'), SUM(amount), COUNT(*) FROM cji3 WHERE bucket='Unclassified' AND kind='cost' GROUP BY 1,2 ORDER BY ABS(SUM(amount)) DESC LIMIT 8`),
      ]);
      const [cost, rev, openCost, openRev, lines, d0, d1] = k.values[0];
      const dd = S.summary.tables.cji3.dataDate;
      const B = new Map(bu.values.map(([b, a, n]) => [b, { a, n }]));
      const bRow = (b, sign) => { const x = B.get(b) || { a: 0, n: 0 }; return { a: (sign || 1) * x.a, n: x.n }; };
      const tot = cost || 0;
      const line = (b, cls) => { const x = bRow(b), det = DETAIL[b] || {};
        const cov = det.reports ? det.reports.map(coverage).join('<br>') : `<span class="muted">${esc(det.offline || det.none || '')}</span>`;
        return `<tr class="${cls || ''}"><td>${esc(b)}</td><td class="num">${money(x.a)}</td><td class="num">${tot ? (100 * x.a / tot).toFixed(1) + '%' : ''}</td><td class="num">${count(x.n)}</td><td>${cov}</td></tr>`; };
      let tb = '';
      for (const g of GROUPS) {
        if (g.title) { const s = g.items.reduce((a, b) => a + bRow(b).a, 0); tb += `<tr class="grp"><td>${g.title}</td><td class="num">${money(s)}</td><td class="num">${tot ? (100 * s / tot).toFixed(1) + '%' : ''}</td><td></td><td class="muted small">Settled from internal orders, detail in ZINTC1</td></tr>`; }
        for (const b of g.items) tb += line(b, g.title ? 'sub' : '');
      }
      tb += line('Opening balance', 'grp');
      const oc = openCost || 0;
      body.innerHTML = `
        <div class="kpis">
          <div class="kpi"><div class="muted small">Cost to date</div><div class="v">${money(cost)}</div><div class="s">cost elements other than 4xxxxxxx, EGP</div></div>
          <div class="kpi"><div class="muted small">Revenue to date</div><div class="v">${money(rev)}</div><div class="s">4xxxxxxx billing, shown positive, never netted against cost</div></div>
          <div class="kpi"><div class="muted small">Opening balances in cost</div><div class="v">${money(oc)}</div><div class="s">go-live balances (UE), plus ${money(openRev)} in revenue</div></div>
          <div class="kpi"><div class="muted small">CJI3 lines</div><div class="v">${count(lines)}</div><div class="s">posted ${esc(d0)} to ${esc(d1)}${dd ? '<br>file dated ' + esc(dd) : ''}</div></div>
        </div>
        <div class="grid2">
          <div class="card"><h3>Cost by month</h3><p class="muted small">Posting date. Go-live opening balances are their own series, not month activity.</p><div class="chartbox"><canvas id="ch-month" role="img" aria-label="Cost by month, stacked bars of activity and opening balance"></canvas></div></div>
          <div class="card"><h3>Top WBS elements by cost</h3><p class="muted small">The 12 largest, all months.</p><div class="chartbox"><canvas id="ch-wbs" role="img" aria-label="Top WBS elements by cost"></canvas></div></div>
        </div>
        <div class="card"><h3>Cost by bucket</h3><p class="muted small">CJI3 is the ledger. The last column shows which detail reports are loaded and the months they cover. Reconciling them against CJI3 comes next.</p>
          <div class="scroll-x"><table class="t"><thead><tr><th>Bucket</th><th class="num">CJI3 amount</th><th class="num">Share of cost</th><th class="num">Lines</th><th>Detail source and coverage</th></tr></thead><tbody>${tb}</tbody></table></div>
          <p class="muted small" style="margin-top:8px">Revenue (not part of cost): ${money(bRow('Revenue', -1).a)} over ${count(bRow('Revenue').n)} lines.</p>
          ${un.values.length ? `<div class="notice warn"><strong>Unclassified cost: ${money(bRow('Unclassified').a)}.</strong> Largest items: ${un.values.map(([n, t, a]) => `${esc(n)} (${esc(t)}) ${short(a)}`).join('; ')}. <button class="link" data-act="tab" data-tab="mapping">Add mapping rules</button></div>` : ''}
        </div>`;
      const css = getComputedStyle(document.documentElement), col = (n) => css.getPropertyValue(n).trim();
      Chart.defaults.color = col('--muted'); Chart.defaults.font.family = 'system-ui, sans-serif';
      const yAx = { ticks: { callback: (v) => short(v) }, grid: { color: col('--grid') } };
      charts.push(new Chart($('#ch-month'), { type: 'bar', data: { labels: mo.values.map((r) => ymLabel(r[0])), datasets: [
        { label: 'Activity', data: mo.values.map((r) => r[1]), backgroundColor: col('--c1'), stack: 's' }, { label: 'Opening balance', data: mo.values.map((r) => r[2]), backgroundColor: col('--c2'), stack: 's' }] },
        options: { responsive: true, maintainAspectRatio: false, scales: { x: { stacked: true, grid: { display: false } }, y: Object.assign({ stacked: true }, yAx) },
          plugins: { tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${money(c.parsed.y)}` } } } } }));
      charts.push(new Chart($('#ch-wbs'), { type: 'bar', data: { labels: wbs.values.map((r) => r[0] || '(no WBS)'), datasets: [{ label: 'Cost', data: wbs.values.map((r) => r[1]), backgroundColor: col('--c1') }] },
        options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, scales: { x: yAx, y: { grid: { display: false } } }, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => money(c.parsed.x) } } } } }));
    } catch (e) { body.innerHTML = `<div class="card"><div class="notice bad">${esc(e.message)}</div></div>`; }
  }

  // ---------------------------------------------------------------- explore: report switcher, filters, virtualised table
  const JOINED = [
    { col: 'srv_type_of_works', label: 'Type of works (ZSCSRV1)', type: 'text' }, { col: 'srv_subcontractor', label: 'Subcontractor (ZSCSRV1)', type: 'text' },
    { col: 'srv_po_lines', label: 'PO service lines (ZSCSRV1)', type: 'int' }, { col: 'zint_order_type', label: 'Order type (ZINTC1)', type: 'text' },
    { col: 'zint_order_description', label: 'Order description (ZINTC1)', type: 'text' }, { col: 'zint_order_actual', label: 'Order total (ZINTC1)', type: 'num' },
    { col: 'po_matched', label: 'PO found in ZSCSRV1', type: 'int' }, { col: 'order_matched', label: 'Order found in ZINTC1', type: 'int' }];
  const X = { id: 'cji3', joined: false, search: '', filters: {}, sort: null, visible: null, gen: 0, ids: null, n: 0, cache: new Map(), PAGE: 100, RH: 26 };

  const xCols = () => rid(X.id).all.map((c) => ({ col: c.col, label: c.label, type: c.type })).concat(X.id === 'cji3' && X.joined ? JOINED : []);
  const xRel = () => (X.id === 'cji3' && X.joined ? { rel: 'v_cji3_joined', rid: 'rid' } : { rel: rid(X.id).table, rid: 'rowid' });
  const xVisible = () => {
    const all = xCols().map((c) => c.col), key = 'cr.cols.' + X.id + (X.joined ? '.j' : '');
    let v = null; try { v = JSON.parse(ls.get(key)); } catch (e) { v = null; }
    v = Array.isArray(v) ? v.filter((c) => all.includes(c)) : null;
    if (!v || !v.length) { v = rid(X.id).defaultVisible.slice(); if (X.joined) v.push('srv_type_of_works', 'zint_order_type'); }
    return v.filter((c) => all.includes(c));
  };
  const colW = (c) => (c.type === 'num' ? 120 : c.type === 'date' ? 100 : c.type === 'int' ? 90 : /name|text|descr/i.test(c.label) ? 240 : Math.min(Math.max(c.label.length * 8 + 30, 110), 200));

  function xWhere() {
    const w = [], p = [], esc2 = (s) => s.replace(/[\\%_]/g, '\\$&');
    if (X.search) { const like = '%' + esc2(X.search) + '%', cols = rid(X.id).searchCols; w.push('(' + cols.map((c) => `${q(c)} LIKE ? ESCAPE '\\'`).join(' OR ') + ')'); cols.forEach(() => p.push(like)); }
    for (const [c, raw] of Object.entries(X.filters)) {
      const v = raw.trim(); if (!v) continue;
      const m = /^(>=|<=|>|<|=)\s*(-?\d[\d,]*\.?\d*)$/.exec(v);
      if (m) { w.push(`${q(c)} ${m[1]} ?`); p.push(parseFloat(m[2].replace(/,/g, ''))); }
      else if (v === '(blank)') w.push(`(${q(c)} IS NULL OR ${q(c)} = '')`);
      else { w.push(`CAST(${q(c)} AS TEXT) LIKE ? ESCAPE '\\'`); p.push('%' + esc2(v) + '%'); }
    }
    return { where: w.length ? 'WHERE ' + w.join(' AND ') : '', params: p };
  }
  const xOrder = () => { const r = xRel(); return X.sort ? `ORDER BY ${q(X.sort.col)} ${X.sort.dir}, ${q(r.rid)}` : `ORDER BY ${q(r.rid)}`; };

  function mountExplore() {
    const tabbody = $('#tabbody');
    X.visible = xVisible();
    const tables = S.summary.tables, d = rid(X.id), tot = tables[X.id].rows;
    tabbody.innerHTML = `<div class="card">
      <div class="row">
        <span class="seg" role="group" aria-label="Report">${R.REPORTS.map((r) => `<button data-act="x-report" data-id="${r.id}" aria-pressed="${r.id === X.id}">${esc(r.short)}${tables[r.id].rows ? '' : ' (empty)'}</button>`).join('')}</span>
        ${X.id === 'cji3' ? `<label class="row"><input type="checkbox" id="x-joined" ${X.joined ? 'checked' : ''}> Add columns from ZSCSRV1 and ZINTC1</label>` : ''}
      </div>
      <div class="row" style="margin-top:10px">
        <input type="search" id="x-search" placeholder="Search ${esc(d.searchCols.length)} text columns" value="${esc(X.search)}" style="width:280px" aria-label="Search">
        <details class="chooser" id="x-chooser"><summary>Columns (${X.visible.length} of ${xCols().length})</summary><div class="pop">
          <div class="row" style="margin-bottom:6px"><button data-act="x-cols" data-m="default">Default</button><button data-act="x-cols" data-m="all">All</button><button data-act="x-cols" data-m="none">None</button></div>
          ${xCols().map((c) => `<label><input type="checkbox" data-col="${c.col}" ${X.visible.includes(c.col) ? 'checked' : ''}> ${esc(c.label)}</label>`).join('')}</div></details>
        <button data-act="x-clear">Clear filters</button>
        <span class="muted" id="x-count" role="status" aria-live="polite"></span>
      </div>
      <div id="x-note"></div>
      <div id="x-table" style="margin-top:12px"></div></div>`;
    if (!tot) { $('#x-table').innerHTML = `<div class="empty">No ${esc(d.short)} data yet. Add its export to the project folder and import it on the Files screen.</div>`; return; }
    buildTable(); reloadTable(); if (X.id === 'cji3' && X.joined) joinedNote();
  }

  async function joinedNote() {
    const r = await Store.query(`SELECT SUM(po_matched = 1), SUM(po_matched = 0), SUM(order_matched = 1), SUM(order_matched = 0) FROM v_cji3_joined`);
    const [pm, pu, om, ou] = r.values[0].map((v) => v || 0), el = $('#x-note'); if (!el) return;
    el.innerHTML = `<div class="notice small">Joined view: CJI3 stays the main table (one row per line, nothing is added up twice). Lines with a PO: <strong>${count(pm)}</strong> found in ZSCSRV1, <strong>${count(pu)}</strong> not found. Lines settled from an order: <strong>${count(om)}</strong> found in ZINTC1, <strong>${count(ou)}</strong> not found.</div>`;
  }

  function buildTable() {
    const byCol = new Map(xCols().map((c) => [c.col, c])), cols = X.visible.map((c) => byCol.get(c)).filter(Boolean);     // in the order chosen (defaults lead with date, type, bucket)
    X.cols = cols;
    const total = cols.reduce((a, c) => a + colW(c), 0);
    const host = $('#x-table');
    host.innerHTML = `<div class="vt" id="vt"><div class="vt-head" style="width:${total}px">
        <div class="vt-hrow">${cols.map((c) => `<div class="vt-h" data-col="${c.col}" style="width:${colW(c)}px" title="${esc(c.label)}">${esc(c.label)}${X.sort && X.sort.col === c.col ? (X.sort.dir === 'ASC' ? ' &#9650;' : ' &#9660;') : ''}</div>`).join('')}</div>
        <div class="vt-frow">${cols.map((c) => `<div class="vt-f" style="width:${colW(c)}px"><input type="text" data-f="${c.col}" value="${esc(X.filters[c.col] || '')}" aria-label="Filter ${esc(c.label)}" placeholder="${c.type === 'num' ? '> 1000' : 'filter'}"></div>`).join('')}</div></div>
      <div class="vt-body" id="vt-body" style="width:${total}px"></div></div>`;
    $('#vt').addEventListener('scroll', () => { if (!X.raf) X.raf = requestAnimationFrame(() => { X.raf = 0; paint(); }); });
  }

  async function reloadTable() {
    const gen = ++X.gen, r = xRel(), w = xWhere();
    $('#x-count').textContent = 'Loading ...';
    try {
      const res = await Store.ids({ rel: r.rel, rid: r.rid, where: w.where, params: w.params, order: xOrder() });
      if (gen !== X.gen) return;
      X.ids = new Float64Array(res.ids); X.n = res.n; X.cache.clear();
      const vt = $('#vt'); if (!vt) return;
      $('#vt-body').style.height = X.n * X.RH + 'px'; vt.scrollTop = 0;
      $('#x-count').textContent = `Showing ${count(X.n)} of ${count(S.summary.tables[X.id].rows)} rows`;
      paint();
    } catch (e) { if (gen === X.gen) $('#x-count').textContent = 'Error: ' + e.message; }
  }

  function fmtCell(c, v) {
    if (v == null || v === '') return '';
    if (c.type === 'num') return typeof v === 'number' ? v.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 3 }) : String(v);
    return String(v);
  }
  function paint() {
    const vt = $('#vt'), body = $('#vt-body'); if (!vt || !body || !X.ids) return;
    const buf = 12, first = Math.max(0, Math.floor(vt.scrollTop / X.RH) - buf), last = Math.min(X.n - 1, Math.ceil((vt.scrollTop + vt.clientHeight) / X.RH) + buf);
    const need = [];
    for (let p = Math.floor(first / X.PAGE); p <= Math.floor(last / X.PAGE); p++) if (!X.cache.has(p)) need.push(p);
    let html = '';
    for (let i = first; i <= last; i++) {
      const page = X.cache.get(Math.floor(i / X.PAGE)), row = page ? page[i % X.PAGE] : null;
      html += `<div class="vt-r" style="top:${i * X.RH}px">` + X.cols.map((c, j) => {
        const t = row ? fmtCell(c, row[j]) : '';
        return `<div class="vt-c ${c.type === 'num' || c.type === 'int' ? 'num' : ''} ${row ? '' : 'wait'}" style="width:${colW(c)}px">${row ? esc(t) : '...'}</div>`;
      }).join('') + '</div>';
    }
    body.innerHTML = html;
    for (const p of need) loadPage(p);
  }
  async function loadPage(p) {
    if (X.cache.has(p) || (X.loading || (X.loading = new Set())).has(p)) return;
    X.loading.add(p);
    const gen = X.gen, r = xRel(), ids = Array.from(X.ids.subarray(p * X.PAGE, (p + 1) * X.PAGE));
    try {
      const rows = await Store.rows({ rel: r.rel, rid: r.rid, cols: X.cols.map((c) => c.col), ids });
      if (gen === X.gen) { X.cache.set(p, rows); paint(); }
    } catch (e) { /* the next scroll retries */ } finally { X.loading.delete(p); }
  }

  // ---------------------------------------------------------------- export
  const EXPORTS = [
    ['headline', 'Headline figures', `SELECT 'Cost to date (EGP)' AS "Measure", ROUND(SUM(amount), 2) AS "Value" FROM cji3 WHERE kind = 'cost'
       UNION ALL SELECT 'Revenue to date (EGP, shown positive)', ROUND(-SUM(amount), 2) FROM cji3 WHERE kind = 'revenue'
       UNION ALL SELECT 'Opening balance included in cost (EGP)', ROUND(SUM(amount), 2) FROM cji3 WHERE kind = 'cost' AND is_opening = 1
       UNION ALL SELECT 'First posting date', MIN(posting_date) FROM cji3 UNION ALL SELECT 'Last posting date', MAX(posting_date) FROM cji3 UNION ALL SELECT 'CJI3 lines', COUNT(*) FROM cji3`],
    ['bucket', 'Cost by bucket', `SELECT bucket AS "Bucket", ROUND(SUM(amount), 2) AS "Amount", COUNT(*) AS "Lines" FROM cji3 GROUP BY bucket ORDER BY ABS(SUM(amount)) DESC`],
    ['wbs', 'Cost by WBS', `SELECT wbs_element AS "WBS element", ROUND(SUM(amount), 2) AS "Cost", COUNT(*) AS "Lines" FROM cji3 WHERE kind = 'cost' GROUP BY wbs_element ORDER BY SUM(amount) DESC`],
    ['period', 'Cost by period', `SELECT period_ym AS "Month", ROUND(SUM(CASE WHEN is_opening = 0 THEN amount ELSE 0 END), 2) AS "Activity", ROUND(SUM(CASE WHEN is_opening = 1 THEN amount ELSE 0 END), 2) AS "Opening balance", ROUND(SUM(amount), 2) AS "Total cost" FROM cji3 WHERE kind = 'cost' GROUP BY period_ym ORDER BY period_ym`],
  ];
  function mountExport() {
    const hasCji = S.summary.tables.cji3.rows > 0;
    $('#tabbody').innerHTML = `<div class="card"><h2>Export to Excel</h2>
      <p class="muted">Writes a new values-only workbook into the <strong>Output</strong> folder. Your source files are never touched.</p>
      <div style="margin-top:8px">${EXPORTS.map(([id, label]) => `<label class="row" style="padding:3px 0"><input type="checkbox" data-ex="${id}" ${hasCji ? 'checked' : 'disabled'}> ${label} <span class="muted small">(CJI3)</span></label>`).join('')}
        <label class="row" style="padding:3px 0"><input type="checkbox" data-ex="view" ${X.visible ? 'checked' : ''}> Current Explore view: <strong>${esc(rid(X.id).short)}</strong>${X.id === 'cji3' && X.joined ? ' joined' : ''}, ${count(X.n)} rows, ${(X.visible || xVisible()).length} columns, with its filters and sort</label></div>
      <div class="row" style="margin-top:12px"><button class="primary" data-act="export-go">Save XLSX to Output folder</button></div>
      <div id="ex-msg">${busyBox()}</div></div>`;
  }
  async function doExport() {
    const picks = [...document.querySelectorAll('[data-ex]:checked')].map((e) => e.dataset.ex);
    if (!picks.length) { $('#ex-msg').innerHTML = '<div class="notice warn">Tick at least one item.</div>'; return; }
    setBusy('Building the workbook ...');
    try {
      const sheets = [];
      for (const [id, label, sql] of EXPORTS) if (picks.includes(id)) sheets.push({ name: label, sql });
      if (picks.includes('view')) {
        if (!X.visible) X.visible = xVisible();
        const cols = xCols().filter((c) => X.visible.includes(c.col)), r = xRel(), w = xWhere();
        sheets.push({ name: 'Explore ' + rid(X.id).short, sql: `SELECT ${cols.map((c) => `${q(c.col)} AS ${q(c.label)}`).join(', ')} FROM ${q(r.rel)} ${w.where} ${xOrder()} LIMIT 1048575`, params: w.params });
      }
      const res = await Store.exportXlsx(sheets);
      const d = new Date(), p = (n) => String(n).padStart(2, '0'), name = `${S.dirName}_cost-register_${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}.xlsx`;
      await FS.write(await FS.output(S.dir), name, new Uint8Array(res.bytes));
      setBusy(null); $('#ex-msg').innerHTML = `<div class="notice ok" role="status">Saved <strong>Output/${esc(name)}</strong> (${sheets.length} sheet${sheets.length === 1 ? '' : 's'}, ${bytes(res.bytes.byteLength)}).</div>`;
    } catch (e) { setBusy(null); $('#ex-msg').innerHTML = `<div class="notice bad" role="alert">${esc(e.message)}</div>`; }
  }

  // ---------------------------------------------------------------- mapping (cost bucket rules)
  const BUCKETS = ['Subcontractor', 'Material', 'Labor', 'Equipment / fuel', 'Fleet / transportation', 'House rent', 'Asset depreciation', 'G&A', 'Revenue', 'Opening balance', 'Unclassified'];
  let rules = [], rulesDirty = false;
  async function mountMapping() {
    const body = $('#tabbody'); body.innerHTML = '<div class="card"><div class="skeleton">Loading rules ...</div></div>';
    try { rules = await Store.rulesList(); rulesDirty = false; drawRules(); } catch (e) { body.innerHTML = `<div class="card"><div class="notice bad">${esc(e.message)}</div></div>`; }
  }
  function drawRules() {
    const f = (i, k, w) => `<input type="text" data-r="${i}" data-k="${k}" value="${esc(rules[i][k] || '')}" style="width:${w}px" aria-label="${k}">`;
    $('#tabbody').innerHTML = `<div class="card"><h2>Cost bucket rules</h2>
      <p class="muted">Each CJI3 line goes to the first rule (lowest priority number) that matches all its filled-in fields. Blank document type is written <em>(blank)</em>. Lines no rule matches stay <em>Unclassified</em>.</p>
      <div class="scroll-x"><table class="t"><thead><tr><th>On</th><th>Priority</th><th>Document type</th><th>Cost element name</th><th>Name starts with</th><th>Cost element starts with</th><th>Bucket</th><th></th></tr></thead><tbody>
      ${rules.map((r, i) => `<tr><td><input type="checkbox" data-r="${i}" data-k="enabled" ${r.enabled === 0 ? '' : 'checked'} aria-label="enabled"></td><td>${f(i, 'priority', 60)}</td><td>${f(i, 'doc_type', 70)}</td><td>${f(i, 'ce_name', 170)}</td><td>${f(i, 'ce_name_prefix', 100)}</td><td>${f(i, 'ce_prefix', 80)}</td>
        <td><select data-r="${i}" data-k="bucket" aria-label="bucket">${BUCKETS.map((b) => `<option ${b === r.bucket ? 'selected' : ''}>${esc(b)}</option>`).join('')}</select></td><td><button data-act="rule-del" data-i="${i}">Remove</button></td></tr>`).join('')}
      </tbody></table></div>
      <div class="row" style="margin-top:12px"><button data-act="rule-add">Add rule</button><button class="primary" data-act="rule-save">Save and apply</button><button data-act="rule-reset">Reset to defaults</button><span class="muted" id="rule-msg"></span></div></div>`;
  }
  async function saveRules() {
    const msg = $('#rule-msg'); msg.textContent = 'Applying ...';
    try {
      const clean = rules.map((r) => ({ priority: parseInt(r.priority, 10) || 0, doc_type: (r.doc_type || '').trim().toUpperCase() || null, ce_name: (r.ce_name || '').trim() || null,
        ce_name_prefix: (r.ce_name_prefix || '').trim() || null, ce_prefix: (r.ce_prefix || '').trim() || null, bucket: r.bucket, note: r.note || null, enabled: r.enabled === 0 ? 0 : 1 }));
      rules = await Store.rulesSave(clean); await Store.save(); rulesDirty = false; drawRules(); $('#rule-msg').textContent = 'Saved. The Overview now uses these rules.';
    } catch (e) { msg.textContent = 'Error: ' + e.message; }
  }

  // ================================================================== events
  document.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-act]'); if (!t) return;
    const a = t.dataset.act;
    if (a === 'connect') connect();
    else if (a === 'reconnect') reconnect();
    else if (a === 'go-connect') { S.screen = 'connect'; S.error = null; render(); }
    else if (a === 'go-scan') { S.screen = 'scan'; render(); }
    else if (a === 'go-ws') { S.screen = 'workspace'; render(); }
    else if (a === 'rescan') { try { S.summary = await Store.summary(); await scanFolder(); } catch (er) { fail(er); } }
    else if (a === 'import') runImport();
    else if (a === 'tab') { S.screen = 'workspace'; S.tab = t.dataset.tab; render(); }
    else if (a === 'x-report') { X.id = t.dataset.id; X.filters = {}; X.sort = null; X.search = ''; X.joined = false; mountExplore(); }
    else if (a === 'x-clear') { X.filters = {}; X.search = ''; X.sort = null; mountExplore(); }
    else if (a === 'x-cols') {
      const m = t.dataset.m, all = xCols().map((c) => c.col);
      X.visible = m === 'all' ? all : m === 'none' ? [all[0]] : (rid(X.id).defaultVisible.slice());
      ls.set('cr.cols.' + X.id + (X.joined ? '.j' : ''), JSON.stringify(X.visible)); const open = $('#x-chooser').open; mountExplore(); $('#x-chooser').open = open;
    }
    else if (a === 'export-go') doExport();
    else if (a === 'rule-add') { rules.push({ priority: ((rules[rules.length - 1] || {}).priority || 0) + 10, doc_type: '', ce_name: '', ce_name_prefix: '', ce_prefix: '', bucket: 'Material', enabled: 1 }); drawRules(); }
    else if (a === 'rule-del') { rules.splice(+t.dataset.i, 1); drawRules(); }
    else if (a === 'rule-save') saveRules();
    else if (a === 'rule-reset') { if (confirm('Replace all rules with the defaults?')) { rules = await Store.rulesReset(); await Store.save(); drawRules(); $('#rule-msg').textContent = 'Defaults restored and applied.'; } }
    else if (t.classList.contains('vt-h')) { /* handled below */ }
  });
  document.addEventListener('click', (e) => {                                         // sort by clicking a column heading
    const h = e.target.closest('.vt-h'); if (!h) return;
    const c = h.dataset.col; X.sort = X.sort && X.sort.col === c ? (X.sort.dir === 'ASC' ? { col: c, dir: 'DESC' } : null) : { col: c, dir: 'ASC' };
    buildTable(); reloadTable();
  });
  let timer = null;
  document.addEventListener('input', (e) => {
    const t = e.target;
    if (t.id === 'x-search') { clearTimeout(timer); timer = setTimeout(() => { X.search = t.value.trim(); reloadTable(); }, 300); }
    else if (t.dataset && t.dataset.f) { clearTimeout(timer); timer = setTimeout(() => { X.filters[t.dataset.f] = t.value; reloadTable(); }, 300); }
    else if (t.dataset && t.dataset.r != null) { const r = rules[+t.dataset.r], k = t.dataset.k; r[k] = t.type === 'checkbox' ? (t.checked ? 1 : 0) : t.value; rulesDirty = true; }
  });
  document.addEventListener('change', (e) => {
    const t = e.target;
    if (t.id === 'x-joined') { X.joined = t.checked; X.filters = {}; X.sort = null; X.visible = null; mountExplore(); }
    else if (t.dataset && t.dataset.col && t.closest('#x-chooser')) {
      const on = [...document.querySelectorAll('#x-chooser input[data-col]:checked')].map((i) => i.dataset.col);
      X.visible = xCols().map((c) => c.col).filter((c) => on.includes(c));
      if (!X.visible.length) { t.checked = true; X.visible = [t.dataset.col]; }
      ls.set('cr.cols.' + X.id + (X.joined ? '.j' : ''), JSON.stringify(X.visible));
      $('#x-chooser summary').textContent = `Columns (${X.visible.length} of ${xCols().length})`;
      buildTable(); reloadTable();
    }
  });

  // ================================================================== start
  (async () => {
    render();
    if (!('showDirectoryPicker' in window)) return;
    try { await Store.start(); S.saved = await FS.saved(); S.ready = true; } catch (e) { S.error = 'The database engine could not start: ' + e.message; S.ready = true; }
    render();
  })();
  window.__cr = { S, X, Store, R, FS };           // handles for the automated tests
})();
