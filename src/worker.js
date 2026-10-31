/* Worker: XLSX parsing + the SQLite database (sql.js). The page never touches either, so it never freezes.
 * The page talks to this through the Store in app.js: open / save (exportDb) / query / import ...
 * Libraries (xlsx, sql.js), headers.js, util.js and reports.js are placed before this file when the page is built. */
'use strict';

let SQL = null, db = null;
const U = self.CRU, R = self.CRR;
const SCHEMA_VERSION = '1';

const fmt = (n) => Number(n).toLocaleString('en-US');
const post = (m, tr) => self.postMessage(m, tr || []);
const progress = (id, text, pct) => post({ type: 'progress', id, text, pct: pct == null ? null : pct });

// ------------------------------------------------------------------ sql helpers
const q = (id) => '"' + String(id).replace(/"/g, '""') + '"';                       // quoted identifier
const safeId = (s) => { if (!/^[a-z0-9_]+$/.test(s)) throw new Error('bad identifier ' + s); return s; };
const SQLTYPE = { text: 'TEXT', num: 'REAL', int: 'INTEGER', date: 'TEXT', time: 'TEXT' };

function run(sql, params) { db.run(sql, params); }
function all(sql, params) {
  const st = db.prepare(sql); const out = [];
  try { if (params) st.bind(params); while (st.step()) out.push(st.getAsObject()); } finally { st.free(); }
  return out;
}
const one = (sql, params) => { const r = all(sql, params)[0]; return r ? Object.values(r)[0] : null; };
const getMeta = (k) => one('SELECT value FROM meta WHERE key = ?', [k]);
const setMeta = (k, v) => run('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [k, v == null ? null : String(v)]);

// ------------------------------------------------------------------ bucket rules (the mapping the Overview groups by)
// First matching rule (lowest priority number) wins. Blank document type is written '(blank)'.
const BUCKETS = ['Subcontractor', 'Material', 'Labor', 'Equipment / fuel', 'Fleet / transportation', 'House rent', 'Asset depreciation', 'G&A', 'Revenue', 'Opening balance', 'Unclassified'];
function defaultRules() {
  const r = [];
  const add = (bucket, o, note) => r.push(Object.assign({ doc_type: null, ce_name: null, ce_name_prefix: null, ce_prefix: null, bucket, note: note || null }, o));
  add('Revenue', { ce_prefix: '4' }, 'Cost elements 4xxxxxxx are client billing, whatever the document type');
  for (const t of R.OPENING_TYPES) add('Opening balance', { doc_type: t }, 'Go-live opening balances are not month activity');
  add('Subcontractor', { doc_type: 'SC' }, 'SC = subcontractor certificate invoices (join to ZSCPRG01 on the PO)');
  add('Material', { doc_type: 'WA' }, 'WA = goods issue from stock');
  add('Asset depreciation', { doc_type: 'AF' });
  add('Equipment / fuel', { doc_type: 'KR', ce_name: 'Fuel' }, 'Direct fuel invoices');
  add('Equipment / fuel', { doc_type: 'KR', ce_name: 'Diesel' }, 'Direct fuel invoices');
  add('Asset depreciation', { ce_name_prefix: 'DC-' });
  for (const n of ['Main Material', 'Consumables Material', 'Spare Parts', 'Material Damages', 'Fuel', 'Diesel']) add('Material', { ce_name: n });
  add('Labor', { ce_name: 'Casual Labour' });
  for (const n of ['Subcontractor Cost', 'Equip Rent - Outside', 'Other Deduction']) add('Subcontractor', { ce_name: n });
  for (const n of ['Inhouse Charge EQ', 'Inhouse Charge Fuel']) add('Equipment / fuel', { ce_name: n }, 'Internal order settlement');
  add('Fleet / transportation', { ce_name: 'Inhouse Charge Fleet' }, 'Internal order settlement');
  for (const n of ['Housing Rent', 'Housing expenses']) add('House rent', { ce_name: n }, 'Internal order settlement');
  for (const n of ['LG Comm charges', 'Salaries', 'Miscel. allowances', 'Buffet & hosp allow', 'Other Equip Exp.', 'Utilities Wat & Elec', 'Transp & Car Allow', 'Meals Night Staff']) add('G&A', { ce_name: n });
  return r.map((x, i) => Object.assign(x, { priority: (i + 1) * 10, enabled: 1 }));
}

function saveRules(rules) {
  run('DELETE FROM bucket_rules');
  const st = db.prepare('INSERT INTO bucket_rules (priority, doc_type, ce_name, ce_name_prefix, ce_prefix, bucket, note, enabled) VALUES (?,?,?,?,?,?,?,?)');
  try { for (const x of rules) st.run([x.priority, x.doc_type || null, x.ce_name || null, x.ce_name_prefix || null, x.ce_prefix || null, x.bucket, x.note || null, x.enabled === 0 ? 0 : 1]); }
  finally { st.free(); }
}

function applyRules() {
  run(`UPDATE cji3 SET bucket = COALESCE((SELECT r.bucket FROM bucket_rules r WHERE r.enabled = 1
      AND (r.doc_type IS NULL OR r.doc_type = COALESCE(cji3.document_type, '(blank)'))
      AND (r.ce_name IS NULL OR lower(r.ce_name) = lower(COALESCE(cji3.cost_element_name, '')))
      AND (r.ce_name_prefix IS NULL OR lower(substr(COALESCE(cji3.cost_element_name, ''), 1, length(r.ce_name_prefix))) = lower(r.ce_name_prefix))
      AND (r.ce_prefix IS NULL OR substr(COALESCE(cji3.cost_element, ''), 1, length(r.ce_prefix)) = r.ce_prefix)
      ORDER BY r.priority, r.id LIMIT 1), 'Unclassified')`);
}

// ------------------------------------------------------------------ schema
function ensureSchema() {
  run('CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT)');
  run(`CREATE TABLE IF NOT EXISTS files (path TEXT PRIMARY KEY, size INTEGER, modified INTEGER, report_id TEXT, imported_at TEXT, row_count INTEGER,
        data_date TEXT, project_code TEXT, status TEXT, note TEXT)`);
  run(`CREATE TABLE IF NOT EXISTS bucket_rules (id INTEGER PRIMARY KEY AUTOINCREMENT, priority INTEGER NOT NULL, doc_type TEXT, ce_name TEXT, ce_name_prefix TEXT,
        ce_prefix TEXT, bucket TEXT NOT NULL, note TEXT, enabled INTEGER NOT NULL DEFAULT 1)`);
  for (const def of R.REPORTS) {
    const cols = def.all.map((c) => `${q(c.col)} ${SQLTYPE[c.type]}${def.keyCols.includes(c.col) ? ' NOT NULL' : ''}`);
    const pk = def.keyCols.length ? `, PRIMARY KEY (${def.keyCols.map(q).join(', ')})` : '';
    run(`CREATE TABLE IF NOT EXISTS ${q(def.table)} (${cols.join(', ')}${pk})`);
    const idx = ['period_ym', 'project'];
    for (const [k, c] of [['po', 'join_po'], ['wbs', 'join_wbs'], ['order', 'join_order'], ['material', 'join_material']]) if (def.join && def.join[k]) idx.push(c);
    if (def.id === 'cji3') idx.push('posting_date', 'wbs_element', 'document_type', 'bucket', 'kind');
    for (const c of idx) run(`CREATE INDEX IF NOT EXISTS ${q('idx_' + def.table + '_' + c)} ON ${q(def.table)} (${q(c)})`);
  }
  // joined view: CJI3 stays the main table; the other reports only add descriptive columns (one row per CJI3 line, never more)
  run('DROP VIEW IF EXISTS v_cji3_joined');
  run(`CREATE VIEW v_cji3_joined AS
        SELECT c.rowid AS rid, c.*,
          s.type_of_works AS srv_type_of_works, s.subcontractor AS srv_subcontractor, s.po_lines AS srv_po_lines,
          o.order_type AS zint_order_type, o.order_description AS zint_order_description, o.actual AS zint_order_actual,
          CASE WHEN c.join_po IS NULL THEN NULL WHEN s.po IS NULL THEN 0 ELSE 1 END AS po_matched,
          CASE WHEN c.join_order IS NULL THEN NULL WHEN o.ord IS NULL THEN 0 ELSE 1 END AS order_matched
        FROM cji3 c
        LEFT JOIN (SELECT join_po AS po, MIN("type_of_works_for_po") AS type_of_works, MIN("subcontractor_name") AS subcontractor, COUNT(*) AS po_lines FROM zscsrv1 WHERE join_po IS NOT NULL GROUP BY join_po) s ON s.po = c.join_po
        LEFT JOIN (SELECT join_order AS ord, MIN("order_type_description") AS order_type, MIN("order_description") AS order_description, SUM("actual") AS actual FROM zintc1 WHERE join_order IS NOT NULL GROUP BY join_order) o ON o.ord = c.join_order`);
  if (getMeta('schema_version') == null) { setMeta('schema_version', SCHEMA_VERSION); setMeta('created_at', new Date().toISOString()); }
  if (one('SELECT COUNT(*) FROM bucket_rules') === 0) saveRules(defaultRules());
}

// ------------------------------------------------------------------ reading a workbook
const READ_OPTS = { type: 'array', dense: true, cellFormula: false, cellStyles: false, cellNF: false, cellHTML: false, cellText: false, sheetStubs: false, bookVBA: false };
function firstSheetRows(buf, sheetRows) {
  const wb = self.XLSX.read(buf, Object.assign({}, READ_OPTS, sheetRows ? { sheetRows } : {}));
  const name = wb.SheetNames[0];
  if (!name) throw new Error('the workbook has no sheet');
  return self.XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: null, blankrows: true });
}

// ------------------------------------------------------------------ operations
const OPS = {
  async init({ wasm }) {
    SQL = await self.initSqlJs({ wasmBinary: wasm });
    return true;
  },

  open({ bytes }) {
    if (db) { try { db.close(); } catch (e) { /* closed */ } }
    try {
      db = bytes ? new SQL.Database(new Uint8Array(bytes)) : new SQL.Database();
      db.exec('SELECT count(*) FROM sqlite_master');            // fails here when the file is not a database
    } catch (e) { db = null; throw new Error('cost.db is not a readable database (' + e.message + ')'); }
    ensureSchema();
    return OPS.summary();
  },

  summary() {
    const tables = {};
    for (const def of R.REPORTS) {
      const n = one(`SELECT COUNT(*) FROM ${q(def.table)}`);
      const r = all(`SELECT MIN(period_ym) AS a, MAX(period_ym) AS b FROM ${q(def.table)}`)[0];
      tables[def.id] = { rows: n, from: r.a, to: r.b, dataDate: getMeta('data_date_' + def.id) };
    }
    return { meta: Object.fromEntries(all('SELECT key, value FROM meta').map((r) => [r.key, r.value])), tables, files: all('SELECT * FROM files ORDER BY path') };
  },

  // the report a file holds, read from its first rows only (never from its name)
  detect({ buf }) {
    const aoa = firstSheetRows(buf, 500);
    const hit = R.detect(aoa);
    if (!hit) return { reportId: null };
    const o = R.prepare(hit.def, aoa, hit.headerRow, {});
    return { reportId: hit.def.id, label: hit.def.label, project: R.projectOf(o.proj) };
  },

  importFile({ id, name, path, buf, size, modified }) {
    const t0 = Date.now();
    progress(id, 'Reading ' + name + ' (large files take up to a minute)', null);
    const aoa = firstSheetRows(buf, 0);
    progress(id, 'Checking ' + name, null);
    const hit = R.detect(aoa);
    if (!hit) throw new Error('not a recognised SAP report');
    const def = hit.def;
    const o = R.prepare(def, aoa, hit.headerRow, { sourceFile: name });
    const fileProject = R.projectOf(o.proj), dbProject = getMeta('project_code');
    if (dbProject && fileProject && dbProject !== fileProject) throw new Error(`this file is for project ${fileProject}, but this folder is project ${dbProject}`);
    if (!o.rows.length) throw new Error('no data lines found in the file');
    if (def.mode === 'upsert' && o.dupKeys) throw new Error(`the line key is not unique inside this file (${o.dupKeys} repeated, e.g. ${o.dupSample[0]}). Nothing was imported - the key for ${def.short} needs review`);
    const project = fileProject || dbProject || null;
    const pj = def.columns.length;                                // index of the "project" helper column
    for (const r of o.rows) r[pj] = project;

    const dataDate = U.dataDateOf(name, modified);
    const res = { reportId: def.id, label: def.label, mode: def.mode, rows: o.rows.length, inserted: 0, updated: 0, replaced: 0, rejected: o.rejected, rejectedSample: o.rejectedSample,
      subtotalRows: o.blankRows, badNumbers: o.badNumbers, badDates: o.badDates, missing: o.missing, unknown: o.unknown, project, from: o.minPeriod, to: o.maxPeriod, dataDate, notes: [], checks: [] };

    // replace_latest: an older snapshot never replaces a newer one
    if (def.mode === 'replace_latest') {
      const cur = getMeta('data_date_' + def.id);
      if (cur && dataDate && dataDate < cur) { res.skipped = `a newer ${def.short} snapshot (${cur}) is already loaded`; return res; }
    }

    const names = def.all.map((c) => c.col), n = names.length;
    const placeholders = names.map(() => '?').join(',');
    let sql = `INSERT INTO ${q(def.table)} (${names.map(q).join(',')}) VALUES (${placeholders})`;
    if (def.mode === 'upsert') {
      const upd = names.filter((c) => !def.keyCols.includes(c)).map((c) => `${q(c)} = excluded.${q(c)}`).join(', ');
      sql += ` ON CONFLICT (${def.keyCols.map(q).join(',')}) DO UPDATE SET ${upd}`;
      const exist = new Set(), kc = def.keyCols.map(q).join(',');
      const st0 = db.prepare(`SELECT ${kc} FROM ${q(def.table)}`);
      try { while (st0.step()) exist.add(st0.get().map((v) => (v == null ? '' : v)).join('\u0001')); } finally { st0.free(); }
      for (const k of o.keys) { if (exist.has(k)) res.updated++; else res.inserted++; }
    } else res.inserted = o.rows.length;

    db.exec('BEGIN');
    try {
      if (def.mode === 'replace_period') {
        const ps = [...o.periods];
        if (!ps.length) throw new Error('no month found in the file (Year / Month columns)');
        res.replaced = one(`SELECT COUNT(*) FROM ${q(def.table)} WHERE period_ym IN (${ps.map(() => '?').join(',')})`, ps);
        run(`DELETE FROM ${q(def.table)} WHERE period_ym IN (${ps.map(() => '?').join(',')})`, ps);
      } else if (def.mode === 'replace_latest') {
        res.replaced = one(`SELECT COUNT(*) FROM ${q(def.table)}`);
        run(`DELETE FROM ${q(def.table)}`);
      }
      const st = db.prepare(sql);
      try {
        for (let i = 0; i < o.rows.length; i++) {
          const r = o.rows[i]; if (r.length < n) r.length = n;
          st.run(r);
          if (i % 5000 === 0) progress(id, `Writing ${name}`, Math.round((i / o.rows.length) * 100));
        }
      } finally { st.free(); }
      db.exec('COMMIT');
    } catch (e) { try { db.exec('ROLLBACK'); } catch (e2) { /* nothing open */ } throw e; }

    if (!dbProject && project) setMeta('project_code', project);
    if (def.mode === 'replace_latest') setMeta('data_date_' + def.id, dataDate);
    else if (dataDate && (!getMeta('data_date_' + def.id) || dataDate > getMeta('data_date_' + def.id))) setMeta('data_date_' + def.id, dataDate);
    if (def.id === 'cji3') { progress(id, 'Applying cost bucket rules', null); applyRules(); }

    // checks (the CJI3 validation list)
    if (def.footer) {
      if (o.footer != null) res.checks.push({ ok: Math.abs(o.sumAmount - o.footer) < 0.5, text: `Sum of lines ${o.sumAmount.toFixed(2)} ${Math.abs(o.sumAmount - o.footer) < 0.5 ? 'equals' : 'differs from'} the export's grand total ${o.footer.toFixed(2)}` });
      else res.checks.push({ ok: null, text: 'No grand-total row found to check the sum against' });
    }
    res.checks.push({ ok: true, text: `${fmt(o.rows.length)} lines + ${fmt(o.blankRows)} subtotal rows read` + (def.mode === 'upsert' ? '; line key unique inside the file' : '') });
    if (o.rejected) res.checks.push({ ok: false, text: `${o.rejected} rows rejected (missing key): ${o.rejectedSample.join('; ')}` });
    if (o.badNumbers) res.checks.push({ ok: false, text: `${o.badNumbers} values could not be read as numbers and were left empty` });
    if (o.missing.length) res.notes.push(`${o.missing.length} known columns are not in this file (left empty)`);
    if (o.unknown.length) res.notes.push(`${o.unknown.length} columns in this file are not known to the tool and were not stored: ${o.unknown.slice(0, 5).join(', ')}${o.unknown.length > 5 ? ' ...' : ''}`);

    run(`INSERT INTO files (path, size, modified, report_id, imported_at, row_count, data_date, project_code, status, note) VALUES (?,?,?,?,?,?,?,?,?,?)
         ON CONFLICT(path) DO UPDATE SET size=excluded.size, modified=excluded.modified, report_id=excluded.report_id, imported_at=excluded.imported_at,
         row_count=excluded.row_count, data_date=excluded.data_date, project_code=excluded.project_code, status=excluded.status, note=excluded.note`,
      [path, size, modified, def.id, new Date().toISOString(), o.rows.length, dataDate, project, 'imported', null]);
    setMeta('last_import_at', new Date().toISOString());
    res.ms = Date.now() - t0;
    return res;
  },

  // remember a file that was looked at but not imported (unrecognized, other project) so the next scan skips re-reading it
  noteFile({ path, size, modified, reportId, status, note, project }) {
    run(`INSERT INTO files (path, size, modified, report_id, imported_at, row_count, data_date, project_code, status, note) VALUES (?,?,?,?,NULL,NULL,NULL,?,?,?)
         ON CONFLICT(path) DO UPDATE SET size=excluded.size, modified=excluded.modified, report_id=excluded.report_id, project_code=excluded.project_code, status=excluded.status, note=excluded.note`,
      [path, size, modified, reportId || null, project || null, status, note || null]);
    return true;
  },

  forgetFile({ path }) { run('DELETE FROM files WHERE path = ?', [path]); return true; },

  query({ sql, params }) {
    const r = db.exec(sql, params || []);
    return r.length ? { columns: r[0].columns, values: r[0].values } : { columns: [], values: [] };
  },

  // ordered row ids of a relation under a filter: the table component pages through these
  ids({ rel, rid, where, params, order }) {
    safeId(rel); safeId(rid);
    const from = `FROM ${q(rel)} ${where || ''}`;
    const n = one(`SELECT COUNT(*) ${from}`, params || []);
    const arr = new Float64Array(n);
    const st = db.prepare(`SELECT ${q(rid)} ${from} ${order || ''}`);
    let i = 0;
    try { if (params && params.length) st.bind(params); while (st.step() && i < n) arr[i++] = st.get()[0]; } finally { st.free(); }
    return { __t: [arr.buffer], v: { ids: arr.buffer, n } };
  },

  rows({ rel, rid, cols, ids }) {
    safeId(rel); safeId(rid); cols.forEach(safeId);
    const out = new Map();
    const st = db.prepare(`SELECT ${q(rid)}, ${cols.map(q).join(',')} FROM ${q(rel)} WHERE ${q(rid)} IN (${ids.map(() => '?').join(',')})`);
    try { st.bind(ids); while (st.step()) { const r = st.get(); out.set(r[0], r.slice(1)); } } finally { st.free(); }
    return ids.map((id) => out.get(id) || null);
  },

  rulesList() { return all('SELECT * FROM bucket_rules ORDER BY priority, id'); },
  rulesSave({ rules }) { db.exec('BEGIN'); try { saveRules(rules); db.exec('COMMIT'); } catch (e) { db.exec('ROLLBACK'); throw e; } applyRules(); return OPS.rulesList(); },
  rulesReset() { saveRules(defaultRules()); applyRules(); return OPS.rulesList(); },

  exportDb() {
    const bytes = db.export();                                   // sql.js resets pragmas here; nothing else is held open
    return { __t: [bytes.buffer], v: { bytes: bytes.buffer } };
  },

  // values-only workbook: sheets = [{ name, sql, params }]
  exportXlsx({ sheets }) {
    const X = self.XLSX, wb = X.utils.book_new(), used = new Set();
    for (const s of sheets) {
      const r = db.exec(s.sql, s.params || []);
      const aoa = r.length ? [r[0].columns].concat(r[0].values) : [['(no rows)']];
      let nm = String(s.name).replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Sheet', k = 2;
      while (used.has(nm.toLowerCase())) nm = nm.slice(0, 28) + ' ' + k++;
      used.add(nm.toLowerCase());
      X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet(aoa), nm);
    }
    const out = X.write(wb, { type: 'array', bookType: 'xlsx' });
    const u8 = out instanceof Uint8Array ? out : new Uint8Array(out);
    return { __t: [u8.buffer], v: { bytes: u8.buffer } };
  },
};

self.onmessage = async (e) => {
  const { id, op, args } = e.data;
  try {
    if (!OPS[op]) throw new Error('unknown operation ' + op);
    const out = await OPS[op](Object.assign({ id }, args || {}));
    if (out && out.__t) post({ id, ok: true, result: out.v }, out.__t);
    else post({ id, ok: true, result: out === undefined ? null : out });
  } catch (err) {
    post({ id, ok: false, error: String((err && err.message) || err) });
  }
};
