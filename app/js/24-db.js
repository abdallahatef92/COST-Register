// =====================================================================================  the data file: one SQLite .db on your computer
// Holds every build (the full build, compressed), your codes per build, the data log (files, coverage by month, certificates) and the
// lines of the latest build with their codes (view "expenses"). Open it in DB Browser for SQLite or Power BI to query it with SQL.
// Chrome / Edge write to the file directly; other browsers download it (Save data file).
const DBF = { SQL: null, db: null, h: null, name: '', st: 'none', at: '', cur: 0, ro: false, t: 0, busy: false };
const DB_SCHEMA = `
CREATE TABLE IF NOT EXISTS info(k TEXT PRIMARY KEY, v TEXT);
CREATE TABLE IF NOT EXISTS builds(id INTEGER PRIMARY KEY, built TEXT, cut TEXT, project TEXT, app TEXT, cji3_cost REAL, files INTEGER, codes_at TEXT, codes TEXT, data BLOB);
CREATE TABLE IF NOT EXISTS files(build_id INTEGER, source TEXT, name TEXT, first_month TEXT, last_month TEXT, cut_type TEXT, rows INTEGER, used INTEGER, amount REAL, merge_rule TEXT, note TEXT);
CREATE TABLE IF NOT EXISTS coverage(build_id INTEGER, source TEXT, month TEXT, files TEXT, n INTEGER, amount REAL);
CREATE TABLE IF NOT EXISTS certificates(build_id INTEGER, po TEXT, serial TEXT, cert_date TEXT, amount REAL);
CREATE TABLE IF NOT EXISTS changes(build_id INTEGER, source TEXT, kind TEXT, month TEXT, line_id TEXT, amount REAL);
CREATE TABLE IF NOT EXISTS lines(build_id INTEGER, line_id TEXT, posting_date TEXT, month TEXT, bucket TEXT, item_key TEXT, item_code TEXT, description TEXT, sap_cost_element TEXT, sap_ce_name TEXT, amount REAL, qty REAL, wbs TEXT, po TEXT, doc_type TEXT, source TEXT);
CREATE TABLE IF NOT EXISTS codes(bucket TEXT, item_key TEXT, item_code TEXT, description TEXT, div TEXT, pkg TEXT, mnl TEXT, cost_element TEXT, PRIMARY KEY(bucket, item_key));
CREATE TABLE IF NOT EXISTS line_codes(line_id TEXT PRIMARY KEY, pkg TEXT, mnl TEXT, cost_element TEXT);
CREATE TABLE IF NOT EXISTS log(at TEXT, build_id INTEGER, event TEXT, detail TEXT);
CREATE INDEX IF NOT EXISTS lines_b ON lines(build_id);
CREATE VIEW IF NOT EXISTS updates AS SELECT id, built AS updated, cut, project, app, cji3_cost, files FROM builds;
CREATE TABLE IF NOT EXISTS source_files(id INTEGER PRIMARY KEY, kind TEXT, name TEXT, project TEXT, added TEXT, size INTEGER, sha TEXT UNIQUE, first_month TEXT, last_month TEXT, data BLOB);
CREATE TABLE IF NOT EXISTS build_files(build_id INTEGER, file_id INTEGER, role TEXT);
CREATE VIEW IF NOT EXISTS expenses AS SELECT l.*, COALESCE(o.pkg, c.pkg) AS pkg, COALESCE(o.mnl, c.mnl) AS mnl, COALESCE(o.cost_element, c.cost_element) AS cost_element, o.line_id IS NOT NULL AS hand_coded
  FROM lines l LEFT JOIN codes c ON c.bucket = l.bucket AND c.item_key = l.item_key LEFT JOIN line_codes o ON o.line_id = l.line_id;`;
async function dbLib() {
  if (!DBF.SQL) {
    const b = atob(SQLWASM_B64),
      u = new Uint8Array(b.length);
    for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i);
    DBF.SQL = await initSqlJs({ wasmBinary: u.buffer });
  }
  return DBF.SQL;
}
async function gz(str) {
  const s = new Blob([str]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(s).arrayBuffer());
}
async function gunz(u8) {
  const s = new Blob([u8]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(s).text();
}
const dbRows = (sql, p) => {
  const st = DBF.db.prepare(sql);
  if (p) st.bind(p);
  const out = [];
  while (st.step()) out.push(st.getAsObject());
  st.free();
  return out;
};
const dbOne = (sql, p) => dbRows(sql, p)[0] || null;
const dbInfo = (k) => {
  const r = dbOne('SELECT v FROM info WHERE k = ?', [k]);
  return r ? r.v : '';
};
const dbLog = (ev, detail, id) =>
  DBF.db.run('INSERT INTO log VALUES (?, ?, ?, ?)', [new Date().toISOString(), id || DBF.cur || null, ev, detail || '']);
async function dbOpenBytes(u8) {
  const SQL = await dbLib();
  DBF.db = u8 && u8.length ? new SQL.Database(u8) : new SQL.Database();
  DBF.db.run(DB_SCHEMA);
  if (!dbInfo('created')) {
    DBF.db.run("INSERT OR REPLACE INTO info VALUES ('created', ?), ('format', 'Cost Register data file 1')", [new Date().toISOString()]);
  }
}
// write the whole file (sql.js keeps the database in memory)
async function dbWrite() {
  if (!DBF.db || DBF.ro) return false;
  if (!DBF.h) {
    DBF.st = 'dl';
    return false;
  }
  try {
    const w = await DBF.h.createWritable();
    await w.write(DBF.db.export());
    await w.close();
    DBF.st = 'ok';
    DBF.at = new Date().toTimeString().slice(0, 5);
    return true;
  } catch (e) {
    DBF.st = 'perm';
    return false;
  }
}
function dbDownload() {
  if (!DBF.db) return;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([DBF.db.export()], { type: 'application/x-sqlite3' }));
  a.download = DBF.name || 'Cost_Register.db';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
const DB_TYPES = [{ description: 'Cost Register data file (SQLite)', accept: { 'application/x-sqlite3': ['.db'] } }];
// open an existing data file (a click is needed)
async function dbPickOpen() {
  if (window.showOpenFilePicker) {
    let h;
    try {
      [h] = await window.showOpenFilePicker({ types: DB_TYPES, multiple: false });
    } catch (e) {
      return false;
    }
    return dbUseHandle(h, true);
  }
  return new Promise((res) => {
    const i = document.createElement('input');
    i.type = 'file';
    i.accept = '.db';
    i.onchange = async () => {
      const f = i.files[0];
      if (!f) return res(false);
      await dbOpenBytes(new Uint8Array(await f.arrayBuffer()));
      DBF.h = null;
      DBF.name = f.name;
      DBF.st = 'dl';
      res(true);
    };
    i.click();
  });
}
// a new data file
async function dbPickCreate(project) {
  if (window.showSaveFilePicker) {
    let h;
    try {
      h = await window.showSaveFilePicker({ suggestedName: (project || 'Project') + '_register.db', types: DB_TYPES });
    } catch (e) {
      return false;
    }
    await dbOpenBytes(null);
    DBF.h = h;
    DBF.name = h.name;
    try {
      await idbSet('dbHandle', h);
    } catch (e) {
      /* this session only */
    }
    await dbWrite();
    return true;
  }
  await dbOpenBytes(null);
  DBF.h = null;
  DBF.name = (project || 'Project') + '_register.db';
  DBF.st = 'dl';
  return true;
}
async function dbUseHandle(h, ask) {
  let p = 'prompt';
  try {
    p = await h.queryPermission({ mode: 'readwrite' });
  } catch (e) {
    /* ask */
  }
  if (p !== 'granted' && ask) {
    try {
      p = await h.requestPermission({ mode: 'readwrite' });
    } catch (e) {
      p = 'denied';
    }
  }
  if (p !== 'granted') return false;
  await dbOpenBytes(new Uint8Array(await (await h.getFile()).arrayBuffer()));
  DBF.h = h;
  DBF.name = h.name;
  DBF.st = 'ok';
  try {
    await idbSet('dbHandle', h);
  } catch (e) {
    /* this session only */
  }
  return true;
}
const dbBuilds = () =>
  DBF.db
    ? dbRows('SELECT id, built, cut, project, app, cji3_cost, files, codes_at, length(data) AS size FROM builds ORDER BY id DESC')
    : [];
async function dbBuildData(id) {
  const r = dbOne('SELECT data FROM builds WHERE id = ?', [id]);
  return r ? JSON.parse(await gunz(r.data)) : null;
}
const dbCodes = (id) => {
  const r = dbOne(
    id ? 'SELECT codes FROM builds WHERE id = ?' : 'SELECT codes FROM builds WHERE codes IS NOT NULL ORDER BY id DESC LIMIT 1',
    id ? [id] : undefined
  );
  return r && r.codes ? JSON.parse(r.codes) : null;
};
// a new build: the data (compressed) and its log
async function dbAddBuild(data, ver) {
  const M = data.META,
    d = M.dlog || { files: [], cov: {}, certs: [] };
  DBF.db.run('INSERT INTO builds (built, cut, project, app, cji3_cost, files, data) VALUES (?, ?, ?, ?, ?, ?, ?)', [
    M.built,
    M.cut,
    M.project,
    ver,
    M.cost,
    d.files.length,
    await gz(JSON.stringify(data)),
  ]);
  const id = dbOne('SELECT max(id) AS id FROM builds').id;
  const fi = DBF.db.prepare('INSERT INTO files VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  d.files.forEach((f) =>
    fi.run([
      id,
      f.src,
      f.name,
      f.first || null,
      f.last || null,
      f.cut,
      f.rows ?? null,
      f.used ?? null,
      f.amt ?? null,
      f.merge,
      f.note || '',
    ])
  );
  fi.free();
  const names = (src) => d.files.filter((f) => f.src === src).map((f) => f.name),
    cv = DBF.db.prepare('INSERT INTO coverage VALUES (?, ?, ?, ?, ?, ?)');
  Object.entries(d.cov || {}).forEach(([src, m]) =>
    Object.entries(m).forEach(([ym, c]) => cv.run([id, src, ym, c.f ? c.f.map((k) => names(src)[k] || '').join(' + ') : '', c.n, c.amt]))
  );
  cv.free();
  const ce = DBF.db.prepare('INSERT INTO certificates VALUES (?, ?, ?, ?, ?)');
  (d.certs || []).forEach((c) => ce.run([id, c[0], c[1], c[2], c[3]]));
  ce.free();
  // one register: the earlier updates stay as log rows (cut, cost, files, coverage, certificates, changes) – their data and codes are not kept
  DBF.db.run('UPDATE builds SET data = NULL, codes = NULL WHERE id < ?', [id]);
  dbLog('update', `${M.project} · cut ${M.cut} · ${d.files.length} files`, id);
  return id;
}
// after an update: SAP files no longer used keep their name in the log, not their content; the file shrinks
function dbTidy() {
  const id = dbOne('SELECT max(id) AS id FROM builds').id;
  DBF.db.run(
    "UPDATE source_files SET data = NULL WHERE id NOT IN (SELECT file_id FROM build_files WHERE build_id = ? AND role != 'replaced')",
    [id]
  );
  try {
    DBF.db.run('VACUUM');
  } catch (e) {
    /* in a transaction */
  }
}
// the SAP files of a build, kept in the data file (each file once): role new = dropped for this build, kept = taken from the build before, replaced = an old file a new one replaced
async function dbStoreFiles(id, list) {
  for (const f of list) {
    let fid = f.fid;
    if (!fid) {
      const sha = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', f.data)))
          .map((x) => x.toString(16).padStart(2, '0'))
          .join(''),
        o = dbOne('SELECT id FROM source_files WHERE sha = ?', [sha]);
      if (o) fid = o.id;
      else {
        DBF.db.run(
          'INSERT INTO source_files (kind, name, project, added, size, sha, first_month, last_month, data) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [f.kind, f.name, f.proj || '', new Date().toISOString(), f.data.length, sha, f.first || null, f.last || null, f.data]
        );
        fid = dbOne('SELECT max(id) AS id FROM source_files').id;
      }
    }
    DBF.db.run('INSERT INTO build_files VALUES (?, ?, ?)', [id, fid, f.role || 'new']);
  }
}
const dbBuildFiles = (id) =>
  DBF.db
    ? dbRows(
        'SELECT f.id AS fid, f.sha, f.kind, f.name, f.project AS proj, f.first_month AS first, f.last_month AS last, f.size, b.role FROM build_files b JOIN source_files f ON f.id = b.file_id WHERE b.build_id = ? ORDER BY f.kind, f.name',
        [id]
      )
    : [];
const dbFileData = (fid) => {
  const r = dbOne('SELECT data FROM source_files WHERE id = ?', [fid]);
  return r ? r.data : null;
};
// a .db dropped on the page: take it during the drop (the browser forgets dropped items afterwards), then open it
function dbGrab(dt) {
  const it = [...((dt && dt.items) || [])].find((x) => x.kind === 'file' && /\.db$/i.test((x.getAsFile() || {}).name || ''));
  if (!it) return null;
  return { f: it.getAsFile(), hp: it.getAsFileSystemHandle ? it.getAsFileSystemHandle() : null };
}
async function dbOpenGrab(g) {
  if (g.hp) {
    try {
      const h = await g.hp;
      if (h && h.kind === 'file' && (await dbUseHandle(h, true))) return true;
    } catch (e) {
      /* the file itself below */
    }
  }
  await dbOpenBytes(new Uint8Array(await g.f.arrayBuffer()));
  DBF.h = null;
  DBF.name = g.f.name;
  DBF.st = 'dl';
  return true;
}
