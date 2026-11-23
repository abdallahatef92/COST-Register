// =====================================================================================  Reports › Client invoices
// The client invoices in CJI3: billing documents (RV) and the opening balance, from the revenue lines (REV).
// Tab 1 · Invoice register: by month, one row per invoice (Ref. document) with its gross, each deduction GL and net.
// Tab 2 · WBS × month: following the WBS structure, net invoiced per month, cost to date on that WBS and below, margin.
// Cost on WBS that are never invoiced has its own row, so the total ties to the CJI3 cost.
const CIV = { tab: 'r', open: null, mfold: new Set(), q: '' };
const civHas = () => REV.length && REV[0].length > 7; // a build made before v4.10 has no invoice details
// the revenue lines of the report, to the cut: { k: invoice key, p: period (0 = opening), ... }
function civRows() {
  const cutI = R.cutI,
    out = [];
  REV.forEach((x, k) => {
    const [d, m, a, is4, ce, cen, wbs, ty, doc, ref, txt] = x,
      t = S[ty];
    const p = m === 0 ? 0 : m < 0 || !d || d > cutI ? -1 : m;
    if (p < 0) return; // after the cut
    if (!(t === 'RV' || m === 0)) return; // invoices and the opening balance only
    out.push({ k, d, p, a, is4, ce: S[ce], cen: S[cen], wbs: S[wbs], ty: t, doc: S[doc], ref: S[ref], txt: S[txt] });
  });
  return out;
}
function civInvoices(rows) {
  const inv = new Map();
  for (const r of rows) {
    const key = r.ref + '|' + r.doc;
    const e =
      inv.get(key) ||
      inv
        .set(key, { key, ref: r.ref, doc: r.doc, ty: r.ty, d: r.d, p: r.p, txt: r.txt, wbs: new Set(), g: 0, dd: {}, dt: 0, idx: [] })
        .get(key);
    e.wbs.add(r.wbs);
    e.idx.push(r.k);
    if (r.d < e.d) e.d = r.d;
    if (r.is4) e.g += -r.a;
    else {
      e.dd[r.ce] = (e.dd[r.ce] || 0) + r.a;
      e.dt += r.a;
    }
  }
  return [...inv.values()].sort((x, y) => x.p - y.p || x.d - y.d || x.ref.localeCompare(y.ref));
}
// the WBS levels: R-SBAY.01-03-2-01 → R-SBAY · R-SBAY.01 · R-SBAY.01-03 · R-SBAY.01-03-2 · R-SBAY.01-03-2-01
const civParts = (w) => {
  const m = /^([A-Z]-[A-Z0-9]+)\.(.+)$/.exec(w || '');
  if (!m) return [w || '(no WBS)'];
  const seg = m[2].split('-'),
    out = [m[1]];
  for (let i = 1; i <= seg.length; i++) out.push(m[1] + '.' + seg.slice(0, i).join('-'));
  return out;
};
function civTree(rows) {
  const T = new Map(),
    node = (k, lv) => T.get(k) || T.set(k, { k, lv, m: new Map(), inv: 0, cost: 0, kids: new Set() }).get(k);
  const add = (w, f) => {
    const p = civParts(w);
    p.forEach((k, i) => {
      const n = node(k, i);
      f(n);
      if (i) node(p[i - 1], i - 1).kids.add(k);
    });
  };
  for (const r of rows)
    add(r.wbs, (n) => {
      n.m.set(r.p, (n.m.get(r.p) || 0) - r.a);
      n.inv -= r.a;
    });
  // CJI3 cost to the cut (not the lines you added, not pending)
  for (let i = 0; i < N; i++) {
    if (L.uns[i] || R.per[i] === NP - 1) continue;
    const a = L.amt[i];
    add(S[L.wbs[i]], (n) => (n.cost += a));
  }
  return T;
}
function renderCiv() {
  const el = $('cli');
  if (!civHas()) {
    el.innerHTML = `<div class="civ"><h2>Client invoices</h2><div class="mrstale">This register was built before the invoice details were kept. <span class="sp"></span><button class="pri" data-civ="rebuild">↻ Rebuild with the current rules</button><span class="help">uses the SAP files in your data file · your codes are kept</span></div></div>`;
    return;
  }
  const rows = civRows(),
    inv = civInvoices(rows),
    T = civTree(rows),
    G = inv.reduce((s, e) => s + e.g, 0),
    D = inv.reduce((s, e) => s + e.dt, 0),
    costAll = [...T.values()].filter((n) => n.lv === 0).reduce((s, n) => s + n.cost, 0),
    mg = G - D - costAll,
    nInv = inv.filter((e) => e.ty === 'RV').length,
    last = inv.filter((e) => e.ty === 'RV').reduce((m, e) => Math.max(m, e.d), 0),
    dt = (d) => (d ? String(d).replace(/(\d{4})(\d\d)(\d\d)/, '$1-$2-$3') : ''),
    pc = (a, b) => (Math.abs(b) > 0.5 ? ((100 * a) / b).toFixed(0) + '%' : ''),
    f = (v) => (Math.abs(v) < 0.5 ? '-' : fmt(v));
  if (!CIV.open) CIV.open = new Set([...T.values()].filter((n) => n.lv < 2).map((n) => n.k));
  const cards = `<div class="civc"><div><span>INVOICED (GROSS)</span><b>${f(G)}</b></div><div class="r"><span>CLIENT DEDUCTIONS</span><b>${D ? '−' + f(D) : '-'}</b></div><div class="g"><span>NET INVOICED</span><b>${f(G - D)}</b></div><div><span>CJI3 COST TO DATE</span><b>${f(costAll)}</b></div><div class="${mg < 0 ? 'r' : 'g'}"><span>MARGIN</span><b>${f(mg)} · ${pc(mg, G - D)}</b></div><div><span>INVOICES · LAST</span><b>${nInv}${last ? ' · ' + dt(last) : ''}</b></div></div>`;
  const head = `<div class="civh"><h2>Client invoices</h2><span class="help">the client invoices in CJI3 (billing documents RV) and the opening balance · to the cut ${esc(ST.cut)}</span><span class="sp"></span><button data-civ="xl">⇩ Excel</button></div>${cards}<div class="civbar"><span class="mrtabs"><button data-civt="r" class="${CIV.tab === 'r' ? 'on' : ''}">1 · Invoice register</button><button data-civt="w" class="${CIV.tab === 'w' ? 'on' : ''}">2 · WBS × month</button></span><input type="search" data-civq="1" value="${esc(CIV.q)}" placeholder="Search…  invoice, text, WBS">${CIV.tab === 'r' ? '<button data-civ="fold">− Fold months</button><button data-civ="unfold">+ Open all</button>' : '<button data-civ="wopen">+ Open all</button><button data-civ="wfold">− Fold all</button>'}</div>`;
  el.innerHTML = `<div class="civ">${head}${CIV.tab === 'r' ? civRegister(inv, f, dt) : civWbs(T, rows, f, pc)}</div>`;
}
function civRegister(inv0, f, dt) {
  const q = CIV.q.toLowerCase(),
    inv = q ? inv0.filter((e) => [e.ref, e.doc, e.txt, ...e.wbs].join(' ').toLowerCase().includes(q)) : inv0,
    gls = [...new Set(inv0.flatMap((e) => Object.keys(e.dd)))].sort(),
    gname = (g) => {
      for (const e of inv0) for (const k of e.idx) if (S[REV[k][4]] === g) return S[REV[k][5]];
      return '';
    },
    byP = new Map();
  inv.forEach((e) => (byP.get(e.p) || byP.set(e.p, []).get(e.p)).push(e));
  let cum = 0,
    body = '';
  const cumOf = new Map();
  inv0.forEach((e) => cumOf.set(e.key, (cum += e.g - e.dt)));
  const nc = 6 + gls.length + 2;
  for (const [p, es] of byP) {
    const g = es.reduce((s, e) => s + e.g, 0),
      d = es.reduce((s, e) => s + e.dt, 0),
      op = !CIV.mfold.has(p);
    body += `<tr class="mh" data-civm="${p}"><td colspan="5">${op ? '−' : '+'} ${p === 0 ? 'Opening balance' : esc(PER[p])} <s>${es.length} ${p === 0 ? 'document' : 'invoice'}${es.length === 1 ? '' : 's'}</s></td><td class="n">${f(g)}</td>${gls.map((gl) => `<td class="n red">${f(-es.reduce((s, e) => s + (e.dd[gl] || 0), 0))}</td>`).join('')}<td class="n">${f(g - d)}</td><td></td></tr>`;
    if (op)
      body += es
        .map(
          (e) =>
            `<tr><td>${dt(e.d)}</td><td><a class="lk" data-civi="${esc(e.key)}">${esc(e.ref || '(no ref.)')}</a></td><td>${esc(e.doc)} <s>${esc(e.ty)}</s></td><td dir="auto">${esc(e.txt)}</td><td class="n">${e.wbs.size}</td><td class="n">${f(e.g)}</td>${gls.map((gl) => `<td class="n red">${e.dd[gl] ? '−' + f(e.dd[gl]) : '-'}</td>`).join('')}<td class="n b">${f(e.g - e.dt)}</td><td class="n">${f(cumOf.get(e.key))}</td></tr>`
        )
        .join('');
  }
  const G = inv.reduce((s, e) => s + e.g, 0),
    D = inv.reduce((s, e) => s + e.dt, 0);
  return `<table class="civt"><thead><tr><th>Posting date</th><th>Invoice<small>Ref. document</small></th><th>SAP document</th><th>Text</th><th class="n">WBS</th><th class="n">Gross<small>4… income</small></th>${gls.map((gl) => `<th class="n dg">${esc(gname(gl))}<small>${esc(gl)}</small></th>`).join('')}<th class="n">Net</th><th class="n">Cumulative</th></tr></thead><tbody>${body || `<tr><td colspan="${nc}" class="help">No client invoice (RV) in CJI3 up to the cut.</td></tr>`}</tbody><tfoot><tr><td colspan="5">TOTAL${q ? ' (search)' : ''}</td><td class="n">${f(G)}</td>${gls.map((gl) => `<td class="n">${f(-inv.reduce((s, e) => s + (e.dd[gl] || 0), 0))}</td>`).join('')}<td class="n">${f(G - D)}</td><td></td></tr></tfoot></table><div class="mrnote">Click an invoice → its lines by WBS · months fold with − / + · Net = gross − client deductions · the total ties to the Summary: Revenue − Client deductions (invoices and opening)</div>`;
}
function civWbs(T, rows, f, pc) {
  const ps = [...new Set(rows.map((r) => r.p))].sort((a, b) => a - b),
    q = CIV.q.toLowerCase(),
    billed = (n) => Math.abs(n.inv) > 0.5,
    tops = [...T.values()].filter((n) => n.lv === 0);
  let tb = '';
  const row = (n, cls, label) => {
    const mg = n.inv - n.cost,
      kids = [...n.kids].map((k) => T.get(k)),
      op = CIV.open.has(n.k);
    return `<tr class="l${Math.min(n.lv, 3)} ${cls || ''}"><td style="padding-left:${8 + n.lv * 16}px"${kids.length ? ` data-civw="${esc(n.k)}"` : ''}>${kids.length ? (op ? '− ' : '+ ') : '&nbsp;&nbsp;&nbsp;'}<b>${esc(label || n.k)}</b>${kids.length ? ` <s>${kids.length}</s>` : ''}${META.wbsNames && META.wbsNames[n.k] ? ` <span class="help" dir="auto">${esc(META.wbsNames[n.k])}</span>` : ''}</td>${ps.map((p) => `<td class="n">${f(n.m.get(p) || 0)}</td>`).join('')}<td class="n b">${f(n.inv)}</td><td class="n">${f(n.cost)}</td><td class="n ${mg < 0 ? 'red' : 'grn'}">${f(mg)}</td><td class="n">${pc(mg, n.inv)}</td></tr>`;
  };
  const match = (n) => !q || n.k.toLowerCase().includes(q) || [...n.kids].some((k) => match(T.get(k)));
  const walk = (n) => {
    if (!match(n)) return;
    tb += row(n, billed(n) ? '' : 'nb');
    if (!CIV.open.has(n.k) && !q) return;
    [...n.kids]
      .map((k) => T.get(k))
      .sort((a, b) => b.inv - a.inv || b.cost - a.cost)
      .forEach(walk);
  };
  // the project › its billed branches as a tree; the branches never invoiced together in one row
  const nb = { k: 'Not invoiced – cost only', lv: 1, m: new Map(), inv: 0, cost: 0, kids: new Set() };
  tops.forEach((t) => {
    if (!billed(t)) {
      // a project (or no WBS) with cost and no invoice at all
      nb.cost += t.cost;
      nb.kids.add(t.k);
      return;
    }
    tb += row(t, 'top');
    [...t.kids]
      .map((k) => T.get(k))
      .sort((a, b) => b.inv - a.inv)
      .forEach((c) => {
        if (billed(c)) {
          if (CIV.open.has(t.k) || q) walk(c);
        } else {
          nb.cost += c.cost;
          nb.kids.add(c.k);
        }
      });
  });
  if (nb.kids.size) {
    const op = CIV.open.has(nb.k);
    tb += `<tr class="l1 nb"><td style="padding-left:24px" data-civw="${esc(nb.k)}">${op ? '− ' : '+ '}<b>Not invoiced – cost only</b> <s>${nb.kids.size} WBS</s> <span class="help">no client invoice on these WBS</span></td>${ps.map(() => '<td class="n">-</td>').join('')}<td class="n">-</td><td class="n">${f(nb.cost)}</td><td class="n red">${f(-nb.cost)}</td><td></td></tr>`;
    if (op)
      [...nb.kids]
        .map((k) => T.get(k))
        .sort((a, b) => b.cost - a.cost)
        .forEach((n) => (tb += row(n, 'nb')));
  }
  const tot = tops.reduce((s, n) => ({ inv: s.inv + n.inv, cost: s.cost + n.cost }), { inv: 0, cost: 0 });
  return `<table class="civt"><thead><tr><th>WBS</th>${ps.map((p) => `<th class="n">${p === 0 ? 'Opening' : esc(PER[p])}</th>`).join('')}<th class="n">Net invoiced</th><th class="n cm">Cost to date</th><th class="n cm">Margin</th><th class="n cm">%</th></tr></thead><tbody>${tb}</tbody><tfoot><tr><td>TOTAL</td>${ps.map((p) => `<td class="n">${f(tops.reduce((s, n) => s + (n.m.get(p) || 0), 0))}</td>`).join('')}<td class="n">${f(tot.inv)}</td><td class="n">${f(tot.cost)}</td><td class="n">${f(tot.inv - tot.cost)}</td><td class="n">${pc(tot.inv - tot.cost, tot.inv)}</td></tr></tfoot></table><div class="mrnote">Following the WBS structure · − / + folds · net invoiced per month · cost to date = CJI3 cost (every bucket, no revenue) on that WBS and below, to the cut · WBS never invoiced are together in "Not invoiced – cost only", so the total ties to the CJI3 cost</div>`;
}
$('cli').addEventListener('click', (e) => {
  const t = e.target.closest('[data-civt]');
  if (t) {
    CIV.tab = t.dataset.civt;
    renderCiv();
    return;
  }
  const m = e.target.closest('[data-civm]');
  if (m) {
    const p = +m.dataset.civm;
    if (CIV.mfold.has(p)) CIV.mfold.delete(p);
    else CIV.mfold.add(p);
    renderCiv();
    return;
  }
  const w = e.target.closest('[data-civw]');
  if (w) {
    const k = w.dataset.civw;
    if (CIV.open.has(k)) CIV.open.delete(k);
    else CIV.open.add(k);
    renderCiv();
    return;
  }
  const iv = e.target.closest('[data-civi]');
  if (iv) {
    const e1 = civInvoices(civRows()).find((x) => x.key === iv.dataset.civi);
    if (!e1) return;
    const by = new Map();
    e1.idx.forEach((k) => {
      const x = REV[k],
        key = S[x[6]] + '|' + S[x[4]];
      const o = by.get(key) || by.set(key, { w: S[x[6]], gl: S[x[5]] + ' ' + S[x[4]], a: 0 }).get(key);
      o.a -= x[2];
    });
    const rs = [...by.values()].sort((a, b) => b.a - a.a);
    drill(
      'Invoice ' + (e1.ref || e1.doc),
      `${e1.doc} ${e1.ty} · ${e1.txt} · ${rs.length} lines · net ${fmt2(e1.g - e1.dt)}`,
      `<table class="s"><tr><th style="text-align:left">WBS</th><th style="text-align:left">GL</th><th>Net</th></tr>${rs.map((o) => `<tr><td style="text-align:left">${esc(o.w)}</td><td style="text-align:left">${esc(o.gl)}</td><td>${fmt2(o.a)}</td></tr>`).join('')}</table>`
    );
    return;
  }
  const b = e.target.closest('[data-civ]');
  if (!b) return;
  const a = b.dataset.civ;
  if (a === 'rebuild') updRebuild();
  else if (a === 'xl') civExport();
  else if (a === 'fold' || a === 'unfold') {
    CIV.mfold = a === 'fold' ? new Set(civInvoices(civRows()).map((x) => x.p)) : new Set();
    renderCiv();
  } else if (a === 'wopen' || a === 'wfold') {
    CIV.open = a === 'wopen' ? new Set([...civTree(civRows()).keys(), 'Not invoiced – cost only']) : new Set();
    renderCiv();
  }
});
$('cli').addEventListener('input', (e) => {
  if (!e.target.closest('[data-civq]')) return;
  CIV.q = e.target.value;
  const pos = e.target.selectionStart;
  renderCiv();
  const i = document.querySelector('#cli [data-civq]');
  if (i) {
    i.focus();
    i.setSelectionRange(pos, pos);
  }
});
// both tabs as one workbook
async function civExport() {
  const wb = new ExcelJS.Workbook(),
    rows = civRows(),
    inv = civInvoices(rows),
    T = civTree(rows),
    gls = [...new Set(inv.flatMap((e) => Object.keys(e.dd)))].sort(),
    nm = (g) => {
      const x = REV.find((r) => S[r[4]] === g);
      return x ? S[x[5]] : '';
    },
    NAVY = 'FF14254A',
    head = (ws, r) =>
      ws.getRow(r).eachCell((c) => {
        c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
        c.alignment = { wrapText: true, vertical: 'middle' };
      }),
    dt = (d) => (d ? String(d).replace(/(\d{4})(\d\d)(\d\d)/, '$1-$2-$3') : '');
  const w1 = wb.addWorksheet('Invoice register', {
    views: [{ state: 'frozen', ySplit: 3 }],
    properties: { outlineProperties: { summaryBelow: false } },
  });
  w1.addRow([`Client invoices · ${META.project} · cut ${ST.cut} · billing documents RV and the opening balance`]).font = {
    bold: true,
    size: 13,
  };
  w1.addRow([]);
  w1.addRow([
    'Month',
    'Posting date',
    'Invoice (Ref. document)',
    'SAP document',
    'Doc. type',
    'Text',
    'WBS',
    'Gross',
    ...gls.map((g) => nm(g) + ' ' + g),
    'Net',
    'Cumulative',
  ]);
  head(w1, 3);
  let cum = 0;
  const byP = new Map();
  inv.forEach((e) => (byP.get(e.p) || byP.set(e.p, []).get(e.p)).push(e));
  for (const [p, es] of byP) {
    const g = es.reduce((s, e) => s + e.g, 0),
      d = es.reduce((s, e) => s + e.dt, 0),
      mr = w1.addRow([
        p === 0 ? 'Opening balance' : PER[p],
        '',
        es.length + ' document(s)',
        '',
        '',
        '',
        '',
        g,
        ...gls.map((gl) => -es.reduce((s, e) => s + (e.dd[gl] || 0), 0)),
        g - d,
        '',
      ]);
    mr.font = { bold: true };
    mr.eachCell({ includeEmpty: true }, (c) => (c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEF2F8' } }));
    es.forEach((e) => {
      cum += e.g - e.dt;
      w1.addRow([
        p === 0 ? 'Opening balance' : PER[p],
        dt(e.d),
        e.ref,
        e.doc,
        e.ty,
        e.txt,
        e.wbs.size,
        e.g,
        ...gls.map((gl) => -(e.dd[gl] || 0)),
        e.g - e.dt,
        cum,
      ]).outlineLevel = 1;
    });
  }
  const G = inv.reduce((s, e) => s + e.g, 0),
    D = inv.reduce((s, e) => s + e.dt, 0);
  w1.addRow(['TOTAL', '', '', '', '', '', '', G, ...gls.map((gl) => -inv.reduce((s, e) => s + (e.dd[gl] || 0), 0)), G - D, '']).font = {
    bold: true,
  };
  w1.columns.forEach((c, i) => (c.width = [16, 12, 22, 14, 9, 30, 7][i] || 16));
  for (let c = 8; c <= 10 + gls.length; c++) w1.getColumn(c).numFmt = '#,##0;[Red]-#,##0';
  const ps = [...new Set(rows.map((r) => r.p))].sort((a, b) => a - b);
  const w2 = wb.addWorksheet('WBS x month', {
    views: [{ state: 'frozen', ySplit: 3, xSplit: 1 }],
    properties: { outlineProperties: { summaryBelow: false } },
  });
  w2.addRow([`Client invoices by WBS · ${META.project} · cut ${ST.cut} · cost to date = CJI3 cost on the WBS and below`]).font = {
    bold: true,
    size: 13,
  };
  w2.addRow([]);
  w2.addRow(['WBS', 'Level', ...ps.map((p) => (p === 0 ? 'Opening' : PER[p])), 'Net invoiced', 'Cost to date', 'Margin', 'Margin %']);
  head(w2, 3);
  const put = (n) => {
    const mg = n.inv - n.cost,
      r = w2.addRow([n.k, n.lv, ...ps.map((p) => n.m.get(p) || 0), n.inv, n.cost, mg, Math.abs(n.inv) > 0.5 ? mg / n.inv : '']);
    r.outlineLevel = Math.min(n.lv, 7);
    if (n.lv < 2) r.font = { bold: true };
    [...n.kids]
      .map((k) => T.get(k))
      .sort((a, b) => b.inv - a.inv || b.cost - a.cost)
      .forEach(put);
  };
  [...T.values()].filter((n) => n.lv === 0).forEach(put);
  w2.getColumn(1).width = 34;
  for (let c = 3; c <= ps.length + 5; c++) w2.getColumn(c).numFmt = '#,##0;[Red]-#,##0';
  w2.getColumn(ps.length + 6).numFmt = '0%';
  const buf = await wb.xlsx.writeBuffer();
  dl(
    new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    `Client_invoices_${META.project}_${ST.cut}.xlsx`
  );
  toast('Client invoices exported');
}
globalThis.__CIV = {
  rows: civRows,
  inv: civInvoices,
  tree: civTree,
  cost: () => {
    let a = 0;
    for (let i = 0; i < N; i++) if (!L.uns[i] && R.per[i] !== NP - 1) a += L.amt[i];
    return a;
  },
}; // for the checks (test/run.js)
