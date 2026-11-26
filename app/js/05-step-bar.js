// =====================================================================================  the step bar: on top of each step's pages – what is open, where to do it, ‹ back · Next ›
// A step (1 Update · 2 Code · 3 Decide · 4 Forecast) opens on its first open task; the bar lists the tasks with their state
// and a link to each. Next always works (some months a step has nothing to do) – the bar says what is still open.
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
function renderStepBar() {
  const el = $('stepbar'),
    k = secOf(ST.tab),
    n = STEPS.indexOf(k);
  if (n < 0 || ST.tab === 'sub' || !el) {
    if (el) el.innerHTML = '';
    return;
  }
  const T = stepTasks(k),
    open = T.filter((x) => !x.ok && !x.info).length,
    here = (go) => {
      const [g, a] = String(go).split(':');
      return (
        g === ST.tab &&
        (a === undefined || (g === 'cod' && +a === ST.bk) || (g === 'uns' && a === ST.unsView) || (g === 'bpkg' && a === ST.bpk))
      );
    },
    DONE = {
      chk: 'the difference to CJI3 is 0.00 and every line has a bucket',
      cod: 'every item is coded and every PKG has a name',
      adj: 'each question is answered and every owner material has a rate',
      bud: 'the cost report is read, the progress typed and the ETC checked',
    };
  el.innerHTML = `<div class="sbar${open ? '' : ' ok'}"><div class="sbh"><b>Step ${n + 1} · ${esc(SECS.find((x) => x[0] === k)[1])}</b><span class="sbp">${open ? open + ' of ' + T.filter((x) => !x.info).length + ' still open' : '✓ done'}</span><span class="sbd">Done when ${DONE[k]}</span><span class="sp"></span>${n ? `<button data-stp="${STEPS[n - 1]}">‹ ${n} ${esc(SECS.find((x) => x[0] === STEPS[n - 1])[1])}</button>` : ''}${n < STEPS.length - 1 ? `<button class="pri" data-stp="${STEPS[n + 1]}" title="${open ? open + ' still open in this step – you can come back to it' : ''}">Next: ${n + 2} ${esc(SECS.find((x) => x[0] === STEPS[n + 1])[1])} ›</button>` : `<button class="pri" data-stp="rep">Reports ›</button>`}<button class="sbx" data-stx="1" title="Hide the step bar for this step">✕</button></div>
  <div class="sbt">${T.map((x) => `<button class="${x.info ? 'inf' : x.ok ? 'ok' : 'todo'}${here(x.go) ? ' on' : ''}" data-stg="${esc(x.go)}"><i>${x.info ? '·' : x.ok ? '✓' : '!'}</i><span><b>${esc(x.title)}</b><small>${esc(x.sub)}</small></span></button>`).join('')}</div></div>`;
}
document.addEventListener('click', (e) => {
  const g = e.target.closest('#stepbar [data-stg]');
  if (g) {
    stepGo(g.dataset.stg);
    return;
  }
  const s = e.target.closest('#stepbar [data-stp]');
  if (s) {
    const k = s.dataset.stp;
    if (k === 'rep') {
      ST.tab = 'sum';
      render();
    } else goSec(k);
    return;
  }
  if (e.target.closest('#stepbar [data-stx]')) {
    const b = $('stepbar');
    b.innerHTML = '';
  }
});
