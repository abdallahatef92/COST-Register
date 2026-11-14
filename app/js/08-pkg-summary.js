// =====================================================================================  PKG summary ("Cost Report Grand Summary"): Direct by PKG, Indirect by your cost element code; actual cost to the cut date
// groups start from the company template and are editable (kept with your codes); drill: PKG › MNL › Cost element (your code) › items › CJI3 lines
const PS_NAMES = {
  'SF-01': 'Staff Salaries',
  'SF-01-01': 'Company Labor',
  'SF-02': 'In-Direct Labor',
  'SF-03': 'Arab Fees & Site Guarding',
  'SP-01': 'Moblization /De-Mob',
  'SP-02': 'Staff / Labor Accomodation',
  'SP-03': 'Temporary Roads & Leveling',
  'SP-09': 'Offices Furniture (Inc. Air Conditions) -DEP',
  'SP-10': 'Water & Wastewater Networks (Pipes, Fittings, Plumbing Tanks, etc..)',
  'SP-11': 'Power & Lighting Networks (Cables, Wires, Panel Boards, etc..)',
  'SP-14': 'Project Sign Boards/Temporary Fences / Marketing',
  'SP-15': 'IT Expense (Laptops-Maintenance-Etc)',
  'SP-16': 'Office Consumables & Stationary (Inc. Computers Consumables)',
  'SP-17': 'Hospitality & Walfare',
  'SP-18': 'Medical Expenses -First Aid',
  'SP-20': 'Safety Gear & Tools',
  'SP-19': 'Monthly Consumption (Water, Power, Telephone, Internet, etc..)',
  'SP-28': 'Tips & Other Expenses',
  'SP-29': 'Printing/Papers/Maintenances of printers /Toners/ink',
  'TR-01': 'Transportation Expenses',
  'TR-02': 'Material Transportation',
  'SE-01': 'Tower Cranes /Mobile Cranes',
  'SE-03': 'Loaders /Forklift',
  'SE-05': 'Buckets /Bobcat',
  'SE-07': 'Trucks /Trailer',
  'SE-08': 'Vibrators /Welding machine /Air Compressors',
  'SE-11': 'Generators',
  'SE-12': 'Surveying Equipment',
  'SE-13': 'Light Scaffolding',
  'SE-17': 'Other Equipment/ Tools & Consumables',
  'SE-18': 'Fuel & Oils',
  'SE-19': 'Spare Parts & Maintenance Costs',
  'SE-16': "FW/Steel workshop Equipment's",
  'SS-01': 'Design fees / Shop Drawings / Consultancy',
  'SS-02': 'Laboratory',
  'SS-03': 'Geotechnical Reports / Soil Investigation / Tests',
  'CO-01': 'Client & Engineer Expenses',
  'CO-02': 'Owner / Consultant Deductions ( Overtime - Absenses .. Etc )',
  'CO-03': 'Client Mobilization',
  Sponsorship: 'Sponsorship',
};
const PS_DEF = () => ({
  direct: ['Civil', 'Architecture', 'MEP', 'Infrastructure'].map((n) => ({ n, c: [] })), // empty Direct groups – your PKGs go into them (Codes & groups)
  indirect: [
    ['Personnel and Manning', ['SF-01', 'SF-01-01', 'SF-02', 'SF-03']],
    [
      'SITE PRELIMIARIES',
      [
        'SP-01',
        'SP-02',
        'SP-03',
        'SP-09',
        'SP-10',
        'SP-11',
        'SP-14',
        'SP-15',
        'SP-16',
        'SP-17',
        'SP-18',
        'SP-20',
        'SP-19',
        'SP-28',
        'SP-29',
      ],
    ],
    ['TRANSPORTATION', ['TR-01', 'TR-02']],
    [
      'Equipment, Vehicles, Tools, & Transportation',
      ['SE-01', 'SE-03', 'SE-05', 'SE-07', 'SE-08', 'SE-11', 'SE-12', 'SE-13', 'SE-17', 'SE-18', 'SE-19', 'SE-16'],
    ],
    ['Engineering /Site Support Services', ['SS-01', 'SS-02', 'SS-03']],
    ['Owner / Consultant Expenses', ['CO-01', 'CO-02', 'CO-03']],
    ['Sponsorship', ['Sponsorship']],
  ].map(([n, c]) => ({ n, c })),
});
const psCfg = () => ST.psg || (ST.psg = PS_DEF());
// the tree: section › group › row (PKG / indirect cost element) › MNL › cost element › items
const IND_PKG = 'Indirect',
  isIndPkg = (p) =>
    String(p || '')
      .trim()
      .toLowerCase() === 'indirect';
// your lists: PKG code → name, and per PKG its cost elements → name (both optional; filled when you code, or defined first)
const psPk = () => {
    const c = psCfg();
    return c.pkgs || (c.pkgs = {});
  },
  psCe = () => {
    const c = psCfg();
    return c.ces || (c.ces = {});
  };
// Codes › PKG list (direct) and Codes › Indirect cost elements: the names and groups of the PKG summary's rows
const psEdit = () => ST.tab === 'pkl' || ST.tab === 'icl';
// PKGs used in your coding that have no name yet (the reports would show the bare code)
const pkNoName = () => [...new Set([...R.exp.values()].map((e) => e.pkg))].filter((p) => p && !isIndPkg(p) && !pkgLabel(p));
const pkgLabel = (p) => (psPk()[p] || {}).n || (psCfg().names || {})[p] || PS_NAMES[p] || '';
const ceLabel = (p, c) =>
  (psCe()[(isIndPkg(p) ? IND_PKG : p) + '|' + c] || {}).n || (isIndPkg(p) ? PS_NAMES[c] || (psCfg().names || {})[c] : '') || '';
function psData() {
  const cfg = psCfg(),
    ind = new Map(),
    dir = new Map();
  cfg.indirect.forEach((g, gi) => g.c.forEach((c) => ind.set(c, gi)));
  cfg.direct.forEach((g, gi) => g.c.forEach((c) => dir.set(c, gi)));
  const node = () => ({ a: 0, m: new Map() }),
    add = (map, k) => map.get(k) || map.set(k, { a: 0, m: new Map(), it: new Map() }).get(k),
    rows = new Map(),
    un = new Map();
  let na = 0,
    naIt = new Map(),
    tot = 0;
  for (const e of R.exp.values()) {
    let a = 0;
    for (let p = 0; p < NP - 1; p++) a += e.p[p];
    if (Math.abs(a) < 0.005) continue;
    tot += a;
    const it = BK[e.b].items[e.ii],
      ik = e.b + ':' + e.ii;
    let key, sec;
    if (isIndPkg(e.pkg)) {
      const ce = e.ce || '(no cost element)';
      sec = 'I';
      key = (ind.has(ce) ? 'I|' : 'J|') + ce;
    } else if (e.pkg && dir.has(e.pkg)) {
      key = 'D|' + e.pkg;
      sec = 'D';
    } else if (e.pkg) {
      key = 'U|' + e.pkg;
      sec = 'U';
    } else {
      na += a;
      naIt.set(ik, (naIt.get(ik) || 0) + a);
      continue;
    }
    const r = add(rows, key);
    r.a += a;
    const mn = add(r.m, e.mnl || '(no MNL)');
    mn.a += a;
    if (sec === 'I' || sec === 'J') mn.it.set(ik, (mn.it.get(ik) || 0) + a);
    else {
      const c = add(mn.m, e.ce || '(no cost element)');
      c.a += a;
      c.it.set(ik, (c.it.get(ik) || 0) + a);
    }
  }
  return { cfg, rows, na, naIt, tot };
}
const psName = (code, n, sec) => {
  const my = sec === 'I' || sec === 'J' ? ceLabel(IND_PKG, code) : pkgLabel(code);
  if (my) return my;
  let best = null,
    bv = 0;
  const walk = (x) => {
    if (x.it)
      x.it.forEach((v, k) => {
        if (Math.abs(v) > bv) {
          bv = Math.abs(v);
          best = k;
        }
      });
    if (x.m) x.m.forEach(walk);
  };
  if (n) walk(n);
  if (!best) return '';
  const [b, i] = best.split(':').map(Number);
  return itemDesc(BK[b].items[i]) || itemCode(BK[b].items[i]);
};
const ceName = (n, code, pkg) => ceLabel(pkg, code) || psName('', n);
function renderPsum() {
  const ED = psEdit(),
    D = psData(),
    cfg0 = D.cfg,
    open = ED
      ? new Set(['S|D', 'S|I', 'G|U', 'G|J', ...cfg0.direct.map((g, i) => 'G|D|' + i), ...cfg0.indirect.map((g, i) => 'G|I|' + i)])
      : ST.psOpen ||
        (ST.psOpen = new Set([
          'S|D',
          'S|I',
          ...D.cfg.direct.map((g, i) => 'G|D|' + i),
          ...D.cfg.indirect.map((g, i) => 'G|I|' + i),
          'G|U',
          'G|J',
        ])),
    T = R.toDate || 1,
    fA = (v) => fmt(v),
    sh = (v) => (Math.abs(v) >= 0.5 ? ((100 * v) / T).toFixed(1) + '%' : '-'),
    mx = Math.max(1, ...[...D.rows.values()].map((r) => Math.abs(r.a)));
  const bar = (v) =>
      Math.abs(v) >= 0.5 ? `<span class="psb" style="width:${Math.max(2, Math.round((110 * Math.abs(v)) / mx))}px"></span>` : '',
    tg = (k, has) => (has ? `<span class="tg" data-pso="${esc(k)}">${open.has(k) ? '−' : '+'}</span>` : '<span class="tg"></span>');
  const mnC = (m) => {
    const c = { MAT: ['#E3EBF7', '#1F4E9A'], SUB: ['#FBE6D6', '#B4561C'], LAB: ['#FBF0D4', '#8A6D1F'], EQU: ['#F6DCDC', '#9B2C2C'] }[m] || [
      '#EEF0F4',
      '#4B5563',
    ];
    return `<span class="mn" style="background:${c[0]};color:${c[1]}">${esc(m)}</span>`;
  };
  let h = '';
  const items = (map, pre, lvl) =>
    [...map]
      .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
      .map(([k, v]) => {
        const [b, i] = k.split(':').map(Number),
          it = BK[b].items[i];
        return `<tr class="l${lvl} psi" data-psit="${k}"><td class="pi${lvl}"><span class="tg"></span><a class="lk">${esc(itemCode(it))}</a></td><td dir="auto" title="${esc(itemDesc(it))}">${esc(itemDesc(it))} <span class="help">· ${esc(BK[b].short)}</span></td><td>${fA(v)}</td><td>${sh(v)}</td><td></td></tr>`;
      })
      .join('');
  const secOf = (sec) => (sec === 'D' || sec === 'U' ? 'direct' : 'indirect');
  const gSelE = (sec, code) => {
    const c = secOf(sec),
      cur = cfg0[c].findIndex((g) => g.c.includes(code));
    return `<select class="psgs psge" data-psmv="${c}|${esc(code)}"><option value="">— no group</option>${cfg0[c].map((g, gi) => `<option value="${gi}" ${cur === gi ? 'selected' : ''}>${esc(g.n)}</option>`).join('')}<option value="new">+ New group…</option></select>`;
  };
  const rowE = (sec, code, r) => {
    const dir = secOf(sec) === 'direct',
      nm = dir ? pkgLabel(code) : ceLabel(IND_PKG, code),
      loose = sec === 'U' || sec === 'J';
    if ((ST.pkF === 'noname' && (nm || !dir)) || (ST.pkF === 'loose' && !loose)) return '';
    return `<tr class="row${r ? '' : ' zero'}"><td class="pi1"><span class="tg"></span><span class="code">${esc(code)}</span></td><td dir="auto"><input class="psin${nm || !dir ? '' : ' miss'}" data-psn="${secOf(sec)}|${esc(code)}" value="${esc(nm)}" placeholder="type the name">${nm || !dir ? '' : '<span class="psno">No name yet</span>'}</td><td class="psgc">${gSelE(sec, code)}</td><td><b>${r ? fA(r.a) : '-'}</b></td><td>${r ? sh(r.a) : '-'}</td><td></td></tr>`;
  };
  const rowH = (sec, code, r, name) => {
    if (ED) return rowE(sec, code, r);
    const k = 'R|' + sec + '|' + code,
      has = r && r.m.size,
      o = open.has(k);
    name = name || psName(code, r, sec);
    let x = `<tr class="row${r ? '' : ' zero'}"><td class="pi1">${tg(k, has)}<span class="code">${esc(code)}</span></td><td dir="auto">${esc(name)}</td><td class="dka" data-psk="${esc(k)}"><b>${r ? fA(r.a) : '-'}</b></td><td>${r ? sh(r.a) : '-'}</td><td>${r ? bar(r.a) : ''}</td></tr>`;
    if (has && o)
      [...r.m]
        .sort((a, b) => Math.abs(b[1].a) - Math.abs(a[1].a))
        .forEach(([m, mv]) => {
          const km = k + '|' + m,
            om = open.has(km),
            hm = sec === 'I' ? mv.it.size : mv.m.size;
          x += `<tr class="l2"><td class="pi2">${tg(km, hm)}${mnC(m)}</td><td>${{ MAT: 'Material', SUB: 'Subcontractor', LAB: 'Labour', EQU: 'Equipment', OTHER: 'Other' }[m] || ''}</td><td class="dka" data-psk="${esc(km)}">${fA(mv.a)}</td><td>${sh(mv.a)}</td><td></td></tr>`;
          if (!om) return;
          if (sec === 'I' || sec === 'J') {
            x += items(mv.it, km, 3);
            return;
          }
          [...mv.m]
            .sort((a, b) => Math.abs(b[1].a) - Math.abs(a[1].a))
            .forEach(([c, cv]) => {
              const kc = km + '|' + c,
                oc = open.has(kc);
              x += `<tr class="l3"><td class="pi3">${tg(kc, cv.it.size)}<span class="code" style="font-weight:500">${esc(c)}</span></td><td dir="auto">${esc(ceName(cv, c, code))}</td><td class="dka" data-psk="${esc(kc)}">${fA(cv.a)}</td><td>${sh(cv.a)}</td><td></td></tr>`;
              if (oc) x += items(cv.it, kc, 4);
            });
        });
    return x;
  };
  const secH = (s, label, groups) => {
    const ks = 'S|' + s,
      gs0 = 0,
      gs = groups.map((g, gi) => ({ g, gi, a: g.c.reduce((x, c) => x + ((D.rows.get(s + '|' + c) || {}).a || 0), 0) })),
      sa = gs.reduce((x, y) => x + y.a, 0);
    h += `<tr class="sec" id="pss-${s}"><td>${tg(ks, 1)}${label}</td><td></td>${ED ? '<td></td>' : ''}<td>${fA(sa)}</td><td>${sh(sa)}</td><td></td></tr>`;
    if (!open.has(ks)) return sa;
    gs.forEach(({ g, gi, a }) => {
      const kg = 'G|' + s + '|' + gi;
      h += ED
        ? `<tr class="grp"><td>${tg(kg, g.c.length)}</td><td><input class="psin psgi" data-psgn="${s === 'D' ? 'direct' : 'indirect'}|${gi}" value="${esc(g.n)}" title="The group's name – type to change it"></td><td class="help">${g.c.length} code${g.c.length === 1 ? '' : 's'}</td><td>${fA(a)}</td><td>${sh(a)}</td><td></td></tr>`
        : `<tr class="grp"><td>${tg(kg, g.c.length)}</td><td>${esc(g.n)}</td><td>${fA(a)}</td><td>${sh(a)}</td><td></td></tr>`;
      if (open.has(kg))
        g.c.forEach((c) => {
          const r = D.rows.get(s + '|' + c);
          if (!r && !ST.psAll && !ED) return;
          h += rowH(s, c, r, '');
        });
    });
    const lp = s === 'D' ? 'U|' : 'J|',
      us = [...D.rows].filter(([k]) => k.startsWith(lp)).sort((a, b) => Math.abs(b[1].a) - Math.abs(a[1].a));
    if (us.length) {
      const ua = us.reduce((x, y) => x + y[1].a, 0),
        gk = 'G|' + lp[0];
      h += ED
        ? `<tr class="grp warn"><td>${tg(gk, 1)}</td><td>Not in a group yet – choose the group on the row</td><td></td><td>${fA(ua)}</td><td>${sh(ua)}</td><td></td></tr>`
        : `<tr class="grp warn"><td>${tg(gk, 1)}</td><td>${s === 'D' ? 'PKGs' : 'Indirect cost elements'} not in a group <a class="lk" data-pse="open|${s === 'D' ? 'p' : 'c'}" style="font-weight:500">– name and group them in Codes ›</a></td><td>${fA(ua)}</td><td>${sh(ua)}</td><td></td></tr>`;
      if (open.has(gk))
        us.forEach(([k, r]) => {
          h += rowH(lp[0], k.slice(2), r, '');
        });
      return sa + ua;
    }
    return sa;
  };
  const da = secH('D', 'Direct', D.cfg.direct),
    ia = secH('I', 'Indirect', D.cfg.indirect);
  h +=
    `<tr class="grp na"><td>${tg('NA', D.naIt.size)}⚠</td><td>Not allocated – no PKG yet</td><td class="dka" data-psk="NA">${fA(D.na)}</td><td>${sh(D.na)}</td><td></td></tr>` +
    (open.has('NA') ? items(new Map([...D.naIt].sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 300)), 'NA', 2) : '');
  h += `<tr class="t"><td></td><td>Total = counted to the cut date (ties to CJI3)</td>${ED ? '<td></td>' : ''}<td>${fA(da + ia + D.na)}</td><td>${sh(da + ia + D.na)}</td><td></td></tr>`;
  const zl = ST.psZ || 'r',
    cfg = D.cfg,
    used = new Set([...cfg.direct, ...cfg.indirect].flatMap((g) => g.c)),
    loose = [...D.rows.keys()].filter((k) => k.startsWith('U|')).map((k) => k.slice(2));
  const nN = pkNoName().length,
    nLo = [...D.rows.keys()].filter((k) => k.startsWith('U|') || k.startsWith('J|')).length,
    edBar = `<div class="sct" style="gap:8px;margin:0 0 10px"><span class="seg">${[
      ['', 'All'],
      ['noname', 'No name' + (nN ? ' · ' + nN : '')],
      ['loose', 'Not in a group' + (nLo ? ' · ' + nLo : '')],
    ]
      .map(([k, l]) => `<button data-pkf="${k}" class="${(ST.pkF || '') === k ? 'on' : ''}">${l}</button>`)
      .join(
        ''
      )}</span><button data-pknew="pkg">+ New PKG</button><button data-pknew="ce">+ New indirect cost element</button><button data-pknew="grp">+ New group</button><button data-fxfit="psum" title="Fit every column to its content">↔ Fit</button><small>type a name in the Name column · choose the Group on the row · codes from your coding come here by themselves</small></div>`;
  const nL = nLo;
  $('psum').innerHTML =
    `<div class="psw">${psEdit() ? '' : `<div class="sct" style="gap:8px;margin:0 0 2px"><button data-pse="open" title="Name the PKGs and the indirect cost elements, put them in groups">Edit names and groups · Codes ›${nL ? ` <span class="psbad">${nL} not in a group</span>` : ''}</button></div>`}${`<div class="panel pscard psrep${ED ? ' psed' : ''}">
    ${
      ED
        ? edBar
        : `<div class="sct" style="gap:8px;margin:0 0 10px"><span class="seg" title="Open the tree to this level">${[
            ['s', 'Sections'],
            ['g', 'Groups'],
            ['r', 'Rows'],
            ['m', 'MNL'],
            ['c', 'Cost element'],
          ]
            .map(([k, l]) => `<button data-psz="${k}" class="${zl === k ? 'on' : ''}">${l}</button>`)
            .join(
              ''
            )}</span><button data-pse="empty" class="${ST.psAll ? 'on' : ''}" title="Show the codes with no cost yet">${ST.psAll ? '✓ ' : ''}Show empty codes</button><button data-fxfit="psum" title="Fit every column to its content">↔ Fit</button><button data-psprint="1" title="Print or save as PDF – A3 portrait, as on screen">🖨 Print A3</button><small>+ / − : PKG › MNL › cost element › items · Indirect: cost element › MNL › items · double-click an amount for its items</small></div>`
    }
    <table class="pshd"><tr><td>Project</td><td><b>${esc(META.project)}</b></td><td rowspan="2" class="pstitle">${ED ? 'Codes – PKG list &amp; indirect cost elements' : 'Cost Report Grand Summary'}</td></tr><tr><td>Cut off Date</td><td><b>${esc(new Date(ST.cut + 'T00:00:00Z').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }))}</b></td></tr><tr><td></td><td colspan="2" class="pskey"><b><u>KEY::</u></b><br>${ED ? '<b>Name</b> : what the reports show for the code · <b>Group</b> : the band it sits in · <b>AC</b> : to date, ties to CJI3' : '<b>AC</b> : Actual Cost – accumulated to the cut-off date, ties to CJI3'}</td></tr></table>
    <div class="psa">A- Actual Cost to date</div>
    <table class="pst fxt" data-fx="psum" data-nosort="1" data-nofill="1" data-maxw="1120" data-growcol="1"><colgroup><col><col>${ED ? '<col style="width:230px">' : ''}<col><col></colgroup><tr class="hb"><th rowspan="2">${ED ? 'Code' : 'Package'}</th><th rowspan="2">${ED ? 'Name' : 'Package'}</th>${ED ? '<th rowspan="2">Group</th>' : ''}<th colspan="2" class="cs">Current Status</th></tr><tr class="hb2"><th>AC</th><th>Share</th></tr>${h.replace(/<td>(<span class="psb"[^<]*<\/span>)?<\/td><\/tr>/g, '</tr>')}</table></div>`}</div>`;
  fxScan($('psum'));
  const jump = ED && ST.tab === 'icl' && R.psLast !== 'icl';
  R.psLast = ST.tab;
  if (jump) {
    const x = $('pss-I');
    if (x) x.scrollIntoView({ block: 'start' });
  }
  const pq = $('psQ');
  if (pq)
    pq.oninput = () => {
      ST.psQ = pq.value;
      const p = pq.selectionStart;
      renderPsum();
      const n = $('psQ');
      n.focus();
      n.setSelectionRange(p, p);
    };
}
function psPlace(sec, c, gi) {
  const cfg = psCfg();
  cfg[sec].forEach((g) => {
    g.c = g.c.filter((x) => x !== c);
  });
  if (gi !== '' && gi !== undefined && gi !== null && cfg[sec][+gi]) cfg[sec][+gi].c.push(c);
}
function psZoom(z) {
  const D = psData(),
    o = new Set();
  ST.psZ = z;
  if (z === 's') {
    ST.psOpen = o;
    return;
  }
  o.add('S|D');
  o.add('S|I');
  if (z === 'g') {
    ST.psOpen = o;
    return;
  }
  D.cfg.direct.forEach((g, i) => o.add('G|D|' + i));
  D.cfg.indirect.forEach((g, i) => o.add('G|I|' + i));
  o.add('G|U');
  o.add('G|J');
  if (z === 'r') {
    ST.psOpen = o;
    return;
  }
  for (const [k, r] of D.rows) {
    const rk = 'R|' + k;
    o.add(rk);
    if (z === 'c') r.m.forEach((v, m) => o.add(rk + '|' + m));
  }
  ST.psOpen = o;
}
document.addEventListener('click', (e) => {
  const t = e.target,
    pg = $('psum');
  if (!pg || !pg.contains(t)) return;
  const tgl = t.closest('[data-pso]');
  if (tgl) {
    const k = tgl.dataset.pso,
      o = ST.psOpen;
    o.has(k) ? o.delete(k) : o.add(k);
    ST.psZ = '';
    renderPsum();
    return;
  }
  if (t.closest('[data-psprint]')) {
    document.body.classList.add('psprint');
    setTimeout(() => {
      print();
      document.body.classList.remove('psprint');
    }, 50);
    return;
  }
  const pf = t.closest('[data-psf]');
  if (pf) {
    ST.psF = pf.dataset.psf;
    renderPsum();
    return;
  }
  if (t.id === 'pnAdd') {
    const c = $('pnC').value.trim(),
      n = $('pnN').value.trim(),
      g = $('pnG').value;
    if (!c) {
      $('pnC').focus();
      return;
    }
    if (isIndPkg(c)) {
      toast('“Indirect” is the Indirect section – add its cost elements in the Cost elements tab');
      return;
    }
    psPk()[c] = { n };
    psPlace('direct', c, g);
    persist();
    logIt('PKG ' + c + ' added' + (n ? ' · ' + n : ''), 1);
    renderPsum();
    lists();
    return;
  }
  if (t.id === 'cnAdd') {
    const c = $('cnC').value.trim(),
      n = $('cnN').value.trim(),
      p = $('cnP').value;
    if (!c || !p) {
      (c ? $('cnP') : $('cnC')).focus();
      toast('Type the cost element and choose its PKG');
      return;
    }
    ST.psCnP = p;
    psCe()[(isIndPkg(p) ? IND_PKG : p) + '|' + c] = { n };
    persist();
    logIt('Cost element ' + c + ' added under ' + p, 1);
    renderPsum();
    lists();
    return;
  }
  const z = t.closest('[data-psz]');
  if (z) {
    psZoom(z.dataset.psz);
    renderPsum();
    return;
  }
  const it = t.closest('tr[data-psit]');
  if (it) {
    const [b, i] = it.dataset.psit.split(':').map(Number);
    R.drillCtx = null;
    drillLines(
      b,
      i,
      PER.slice(0, NP - 1).map((x, k) => k),
      'to date'
    );
    return;
  }
  const ev = t.closest('[data-pse]');
  if (!ev) return;
  const [a, s, gi, c] = ev.dataset.pse.split('|'),
    cfg = psCfg();
  if (a === 'add') {
    const c = canon(s === 'direct' ? 'pkg' : 'ce', $('nC-' + s).value.trim()),
      n = $('nN-' + s).value.trim(),
      g = $('nG-' + s).value;
    if (!c) {
      $('nC-' + s).focus();
      return;
    }
    if (s === 'direct' && isIndPkg(c)) {
      toast('“Indirect” is the Indirect section – add its cost elements below');
      return;
    }
    if (s === 'direct') psPk()[c] = { n };
    else psCe()[IND_PKG + '|' + c] = { n };
    psPlace(s, c, g);
    persist();
    logIt((s === 'direct' ? 'PKG ' : 'Indirect cost element ') + c + ' added', 1);
    renderPsum();
    lists();
    return;
  }
  if (a === 'drop') {
    const code = ev.dataset.pse.split('|').slice(2).join('|');
    psPlace(s, code, '');
    if (s === 'direct') delete psPk()[code];
    else delete psCe()[IND_PKG + '|' + code];
    persist();
    renderPsum();
    return;
  }
  if (a === 'empty') ST.psAll = !ST.psAll;
  else if (a === 'open') {
    ST.tab = s === 'c' ? 'icl' : 'pkl';
    render();
    return;
  } else if (a === 'tab') ST.psTab = s;
  else if (a === 'delp') {
    delete psPk()[s];
    persist();
  } else if (a === 'delc') {
    delete psCe()[ev.dataset.pse.slice(5)];
    persist();
  } else if (a === 'rep' || a === 'close') {
    ST.tab = 'psum';
    render();
    return;
  } else if (a === 'rm') {
    cfg[s][+gi].c = cfg[s][+gi].c.filter((x) => x !== c);
    persist();
  } else if (a === 'del') {
    if (!confirm('Remove the group "' + cfg[s][+gi].n + '"? Its codes are not deleted – they go back to "not in a group".')) return;
    cfg[s].splice(+gi, 1);
    persist();
  } else if (a === 'up') {
    const i = +gi;
    if (i > 0) {
      const x = cfg[s][i];
      cfg[s][i] = cfg[s][i - 1];
      cfg[s][i - 1] = x;
      persist();
    }
  } else if (a === 'new') {
    const n = prompt('Name of the new ' + s + ' group');
    if (!n) return;
    cfg[s].push({ n: n.trim(), c: [] });
    if (ST.psOpen) ST.psOpen.add('G|' + (s === 'direct' ? 'D' : 'I') + '|' + (cfg[s].length - 1));
    persist();
  } else if (a === 'reset') {
    if (!confirm('Put the groups back to the template? Your own groups and the codes you placed are removed (your names are kept).'))
      return;
    const nm = cfg.names;
    ST.psg = PS_DEF();
    if (nm) ST.psg.names = nm;
    persist();
  }
  renderPsum();
});
document.addEventListener('change', (e) => {
  const t = e.target,
    pg = $('psum');
  if (!pg || !pg.contains(t)) return;
  const cfg = psCfg();
  if (t.dataset.psn !== undefined) {
    const [sec, code] = [t.dataset.psn.slice(0, t.dataset.psn.indexOf('|')), t.dataset.psn.slice(t.dataset.psn.indexOf('|') + 1)],
      v = t.value.trim();
    if (sec === 'direct') psPk()[code] = { ...(psPk()[code] || {}), n: v };
    else psCe()[IND_PKG + '|' + code] = { ...(psCe()[IND_PKG + '|' + code] || {}), n: v };
    persist();
    logIt('Name of ' + code + ' = ' + (v || '(none)'), 1);
    lists();
    renderStatus(); // the footer's "PKG without a name"
    renderSide();
    return;
  }
  if (t.dataset.psmv !== undefined) {
    const i2 = t.dataset.psmv.indexOf('|'),
      sec = t.dataset.psmv.slice(0, i2),
      code = t.dataset.psmv.slice(i2 + 1);
    let v = t.value;
    if (v === 'new') {
      const n = prompt('Name of the new ' + sec + ' group');
      if (!n) {
        renderPsum();
        return;
      }
      cfg[sec].push({ n: n.trim(), c: [] });
      v = String(cfg[sec].length - 1);
      if (ST.psOpen) ST.psOpen.add('G|' + (sec === 'direct' ? 'D' : 'I') + '|' + v);
    }
    psPlace(sec, code, v);
    persist();
    logIt(code + ' → ' + (v === '' ? 'no group' : cfg[sec][+v].n), 1);
    renderPsum();
    return;
  }
  if (t.dataset.pkn !== undefined) {
    const v = t.value.trim(),
      m = psPk();
    m[t.dataset.pkn] = { ...(m[t.dataset.pkn] || {}), n: v };
    persist();
    logIt('Name of PKG ' + t.dataset.pkn + ' = ' + (v || '(none)'), 1);
    lists();
    return;
  }
  if (t.dataset.cen !== undefined) {
    const v = t.value.trim(),
      m = psCe();
    m[t.dataset.cen] = { ...(m[t.dataset.cen] || {}), n: v };
    persist();
    logIt('Name of cost element ' + t.dataset.cen.replace('|', ' › ') + ' = ' + (v || '(none)'), 1);
    lists();
    return;
  }
  if (t.dataset.pkg2 !== undefined || t.dataset.ceg !== undefined) {
    const sec = t.dataset.pkg2 !== undefined ? 'direct' : 'indirect',
      c = t.dataset.pkg2 ?? t.dataset.ceg;
    if (t.value === 'new') {
      const n = prompt('Name of the new ' + sec + ' group');
      if (!n) {
        renderPsum();
        return;
      }
      cfg[sec].push({ n: n.trim(), c: [] });
      if (ST.psOpen) ST.psOpen.add('G|' + (sec === 'direct' ? 'D' : 'I') + '|' + (cfg[sec].length - 1));
      psPlace(sec, c, String(cfg[sec].length - 1));
    } else psPlace(sec, c, t.value);
    persist();
    logIt(c + ' → ' + (t.value === '' ? 'no group' : cfg[sec][+t.value] ? cfg[sec][+t.value].n : 'new group'), 1);
    renderPsum();
    return;
  }
  if (t.dataset.psnm !== undefined) {
    const nm = cfg.names || (cfg.names = {}),
      v = t.value.trim();
    if (v) nm[t.dataset.psnm] = v;
    else delete nm[t.dataset.psnm];
    persist();
    logIt('Name of ' + t.dataset.psnm + ' = ' + (v || '(template)'), 1);
    return;
  }
  if (t.dataset.psgs !== undefined) {
    const c = t.dataset.psgs;
    let v = t.value;
    if (v.startsWith('new|')) {
      const sec = v.slice(4),
        n = prompt('Name of the new ' + sec + ' group');
      if (!n) {
        renderPsum();
        return;
      }
      cfg[sec].push({ n: n.trim(), c: [] });
      v = sec + '|' + (cfg[sec].length - 1);
      if (ST.psOpen) ST.psOpen.add('G|' + (sec === 'direct' ? 'D' : 'I') + '|' + (cfg[sec].length - 1));
    }
    cfg.direct.forEach((g) => {
      g.c = g.c.filter((x) => x !== c);
    });
    cfg.indirect.forEach((g) => {
      g.c = g.c.filter((x) => x !== c);
    });
    if (v) {
      const [sec, gi] = v.split('|');
      cfg[sec][+gi].c.push(c);
    }
    persist();
    logIt(c + ' → ' + (v ? cfg[v.split('|')[0]][+v.split('|')[1]].n : 'not in the report'), 1);
    renderPsum();
    return;
  }
  if (t.dataset.psgn) {
    const [s, gi] = t.dataset.psgn.split('|');
    cfg[s][+gi].n = t.value.trim() || cfg[s][+gi].n;
    persist();
    renderPsum();
    return;
  }
  if (t.dataset.psadd) {
    const [s, gi] = t.dataset.psadd.split('|'),
      v = t.value.trim();
    if (!v) return;
    cfg.direct.forEach((g) => {
      g.c = g.c.filter((x) => x !== v);
    });
    cfg.indirect.forEach((g) => {
      g.c = g.c.filter((x) => x !== v);
    });
    cfg[s][+gi].c.push(v);
    persist();
    renderPsum();
  }
});
document.addEventListener('dblclick', (e) => {
  const c = e.target.closest('#psum td.dka');
  if (!c) return;
  const k = c.dataset.psk,
    D = psData();
  let its = new Map();
  const grab = (x) => {
    if (x.it) x.it.forEach((v, kk) => its.set(kk, (its.get(kk) || 0) + v));
    if (x.m) x.m.forEach(grab);
  };
  if (k === 'NA') its = D.naIt;
  else {
    const p = k.split('|'),
      r = D.rows.get(p[1] + '|' + p[2]);
    if (!r) return;
    let n = r;
    if (p[3]) n = r.m.get(p[3]);
    if (p[4] && n) n = n.m.get(p[4]);
    if (n) grab(n);
  }
  const rows = [...its].sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])),
    tot = rows.reduce((x, y) => x + y[1], 0);
  drill(
    k === 'NA' ? 'Not allocated' : k.split('|').slice(2).join(' › '),
    rows.length + ' items · ' + fmt(tot) + ' · click an item for its CJI3 lines',
    `<table class="s"><tr><th style="text-align:left">Item</th><th style="text-align:left">Description</th><th>Bucket</th><th>To date</th></tr>${rows
      .slice(0, 400)
      .map(([kk, v]) => {
        const [b, i] = kk.split(':').map(Number),
          it = BK[b].items[i];
        return `<tr class="drl2" data-psit="${kk}"><td style="text-align:left"><a class="lk">${esc(itemCode(it))}</a></td><td style="text-align:left" dir="auto">${esc(itemDesc(it))}</td><td>${esc(BK[b].short)}</td><td><b>${fmt(v)}</b></td></tr>`;
      })
      .join('')}</table>`
  );
});
document.addEventListener('click', (e) => {
  const r = e.target.closest('#dBody tr.drl2');
  if (!r) return;
  const [b, i] = r.dataset.psit.split(':').map(Number);
  R.drillCtx = null;
  drillLines(
    b,
    i,
    PER.slice(0, NP - 1).map((x, k) => k),
    'to date'
  );
});

document.addEventListener('click', (e) => {
  const f = e.target.closest('[data-pkf]');
  if (f) {
    ST.pkF = f.dataset.pkf;
    render();
    return;
  }
  const n = e.target.closest('[data-pknew]');
  if (!n) return;
  const k = n.dataset.pknew,
    cfg = psCfg();
  if (k === 'grp') {
    const sec = confirm('A Direct group (OK) or an Indirect head (Cancel)?') ? 'direct' : 'indirect',
      nm = (prompt('Name of the new ' + (sec === 'direct' ? 'Direct group' : 'Indirect head')) || '').trim();
    if (!nm) return;
    cfg[sec].push({ n: nm, c: [] });
    logIt('New group ' + nm, 1);
  } else {
    const c = canon(
      k === 'pkg' ? 'pkg' : 'ce',
      (prompt(k === 'pkg' ? 'New PKG code (e.g. S12)' : 'New indirect cost element (e.g. SP-30)') || '').trim()
    );
    if (!c) return;
    if (k === 'pkg' && isIndPkg(c)) return toast('“Indirect” is the Indirect section');
    const nm = (prompt('Name of ' + c) || '').trim();
    if (k === 'pkg') psPk()[c] = { ...(psPk()[c] || {}), n: nm };
    else psCe()[IND_PKG + '|' + c] = { ...(psCe()[IND_PKG + '|' + c] || {}), n: nm };
    psPlace(k === 'pkg' ? 'direct' : 'indirect', c, '');
    logIt((k === 'pkg' ? 'PKG ' : 'Indirect cost element ') + c + ' added', 1);
  }
  persist();
  lists();
  render();
});
// a new PKG typed while coding: name it now (or later in Codes › PKG list)
function pkAsk(code) {
  let m = $('pkask');
  if (!m) {
    m = document.createElement('div');
    m.id = 'pkask';
    m.className = 'pkask';
    document.body.appendChild(m);
  }
  m.innerHTML = `<b>${esc(code)}</b> is a new PKG – name it: <input id="pkaskN" placeholder="e.g. Concrete works"><button class="pri" id="pkaskS">Save</button><button id="pkaskL">Later</button>`;
  m.hidden = false;
  const save = () => {
    const v = $('pkaskN').value.trim();
    if (v) {
      psPk()[code] = { ...(psPk()[code] || {}), n: v };
      persist();
      logIt('Name of ' + code + ' = ' + v, 1);
      lists();
      render();
    }
    m.hidden = true;
  };
  $('pkaskS').onclick = save;
  $('pkaskL').onclick = () => {
    m.hidden = true;
  };
  $('pkaskN').onkeydown = (e) => {
    if (e.key === 'Enter') save();
    if (e.key === 'Escape') m.hidden = true;
  };
}
