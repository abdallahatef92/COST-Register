// =====================================================================================  state: cut date, VAT, codes, line overrides, undo
const LSK = 'cost-register:' + META.project + ':' + (META.buildId || META.built),
  OVR = Object.assign({}, L.ovr);
const ST = {
  own: {},
  ownSet: {},
  ownGl: [],
  indOff: !!META.indOffState,
  log: (META.logState || []).slice(-3000),
  crules: { ...(META.cruleState || {}) },
  pk: (META.pkState || []).map((x) => ({ ...x })),
  pkTick: new Set(),
  depx: META.depState || { mode: 'none', pick: [] },
  uns: META.unsState || { mode: 'none', pick: [] },
  unsc: META.unscState || { mode: 'none', pick: [] },
  unsView: 'o',
  rules: (META.rules || []).map((r) => ({ ...r })),
  xbk: -1,
  glMode: 'ce',
  cut: META.cut,
  vat: META.vat.mode || 'Exclude VAT',
  vatFrom: META.vat.from || '',
  tab: 'cod',
  grpSel: {},
  bk: Math.max(0, MATI),
  sub: 'pkg',
  pkView: 'alloc',
  pmMode: 'Amount',
};
let undo = [],
  redo = [];
function logIt(label, n) {
  ST.log.push({ at: new Date().toISOString(), label: String(label), n, cut: ST.cut });
  if (ST.log.length > 3000) ST.log.splice(0, ST.log.length - 3000);
} // the change log: kept with your codes and exported
// changes not yet saved to a file (Save codes or Export Excel) – kept across reloads, warned about before closing
let DIRTY = 0;
try {
  DIRTY = +localStorage.getItem(LSK + ':dirty') || 0;
} catch (e) {
  /* none */
}
const setDirty = (n) => {
  DIRTY = n;
  try {
    localStorage.setItem(LSK + ':dirty', String(n));
  } catch (e) {
    /* none */
  }
};
addEventListener('beforeunload', (e) => {
  if (DIRTY > 0) {
    e.preventDefault();
    e.returnValue = '';
  }
});
// a change: {t:'item', bi, ii, f, v} or {t:'line', i, f, v}  (v undefined = remove override)
function getC(c) {
  if (c.t === 'own') return ST.own[c.k];
  if (c.t === 'ownset') return ST.ownSet[c.k];
  if (c.t === 'owngl') return JSON.stringify(ST.ownGl);
  if (c.t === 'uns') return JSON.stringify(ST.uns);
  if (c.t === 'unsc') return JSON.stringify(ST.unsc);
  if (c.t === 'depx') return JSON.stringify(ST.depx);
  if (c.t === 'item') return BK[c.bi].items[c.ii][c.f];
  const o = OVR[L.id[c.i]];
  return o ? o[c.f] : undefined;
}
function setC(c, v) {
  if (c.t === 'ownset') {
    if (v === undefined) delete ST.ownSet[c.k];
    else ST.ownSet[c.k] = v;
    return;
  }
  if (c.t === 'owngl') {
    ST.ownGl = JSON.parse(v);
    return;
  }
  if (c.t === 'own') {
    if (v === undefined || v === null || v === '' || !(+v > 0)) delete ST.own[c.k];
    else ST.own[c.k] = +v;
    return;
  }
  if (c.t === 'uns') {
    ST.uns = JSON.parse(v);
    return;
  }
  if (c.t === 'unsc') {
    ST.unsc = JSON.parse(v);
    return;
  }
  if (c.t === 'depx') {
    ST.depx = JSON.parse(v);
    return;
  }
  if (c.t === 'item') {
    BK[c.bi].items[c.ii][c.f] = v;
    return;
  }
  const id = L.id[c.i];
  const o = OVR[id] || (OVR[id] = {});
  if (v === undefined || v === null) delete o[c.f];
  else o[c.f] = v;
  if (!Object.keys(o).length) delete OVR[id];
}
// codes in one spelling: a known code keeps its own (Indirect, Sponsorship, SF-02 …), anything else in capitals – sf-02 → SF-02
const CODEF = new Set(['pkg', 'mnl', 'ce', 'div']);
let KNOWN = null;
const canon = (f, v) => {
  if (typeof v !== 'string') return v;
  const t = v.trim();
  if (!t) return t;
  if (!KNOWN) {
    KNOWN = new Map();
    [IND_PKG, ...Object.keys(PS_NAMES)].forEach((k) => KNOWN.set(k.toLowerCase(), k));
  }
  return KNOWN.get(t.toLowerCase()) || t.toUpperCase();
};
const canonCh = (c) => ((c.t === 'item' || c.t === 'line') && CODEF.has(c.f) && typeof c.v === 'string' ? { ...c, v: canon(c.f, c.v) } : c);
// the same for your lists in the PKG summary (PKG names, cost element names, the codes in the groups)
function canonCfg() {
  const c = ST.psg;
  if (!c) return;
  const re = (o, fn) => {
    if (!o) return o;
    const n = {};
    Object.entries(o).forEach(([k, v]) => {
      const k2 = fn(k);
      n[k2] = n[k2] && n[k2].n ? n[k2] : v;
    });
    return n;
  };
  c.pkgs = re(c.pkgs, (k) => canon('pkg', k));
  c.ces = re(c.ces, (k) => {
    const i = k.indexOf('|');
    return i < 0 ? canon('ce', k) : canon('pkg', k.slice(0, i)) + '|' + canon('ce', k.slice(i + 1));
  });
  ['direct', 'indirect'].forEach((s) =>
    (c[s] || []).forEach((g) => {
      g.c = [...new Set(g.c.map((x) => canon(s === 'direct' ? 'pkg' : 'ce', x)))];
    })
  );
}
function change(list, label) {
  list = list.map(canonCh);
  const rec = list.map((c) => ({ ...c, old: getC(c) })).filter((c) => c.old !== c.v);
  if (!rec.length) return;
  rec.forEach((c) => setC(c, c.v));
  undo.push({ rec, label });
  redo = [];
  setDirty(DIRTY + 1);
  logIt(label, rec.length);
  if (!AS.boot) setTimeout(asAsk, 400);
  after(label + ' · ' + rec.length + ' change' + (rec.length > 1 ? 's' : ''));
}
function doUndo() {
  const u = undo.pop();
  if (!u) return;
  u.rec.forEach((c) => setC(c, c.old));
  redo.push(u);
  setDirty(DIRTY + 1);
  logIt('Undone: ' + u.label, u.rec.length);
  after('Undone: ' + u.label);
}
function doRedo() {
  const u = redo.pop();
  if (!u) return;
  u.rec.forEach((c) => setC(c, c.v));
  undo.push(u);
  setDirty(DIRTY + 1);
  logIt('Redone: ' + u.label, u.rec.length);
  after('Redone: ' + u.label);
}
function after(msg) {
  persist();
  compute();
  render();
  if (msg) toast(msg);
}
function snapshot() {
  const codes = {};
  BK.forEach((b) => {
    codes[b.id] = {};
    b.items.forEach((it) => {
      codes[b.id][it.k] = { pkg: it.pkg, mnl: it.mnl, ce: it.ce, inc: it.inc, ...(isSub(it.bi) ? { div: it.div } : {}) };
    });
  });
  return {
    project: META.project,
    cut: ST.cut,
    vat: ST.vat,
    vatFrom: ST.vatFrom,
    at: new Date().toISOString(),
    tool: '__VER__',
    codes,
    lines: OVR,
    rules: ST.rules,
    uns: ST.uns,
    unsc: ST.unsc,
    depx: ST.depx,
    pk: ST.pk,
    crules: ST.crules,
    log: ST.log,
    psg: ST.psg || null,
    indOff: ST.indOff,
    own: ST.own,
    ownSet: ST.ownSet,
    ownGl: ST.ownGl,
  };
}
function setSaved(t) {
  $('saved').textContent = t;
  $('bSave').title = 'Save all codes (and line overrides) as a small file · ' + t;
}
function persist() {
  asSoon();
  try {
    localStorage.setItem(LSK, JSON.stringify(snapshot()));
    setSaved('Saved in this browser ' + new Date().toLocaleTimeString());
  } catch (e) {
    setSaved('Not saved here – use Save codes');
  }
}
