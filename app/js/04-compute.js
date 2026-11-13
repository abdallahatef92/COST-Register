// =====================================================================================  the engine: everything from the lines, the codes and the cut date (no formulas)
let OB0 = 0;
for (let i = 0; i < N; i++) if (L.d[i] && (!OB0 || L.d[i] < OB0)) OB0 = L.d[i];
const isOB = (i) => S[L.ty[i]] === 'UE' && (/^OB\b/i.test(S[L.hdr[i]] || '') || L.d[i] === OB0),
  OBTAG = '<span class="obt" title="Opening balance (UE) – stays in this bucket until it is reallocated in SAP">OB</span>';
const R = {};
globalThis.R = R;
globalThis.__ST = ST;
globalThis.__BK = BK;
globalThis.__D = { L, S, N }; // results of compute() (also readable from the browser console)
const SRC = L.src.map((x) => S[x]);
// owner-supplied: yes when you said Yes for the material; else no when you said No, or a rule takes out the line's SAP cost element (GL)
const ownOn = (i) => {
  if (!isOwn(i)) return false;
  const s = ST.ownSet[BK[L.b[i]].items[L.it[i]].k];
  return s === 'yes' || (s !== 'no' && !ST.ownGl.includes(S[L.ce[i]]));
};
// the source of a counted line in Expenses: CJI3, or an adjustment that is the whole line (owner material at your rate, not yet in CJI3)
const ADJK = {
  vat: 'VAT in',
  own: 'Owner material',
  ord: 'Order not yet settled',
  cert: 'Certificate not in CJI3',
  exc: 'Excluded',
  dep: 'Depreciation out',
  cd: 'Client deduction',
};
const adjKind = (i) =>
  UNS[i] ? (L.b[i] === SUBI ? ADJK.cert : ADJK.ord) : HASOWN && ownOn(i) && ST.own[BK[L.b[i]].items[L.it[i]].k] > 0 ? ADJK.own : '';
function compute() {
  const cutI = +ST.cut.replace(/-/g, ''),
    fromI = ST.vatFrom ? +ST.vatFrom.replace(/-/g, '') : 0,
    rep = PER.indexOf(monLab(ST.cut));
  R.rep = rep;
  R.repLab = monLab(ST.cut);
  R.cutI = cutI;
  const per = (R.per = new Int16Array(N)),
    amt = (R.amt = new Float64Array(N)),
    vin = (R.vin = new Float64Array(N));
  let openVin = 0,
    offRow = -1,
    ownIn = 0;
  for (let i = 0; i < N; i++) {
    const m = L.m[i];
    per[i] = m === 0 ? 0 : m < 0 || !L.d[i] || L.d[i] > cutI ? NP - 1 : m;
    let v = 0;
    if (L.b[i] === SUBI) {
      if (L.vat[i] === -1) offRow = i;
      else if (L.vat[i] && (SRC[i] === 'Certificate' || SRC[i] === 'Opening certificate')) {
        v =
          ST.vat === 'Include VAT'
            ? L.vat[i]
            : ST.vat === 'Include VAT before date'
              ? (L.cd[i] ? fromI && L.cd[i] < fromI : SRC[i] === 'Opening certificate')
                ? L.vat[i]
                : 0
              : 0;
        if (SRC[i] === 'Opening certificate') openVin += v;
      }
    }
    vin[i] = v;
    amt[i] = L.amt[i] + v;
    if (HASOWN && ownOn(i)) {
      const rt = ST.own[BK[L.b[i]].items[L.it[i]].k];
      if (rt > 0) {
        amt[i] = L.qty[i] * rt;
        ownIn += amt[i];
      }
    } // owner-supplied material, valued at your rate
  }
  if (offRow >= 0) {
    vin[offRow] = -openVin;
    amt[offRow] = L.amt[offRow] - openVin;
  }
  // effective codes per line + aggregates per item
  const ek = (R.ek = new Array(N));
  R.hand = new Uint8Array(N);
  R.inc = new Uint8Array(N);
  BK.forEach((b) =>
    b.items.forEach((it) => {
      it.p = new Float64Array(NP);
      it.q = new Float64Array(NP);
      it.exc = 0;
      it.n = 0;
      it.nh = 0;
      it.ua = null;
      it.da = null;
    })
  );
  R.bkP = BK.map(() => new Float64Array(NP));
  R.bkExc = BK.map(() => 0);
  R.bkUns = BK.map(() => 0);
  R.vatIn = 0;
  R.unsIn = 0;
  R.unsExc = 0;
  R.unsMk = { o: new Map(), c: new Map() };
  R.unsInK = { o: 0, c: 0 };
  R.unsExcK = { o: 0, c: 0 };
  R.depExc = 0;
  R.depM = new Map();
  const dpk = new Set(ST.depx.pick || []),
    depOff = (k) => ST.depx.mode === 'all' || (ST.depx.mode === 'pick' && dpk.has(k));
  R.depOff = depOff;
  const pkK = { o: new Set(ST.uns.pick || []), c: new Set(ST.unsc.pick || []) },
    stK = { o: ST.uns, c: ST.unsc },
    mStart = (k) => {
      const [mn, yy] = PER[+k].split('-');
      return (2000 + +yy) * 10000 + (MON.indexOf(mn) + 1) * 100 + 1;
    },
    keyOnK = (v, k) => (stK[v].mode === 'cut' ? k !== 'a' && mStart(k) <= cutI : stK[v].mode === 'pick' ? pkK[v].has(String(k)) : false);
  R.keyOnK = keyOnK;
  R.exp = new Map();
  R.expPo = new Map();
  R.exps = new Map();
  R.expPoS = new Map();
  for (let i = 0; i < N; i++) {
    const b = L.b[i],
      it = BK[b].items[L.it[i]],
      o = OVR[L.id[i]];
    const pkg = o && o.pkg !== undefined ? o.pkg : it.pkg,
      mnl = o && o.mnl !== undefined ? o.mnl : it.mnl,
      ce = o && o.ce !== undefined ? o.ce : it.ce,
      inc = o && o.inc !== undefined ? o.inc : it.inc;
    const hand = !!o && ((pkg !== it.pkg && b !== SUBI) || mnl !== it.mnl || ce !== it.ce); // a subcontractor package set per PO is not hand-coding
    R.hand[i] = hand ? 1 : 0;
    it.n++;
    if (hand) it.nh++;
    if (UNS[i]) {
      // not yet in CJI3 (ZINTC1 order charge 'o' / subcontractor certificate 'c'): counted only when its month is switched on (Unsettled tab) and not excluded
      const v = b === SUBI ? 'c' : 'o',
        k = L.m[i] > 0 ? String(L.m[i]) : 'a',
        on = keyOnK(v, k) && inc !== 'No';
      let e = R.unsMk[v].get(k);
      if (!e) R.unsMk[v].set(k, (e = { all: 0, on: 0 }));
      e.all += amt[i];
      if (on) e.on += amt[i];
      if (!it.ua) it.ua = new Map();
      it.ua.set(k, (it.ua.get(k) || 0) + amt[i]);
      if (!on) {
        it.exc += amt[i];
        R.inc[i] = 0;
        R.unsExc += amt[i];
        R.unsExcK[v] += amt[i];
        continue;
      }
      R.unsIn += amt[i];
      R.unsInK[v] += amt[i];
      R.bkUns[b] += amt[i];
    } else if (b === DEPI) {
      // depreciation in CJI3: the Depreciation tab can take whole months out (shown on the Summary as its own line)
      const k = L.m[i] >= 0 ? String(L.m[i]) : 'a';
      let e = R.depM.get(k);
      if (!e) R.depM.set(k, (e = { all: 0, off: 0 }));
      e.all += amt[i];
      if (!it.da) it.da = new Map();
      it.da.set(k, (it.da.get(k) || 0) + amt[i]);
      if (depOff(k)) {
        e.off += amt[i];
        it.exc += amt[i];
        R.inc[i] = 0;
        R.depExc += amt[i];
        continue;
      }
      if (inc === 'No') {
        it.exc += amt[i];
        R.inc[i] = 0;
        R.bkExc[b] += amt[i];
        continue;
      }
    } else if (inc === 'No') {
      it.exc += amt[i];
      R.inc[i] = 0;
      R.bkExc[b] += amt[i];
      continue;
    }
    R.inc[i] = 1;
    const p = per[i];
    it.p[p] += amt[i];
    it.q[p] += L.qty[i];
    R.bkP[b][p] += amt[i];
    R.vatIn += vin[i];
    // Expenses: one row per item + codes + source – CJI3 (the pure CJI3 amount) and each adjustment on its own row, in the line's month
    const put = (M, MP, k, src, a, q) => {
      let e = M.get(k);
      if (!e) M.set(k, (e = { b, ii: L.it[i], pkg, mnl, ce, hand, src, p: new Float64Array(NP), q: new Float64Array(NP) }));
      e.p[p] += a;
      e.q[p] += q;
      if (hand) e.hand = true;
      if (b === SUBI) {
        const po = S[L.po[i]] || '(no PO)',
          k2 = k + '\u0001' + po;
        let f = MP.get(k2);
        if (!f)
          MP.set(
            k2,
            (f = { b, ii: L.it[i], pkg, mnl, ce, hand, src, po, sup: S[L.sup[i]] || '', p: new Float64Array(NP), q: new Float64Array(NP) })
          );
        f.p[p] += a;
        f.q[p] += q;
        if (hand) f.hand = true;
      }
    }; // Expenses per month: one row per PO
    const k0 = b + '\u0001' + L.it[i] + '\u0001' + pkg + '\u0001' + mnl + '\u0001' + ce;
    put(R.exp, R.expPo, k0, '', amt[i], L.qty[i]); // item + codes (reports, Excel register)
    const add = (src, a, q) => put(R.exps, R.expPoS, k0 + '\u0001' + src, src, a, q); // Expenses pages: + the source
    const ak = adjKind(i);
    if (ak) add(ak, amt[i], L.qty[i]);
    else {
      add('CJI3', amt[i] - vin[i], L.qty[i]);
      if (vin[i]) add('VAT in', vin[i], 0);
    }
  }
  const td = (arr) => {
    let s = 0;
    for (let p = 0; p < NP - 1; p++) s += arr[p];
    return s;
  };
  BK.forEach((b) =>
    b.items.forEach((it) => {
      it.td = r2(td(it.p));
      it.tm = rep > 0 ? r2(it.p[rep]) : 0;
      it.qtd = td(it.q);
      it.pe = r2(it.p[NP - 1]);
    })
  );
  R.tot = new Float64Array(NP);
  R.bkP.forEach((a) =>
    a.forEach((v, p) => {
      R.tot[p] += v;
    })
  );
  R.toDate = r2(td(R.tot));
  R.thisM = rep > 0 ? r2(R.tot[rep]) : 0;
  R.pend = r2(R.tot[NP - 1]);
  R.excl = r2(R.bkExc.reduce((s, v) => s + v, 0));
  R.rev4 = 0;
  R.cd = 0;
  R.revPend = 0;
  for (const [d, m, a, is4] of REV) {
    const p = m === 0 ? 0 : m < 0 || !d || d > cutI ? NP - 1 : m;
    if (p === NP - 1) {
      R.revPend += -a;
      continue;
    }
    if (is4) R.rev4 += -a;
    else R.cd += a;
  }
  R.cdAll = REV.filter((x) => !x[3]).reduce((s, x) => s + x[2], 0);
  R.unsIn = r2(R.unsIn);
  R.unsExc = r2(R.unsExc);
  R.depExc = r2(R.depExc);
  R.ownIn = r2(ownIn);
  R.diff = r2(META.cost - R.toDate - R.pend - R.excl - R.depExc - R.cdAll + R.vatIn + R.unsIn + R.ownIn);
}
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  monLab = (iso) => MON[+iso.slice(5, 7) - 1] + '-' + iso.slice(2, 4);
