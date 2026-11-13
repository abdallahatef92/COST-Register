// ---- detail drawer (an item): months, lines, POs
function openBreak(kind, key) {
  const inK = (i) =>
    kind === 'ce'
      ? S[L.ce[i]] === key
      : (S[L.wbs[i]] || '(no WBS)') === key || (S[L.wbs[i]] || '').startsWith(key + '.') || (S[L.wbs[i]] || '').startsWith(key + '-');
  const by = new Map(),
    by2 = new Map(),
    mon = new Float64Array(NP);
  let n = 0,
    t = 0;
  for (let i = 0; i < N; i++) {
    if (!R.inc[i] || !inK(i) || R.per[i] === NP - 1) continue;
    const a = R.amt[i];
    n++;
    t += a;
    mon[R.per[i]] += a;
    const b = BK[L.b[i]].id;
    by.set(b, (by.get(b) || 0) + a);
    const k2 = kind === 'ce' ? S[L.wbs[i]] || '(no WBS)' : S[L.ce[i]] + ' · ' + S[L.cen[i]];
    by2.set(k2, (by2.get(k2) || 0) + a);
  }
  const mx = Math.max(
      1,
      ...Array.from(mon)
        .slice(0, NP - 1)
        .map(Math.abs)
    ),
    tbl = (m, h) =>
      `<table class="s" style="margin-top:8px"><tr><th>${h}</th><th>To date</th><th>%</th></tr>${[...m]
        .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
        .slice(0, 25)
        .map(([k, v]) => `<tr><td dir="auto">${esc(k)}</td><td>${fmt(v)}</td><td>${pct(v, t)}</td></tr>`)
        .join('')}</table>`;
  $('dTitle').textContent = key;
  $('dSub').textContent =
    kind === 'ce'
      ? 'Cost element · ' + ([...Array(N).keys()].map((i) => (S[L.ce[i]] === key ? S[L.cen[i]] : '')).find(Boolean) || '')
      : 'WBS · ' + (META.wbsNames[key] || '') + ' (incl. everything below)';
  $('dBody').innerHTML = `<div class="bars">${PER.slice(0, NP - 1)
    .map(
      (p, k) =>
        `<div class="${k === R.rep ? 'cut' : ''}" style="height:${((100 * Math.abs(mon[k])) / mx).toFixed(1)}%" title="${p}: ${fmt(mon[k])}"></div>`
    )
    .join('')}</div><div class="blab">${PER.slice(0, NP - 1)
    .map((p) => `<span>${p.replace('-', ' ')}</span>`)
    .join('')}</div>
    <dl><dt>To date</dt><dd><b>${fmt(t)}</b></dd><dt>Lines</dt><dd>${n.toLocaleString('en-US')}</dd></dl>${tbl(by, 'Bucket')}${tbl(by2, kind === 'ce' ? 'WBS element (top 25)' : 'Cost element (top 25)')}`;
  $('drawer').classList.add('open');
}
// drill-down: double-click a number → the items behind it (one bucket, one or more months) → an item's CJI3 lines
function drill(title, sub, html) {
  $('dTitle').textContent = title;
  $('dSub').textContent = sub;
  $('dBody').innerHTML = html;
  $('drawer').classList.add('open', 'wide');
}
function drillItems(bi, pidx, its0, label) {
  const b = BK[bi],
    ps = new Set(pidx),
    rows = (its0 || b.items)
      .map((it) => {
        let a = 0,
          q = 0;
        for (const p of ps) {
          a += it.p[p];
          q += it.q[p];
        }
        return { it, a, q };
      })
      .filter((x) => Math.abs(x.a) > 0.005)
      .sort((x, y) => Math.abs(y.a) - Math.abs(x.a)),
    tot = rows.reduce((x, y) => x + y.a, 0);
  R.drillCtx = { bi, pidx };
  drill(
    b.id + ' · ' + label,
    rows.length + ' items · ' + fmt(tot) + ' · click an item for its CJI3 lines',
    `<table class="s"><tr><th style="text-align:left">Item</th><th style="text-align:left">Description</th>${b.qty ? '<th>Qty</th>' : ''}<th>Amount</th><th>%</th></tr>${rows
      .slice(0, 400)
      .map(
        (x) =>
          `<tr class="drl" data-di="${x.it.ii}"><td style="text-align:left"><a class="lk">${esc(itemCode(x.it))}</a></td><td style="text-align:left" dir="auto">${esc(itemDesc(x.it))}</td>${b.qty ? `<td>${fq(x.q)}</td>` : ''}<td><b>${fmt(x.a)}</b></td><td>${tot ? ((100 * x.a) / tot).toFixed(1) + '%' : ''}</td></tr>`
      )
      .join(
        ''
      )}${rows.length > 400 ? `<tr><td colspan="5" class="help" style="text-align:left">… ${rows.length - 400} smaller items</td></tr>` : ''}</table>`
  );
}
function drillLines(bi, ii, pidx, label) {
  const it = BK[bi].items[ii],
    ps = new Set(pidx),
    idx = [];
  for (let i = 0; i < N; i++) if (L.b[i] === bi && L.it[i] === ii && R.inc[i] && ps.has(R.per[i])) idx.push(i);
  idx.sort((x, y) => L.d[x] - L.d[y]);
  const tot = idx.reduce((x, i) => x + R.amt[i], 0),
    dt = (d) => (d ? String(d).replace(/(\d{4})(\d\d)(\d\d)/, '$1-$2-$3') : '');
  drill(
    itemCode(it) + ' · ' + label,
    idx.length + ' CJI3 lines · ' + fmt2(tot),
    `<div style="margin-bottom:8px">${R.drillCtx && R.drillCtx.bi === bi ? '<a class="lk" id="drBack">‹ back to the items</a> · ' : ''}<a class="lk" id="drItem">item detail</a></div><table class="s"><tr><th style="text-align:left">Date</th><th style="text-align:left">Document</th><th style="text-align:left">Text</th><th>Qty</th><th>Amount</th></tr>${idx
      .slice(0, 600)
      .map(
        (i) =>
          `<tr${isOB(i) ? ' class="obr"' : ''}><td style="text-align:left">${dt(L.d[i])}${isOB(i) ? ' ' + OBTAG : ''}</td><td style="text-align:left">${esc(S[L.doc[i]])} <span class="help">${esc(S[L.ty[i]])}</span></td><td style="text-align:left" dir="auto">${esc(S[L.desc[i]] || S[L.name[i]] || '')}</td><td>${L.qty[i] ? fq(L.qty[i]) : ''}</td><td>${fmt2(R.amt[i])}</td></tr>`
      )
      .join(
        ''
      )}${idx.length > 600 ? `<tr><td colspan="5" class="help" style="text-align:left">… ${idx.length - 600} more – open Lines</td></tr>` : ''}</table>`
  );
  const bk = $('drBack');
  if (bk) bk.onclick = () => drillItems(R.drillCtx.bi, R.drillCtx.pidx, null, R.drillCtx.label || label);
  $('drItem').onclick = () => openDrawer(it);
}
const perLab = (pidx) =>
  pidx.length === 1 ? PER[pidx[0]] : pidx.length === NP - 1 ? 'to date' : PER[pidx[0]] + ' – ' + PER[pidx[pidx.length - 1]];
document.addEventListener('dblclick', (e) => {
  const t = e.target;
  const dk = t.closest('[data-dk]');
  if (dk) {
    const [bi, k] = dk.dataset.dk.split('|'),
      pidx = k === 'td' ? PER.slice(0, NP - 1).map((x, j) => j) : [+k];
    R.drillCtx = { bi: +bi, pidx, label: perLab(pidx) };
    drillItems(+bi, pidx, null, perLab(pidx));
    return;
  }
  const td = t.closest('#tb td');
  if (!td || (ST.tab !== 'pm' && ST.tab !== 'xpm')) return;
  const tr = td.parentElement;
  let ci = 0;
  for (const x of tr.cells) {
    if (x === td) break;
    ci += x.colSpan || 1;
  }
  const D = R.D,
    c = D && D.cols[ci - (D.sel ? 1 : 0)];
  if (!c || !c.pidx) return;
  if (tr.dataset.k) {
    const r = rowOf(tr);
    if (r && r.it) {
      R.drillCtx = null;
      drillLines(r.it.bi, r.it.ii, c.pidx, perLab(c.pidx));
    }
    return;
  }
  const g = tr.dataset.g;
  if (g !== undefined) {
    const its = R.rows.filter((r) => (g.startsWith('F:') ? famOf(r.g) === g.slice(2) : r.g === g)).map((r) => r.it);
    R.drillCtx = { bi: ST.bk, pidx: c.pidx, label: perLab(c.pidx) };
    drillItems(ST.bk, c.pidx, its, (g.startsWith('F:') ? g.slice(2) : grpTail(g)) + ' · ' + perLab(c.pidx));
  }
});
document.addEventListener('click', (e) => {
  const r = e.target.closest('#dBody tr.drl');
  if (!r || !R.drillCtx) return;
  drillLines(R.drillCtx.bi, +r.dataset.di, R.drillCtx.pidx, perLab(R.drillCtx.pidx));
});
function openDrawer(it) {
  $('drawer').classList.remove('wide');
  const b = BK[it.bi],
    mx = Math.max(
      1,
      ...Array.from(it.p)
        .slice(0, NP - 1)
        .map(Math.abs)
    );
  $('dTitle').textContent = itemCode(it);
  $('dSub').textContent = b.id + (it.grp ? ' · ' + it.grp : '');
  let pol = '';
  if (isSub(it.bi)) {
    const m = new Map();
    for (let i = 0; i < N; i++)
      if (L.b[i] === SUBI && L.it[i] === it.ii && R.inc[i] && R.per[i] !== NP - 1) {
        const po = S[L.po[i]];
        m.set(po, (m.get(po) || 0) + R.amt[i]);
      }
    pol = `<table class="s" style="margin-top:8px"><tr><th>PO</th><th>Subcontractor</th><th>To date</th></tr>${[...m]
      .sort((a, b2) => b2[1] - a[1])
      .map(
        ([po, v]) =>
          `<tr><td><a class="lk gopo2" data-po="${esc(po)}">${esc(po)}</a></td><td dir="auto" style="text-align:right">${esc(SUB.supn[po] || '')}</td><td>${fmt(v)}</td></tr>`
      )
      .join('')}</table>`;
  }
  $('dBody').innerHTML = `<div dir="auto" style="font-size:14px;font-weight:600">${esc(itemDesc(it))}</div>
    <div class="bars">${PER.slice(0, NP - 1)
      .map(
        (p, k) =>
          `<div class="${k === R.rep ? 'cut' : ''}" style="height:${((100 * Math.abs(it.p[k])) / mx).toFixed(1)}%" title="${p}: ${fmt(it.p[k])}"></div>`
      )
      .join('')}</div>
    <div class="blab">${PER.slice(0, NP - 1)
      .map((p) => `<span>${p.replace('-', ' ')}</span>`)
      .join('')}</div>
    <dl><dt>To date</dt><dd><b>${fmt(it.td)}</b></dd><dt>This month (${R.repLab})</dt><dd>${fmt(it.tm)}</dd><dt>Pending</dt><dd>${fmt(it.pe)}</dd>${b.qty ? `<dt>Qty to date</dt><dd>${fq(it.qtd)} ${esc(itemUnit(it))}</dd><dt>Rate</dt><dd>${Math.abs(it.qtd) > 1e-9 ? fmt2(it.td / it.qtd) : '-'}</dd>` : ''}
    <dt>Lines</dt><dd>${it.n} (${it.nh} hand-coded) · <a class="lk golines">show lines</a></dd><dt>Excluded</dt><dd>${fmt(it.exc)}</dd><dt>Codes</dt><dd>${codeF(
      it.bi
    )
      .map((f) => FN[f] + ': <b>' + (esc(it[f]) || '–') + '</b>')
      .join(' · ')}</dd><dt>Status</dt><dd>${statusOf(it)}</dd></dl>${pol}`;
  $('dBody').querySelector('.golines').onclick = () => xpGoLines(it, null); // Expenses › SAP CJI3 transactions, only this item's lines
  $('dBody')
    .querySelectorAll('.gopo2')
    .forEach((a) => {
      a.onclick = () => {
        ST.tab = 'sub';
        ST.sub = 'po';
        const S0 = vs();
        S0.q = a.dataset.po;
        S0.fold.clear();
        $('drawer').classList.remove('open');
        render();
      };
    });
  $('drawer').classList.add('open');
}
$('dClose').onclick = () => $('drawer').classList.remove('open');
