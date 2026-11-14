// =====================================================================================  Monthly job: the 5 steps of a month, each with its live status
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
  return [
    {
      t: 'Update with the new SAP files',
      d: 'Drop only the new SAP files on the register (CJI3, and ZSCPRG01, ZSCSRV1, ZINTC1, MB52 when there are new ones)',
      done: true,
      s: b0 ? `updated ${String(b0.built).slice(0, 10)} · cut ${b0.cut}` : `built ${META.built} · cut ${META.cut}`,
      go: 'upd',
      gl: DBF.db ? 'Update ›' : 'Data log ›',
    },
    {
      t: 'Check: difference to CJI3 = 0',
      d: 'The footer must show Difference 0.00 ✓',
      done: ok,
      s: ok ? 'difference 0.00' : 'difference ' + fmt2(R.diff) + ' – open Check',
      go: 'chk',
      gl: 'Checks ›',
    },
    {
      t: 'Code the new cost',
      d: 'PKG, MNL and cost element for every item – biggest first; name any new PKG',
      done: ls.pc >= 100 && !nn,
      s: `${ls.pc}% coded${ls.l >= 0.5 ? ' · ' + fmtM(ls.l) + ' left' : ''}${nn ? ' · ' + nn + ' PKG without a name' : ''}`,
      go: ls.pc >= 100 && nn ? 'pkl' : 'cod',
      gl: ls.pc >= 100 && nn ? 'Name PKGs ›' : 'Code ›',
    },
    {
      t: 'Decide what is not in CJI3 yet',
      d: 'Orders not settled, certificates not in CJI3, owner material, depreciation – add to the cost or not',
      done: !need || (dec && !(own && own.noRate)),
      s: !need
        ? 'nothing to decide this month'
        : (dec ? 'decided' : 'not decided yet') + (own && own.noRate ? ` · ${own.noRate} owner materials without a rate` : ''),
      go: 'adj',
      gl: 'Adjust ›',
    },
    {
      t: 'Report: Expenses and Excel',
      d: 'Look at Expenses › Summary for the month, then Export Excel for the monthly report',
      done: jobExported(),
      s: jobExported() ? 'exported for this cut' : 'not exported for this cut yet',
      go: 'rep',
      gl: 'Expenses ›',
    },
  ];
}
function renderJob() {
  const st = jobSteps(),
    n = st.filter((x) => x.done).length,
    now = st.findIndex((x) => !x.done);
  const c = $('jobN');
  if (c) c.textContent = n + ' / 5';
  const m = $('mjob');
  if (!m || m.hidden) return;
  m.innerHTML = `<div class="hd"><div><h2>Monthly job · ${esc(PER[R.rep] || '')}</h2><div class="sub">5 steps, the same every month · each step shows where you are</div></div><button class="x" data-job="x" title="Close">✕</button></div>
    <div class="jbar"><i style="width:${n * 20}%"></i></div><div class="bl">${n} of 5 steps done</div>
    ${st
      .map((x, i) => {
        const cls = x.done ? 'ok' : i === now ? 'now' : 'todo';
        return `<div class="st ${cls}"><div class="n">${x.done ? '✓' : i + 1}</div><div class="tx"><b>${x.t}</b><div class="d">${x.d}</div><div class="s">${x.done ? 'Done' : i === now ? 'Now' : 'To do'} · ${esc(x.s)}</div></div><button class="go" data-job="${x.go}">${x.gl}</button></div>`;
      })
      .join('')}
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
  else if (k === 'adj') return goSec('adj');
  else if (k === 'rep') {
    ST.tab = 'xpm';
    ST.xpPage = 'sum';
  }
  sel.clear();
  render();
});
$('bJob').onclick = () => jobOpen($('mjob') ? $('mjob').hidden : true);
