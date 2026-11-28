// =====================================================================================  Monthly job: the 4 steps of the menu, each with its live status, and the closing export
// Side navigation › Monthly job opens a panel: 1 Update · 2 Check · 3 Code · 4 Decide · 5 Report (Expenses + Excel).
// Done / Now / To do come from the register; "Go ›" opens the place. It opens by itself once after each update.
const JOBK = () => LSK + ':exported'; // the cut date the Excel report was last exported for (this browser)
const jobExported = () => {
  try {
    return localStorage.getItem(JOBK()) === ST.cut;
  } catch (e) {
    return false;
  }
};
function jobSteps() {
  const b0 = DBF.db ? dbBuilds()[0] : null,
    ls = leftStats(),
    nn = pkNoName().length,
    ok = Math.abs(R.diff) < 0.01;
  const ua = (v) => R.unsInK[v] + R.unsExcK[v],
    hasUns = HASUNS && (ua('o') || ua('c')),
    dec = [ST.uns.mode, ST.unsc.mode, ST.depx.mode].some((m) => m && m !== 'none'),
    own = HASOWN ? ownStats() : null,
    need = hasUns || DEPI >= 0 || (own && own.n);
  // step 4 › Go: the first place still open – not settled / not in CJI3, depreciation, then the owner material rates
  const unsSet = [ST.uns.mode, ST.unsc.mode].some((m) => m && m !== 'none'),
    depSet = ST.depx.mode && ST.depx.mode !== 'none',
    open4 =
      !dec && hasUns && !unsSet
        ? ['uns', 'Not settled ›']
        : !dec && DEPI >= 0 && !depSet
          ? ['dep', 'Depreciation ›']
          : own && own.noRate
            ? ['own', 'Owner material ›']
            : ['adjl', 'Decide ›'];
  const bud = typeof stepTasks === 'function' ? stepTasks('bud') : [],
    budOk = !!ST.bud && bud.every((x) => x.ok || x.info);
  return [
    {
      t: 'Update',
      d: 'Drop the new SAP files on the register – the footer must show Difference to CJI3 0.00 ✓',
      done: ok,
      s:
        (b0 ? `updated ${String(b0.built).slice(0, 10)} · cut ${b0.cut}` : `built ${META.built} · cut ${META.cut}`) +
        (ok ? ' · difference 0.00 ✓' : ' · difference ' + fmt2(R.diff) + ' – open the checks'),
      go: ok ? 'upd' : 'chk',
      gl: ok ? (DBF.db ? 'Update ›' : 'Data log ›') : 'Checks ›',
    },
    {
      t: 'Code',
      d: 'PKG, MNL and cost element for every item – the largest cost first; name every new PKG',
      done: ls.pc >= 100 && !nn,
      s: `${ls.pc}% coded${ls.l >= 0.5 ? ' · ' + fmtM(ls.l) + ' left' : ''}${nn ? ' · ' + nn + ' PKG without a name' : ''}`,
      go: ls.pc >= 100 && nn ? 'pkl' : 'cod',
      gl: ls.pc >= 100 && nn ? 'Name PKGs ›' : 'Code ›',
    },
    {
      t: 'Decide',
      d: 'Orders not settled, certificates not in CJI3, owner material, depreciation – add to the cost or not',
      done: !need || (dec && !(own && own.noRate)),
      s: !need
        ? 'nothing to decide this month'
        : [
            dec ? '' : 'add to the cost or not – not decided yet',
            own && own.noRate ? `${own.noRate} owner materials still need a rate` : '',
          ]
            .filter(Boolean)
            .join(' · ') || 'decided',
      go: open4[0],
      gl: open4[1],
    },
    {
      t: 'Forecast',
      d: 'Read the cost report, type the progress, check ETC and EAC per PKG',
      done: budOk,
      s: !ST.bud ? 'the cost report is not read yet' : budOk ? 'every PKG checked' : (bud.find((x) => !x.ok && !x.info) || {}).title || '',
      go: 'bsum',
      gl: ST.bud ? 'Forecast ›' : 'Read the cost report ›',
    },
  ];
}
function renderJob() {
  const st = jobSteps(),
    n = st.filter((x) => x.done).length,
    now = st.findIndex((x) => !x.done);
  const c = $('jobN');
  if (c) c.textContent = n + ' / 4';
  const m = $('mjob');
  if (!m || m.hidden) return;
  m.innerHTML = `<div class="hd"><div><h2>Monthly job · ${esc(PER[R.rep] || '')}</h2><div class="sub">the 4 steps of the menu, the same every month · each shows where you are</div></div><button class="x" data-job="x" title="Close">✕</button></div>
    <div class="jbar"><i style="width:${n * 25}%"></i></div><div class="bl">${n} of 4 steps done</div>
    ${st
      .map((x, i) => {
        const cls = x.done ? 'ok' : i === now ? 'now' : 'todo';
        return `<div class="st ${cls}"><div class="n">${x.done ? '✓' : i + 1}</div><div class="tx"><b>${x.t}</b><div class="d">${x.d}</div><div class="s">${x.done ? 'Done' : i === now ? 'Now' : 'To do'} · ${esc(x.s)}</div></div><div class="gos"><button class="go" data-job="${x.go}">${x.gl}</button>${x.x2 ? `<button class="go x2" data-job="${x.x2[0]}">${x.x2[1]}</button>` : ''}</div></div>`;
      })
      .join('')}
    <div class="st ${jobExported() ? 'ok' : 'todo'} end"><div class="n">⇩</div><div class="tx"><b>Then: export the monthly report</b><div class="d">the closing action of the month – every report in one Excel file</div><div class="s">${jobExported() ? 'exported for this cut ✓' : 'not exported for this cut yet'}</div></div><div class="gos"><button class="go" data-job="xl">⇩ Export the monthly report</button><button class="go x2" data-job="rep">Expenses ›</button></div></div>
    <div class="ft">How to code a row: Coding guide (side navigation) · this panel opens by itself after each update</div>`;
}
function jobOpen(on) {
  let m = $('mjob');
  if (!m) {
    m = document.createElement('div');
    m.id = 'mjob';
    m.className = 'mjob';
    document.body.appendChild(m);
  }
  m.hidden = !on;
  // one side panel at a time: the Monthly job closes the drawer
  if (on && $('drawer')) $('drawer').classList.remove('open', 'wide');
  renderJob();
}
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-job]');
  if (!b) return;
  const k = b.dataset.job;
  if (k === 'x') return jobOpen(false);
  if (k === 'upd') {
    if (DBF.db) $('bAdd').click();
    else {
      ST.tab = 'dlog';
      render();
    }
    return;
  }
  if (k === 'chk') ST.tab = 'chk';
  else if (k === 'cod') ST.tab = 'cod';
  else if (k === 'pkl') ST.tab = 'pkl';
  else if (k === 'xl')
    return $('bExport').onclick({ shiftKey: true }); // the full monthly report, whatever page is open
  else if (['uns', 'dep', 'own', 'adjl', 'bsum'].includes(k)) ST.tab = k;
  else if (k === 'rep') {
    ST.tab = 'xpm';
    ST.xpPage = 'month';
  }
  sel.clear();
  render();
});
$('bJob').onclick = () => jobOpen($('mjob') ? $('mjob').hidden : true);

// one side panel at a time: a drawer that opens closes the Monthly job; Esc closes it
new MutationObserver(() => {
  const m = $('mjob');
  if ($('drawer').classList.contains('open') && m && !m.hidden) jobOpen(false);
}).observe($('drawer'), { attributes: true, attributeFilter: ['class'] });
document.addEventListener('keydown', (e) => {
  const m = $('mjob');
  if (e.key === 'Escape' && m && !m.hidden) jobOpen(false);
});
