// =====================================================================================  Update the register with new SAP files
// Drop the new files on the open register (or Side navigation › Update with new SAP files…).
// The files in use come from the data file. A new file replaces an old one of its kind when it covers
// the same months (ZSCSRV1, MB52, ME2N, ZSCPRG01: always); otherwise both are kept and merged
// (CJI3: a line in both counts once; ZINTC1: order + month, newest file).
// Guard: a new CJI3 whose cost for the months it shares with the register is LOWER than the register's
// looks like a part download (fewer WBS) – the old file is kept too, unless you choose "Replace anyway".
const UPD_SNAP = new Set(['zscsrv1', 'mb52', 'me2n', 'zscprg01']);
const UPD_NAME = { cji3: 'CJI3', zscprg01: 'ZSCPRG01', zscsrv1: 'ZSCSRV1', zintc1: 'ZINTC1', mb52: 'MB52', me2n: 'ME2N' };
const ymL = (ym) => (ym ? MON[+ym.slice(5, 7) - 1] + '-' + ym.slice(2, 4) : '');
const span = (a, b) => (a ? ymL(a) + (b && b !== a ? ' – ' + ymL(b) : '') : '');
const ymNext = (ym) => {
  let [y, m] = ym.split('-').map(Number);
  if (++m > 12) {
    m = 1;
    y++;
  }
  return y + '-' + String(m).padStart(2, '0');
};
const sha256 = async (u8) =>
  Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', u8)))
    .map((x) => x.toString(16).padStart(2, '0'))
    .join('');
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

function updBox(html) {
  let m = $('updm');
  if (!m) {
    m = document.createElement('div');
    m.id = 'updm';
    m.className = 'updm';
    document.body.appendChild(m);
  }
  m.innerHTML = `<div class="ub">${html}</div>`;
  m.style.display = 'flex';
  return m;
}
const updClose = () => {
  const m = $('updm');
  if (m) m.style.display = 'none';
};

// read the dropped files: same file as in the data file → left out; else its kind, project and months
async function updRead(list) {
  const last = latestId(),
    inUse = dbBuildFiles(last).filter((f) => f.role !== 'replaced');
  const shas = new Set(inUse.map((f) => f.sha)),
    nw = [],
    same = [];
  for (const f of list) {
    const o = { name: f.name, data: new Uint8Array(await f.arrayBuffer()) };
    o.sha = await sha256(o.data);
    if (shas.has(o.sha)) {
      same.push(o);
      continue;
    }
    const si = Engine.sniffInfo(o);
    o.kind = si.kind;
    o.proj = si.proj;
    nw.push(o);
  }
  for (const o of nw) {
    if (!['cji3', 'zintc1', 'zscprg01'].includes(o.kind)) continue;
    await pause(20);
    Object.assign(o, Engine.peek(o, o.kind));
  }
  // the register's CJI3 cost per month (the last update), to compare a new CJI3 with
  const regCov = new Map(
    dbRows("SELECT month, amount FROM coverage WHERE build_id = ? AND source = 'cji3'", [last]).map((r) => [r.month, r.amount])
  );
  return { last, old: inUse, nw, same, regCov, force: new Set() };
}

// a new CJI3 that is lower than the register for the months both cover: { less, from, to, n }
function partCheck(o, regCov) {
  if (o.kind !== 'cji3' || !o.cov) return null;
  const ms = [...regCov.keys()].filter((m) => m >= o.first && m <= o.last).sort();
  if (!ms.length) return null;
  const was = ms.reduce((t, m) => t + regCov.get(m), 0),
    now = ms.reduce((t, m) => t + (o.cov[m] || 0), 0);
  const less = r2(was - now);
  if (!(less > Math.max(1000, Math.abs(was) * 0.005))) return null;
  // which WBS: the register's CJI3 cost per WBS (this update's log) against the new file, for the same months
  const inM = (mm) => ms.reduce((t, m) => t + ((mm || {})[m] || 0), 0);
  const reg = (META.dlog && META.dlog.wbs) || {},
    nwW = o.wbs || {};
  const wbs = Object.keys(reg)
    .map((w) => ({ w, was: inM(reg[w]), now: inM(nwW[w]), gone: !nwW[w] }))
    .map((x) => ({ ...x, d: r2(x.was - x.now) }))
    .filter((x) => x.d > 1000)
    .sort((a, b) => b.d - a.d);
  return { less, from: ms[0], to: ms[ms.length - 1], n: ms.length, wbs };
}
// the WBS a smaller CJI3 is missing (or has less of), the biggest first
function partWbs(p) {
  if (!p.wbs || !p.wbs.length) return '';
  const name = (w) => esc(w) + (META.wbsNames && META.wbsNames[w] ? ` <span class="help">${esc(META.wbsNames[w])}</span>` : '');
  const gone = p.wbs.filter((x) => x.gone),
    low = p.wbs.filter((x) => !x.gone);
  const list = (xs) =>
    xs
      .slice(0, 5)
      .map((x) => `${name(x.w)} (${fmtM(x.d)})`)
      .join(', ') + (xs.length > 5 ? ` and ${xs.length - 5} more` : '');
  return `<div class="pw">${gone.length ? `<b>missing ${gone.length} WBS:</b> ${list(gone)}` : ''}${gone.length && low.length ? '<br>' : ''}${low.length ? `<b>lower in ${low.length} WBS:</b> ${list(low)}` : ''}</div>`;
}

// which old file each new one replaces, and what stays
function updPlan(U) {
  const good = U.nw.filter((o) => UPD_NAME[o.kind]),
    repl = new Map();
  good.forEach((o) => {
    o.part = partCheck(o, U.regCov);
  });
  for (const f of U.old) {
    const by = good.find(
      (o) =>
        o.kind === f.kind &&
        (UPD_SNAP.has(f.kind) || (o.first && f.first && o.first <= f.first && o.last >= f.last && (!o.part || U.force.has(o.sha))))
    );
    if (by) repl.set(f.fid, by);
  }
  return Object.assign(U, { good, bad: U.nw.filter((o) => !UPD_NAME[o.kind]), repl, kept: U.old.filter((f) => !repl.has(f.fid)) });
}

// what a new file does, in a few words
function updWhat(U, o) {
  const gone = U.old.filter((f) => U.repl.get(f.fid) === o);
  const oldMax =
    U.old
      .filter((f) => f.kind === o.kind && !U.repl.has(f.fid))
      .map((f) => f.last || '')
      .sort()
      .pop() || '';
  if (gone.length)
    return (
      'replaces ' +
      gone.map((f) => (f.first ? span(f.first, f.last) : esc(f.name))).join(', ') +
      (o.first ? ' · now ' + span(o.first, o.last) : '')
    );
  if (o.first && oldMax && o.last > oldMax) return 'adds ' + span(o.first > oldMax ? o.first : ymNext(oldMax), o.last);
  return o.first ? 'adds ' + span(o.first, o.last) + ' (a line in both counts once)' : 'added';
}

function updShow() {
  const U = updPlan(R.upd),
    b0 = dbBuilds()[0] || {};
  const wrong = U.good.filter((o) => o.proj && o.proj !== META.project);
  const noCji = !U.kept.concat(U.good).some((f) => f.kind === 'cji3');
  const li = (o) => {
    const p =
      o.part && !U.force.has(o.sha)
        ? `<div class="part">⚠ ${fmt(o.part.less)} lower than the register for ${span(o.part.from, o.part.to)} – looks like a part download. The old CJI3 is kept too; a line in both counts once.${partWbs(o.part)}
      <button data-upd="force" data-sha="${o.sha}">Replace anyway</button></div>`
        : '';
    const proj = o.proj && o.proj !== META.project ? ` <span class="bad">· project ${esc(o.proj)}</span>` : '';
    return `<li><b>${UPD_NAME[o.kind]}</b><span class="n" dir="auto">${esc(o.name)}${proj}</span><span class="d">${updWhat(U, o)}</span>${p}</li>`;
  };
  const keptTxt =
    !U.kept.length && U.old.length
      ? 'Every SAP file in the data file is replaced by the new ones.'
      : U.kept.length
        ? 'Kept from the data file: ' +
          U.kept.map((f) => `${UPD_NAME[f.kind] || f.kind}${f.first ? ' ' + span(f.first, f.last) : ''}`).join(' · ') +
          ' · your codes'
        : 'No SAP files in the data file yet (made before v3.4) – drop every file once; your codes come from the data file.';
  updBox(`<h3>${U.good.length ? `Update the register with ${U.good.length} new file${U.good.length === 1 ? '' : 's'}` : 'Nothing new to update'}</h3>
    <div class="sub">${esc(DBF.name)} · last update ${esc(String(b0.built || '').slice(0, 10))} · cut ${esc(b0.cut || '')}</div>
    <ul>${U.good.map(li).join('')}
      ${U.same.map((o) => `<li><b class="help">=</b><span class="n" dir="auto">${esc(o.name)}</span><span class="d help">same file as in the data file – no change</span></li>`).join('')}
      ${U.bad.map((o) => `<li><b class="bad">?</b><span class="n">${esc(o.name)}</span><span class="d bad">not a SAP file the Tool reads – left out</span></li>`).join('')}</ul>
    <div class="k">${keptTxt}</div>
    ${wrong.length ? `<div class="k bad">${wrong.length} file${wrong.length > 1 ? 's are' : ' is'} another project than ${esc(META.project)} – remove ${wrong.length > 1 ? 'them' : 'it'}, or Update anyway.</div>` : ''}
    ${noCji ? '<div class="k bad">A CJI3 is needed – none in the data file or in the new files.</div>' : ''}
    <div class="bt"><button data-upd="x">Cancel</button><button class="pri" data-upd="go"${U.good.length && !noCji ? '' : ' disabled'}>Update</button></div>`);
}

async function updStart(fileList) {
  const list = [...fileList];
  if (!list.length) return;
  if (list.some((f) => /\.db$/i.test(f.name))) {
    toast('To open another data file: Side navigation › Data file › Open another data file…');
    return;
  }
  if (!DBF.db) {
    updBox(`<h3>Keep your work in a data file first</h3><div class="sub">The SAP files go into the data file with the register and your codes – then every month you drop only the new ones.</div>
      <div class="bt"><button data-upd="x">Cancel</button><button class="pri" data-upd="mk">Create data file…</button></div>`);
    return;
  }
  updBox('<h3>Reading the new files…</h3><div class="sub">a few seconds for a big CJI3</div>');
  await pause(60);
  R.upd = await updRead(list);
  updShow();
}

async function updGo() {
  const U = R.upd;
  if (!U) return;
  updBox('<h3>Updating the register…</h3><div class="sub">about 20–30 seconds · logged in Check › Data log › Updates</div>');
  await pause(60);
  try {
    await dbSave(); // your latest codes go with the update
    const files = {},
      put = (k, f) => (files[k] || (files[k] = [])).push(f);
    U.kept.forEach((f) => put(f.kind, { name: f.name, data: dbFileData(f.fid) }));
    U.good.forEach((o) => put(o.kind, o));
    files.prev = { name: 'codes from ' + DBF.name + '.json', data: new TextEncoder().encode(JSON.stringify(snapshot())) };
    const data = Engine.build(files, {}),
      id = await dbAddBuild(data, '__VER__');
    const cov = new Map(((data.META.dlog || {}).files || []).map((f) => [f.name, f]));
    await dbStoreFiles(id, [
      ...U.kept.map((f) => ({ fid: f.fid, role: 'kept' })),
      ...U.good.map((o) => ({
        ...o,
        role: 'new',
        first: o.first || (cov.get(o.name) || {}).first,
        last: o.last || (cov.get(o.name) || {}).last,
      })),
      ...[...U.repl.keys()].map((fid) => ({ fid, role: 'replaced' })),
    ]);
    dbLog(
      'update',
      `${U.good.length} new file(s): ${U.good.map((o) => o.name).join(', ')} · ${U.repl.size} replaced · cut ${data.META.cut}`,
      id
    );
    dbTidy();
    const okW = await dbWrite();
    try {
      await idbSet('dbCache', { name: DBF.name, id, data });
    } catch (e) {
      /* none */
    }
    if (!okW) {
      // a browser that cannot write files: the data file downloads
      try {
        await idbSet('lastBuild', data);
      } catch (e) {
        /* none */
      }
      dbDownload();
      await pause(1500);
    }
    sessionStorage.setItem('crOpen', '');
    sessionStorage.setItem('crJob', '1'); // a new month: the Monthly job opens by itself
    location.reload();
  } catch (e) {
    console.error(e);
    updBox(
      `<h3>Could not update</h3><div class="sub bad">${esc(String(e.message || e))}</div><div class="bt"><button data-upd="x">Close</button></div>`
    );
  }
}

document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-upd]');
  if (!b) return;
  const k = b.dataset.upd;
  if (k === 'x') {
    updClose();
    R.upd = null;
  } else if (k === 'go') updGo();
  else if (k === 'mk') {
    updClose();
    asPick();
  } else if (k === 'force' && R.upd) {
    R.upd.force.add(b.dataset.sha);
    updShow();
  }
});
// drop SAP files anywhere on the register (the start page has its own drop box); a .db opens that data file
const onRegister = (e) => $('start').style.display === 'none' && e.dataTransfer;
document.addEventListener('dragover', (e) => {
  if (!onRegister(e) || ![...e.dataTransfer.types].includes('Files')) return;
  e.preventDefault();
  document.body.classList.add('dropping');
});
document.addEventListener('dragleave', (e) => {
  if (!e.relatedTarget) document.body.classList.remove('dropping');
});
document.addEventListener('drop', (e) => {
  if (!onRegister(e) || !e.dataTransfer.files.length) return;
  e.preventDefault();
  document.body.classList.remove('dropping');
  const g = dbGrab(e.dataTransfer),
    cant = () => toast('This browser cannot switch the data file here – New project register › Open…');
  if (g && !g.hp) {
    cant();
    return;
  }
  if (g) {
    dbOpenGrab(g).then((ok) => {
      if (ok && DBF.h) {
        sessionStorage.setItem('crOpen', '');
        location.reload();
      } else cant();
    });
    return;
  }
  updStart(e.dataTransfer.files);
});
$('bAdd').onclick = () => {
  const i = document.createElement('input');
  i.type = 'file';
  i.multiple = true;
  i.accept = '.xlsx,.xls,.xlsm';
  i.onchange = () => updStart(i.files);
  i.click();
};
globalThis.__UPD = { start: updStart }; // for the checks
