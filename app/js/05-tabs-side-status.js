// =====================================================================================  tabs
// the pages, by section: the 4 work steps of the month (in the nav) and the report / setup sections (Reports menu, Mapping rules, More)
const SECS = [
  ['chk', 'Update', ['chk', 'log', 'dlog']],
  ['cod', 'Code', ['cod', 'lines']],
  ['adj', 'Decide', ['adjl', ...(HASUNS ? ['uns'] : []), ...(HASOWN ? ['own'] : []), ...(DEPI >= 0 ? ['dep'] : [])]],
  ['bud', 'Forecast', ['bsum', 'bca', 'bprog', 'bpkg']],
  ['dash', 'Reports', ['sum', 'flow', 'drv', ...(MATI >= 0 ? ['mrate'] : [])]],
  ['xp', 'Reports', ['xpm']],
  ['rep', 'Reports', ['psum', 'gl', 'wbs']],
  ['codes', 'PKG names', ['pkl']],
  ['rul', 'Mapping rules', ['rules']],
  ['cli', 'Reports', ['cinv']],
];
const STEPS = ['chk', 'cod', 'adj', 'bud'],
  REPSEC = ['dash', 'xp', 'rep', 'cli'];
// the subcontractor pages live in other sections: POs in Code, Packages & rates and PO register in Reports, Bridge in Update
const SUBSEC = { po: 'cod', pkg: 'dash', reg: 'rep', bridge: 'chk' };
const secOf = (t) => (t === 'sub' ? SUBSEC[ST.sub] || 'dash' : (SECS.find((x) => x[2].includes(t)) || SECS[0])[0]),
  LASTT = {},
  LASTS = {};
// the side navigation: every page of the month with its status; it hides to a strip of icons and opens under the mouse (pin keeps it open)
const NIC = ((d) =>
  Object.fromEntries(
    Object.entries(d).map(([k, v]) => [
      k,
      `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${v}</svg>`,
    ])
  ))({
  dash: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  cod: '<path d="M4 6h16M4 12h10M4 18h7"/><path d="M17 15l3 3-3 3"/>',
  job: '<path d="M9 5h10M9 12h10M9 19h10"/><path d="M4 5l1.2 1.2L7 4.5M4 12l1.2 1.2L7 11.5"/><circle cx="5" cy="19" r="1.2"/>',
  bud: '<path d="M4 20h16"/><path d="M6 16l4-5 3 3 5-7"/><path d="M18 7h-3M18 7v3"/>',
  codes: '<path d="M5 3h12a2 2 0 0 1 2 2v16H7a2 2 0 0 1-2-2z"/><path d="M5 19a2 2 0 0 1 2-2h12M9 7h6M9 11h4"/>',
  sub: '<rect x="3" y="4" width="18" height="6" rx="1"/><rect x="3" y="14" width="8" height="6" rx="1"/><rect x="13" y="14" width="8" height="6" rx="1"/>',
  xp: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M9 9v11M15 9v11"/>',
  adj: '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
  chk: '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l3 3 5-6"/>',
  rep: '<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 13h7M9 17h7"/>',
  imp: '<path d="M12 16V4M7 9l5-5 5 5M4 20h16"/>',
  add: '<path d="M14 3H6v18h12V7z"/><path d="M14 3v4h4M12 11v6M9 14h6"/>',
  db: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
  save: '<path d="M5 3h11l3 3v15H5z"/><path d="M8 3v6h7V3M8 21v-7h8v7"/>',
  build: '<path d="M20 12a8 8 0 1 1-2.3-5.6"/><path d="M20 4v5h-5"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7M12 17h.01"/>',
  vat: '<path d="M6 18L18 6"/><circle cx="7.5" cy="7.5" r="2.5"/><circle cx="16.5" cy="16.5" r="2.5"/>',
  pin: '<path d="M9 4h6l-1 6 3 3H7l3-3z"/><path d="M12 13v7"/>',
  rul: '<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>',
  more: '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>',
});
// the menu: MONTH CLOSE (the 4 steps) · REPORTS (the main reports, All reports) · SETTINGS – words always; ☰ folds it to a rail
const NAVREP = [
  ['sum', '▤', 'Summary'],
  ['xpm', '▤', 'Expenses'],
  ['psum', '▤', 'PKG summary'],
  ['bsum', '▤', 'Budget'],
  ['cinv', '▤', 'Client invoices'],
  ...(SUBI >= 0 ? [['sub:reg', '▤', 'PO register']] : []),
];
$('tabs').innerHTML = STEPS.map(
  (k, n) =>
    `<button data-s="${k}"><span class="ni">${n + 1}</span><span class="tx">${(SECS.find((x) => x[0] === k) || [])[1]}</span><em class="nb"></em></button>`
).join('');
$('nrep').innerHTML = NAVREP.map(
  ([g, i, l], n) =>
    `<button class="nlk${n > 1 ? ' nfo' : ''}" data-ngo="${g}"><span class="ni">${i}</span><span class="tx">${l}</span></button>`
).join('');
$('nrep').onclick = (e) => {
  const b = e.target.closest('[data-ngo]');
  if (!b) return;
  const g = b.dataset.ngo;
  sel.clear();
  if (g.startsWith('sub:')) {
    ST.tab = 'sub';
    goSub(g.slice(4));
    return;
  }
  ST.tab = g;
  render();
};
let NAVFOLD = false;
try {
  NAVFOLD = localStorage.getItem('cr-navfold') === '1';
} catch (e) {
  /* per-viewer only */
}
const navFold = () => document.body.classList.toggle('navfold', NAVFOLD);
navFold();
$('bNavFold').onclick = () => {
  NAVFOLD = !NAVFOLD;
  try {
    localStorage.setItem('cr-navfold', NAVFOLD ? '1' : '0');
  } catch (e) {
    /* none */
  }
  navFold();
  window.dispatchEvent(new Event('resize'));
  render();
};
$('cUpd').onclick = () => $('bAdd').click();
// a step opens where you left it, else on its first open task (2 Code: the bucket with the most left; 3 Decide: the first question)
const goSec = (k) => {
  const sc = SECS.find((x) => x[0] === k);
  if (!LASTT[k] && ['cod', 'adj'].includes(k)) {
    const f = stepFirst(k);
    if (f) return stepGo(f);
  }
  ST.tab = sc[0] === 'chk' ? 'chk' : LASTT[sc[0]] || sc[2][0];
  if (ST.tab === 'sub') ST.sub = LASTS[sc[0]] || 'pkg';
  sel.clear();
  render();
  $('wrap').scrollTop = 0;
};
globalThis.__GO = goSec; // for the checks (test/run.js): open a section, as the nav or the Reports menu does
globalThis.__SEC = () => secOf(ST.tab);
globalThis.__SECS = () => SECS.map((x) => x[0]);
$('tabs').onclick = (e) => {
  const b = e.target.closest('button');
  if (b) goSec(b.dataset.s);
};
// what is left to code: per bucket and in all (by to-date cost, items set to Include = No are out)
function leftStats() {
  let A = 0,
    Lf = 0,
    n = 0;
  const bk = BK.map((b) => {
    let a = 0,
      l = 0,
      c = 0;
    b.items.forEach((it) => {
      if (it.inc === 'No') return;
      const v = Math.abs(it.td);
      a += v;
      if (statusOf(it) !== 'Coded') {
        l += v;
        c++;
      }
    });
    A += a;
    Lf += l;
    n += c;
    return { a, l, n: c, pc: a ? Math.floor((100 * (a - l)) / a) : 100 };
  });
  return { bk, a: A, l: Lf, n, pc: A ? Math.floor((100 * (A - Lf)) / A) : 100 };
}
// the page name on the top bar: the step (2 Code) or the report
const PGNAME = {
  sum: 'Summary',
  flow: 'Cost flow',
  drv: 'Cost drivers',
  mrate: 'Material rates',
  xpm: 'Expenses',
  psum: 'PKG summary',
  gl: 'GL · WBS',
  wbs: 'GL · WBS',
  pkl: 'PKG names',
  rules: 'Mapping rules',
  cinv: 'Client invoices',
  bsum: 'Budget',
  bca: 'Cost Analysis',
  bprog: 'Progress',
  bpkg: 'PKG pages',
};
// what each page is for, in one line (the page header)
const PGLINE = {
  chk: 'the new SAP files are in and every line ties to CJI3',
  cod: 'give the new items their PKG, MNL and cost element – the largest cost first',
  adj: 'what is not in CJI3 yet – add it to the cost or not',
  bud: 'the budget from your cost report · progress · ETC and EAC per PKG',
  sum: 'the month on one screen',
  flow: 'where the cost goes: bucket › PKG',
  drv: 'rates and monthly costs behind the cost',
  mrate: 'rate per unit, month by month',
  xpm: 'every item of every bucket by month',
  psum: 'Direct by PKG · Indirect by cost element',
  gl: 'by cost element or by WBS element',
  wbs: 'by cost element or by WBS element',
  cinv: 'the client invoices in CJI3 and the opening balance',
  rules: 'how every CJI3 line gets its bucket and its cost element',
  pkl: 'the name of every PKG',
  dlog: 'every file read, what it covers and how it is merged',
  log: 'every change you made, with time',
};
const pgName = () =>
  ST.tab === 'sub' && ST.sub === 'reg'
    ? 'PO register'
    : ST.tab === 'sub' && ST.sub === 'pkg'
      ? 'Packages & rates'
      : ST.tab === 'sub' && ST.sub === 'bridge'
        ? 'Bridge to CJI3'
        : PGNAME[ST.tab] || (ST.tab === 'dlog' ? 'Data log' : ST.tab === 'log' ? 'Changes' : '');
function renderProg() {
  const sec = secOf(ST.tab),
    n = STEPS.indexOf(sec),
    stepName = n >= 0 ? n + 1 + ' ' + SECS.find((x) => x[0] === sec)[1] : '',
    grp = n >= 0 ? 'Month close' : ['rul', 'codes'].includes(sec) ? 'Settings' : 'Reports';
  $('hgrp').textContent = grp;
  const xpn = ST.tab === 'xpm' ? (XPAGES.find((x) => x[0] === xpPage()) || XPAGES[0])[1] : '';
  $('hpage').textContent = n >= 0 ? stepName : (pgName() || (SECS.find((x) => x[0] === sec) || [])[1] || '') + (xpn ? ' · ' + xpn : '');
  // the page header: title, what it is for, the key figures of a step
  const kp = (l, v, cls) => `<div><span>${l}</span><b class="${cls || ''}">${v}</b></div>`,
    ok = Math.abs(R.diff) < 0.01,
    diff = kp('Difference to CJI3', ok ? '0.00 ✓' : fmt2(R.diff), ok ? 'g' : 'r');
  let fig = '';
  if (sec === 'chk') {
    const b0 = DBF.db ? dbBuilds()[0] : null;
    fig =
      diff +
      kp('CJI3 cost', fmt(META.cost)) +
      kp('Lines without a bucket', (META.unclassified || 0).toLocaleString('en-US'), META.unclassified ? 'r' : '') +
      kp('Last update', b0 ? String(b0.built).slice(0, 10) : META.built);
  } else if (sec === 'cod') {
    const ls = leftStats(),
      nn = pkNoName().length;
    fig =
      kp('To code', ls.n.toLocaleString('en-US') + ' items') +
      kp('Left', fmtM(ls.l)) +
      kp('Coded', ls.pc + '%') +
      kp('PKG without a name', nn, nn ? 'w' : '') +
      diff;
  } else if (sec === 'adj') {
    const T = stepTasks('adj'),
      open = T.filter((x) => !x.ok && !x.info).length;
    fig =
      kp('Still open', open ? open + ' of ' + T.length : '✓ none', open ? 'w' : 'g') +
      kp('Added to the cost', fmt((R.unsIn || 0) + (R.ownIn || 0))) +
      kp('Taken out', fmt((R.excl || 0) + (R.depExc || 0))) +
      diff;
  } else if (sec === 'bud') {
    if (ST.bud) {
      const C = budCalc(),
        t = budSum(budPkgs(C).flatMap((p) => [...C.pk.get(p).values()]));
      fig =
        kp('BAC', fmtM(t.bac)) +
        kp('EV', fmtM(t.ev)) +
        kp('AC', fmtM(t.ac)) +
        kp('EAC', fmtM(t.eac)) +
        kp('VAC', fmtM(t.vac), t.vac < -0.5 ? 'r' : 'g');
    } else fig = kp('Cost report', 'not read yet', 'w');
  }
  const cd = new Date(String(ST.cut) + 'T00:00:00'),
    cutTxt = isNaN(cd) ? '' : ' · to ' + cd.getDate() + ' ' + MON[cd.getMonth()] + ' ' + cd.getFullYear(),
    line =
      (xpn
        ? (XPAGES.find((x) => x[0] === xpPage()) || [])[2] || PGLINE.xpm
        : PGLINE[n >= 0 ? sec : ST.tab] || (ST.tab === 'sub' ? 'subcontractor POs, packages and rates' : '')) +
      (n < 0 && ['xpm', 'sum', 'psum', 'cinv', 'gl', 'wbs', 'flow', 'drv'].includes(ST.tab) ? cutTxt : '');
  $('phd').innerHTML =
    `<div class="r1"><h2>${esc(n >= 0 ? stepName : $('hpage').textContent)}</h2><span>${esc(line)}</span></div>${fig ? `<div class="kp">${fig}</div>` : ''}`;
  // ‹ back · Next › in the command bar on a step
  $('cmdNav').innerHTML =
    n >= 0
      ? `${n ? `<button data-stp="${STEPS[n - 1]}">‹ ${n} ${esc(SECS.find((x) => x[0] === STEPS[n - 1])[1])}</button>` : ''}${n < STEPS.length - 1 ? `<button class="nx" data-stp="${STEPS[n + 1]}">Next: ${n + 2} ${esc(SECS.find((x) => x[0] === STEPS[n + 1])[1])} ›</button>` : '<button class="nx" data-stp="rep">Reports ›</button>'}`
      : '';
}
$('cmdNav').onclick = (e) => {
  const b = e.target.closest('[data-stp]');
  if (!b) return;
  if (b.dataset.stp === 'rep') {
    ST.tab = 'sum';
    render();
  } else goSec(b.dataset.stp);
};
// the 4 steps of the month, each with where it is: ✓ done · gold = the step you are on · number = still to do
function stepState() {
  const J = jobSteps(),
    ok = J[1].done;
  return {
    chk: [ok, ok ? 'SAP files in · difference 0.00 ✓' : J[1].s],
    cod: [
      J[2].done,
      (() => {
        const ls = leftStats(),
          nn = pkNoName().length;
        return (
          (ls.n
            ? `${ls.pc}% coded · ${ls.n.toLocaleString('en-US')} item${ls.n === 1 ? '' : 's'} left · ${fmtM(ls.l)}`
            : 'everything is coded') + (nn ? ` · ${nn} PKG without a name` : '')
        );
      })(),
    ],
    adj: [J[3].done, J[3].s],
    bud: [!!ST.bud, ST.bud ? 'progress · ETC per PKG' : 'read the cost report first'],
  };
}
// the SAP files in the register and the months they cover, against the cut (gold line)
function dataIn() {
  const D = META.dlog || { files: [] },
    cut = String(ST.cut).slice(0, 7),
    by = new Map();
  (D.files || []).forEach((f) => {
    const e = by.get(f.src) || by.set(f.src, { first: '', last: '', n: 0 }).get(f.src);
    e.n++;
    if (f.first && (!e.first || f.first < e.first)) e.first = f.first;
    if (f.last && f.last > e.last) e.last = f.last;
  });
  const ms = [...by.values()].flatMap((e) => [e.first, e.last]).filter(Boolean),
    lo = ms.concat(cut).sort()[0],
    hiM = ms.concat(cut).sort().pop(),
    mi = (ym) => (+ym.slice(0, 4) - +lo.slice(0, 4)) * 12 + +ym.slice(5, 7) - +lo.slice(5, 7),
    span = mi(hiM) + 1,
    pc = (v) => Math.max(0, Math.min(100, (100 * v) / span)).toFixed(1),
    cx = pc(mi(cut) + 1);
  const row = (k, lab) => {
    const e = by.get(k);
    if (!e) return '';
    let c = '#4CAF6A',
      note = '',
      rng = e.first ? `${ymLbl(e.first)} → ${ymLbl(e.last)}` : 'stock · ' + ymLbl(cut);
    if (e.last && e.last < cut) {
      c = '#D64545';
      note = `ends ${ymLbl(e.last)} – before the cut`;
    } else if (e.last && e.last > cut && k !== 'zintc1') {
      c = '#E9B949';
      note = k === 'zscprg01' ? `${ymLbl(e.last)} certificates: after the cut – not in CJI3 yet` : `${ymLbl(e.last)}: after the cut`;
    }
    const bar = e.first
      ? `<i style="left:${pc(mi(e.first))}%;width:${(pc(mi(e.last) + 1) - pc(mi(e.first))).toFixed(1)}%"></i>`
      : `<i style="left:${(cx - 3).toFixed(1)}%;width:3%"></i>`;
    return `<div class="f"><span class="d" style="background:${c}"></span><b>${lab}</b><em>${rng}</em><span class="bar">${bar}<u style="left:${cx}%"></u></span>${note ? `<span class="note">${esc(note)}</span>` : ''}</div>`;
  };
  const cr = ST.bud
    ? `<div class="f"><span class="d" style="background:#4CAF6A"></span><b>Cost report</b><em>read ${esc(String(ST.bud.at || '').slice(0, 10))}</em></div>`
    : `<div class="f miss"><span class="d" style="background:#D97706"></span><b>Cost report</b><em>not read</em><span class="note">Budget, EV and EAC need it</span></div>`;
  const cd = new Date(String(ST.cut) + 'T00:00:00');
  return `<div class="t">DATA IN <b>cut ${isNaN(cd) ? esc(ST.cut) : cd.getDate() + ' ' + MON[cd.getMonth()] + ' ' + cd.getFullYear()}</b></div>${[
    ['cji3', 'CJI3'],
    ['zscprg01', 'ZSCPRG01'],
    ['zintc1', 'ZINTC1'],
    ['mb52', 'MB52'],
  ]
    .map(([k, l]) => row(k, l))
    .join('')}${cr}<div class="lg">gold line = the cut · click for the Data log</div>`;
}
function navBadges() {
  const cur = secOf(ST.tab),
    ls = leftStats();
  const badge = {
    chk: Math.abs(R.diff) < 0.01 && !META.unclassified && !mapStale() ? ['✓', 'ok'] : ['!', 'bad'],
    cod: ls.n ? [ls.n > 999 ? Math.round(ls.n / 100) / 10 + 'k' : String(ls.n), 'w'] : ['✓', 'ok'],
    adj: (() => {
      const o = stepTasks('adj').filter((x) => !x.ok && !x.info).length;
      return o ? [String(o), 'w'] : ['✓', 'ok'];
    })(),
    bud: ST.bud ? ['✓', 'ok'] : ['!', 'bad'],
  };
  const st = stepState();
  document.querySelectorAll('#tabs button').forEach((b, n) => {
    const k = b.dataset.s,
      [v, c] = badge[k];
    b.classList.toggle('on', k === cur);
    const em = b.querySelector('em');
    em.textContent = v;
    em.className = 'nb ' + c;
    b.title = n + 1 + ' ' + SECS.find((x) => x[0] === k)[1] + ' · ' + st[k][1];
  });
  document.querySelectorAll('#nrep [data-ngo]').forEach((b) => {
    const g = b.dataset.ngo;
    b.classList.toggle(
      'on',
      g.startsWith('sub:')
        ? ST.tab === 'sub' && ST.sub === g.slice(4)
        : ST.tab === g || (g === 'bsum' && ['bca', 'bprog', 'bpkg'].includes(ST.tab) && false)
    );
  });
  // the project card on top of the menu
  {
    const mon = new Date(String(ST.cut) + 'T00:00:00');
    $('nprj').innerHTML =
      `<b>${esc(META.project || '')}</b><small>${esc(DBF.name || 'no data file')} · ${isNaN(mon) ? '' : MON[mon.getMonth()] + '-' + String(mon.getFullYear()).slice(2)}</small>`;
  }
  $('din').innerHTML = dataIn();
  const warn = (META.dlog && (META.dlog.files || []).some((f) => f.last && f.last < String(ST.cut).slice(0, 7))) || !ST.bud;
  $('dataSt').innerHTML = `<b class="${warn ? 'w' : 'ok'}">${warn ? '!' : '✓'}</b>`;
  const nn = pkNoName().length;
  $('pklSt').innerHTML = nn ? `<b class="w">${nn}</b>` : '';
  const um = mapUnmapped(),
    stl = mapStale();
  $('rulSt').innerHTML = stl ? `<b class="bad">↻</b>` : um ? `<b class="bad">${um.toLocaleString('en-US')}</b>` : '<b class="ok">✓</b>';
  $('bRules').title = stl
    ? 'Mapping rules – lines sorted with older rules: rebuild'
    : um
      ? `Mapping rules – ${um} lines not mapped`
      : 'Mapping rules – all mapped ✓';
  $('bRules').classList.toggle('on', ST.tab === 'rules');
  $('bPkl').classList.toggle('on', ST.tab === 'pkl');
  $('bReports').classList.toggle('on', !$('repm').hidden);
}
// Data files: the files and months against the cut, opened from the menu
$('bData').onclick = (e) => {
  e.stopPropagation();
  const d = $('din'),
    r = $('bData').getBoundingClientRect();
  d.hidden = !d.hidden;
  d.style.top = Math.min(r.top, innerHeight - 380) + 'px';
};
$('din').onclick = () => {
  $('din').hidden = true;
  ST.tab = 'dlog';
  render();
};
document.addEventListener('click', (e) => {
  if (!$('din').hidden && !e.target.closest('#din') && !e.target.closest('#bData')) $('din').hidden = true;
});
$('nprj').onclick = () => $('bDb').click();
$('bRules').onclick = () => {
  ST.tab = 'rules';
  sel.clear();
  render();
};
$('bDlog').onclick = () => {
  ST.tab = 'dlog';
  render();
};
$('bPkl').onclick = () => {
  ST.tab = 'pkl';
  render();
};
$('bMore').onclick = () => {
  $('nmore').hidden = !$('nmore').hidden;
  $('bMore').classList.toggle('on', !$('nmore').hidden);
  const n = document.querySelector('#nav .nin');
  n.scrollTop = n.scrollHeight;
};
// Reports: one menu – Cost · Budget · Subcontract · Material
function repMenu() {
  const a = (go, l, d, on) => `<a data-rgo="${go}" class="${on ? 'on' : ''}">${l}${d ? ` <small>${d}</small>` : ''}</a>`,
    isSub = (v) => ST.tab === 'sub' && ST.sub === v,
    g = (t, c, links) => `<div class="grp" style="--c:${c}"><h4>${t}</h4>${links.join('')}</div>`;
  return (
    g('COST', '#1F4E9A', [
      a('sum', 'Summary', 'one screen', ST.tab === 'sum'),
      a('xpm', 'Expenses', 'per month · by PKG', ST.tab === 'xpm'),
      a('flow', 'Cost flow', 'bucket › PKG', ST.tab === 'flow'),
      a('drv', 'Cost drivers', 'rates and monthly costs', ST.tab === 'drv'),
      a('psum', 'PKG summary', 'Direct · Indirect', ST.tab === 'psum'),
      a(ST.glw || 'gl', 'GL · WBS', 'by cost element or WBS', ST.tab === 'gl' || ST.tab === 'wbs'),
    ]) +
    g('CLIENT', '#0F766E', [a('cinv', 'Client invoices', 'invoice register · WBS × month · margin', ST.tab === 'cinv')]) +
    g('BUDGET', '#2E7D32', [
      a('bsum', 'All PKGs', 'Civil · Arch · MEP', ST.tab === 'bsum'),
      a('bpkg', 'PKG pages', 'EVM · ETC · EAC', ST.tab === 'bpkg'),
      a('bca', 'Cost Analysis', 'BOQ items · resources', ST.tab === 'bca'),
    ]) +
    (SUBI >= 0
      ? g('SUBCONTRACT', '#E07B39', [
          a('sub:reg', 'PO register', 'every PO and its status', isSub('reg')),
          a('sub:pkg', 'Packages &amp; rates', 'rate per unit by month', isSub('pkg')),
        ])
      : '') +
    (MATI >= 0
      ? g('MATERIAL', '#8E5EA2', [
          a('mrate', 'Material rates', 'rate per unit by month', ST.tab === 'mrate'),
          ...(HASOWN ? [a('own', 'Owner material', 'quantity × your rate', ST.tab === 'own')] : []),
        ])
      : '') +
    `<div class="ft">Every report has ⇩ Excel · the monthly report (all of them in one file) is ⇩ Export Excel on the top bar</div>`
  );
}
const repClose = () => {
  $('repm').hidden = true;
  $('bReports').classList.toggle('on', REPSEC.includes(secOf(ST.tab)) || (ST.tab === 'sub' && ['reg', 'pkg'].includes(ST.sub)));
};
$('bReports').onclick = (e) => {
  e.stopPropagation();
  if (!$('repm').hidden) return repClose();
  const m = $('repm'),
    r = $('bReports').getBoundingClientRect();
  m.innerHTML = repMenu();
  m.hidden = false;
  m.style.left = r.right + 8 + 'px';
  m.style.top = Math.max(64, Math.min(r.top - 40, innerHeight - m.offsetHeight - 12)) + 'px';
  $('bReports').classList.add('on');
};
$('repm').onclick = (e) => {
  const a = e.target.closest('[data-rgo]');
  if (!a) return;
  const g = a.dataset.rgo;
  repClose();
  sel.clear();
  if (g.startsWith('sub:')) {
    ST.tab = 'sub';
    goSub(g.slice(4));
    return;
  }
  ST.tab = g;
  if (g === 'mrate') ST.bk = MATI;
  if (g === 'gl' || g === 'wbs') ST.glw = g;
  render();
  $('wrap').scrollTop = 0;
};
document.addEventListener('click', (e) => {
  if (!$('repm').hidden && !e.target.closest('#repm') && !e.target.closest('#bReports')) repClose();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !$('repm').hidden) repClose();
});
let SIDEC = innerWidth < 1500;
try {
  const v = localStorage.getItem('cr-side');
  if (v !== null) SIDEC = v === '1';
} catch (e) {
  /* none */
}
const zoomSeg = (b) => {
  if (!b.tree) return '';
  const S1 = vs(),
    zm = !S1.fold.size ? 'it' : [...S1.fold].every((k) => k.startsWith('F:')) ? 'fam' : 'grp';
  return `<span class="seg" title="Zoom: families › groups › items">${hasFam(b) ? `<button data-zm="fam" class="${zm === 'fam' ? 'on' : ''}">Families</button>` : ''}<button data-zm="grp" class="${zm === 'grp' ? 'on' : ''}">Groups</button><button data-zm="it" class="${zm === 'it' ? 'on' : ''}">Items</button></span>`;
};
const famLabel = (f, rs) => {
  const its = rs.map((r) => r.it),
    c = its.filter((x) => statusOf(x) === 'Coded'),
    td = its.reduce((x, y) => x + y.td, 0),
    tdc = c.reduce((x, y) => x + y.td, 0);
  return `<span dir="auto" style="unicode-bidi:isolate">${esc(f)}</span><span class="gm">${((n) => n + (n === 1 ? ' group' : ' groups'))(new Set(its.map((x) => x.grp)).size)} · ${its.length} items · coded ${c.length}/${its.length}</span><span class="gb"><i style="width:${td ? ((100 * tdc) / td).toFixed(0) : 0}%"></i></span>`;
};
const famOf = (g) => (String(g).includes('›') ? String(g).split('›')[0].trim() : String(g)),
  grpTail = (g) => (String(g).includes('›') ? String(g).split('›').slice(1).join('›').trim() : String(g)),
  hasFam = (b) => !!b.tree && b.items.some((it) => String(it.grp).includes('›'));
const abbr = (t) => {
  const w = String(t)
    .split(/[\s/]+/)
    .filter(Boolean);
  return w.length > 1
    ? w
        .map((x) => x[0].toUpperCase())
        .join('')
        .slice(0, 3)
    : String(t).slice(0, 3);
};
const sdi = (go, on, c, t, a, s1, s2, pg) =>
  `<div class="sdi${on ? ' on' : ''}" ${go} style="--c:${c}" title="${esc(t)}${s1 ? ' · ' + String(s1).replace(/<[^>]+>/g, '') : ''}"><b>${esc(t)}</b>${a ? `<span class="a">${a}</span>` : ''}${s1 !== undefined ? `<small>${s1}</small>` : ''}${pg !== undefined ? `<div class="pg"><i style="width:${pg}%"></i></div>` : ''}</div>`;
function renderSide() {
  const sec = ST.tab === 'sub' && ST.sub === 'pkg' ? 'sub' : secOf(ST.tab),
    el = $('side'),
    items = [];
  if (sec === 'rul' || sec === 'cli') {
    el.className = 'hid';
    el.innerHTML = '';
    return;
  } // the packages page keeps its own list of packages   // items: [go-attrs, on, colour, title, right, sub1, sub2, progress, rail-label]
  let head = '',
    foot = '',
    extra = {};
  if (sec === 'cod') {
    // a tab per bucket (what is left on each) and, for the bucket open, its groups in a pick list
    const LS = leftStats().bk,
      gt = ST.tab === 'lines' ? 'lines' : 'cod',
      order = BK.map((b, bi) => bi).sort((x, y) => (LS[y].n ? 1 : 0) - (LS[x].n ? 1 : 0) || 0);
    const tab = (bi) => {
      const b = BK[bi],
        x = LS[bi],
        on = ST.bk === bi;
      return `<div class="rk${on ? ' on' : ''}"><div class="rh" data-gt="${gt}" data-bk="${bi}" style="--c:${bkColor(bi)}" title="${esc(b.id)} · to date ${fmtM(b.items.reduce((t, it) => t + it.td, 0))}${x.n ? ' · ' + x.n + ' to code' : ' · all coded'}"><div class="r1"><b>${esc(b.short || b.id)}</b>${x.n ? `<span>${x.n.toLocaleString('en-US')}</span>` : '<span class="dn">✓</span>'}</div><div class="pg"><i style="width:${x.pc}%"></i></div><small>${x.n ? fmtM(x.l) + ' left' : 'all coded'}</small></div></div>`;
    };
    let grp = '';
    const b = BK[ST.bk];
    if (b && b.tree) {
      const g = new Map();
      b.items.forEach((it) => {
        const e = g.get(it.grp) || g.set(it.grp, { n: 0, t: 0, c: 0 }).get(it.grp);
        e.n++;
        e.t += it.td;
        if (it.inc !== 'No' && statusOf(it) !== 'Coded') e.c++;
      });
      const cur = ST.grpSel[ST.bk] || '';
      grp = `<label class="sgrp">Group <select data-grpsel="1"><option value="">All groups · ${LS[ST.bk].n.toLocaleString('en-US')} to code</option>${[
        ...g,
      ]
        .sort((x1, y) => y[1].t - x1[1].t)
        .map(
          ([k, v]) =>
            `<option value="${esc(k)}" ${cur === k ? 'selected' : ''}>${esc(String(grpTail(k)).trim() || '(none)')} · ${v.c ? v.c + ' to code' : '✓'}</option>`
        )
        .join('')}</select></label>`;
    }
    el.className = 'tabs';
    el.innerHTML = `<div class="ls">${order.map(tab).join('')}</div>${grp}`;
    return;
  } else if (sec === 'sub') {
    const ps = pkSide(false),
      more = [
        ['reg', 'PO register', 'every PO and its status'],
        ['bridge', 'Bridge to CJI3', 'certificates vs CJI3'],
      ];
    el.className = 'tabs';
    el.innerHTML = `<div class="ls">${ps.body}${more.map(([k, l, d]) => sdi(`data-gt="sub" data-sv="${k}"`, ST.sub === k, '#C9CED6', l, '', d, '')).join('')}</div><div class="ft">${ps.foot}</div>`;
    return;
  } else if (sec === 'adj') {
    head = '3 Decide';
    {
      const ar = adjRows().filter((r) => r.on);
      items.push([
        'data-gt="adjl"',
        ST.tab === 'adjl',
        '#14254A',
        'Adjustment lines',
        ar.length.toLocaleString('en-US'),
        'every adjustment, line by line · CJI3 → To date',
        '',
        undefined,
        'Adj',
      ]);
    }
    const ua = (v) => R.unsInK[v] + R.unsExcK[v];
    if (HASUNS) {
      items.push(['sec', 'Not in CJI3 yet – add to the cost?']);
      if (R.unsMk.o.size)
        items.push([
          `data-gt="uns" data-uv="o"`,
          ST.tab === 'uns' && ST.unsView === 'o',
          '#3E6FA8',
          'Orders not settled',
          fmtM(ua('o')),
          R.unsInK.o ? 'ZINTC1 · added ' + fmt(R.unsInK.o) : 'ZINTC1 · not added yet',
          '',
          undefined,
          'Ord',
        ]);
      if (R.unsMk.c.size)
        items.push([
          `data-gt="uns" data-uv="c"`,
          ST.tab === 'uns' && ST.unsView === 'c',
          '#2F7F7A',
          'Certificates not in CJI3',
          fmtM(ua('c')),
          R.unsInK.c ? 'added ' + fmt(R.unsInK.c) : 'not added yet',
          '',
          undefined,
          'Cer',
        ]);
    }
    if (HASOWN) {
      const o = ownStats();
      items.push(['sec', 'Quantity only – value it?']);
      items.push([
        'data-gt="own"',
        ST.tab === 'own',
        '#B8860B',
        'Owner-supplied material',
        R.ownIn ? fmtM(R.ownIn) : '',
        `${o.n} materials · ${o.noRate ? o.noRate + ' without a rate' : 'every one has a rate'}${o.out ? ' · ' + o.out + ' not counted' : ''}`,
        '',
        undefined,
        'Own',
      ]);
    }
    if (DEPI >= 0) {
      const all = [...R.depM.values()].reduce((x, e) => x + e.all, 0);
      items.push(['sec', 'In CJI3 – take out?']);
      items.push([
        'data-gt="dep"',
        ST.tab === 'dep',
        '#5F6B7A',
        'Asset depreciation',
        fmtM(all),
        R.depExc ? 'taken out ' + fmt(R.depExc) : 'kept in the cost',
        '',
        undefined,
        'Dep',
      ]);
    }
  } else if (sec === 'chk') {
    head = '1 Update';
    const ok = Math.abs(R.diff) < 0.01;
    items.push([
      'data-gt="chk"',
      ST.tab === 'chk',
      ok ? '#2F6B3A' : '#9B2C2C',
      'All checks',
      ok ? '✓' : '!',
      'Difference to CJI3 ' + (ok ? '0.00' : fmt2(R.diff)),
      '',
      undefined,
      'Chk',
    ]);
    items.push([
      'data-gt="log"',
      ST.tab === 'log',
      '#5F6B7A',
      'Changes',
      String(ST.log.length),
      'every change you made, with time',
      '',
      undefined,
      'Log',
    ]);
    if (SUBI >= 0)
      items.push([
        'data-gt="sub" data-sv="bridge"',
        ST.tab === 'sub' && ST.sub === 'bridge',
        '#E07B39',
        'Bridge to CJI3',
        '',
        'subcontractor certificates vs CJI3',
        '',
        undefined,
        'Brg',
      ]);
    {
      const ov = ((META.dlog && META.dlog.ovl) || []).length;
      items.push([
        'data-gt="dlog"',
        ST.tab === 'dlog',
        '#2F5597',
        'Data log',
        ov ? `<span style="color:#9B2C2C">${ov}</span>` : '✓',
        ov ? 'files overlap – see how they are merged' : 'files · coverage · updates',
        '',
        undefined,
        'Log',
      ]);
    }
  } else if (sec === 'bud') {
    head = 'Budget';
    budSide(items);
  } else if (sec === 'codes') {
    head = 'Your codes';
    const nn = pkNoName().length;
    items.push([
      'data-gt="pkl"',
      ST.tab === 'pkl',
      '#1F4E9A',
      'PKG list',
      nn ? `<span style="color:#9B2C2C">${nn}</span>` : '✓',
      nn ? nn + ' PKG without a name' : 'every PKG has a name',
      '',
      undefined,
      'PKG',
    ]);
  } else if (sec === 'xp') {
    head = 'Expenses · reports';
    XPAGES.forEach(([k, l, d], n) =>
      items.push([
        `data-gt="xpm" data-xp="${k}"`,
        ST.tab === 'xpm' && xpPage() === k,
        PAL[n],
        l,
        '',
        undefined,
        '',
        undefined,
        String(n + 1),
      ])
    );
  } else if (sec === 'dash') {
    head = 'Dashboard';
    [
      ['sum', 'Summary', 'one-screen view'],
      ['flow', 'Cost flow', 'where the cost goes: bucket › PKG'],
      ['drv', 'Cost drivers', 'rates and monthly costs behind the cost'],
    ].forEach(([k, l, d], i) => items.push([`data-gt="${k}"`, ST.tab === k, PAL[i], l, '', d, '', undefined, l.slice(0, 3)]));
    if (MATI >= 0 || SUBI >= 0)
      items.push([
        'data-rates="1"',
        ST.tab === 'mrate' || (ST.tab === 'sub' && ST.sub === 'pkg'),
        PAL[3],
        'Rates',
        '',
        [MATI >= 0 ? 'material' : '', SUBI >= 0 ? 'subcontractor' : ''].filter(Boolean).join(' · ') + ': rate per unit, by month',
        '',
        undefined,
        'Rat',
      ]);
  } else {
    head = 'Reports';
    [['psum', 'PKG summary', 'Direct by PKG · Indirect by cost element']].forEach(([k, l, d], i) =>
      items.push([`data-gt="${k}"`, ST.tab === k, PAL[i], l, '', d, '', undefined, l.slice(0, 3)])
    );
    items.push([
      `data-gt="${ST.glw || 'gl'}"`,
      ST.tab === 'gl' || ST.tab === 'wbs',
      PAL[1],
      'GL · WBS',
      '',
      'by cost element or by WBS element – switch on the page',
      '',
      undefined,
      'GL',
    ]);
    if (SUBI >= 0)
      items.push([
        'data-gt="sub" data-sv="reg"',
        ST.tab === 'sub' && ST.sub === 'reg',
        '#E07B39',
        'PO register',
        '',
        'every PO and its status · Excel',
        '',
        undefined,
        'POs',
      ]);
  }
  el.className = items.length ? 'tabs' + (sec === 'dash' ? ' nosub' : '') : 'hid';
  el.innerHTML = `<div class="ls">${items
    .filter((x) => x[0] !== 'sec')
    .map((x, k) => sdi(...x.slice(0, 8)) + (extra[k] || ''))
    .join('')}</div>${foot ? `<div class="ft">${foot}</div>` : ''}`;
}
$('side').addEventListener('change', (e) => {
  const g = e.target.closest('[data-grpsel]');
  if (!g) return;
  ST.grpSel[ST.bk] = g.value;
  sel.clear();
  render();
  $('wrap').scrollTop = 0;
});
$('side').addEventListener('click', (e) => {
  if (e.target.closest('[data-side]')) {
    SIDEC = !SIDEC;
    try {
      localStorage.setItem('cr-side', SIDEC ? '1' : '0');
    } catch (x) {
      /* none */
    }
    render();
    return;
  }
  const g = e.target.closest('[data-grp]');
  if (g) {
    ST.grpSel[ST.bk] = g.dataset.grp;
    sel.clear();
    render();
    $('wrap').scrollTop = 0;
    return;
  }
  if (e.target.closest('#side [data-rates]')) {
    // Rates: the last of Material / Subcontractor (Material first)
    sel.clear();
    if (ST.rates === 's' || MATI < 0) {
      ST.tab = 'sub';
      goSub('rate');
    } else {
      ST.tab = 'mrate';
      ST.bk = MATI;
      render();
    }
    return;
  }
  const a = e.target.closest('[data-gt]');
  if (!a) return;
  ST.tab = a.dataset.gt;
  if (a.dataset.bk) {
    ST.bk = +a.dataset.bk;
  }
  if (ST.tab === 'mrate') ST.bk = MATI;
  if (a.dataset.xp) ST.xpPage = a.dataset.xp;
  if (a.dataset.uv) ST.unsView = a.dataset.uv;
  if (a.dataset.bp) ST.bpk = a.dataset.bp;
  sel.clear();
  if (a.dataset.sv) {
    goSub(a.dataset.sv);
    return;
  }
  render();
  $('wrap').scrollTop = 0;
});
// status bar: the totals of the register and everything you included / excluded, on every tab
function renderStatus() {
  const it = (l, v, cls, go, tip) =>
      `<${go ? 'a' : 'span'} class="si ${cls || ''}"${go ? ` data-sgo="${go}"` : ''}${tip ? ` title="${esc(tip)}"` : ''}><span>${l}</span><b>${v}</b></${go ? 'a' : 'span'}>`,
    sep = '<i class="sep"></i>';
  const z = (v) => (Math.abs(v) < 0.005 ? 'zero' : ''),
    inc = BK.flatMap((b) => b.items.filter((x) => x.inc !== 'No')),
    tdA = inc.reduce((s2, x) => s2 + x.td, 0),
    tdF = inc.filter((x) => statusOf(x) === 'Coded').reduce((s2, x) => s2 + x.td, 0);
  const hand = R.hand ? R.hand.reduce((s2, v) => s2 + v, 0) : 0,
    ok = Math.abs(R.diff) < 0.01,
    uo = R.unsInK ? R.unsInK.o : 0,
    uc = R.unsInK ? R.unsInK.c : 0;
  $('sbar').innerHTML = [
    it(
      'CJI3',
      fmt(META.cost),
      '',
      'xl',
      'The CJI3 file total. It is more than To date by Pending, Excluded, Depreciation out and Client deductions – Difference is what is left and must be 0'
    ),
    it('To date', fmt(R.toDate), '', 'xl', 'The cost counted up to the cut date – CJI3 less what is shown to the right'),
    it(R.repLab, fmt(R.thisM), '', 'pm', 'This month'),
    ...(z(R.pend) ? [] : [it('Pending', fmt(R.pend), '')]),
    it(
      'Difference',
      ok ? '0.00 ✓' : fmt2(R.diff),
      ok ? 'ok' : 'bad',
      'chk',
      'CJI3 − To date − Pending − Excluded − Depreciation out − Client deductions (+ what you added). Must be 0'
    ),
    sep,
    ...(z(R.excl) ? [] : [it('Excluded', fmt(R.excl), 'exc', 'adj:' + ADJK.exc, 'Items / lines set to Include = No')]),
    ...(SUBI >= 0 && !z(R.vatIn) ? [it('VAT in', fmt(R.vatIn), z(R.vatIn) || 'inc', 'adj:' + ADJK.vat, ST.vat)] : []),
    ...(R.unsMk && R.unsMk.o.size && uo
      ? [it('Orders in', fmt(uo), z(uo) || 'inc', 'adj:' + ADJK.ord, 'ZINTC1 orders not yet settled, included by you')]
      : []),
    ...(R.unsMk && R.unsMk.c.size && uc
      ? [it('Certificates in', fmt(uc), z(uc) || 'inc', 'adj:' + ADJK.cert, 'Certificates not in CJI3, included by you')]
      : []),
    ...(R.ownIn
      ? [
          it(
            'Owner material in',
            fmt(R.ownIn),
            'inc',
            'adj:' + ADJK.own,
            'Owner-supplied material valued at your rates (quantity × rate) – added to the cost'
          ),
        ]
      : []),
    ...(DEPI >= 0 && !z(R.depExc)
      ? [it('Depreciation out', fmt(R.depExc), z(R.depExc) || 'exc', 'adj:' + ADJK.dep, 'CJI3 depreciation excluded by you')]
      : []),
    ...(Math.abs(R.cdAll) >= 0.5
      ? [
          it(
            'Client deductions',
            fmt(R.cdAll),
            'exc',
            'adj:' + ADJK.cd,
            'Client deductions in CJI3 booked with revenue – in the CJI3 total, not counted as cost'
          ),
        ]
      : []),
    sep,
    ...(hand ? [it('Hand-coded lines', hand.toLocaleString('en-US'), '', 'lines')] : []),
    ...(pkNoName().length
      ? [
          it(
            '⚠ PKG without a name',
            String(pkNoName().length),
            'warn',
            'pkl:no',
            'PKGs used in your coding that have no name yet – the reports show only the code. Click to name them'
          ),
        ]
      : []),
  ].join('');
  $('hasv').innerHTML =
    !DBF.db && DBF.pendH
      ? `<a class="asv amb" data-asgo="allow" title="Opened from this browser's copy of your last build – the first click connects the data file again (choose Allow on every visit)">⟳ ${esc(DBF.pendH.name)} · click to reconnect</a>`
      : DBF.db
        ? DBF.ro
          ? `<a class="asv amb" data-dbgo="latest" title="An older build from the data file – changes are not saved">🔒 Read only · cut ${esc(META.cut)} · back to the latest</a>`
          : DBF.st === 'ok'
            ? `<span class="asv ok" title="Every change is saved to ${esc(DBF.name)} by itself · updated ${esc(String((dbBuilds()[0] || {}).built || '').slice(0, 10))}">✓ Saved${DBF.at ? ' · ' + DBF.at : ''}</span>`
            : DBF.st === 'perm'
              ? `<a class="asv amb" data-asgo="allow" title="The browser asks again – one click">⟳ Click to keep saving to ${esc(DBF.name)}</a>`
              : `<a class="asv red" data-dbgo="dl" title="This browser cannot write to the file – download it to keep your work">⇩ Save data file ${esc(DBF.name)}</a>`
        : AS.h && AS.st === 'ok'
          ? `<span class="asv ok" title="Every change is saved to this file by itself">✓ Auto-saved · ${esc(asName())}${AS.at ? ' · ' + AS.at : ''}</span>`
          : AS.h
            ? `<a class="asv amb" data-asgo="allow" title="The browser asks again after the Tool is reopened – one click">⟳ Click to keep auto-saving</a>`
            : `<a class="asv red" data-asgo="pick" title="${(DIRTY > 0 ? DIRTY.toLocaleString('en-US') + ' change' + (DIRTY > 1 ? 's' : '') + ' not in a file yet. ' : '') + (AS.ok ? 'Your codes are only in this browser – choose a file once and every change saves itself' : 'This browser cannot auto-save: use Save to keep your codes in a file')}">⚠ Not saved to a file · <u>${AS.ok ? 'Choose file' : 'Save'}</u></a>`;
}
document.addEventListener('click', (e) => {
  const g = e.target.closest('[data-asgo]');
  if (g) {
    if (g.dataset.asgo === 'pick') asPick();
    else asAllow();
  }
});
document.addEventListener('click', (e) => {
  const a = e.target.closest('#sbar [data-sgo]');
  if (!a) return;
  if (a.dataset.sgo === 'save') {
    $('bSave').click();
    return;
  }
  const [t, v] = a.dataset.sgo.split(':');
  if (t === 'xl') {
    ST.tab = 'xpm';
    ST.xpPage = 'lines';
    ST.xpLF = null;
  } else if (t === 'pkl') {
    ST.tab = 'pkl'; // the whole list – a PKG without a name shows "No name yet" on its row
  } else if (t === 'adj') {
    ST.tab = 'adjl';
    ST.adjK0 = v || '';
    ST.adjAll = false;
  } else {
    ST.tab = t === 'chk' ? 'chk' : t;
    if (v) ST.unsView = v;
  }
  sel.clear();
  render();
});
let GUIDE_OFF = false;
try {
  GUIDE_OFF = localStorage.getItem('crt:guideOff') === '1';
} catch (e) {
  /* per-viewer only */
}
function renderGuide() {
  const g = $('guide');
  if (ST.tab === 'cod' && ST.next) {
    g.hidden = false;
    g.className = 'gs kb';
    g.innerHTML =
      '<b>Keys:</b><span><kbd>Enter</kbd> accept the grey suggestion / next row</span><span><kbd>Ctrl</kbd>+<kbd>D</kbd> same as the row above</span><span><kbd>Esc</kbd> skip</span><span>☐ tick several rows → one code for all</span><span id="nxbar" style="margin-left:auto"></span>';
    return;
  }
  g.className = 'gs';
  const on = ST.tab === 'cod' && !GUIDE_OFF;
  g.hidden = !on;
  $('bHelp').classList.toggle('on', ST.tab === 'cod' && !GUIDE_OFF);
  if (!on) return;
  const sub = isSub(ST.bk);
  g.innerHTML = `<div class="lead"><h4>Start here – coding an item</h4><span class="s">Each item needs <b>${sub ? 4 : 3} codes</b>. When all ${sub ? 4 : 3} are filled the status turns <b style="color:#2F6B3A">Coded</b>.</span></div>
    <div><span class="k">PKG</span><b>Which package pays for it</b><div class="s">e.g. <b>S03</b> Concrete works. Pick from the list. Indirect items use <b>Indirect</b>.</div></div>
    <div><span class="k">MNL</span><b>What kind of cost</b><div class="s">MAT material · SUB subcontract · LAB labour · EQU equipment · OTHER. Filled for you from the bucket.</div></div>
    <div><span class="k">Cost element</span><b>What it is inside the package</b><div class="s">e.g. <b>STEEL</b>, <b>CONC</b>. Your own short code.${sub ? ' Subcontractor items also need <b>DIV</b> (the CSI division).' : ''}</div></div>
    <button class="x" id="gHide" title="Hide – bring it back with ? in the top bar">✕ hide</button>
    <div class="ft"><span>💡 Tick several rows → give them one code at once</span><span>✓ Indirect items (G&amp;A, equipment, fleet, house rent) are already coded from their SAP GL</span><span style="margin-left:auto">Your PKG list and names: <button id="gPk">Reports › PKG summary › Codes &amp; groups</button></span></div>`;
  $('gHide').onclick = () => {
    GUIDE_OFF = true;
    try {
      localStorage.setItem('crt:guideOff', '1');
    } catch (e) {
      /* none */
    }
    renderGuide();
  };
  $('gPk').onclick = () => {
    ST.tab = 'pkl';
    render();
    $('wrap').scrollTop = 0;
  };
}
function render() {
  {
    const rp = ST.tab === 'xpm' || ST.tab === 'own' || ST.tab === 'adjl' || (ST.tab === 'sub' && ST.sub === 'reg');
    $('bExport').innerHTML = '⇩ Export to Excel';
    $('bExport').title = rp
      ? 'This report only, as on screen – as an Excel file (Shift+click: the full register)'
      : 'Light Excel report: values, formatted, cut date as now';
  }
  if (!(ST.tab === 'sub' && ST.sub === 'pkg')) {
    LASTT[secOf(ST.tab)] = ST.tab;
    if (ST.tab === 'sub') LASTS[secOf('sub')] = ST.sub;
  }
  /* Dashboard reopens its own pages, not the packages */ renderGuide();
  navBadges();
  renderProg();
  document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.s === secOf(ST.tab)));
  const isOv = ST.tab === 'sub' && ST.sub === 'ov',
    isPk = (ST.tab === 'sub' && ST.sub === 'pkg') || isOv;
  $('pg-pkg').classList.toggle('on', isPk && !isOv);
  $('pg-sov').classList.toggle('on', isOv);
  ['sum', 'tbl', 'chk', 'rul', 'mr', 'log', 'drv', 'psum', 'flow', 'dlog', 'bud', 'cli'].forEach((p) =>
    $('pg-' + p).classList.toggle(
      'on',
      !isPk &&
        ((p === 'dlog' && ST.tab === 'dlog') ||
          (p === 'bud' && ['bsum', 'bca', 'bprog', 'bpkg'].includes(ST.tab)) ||
          (p === 'sum' && ST.tab === 'sum') ||
          (p === 'flow' && ST.tab === 'flow') ||
          (p === 'drv' && ST.tab === 'drv') ||
          (p === 'psum' && (ST.tab === 'psum' || ST.tab === 'pkl')) ||
          (p === 'chk' && ST.tab === 'chk') ||
          (p === 'log' && ST.tab === 'log') ||
          (p === 'rul' && ST.tab === 'rules') ||
          (p === 'cli' && ST.tab === 'cinv') ||
          (p === 'mr' && ST.tab === 'mrate') ||
          (p === 'tbl' &&
            !['sum', 'chk', 'rules', 'cinv', 'mrate', 'log', 'drv', 'psum', 'pkl', 'flow', 'dlog', 'bsum', 'bca', 'bprog', 'bpkg'].includes(
              ST.tab
            )))
    )
  );
  $('bUndo').disabled = !undo.length;
  $('bRedo').disabled = !redo.length;
  lists();
  renderStatus();
  renderSide();
  if (isOv) renderSov();
  else if (isPk) renderPkg();
  else if (ST.tab === 'sum') renderSummary();
  else if (ST.tab === 'chk') renderChecks();
  else if (ST.tab === 'rules') renderRules();
  else if (ST.tab === 'cinv') renderCiv();
  else if (ST.tab === 'mrate') renderMRate();
  else if (ST.tab === 'log') renderLog();
  else if (ST.tab === 'drv') renderDrivers();
  else if (ST.tab === 'flow') renderFlow();
  else if (ST.tab === 'dlog') renderDlog();
  else if (['bsum', 'bca', 'bprog', 'bpkg'].includes(ST.tab)) renderBudget();
  else if (ST.tab === 'psum' || ST.tab === 'pkl') renderPsum();
  else renderTable();
  renderJob(); // Monthly job: the count on its button, and the panel when it is open
  // Rates: one page, two tabs – Material (rate analysis) · Subcontractor (packages: rates and codes)
  const rm = ST.tab === 'mrate',
    rs = isPk && !isOv;
  if ((rm || rs) && MATI >= 0 && SUBI >= 0) {
    ST.rates = rm ? 'm' : 's';
    $(rm ? 'mr' : 'pkg').insertAdjacentHTML(
      'afterbegin',
      `<div class="ratetabs"><b>Rates</b><span class="seg"><button data-rt="m" class="${rm ? 'on' : ''}">Material</button><button data-rt="s" class="${rs ? 'on' : ''}">Subcontractor</button></span><span class="help">rate per unit, month by month</span></div>`
    );
  }
}
document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-rt]');
  if (t) {
    ST.rates = t.dataset.rt;
    if (ST.rates === 's') {
      ST.tab = 'sub';
      goSub('rate');
    } else {
      ST.tab = 'mrate';
      ST.bk = MATI;
      render();
    }
    return;
  }
  const g = e.target.closest('[data-glw]');
  if (g) {
    ST.tab = ST.glw = g.dataset.glw;
    sel.clear();
    render();
  }
});
function lists() {
  const s = {
    div: new Set([
      'DIV 03',
      'DIV 0302',
      'DIV 04',
      'DIV 05',
      'DIV 06',
      'DIV 07',
      'DIV 08',
      'DIV 09',
      'DIV 10',
      'DIV 21',
      'DIV 22',
      'DIV 23',
      'DIV 26',
      'DIV 27',
      'DIV 31',
      'DIV 32',
      'DIV 33',
      'INDIRECT',
    ]),
    pkg: new Set(),
    mnl: new Set(['MAT', 'SUB', 'LAB', 'EQU', 'OTHER']),
    ce: new Set(),
  };
  BK.forEach((b) =>
    b.items.forEach((it) =>
      ['pkg', 'mnl', 'ce'].forEach((f) => {
        if (it[f]) s[f].add(it[f]);
      })
    )
  );
  Object.values(OVR).forEach((o) =>
    ['pkg', 'mnl', 'ce'].forEach((f) => {
      if (o[f]) s[f].add(o[f]);
    })
  );
  Object.keys(psPk()).forEach((p) => s.pkg.add(p));
  s.pkg.add(IND_PKG);
  Object.keys(psCe()).forEach((k) => s.ce.add(k.slice(k.indexOf('|') + 1)));
  ['div', 'mnl'].forEach((f) => {
    $('dl-' + f).innerHTML = [...s[f]]
      .sort()
      .map((x) => `<option value="${esc(x)}">`)
      .join('');
  });
  $('dl-pkg').innerHTML = [...s.pkg]
    .sort()
    .map(
      (x) =>
        `<option value="${esc(x)}" label="${esc(isIndPkg(x) ? 'Indirect cost (G&A, site, equipment, fleet, house rent)' : pkgLabel(x) || 'no name yet – name it in Codes & groups')}">`
    )
    .join('');
  R.ceAll = [...s.ce].sort();
  ceList('');
  R.pkgs = [...s.pkg].sort();
}
// the cost element dropdown shows the cost elements of the row's PKG (defined ones and ones already used under it), else all
function ceCodes(pkg) {
  const p = isIndPkg(pkg) ? IND_PKG : pkg,
    m = new Map();
  if (p === IND_PKG) psCfg().indirect.forEach((g) => g.c.forEach((c) => m.set(c, 1))); // Indirect: the whole template list, used or not
  if (p) {
    Object.keys(psCe()).forEach((k) => {
      if (k.startsWith(p + '|')) m.set(k.slice(p.length + 1), 1);
    });
    BK.forEach((b) =>
      b.items.forEach((it) => {
        if (it.ce && (isIndPkg(it.pkg) ? IND_PKG : it.pkg) === p) m.set(it.ce, 1);
      })
    );
  }
  return { p, list: m.size ? [...m.keys()].sort() : R.ceAll || [] };
}
// no PKG on the row yet: every cost element you have, each with its PKG and name
function ceAll() {
  const m = new Map(),
    add = (p, c) => {
      if (p && c) m.set(p + '|' + c, { c, p });
    };
  psCfg().indirect.forEach((g) => g.c.forEach((c) => add(IND_PKG, c)));
  Object.keys(psCe()).forEach((k) => add(k.slice(0, k.indexOf('|')), k.slice(k.indexOf('|') + 1)));
  BK.forEach((b) => b.items.forEach((it) => add(isIndPkg(it.pkg) ? IND_PKG : it.pkg, it.ce)));
  return [...m.values()].sort((x, y) => x.c.localeCompare(y.c) || x.p.localeCompare(y.p));
}
function ceList(pkg) {
  const { p, list } = ceCodes(pkg);
  $('dl-ce').innerHTML = list.map((c) => `<option value="${esc(c)}" label="${esc(p ? ceLabel(p, c) : '')}">`).join('');
}
document.addEventListener('focusin', (e) => {
  const t = e.target;
  if (!t.matches || !t.matches('input[list="dl-ce"]')) return;
  let pkg = '';
  const tr = t.closest('tr');
  if (tr && tr.dataset.k) {
    const r = rowOf(tr);
    if (r && r.it) {
      const o = r.i !== undefined ? OVR[L.id[r.i]] : null;
      pkg = (o && o.pkg !== undefined ? o.pkg : r.it.pkg) || '';
    }
  } else if (tr && tr.dataset.mo) pkg = BK[MATI].items[+tr.dataset.mo].pkg || '';
  else if (tr && tr.dataset.wo) pkg = BK[SUBI].items[+tr.dataset.wo].pkg || '';
  else if (t.id === 'bCE') pkg = $('bPKG').value.trim();
  else if (t.id === 'mfCE') pkg = $('mfPKG').value.trim();
  ceList(pkg);
});
