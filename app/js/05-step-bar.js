// =====================================================================================  the tasks of each step: what is open, and where to do it
// A step (1 Update · 2 Code · 3 Decide · 4 Forecast) opens on its first open task; the menu badge and the page header count them.
function stepTasks(k) {
  const T = [],
    t = (ok, title, sub, go, info) => T.push({ ok, title, sub, go, info });
  if (k === 'chk') {
    const ok = Math.abs(R.diff) < 0.01;
    t(
      ok,
      ok ? 'Difference to CJI3: 0.00' : 'Difference to CJI3: ' + fmt2(R.diff),
      ok ? 'every reconciliation check is OK' : 'open the checks',
      'chk'
    );
    const un = META.unclassified || 0,
      st = typeof mapStale === 'function' ? mapStale() : 0;
    t(
      !un && !st,
      un ? un + ' lines without a bucket' : st ? st + ' lines sorted with older rules' : 'Every line has a bucket',
      un || st ? 'Mapping rules – add a rule or rebuild' : 'by the mapping rules',
      'rules'
    );
    const b0 = DBF.db ? dbBuilds()[0] : null;
    t(
      true,
      'SAP files in',
      b0 ? `updated ${String(b0.built).slice(0, 10)} · cut ${b0.cut}` : `built ${META.built} · cut ${META.cut}`,
      'dlog',
      1
    );
  } else if (k === 'cod') {
    const ls = leftStats(),
      nn = pkNoName().length;
    const left = BK.map((b, bi) => ({ b, bi, x: ls.bk[bi] }))
      .filter((y) => y.x.n)
      .sort((a, b) => b.x.l - a.x.l);
    if (!left.length) t(true, 'Everything is coded', ls.pc + '% of the cost to date', 'cod');
    left
      .slice(0, 2)
      .forEach((y) =>
        t(false, `${y.b.id}: ${y.x.n.toLocaleString('en-US')} items to code`, fmtM(y.x.l) + ' left · the largest cost first', 'cod:' + y.bi)
      );
    if (left.length > 2)
      t(
        false,
        `${left.length - 2} more bucket${left.length > 3 ? 's' : ''} to code`,
        fmtM(left.slice(2).reduce((s, y) => s + y.x.l, 0)) + ' left',
        'cod:' + left[2].bi
      );
    t(!nn, nn ? nn + ' PKG without a name' : 'Every PKG has a name', nn ? 'name it in PKG names' : 'PKG names', 'pkl');
  } else if (k === 'adj') {
    const dec = (m) => m && m !== 'none',
      ua = (v) => (R.unsInK ? R.unsInK[v] + R.unsExcK[v] : 0);
    if (HASUNS && R.unsMk && R.unsMk.o.size)
      t(
        dec(ST.uns.mode),
        'Orders not settled: ' + fmtM(ua('o')),
        dec(ST.uns.mode)
          ? R.unsInK.o
            ? 'added ' + fmt(R.unsInK.o)
            : 'decided – not added'
          : 'add them to the cost or not – not decided yet',
        'uns:o'
      );
    if (HASUNS && R.unsMk && R.unsMk.c.size)
      t(
        dec(ST.unsc.mode),
        'Certificates not in CJI3: ' + fmtM(ua('c')),
        dec(ST.unsc.mode)
          ? R.unsInK.c
            ? 'added ' + fmt(R.unsInK.c)
            : 'decided – not added'
          : 'add them to the cost or not – not decided yet',
        'uns:c'
      );
    if (HASOWN) {
      const o = ownStats();
      t(
        !o.noRate,
        o.noRate ? `Owner-supplied material: ${o.noRate} without a rate` : 'Owner-supplied material: every one has a rate',
        o.noRate ? 'type a rate per unit – qty × rate is added to the cost' : R.ownIn ? 'added ' + fmt(R.ownIn) : 'nothing added',
        'own'
      );
    }
    if (DEPI >= 0)
      t(
        dec(ST.depx.mode),
        'Asset depreciation',
        dec(ST.depx.mode)
          ? R.depExc
            ? 'taken out ' + fmt(R.depExc)
            : 'kept in the cost'
          : 'keep it in the cost or take it out – not decided yet',
        'dep'
      );
    if (!T.length) t(true, 'Nothing to decide this month', 'no orders, certificates, owner material or depreciation', 'adjl');
  } else if (k === 'bud') {
    if (!ST.bud) t(false, 'Read the cost report', 'the budget, BOQ items and progress come from it', 'bsum');
    else {
      t(true, 'Cost report: ' + ST.bud.file, 'read ' + String(ST.bud.at).slice(0, 10), 'bsum', 1);
      const started = ST.bud.items.filter((x) => budDone(x).reduce((s, v) => s + budNum(v), 0)).length;
      t(
        started > 0,
        started ? `Progress: ${started.toLocaleString('en-US')} BOQ items started` : 'Progress: no done quantity yet',
        'type the done quantity per BOQ item',
        'bprog'
      );
      const C = budCalc(),
        over = budPkgs(C).filter((p) => budSum([...C.pk.get(p).values()]).vac < -0.5);
      t(
        !over.length,
        over.length ? `${over.length} PKG${over.length === 1 ? '' : 's'} over budget (VAC < 0)` : 'No PKG over budget',
        over.length ? over.slice(0, 4).join(' · ') + ' – check their ETC' : 'EAC within BAC',
        over.length ? 'bpkg:' + over[0] : 'bsum'
      );
    }
  }
  return T;
}
// open a task: tab (+ bucket / view / PKG)
function stepGo(go) {
  const [g, a] = String(go).split(':');
  sel.clear();
  if (g === 'cod') {
    ST.tab = 'cod';
    if (a !== undefined) ST.bk = +a;
  } else if (g === 'uns') {
    ST.tab = 'uns';
    ST.unsView = a;
  } else if (g === 'bpkg') {
    ST.tab = 'bpkg';
    ST.bpk = a;
  } else ST.tab = g;
  render();
  const w = $('wrap');
  if (w) w.scrollTop = 0;
}
// the first open task of a step (else its first page)
const stepFirst = (k) => (stepTasks(k).find((x) => !x.ok && !x.info) || {}).go;
