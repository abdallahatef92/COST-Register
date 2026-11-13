// =====================================================================================  Checks (live)
function renderChecks() {
  const rows = [],
    add = (name, v, kind, note) => rows.push([name, v, kind, note]);
  add(
    'Register vs CJI3 cost – difference',
    R.diff,
    'abs',
    'Counted + pending + excluded + depreciation excluded + client deductions − VAT included − included charges not yet in CJI3 − CJI3 cost.'
  );
  add('Duplicate line keys', META.dupes, 'zero', 'A key that appears twice would be double-counted.');
  (META.cjiFiles || []).forEach((f) =>
    add(
      `CJI3 file ${f.name} (${f.first} → ${f.last}, ${f.lines.toLocaleString('en-US')} lines): lines vs its grand-total row`,
      r2(f.sum - (f.grand || 0)),
      'abs',
      f.dropped
        ? f.dropped.toLocaleString('en-US') + ' lines were already in an earlier file and are counted once.'
        : "Sum of the file's lines minus its own grand-total row."
    )
  );
  if ((META.cjiFiles || []).length > 1)
    add(
      'CJI3 lines with a different amount in two files',
      META.cjiConflictN || 0,
      'zero',
      (META.cjiConflicts || [])
        .slice(0, 3)
        .map((c) => `${c.id}: ${c.wasFile} ${c.was} → ${c.nowFile} ${c.now}`)
        .join(' · ') || 'The later download wins; none found.'
    );
  add(
    'Lines with no bucket (Unclassified)',
    META.unclassified,
    'zero',
    'A cost element without a rule – Check › Rules (bottom of the list): make a rule and apply it.'
  );
  const subP = SUBI >= 0 ? R.bkP[SUBI] : null;
  if (SUB && subP) {
    const reg = subP.reduce((s, v) => s + v, 0) + R.bkExc[SUBI];
    add(
      'Subcontractor: bucket (without VAT) vs CJI3',
      r2(reg - R.vatIn - R.bkUns[SUBI] - SUB.cjiTotal),
      'abs',
      'Certificates + differences = Subcontractor bucket in CJI3.'
    );
  }
  BK.forEach((b) => {
    const nf = b.items.filter((it) => statusOf(it) !== 'Coded').length;
    add(b.id + ': items not fully coded', nf, 'info', b.items.length + ' items.');
  });
  if (HASOWN) {
    const o = ownStats();
    add(
      'Owner-supplied material: materials with quantity and no amount, still without a rate',
      o.noRate,
      'info',
      `${o.n} owner-supplied materials${o.out ? ` · ${o.out} set as not owner-supplied` : ''} · valued so far ${fmt(R.ownIn)} – Adjust › Owner-supplied material.`
    );
  }
  add(
    'Lines typed over (hand-coded)',
    [...R.hand].reduce((s, v) => s + v, 0),
    'info',
    'Lines coded differently from their item (Lines tab).'
  );
  add('ZY accrual-reversal lines paired to a bucket', META.zy, 'info', 'Equal-and-opposite pairs take the bucket of the original.');
  if (ZI) {
    const T = {
      HOUS: 'house rent',
      ZF01: 'fleet orders',
      ZFU1: 'fuel orders',
      ZE01: 'equipment',
      ZTM1: 'trips',
      DCRM: 'corrective maintenance',
    };
    add(
      'ZINTC1: CJI3 order settlements not explained by ZINTC1',
      r2(ZI.cjiSettle - ZI.explained),
      'abs',
      `${(ZI.ordersSettled || 0).toLocaleString('en-US')} settled orders; ${fmt2(ZI.explained)} of ${fmt2(ZI.cjiSettle)} replaced by ZINTC1 detail${ZI.shifted ? ` (${fmt2(ZI.shifted)} charged in one month, settled in a later one)` : ''}.`
    );
    add(
      'ZINTC1: settlements that differ from their ZINTC1 rows',
      ZI.adjN,
      'info',
      ZI.adjN ? `${fmt2(ZI.adj)} kept as "Settlement difference" rows.` : 'Every settlement equals its ZINTC1 rows.'
    );
    add(
      'ZINTC1: charges not yet settled in CJI3',
      ZI.uns,
      'info',
      Object.entries(ZI.unsByType || {})
        .filter(([, v]) => Math.abs(v) >= 1)
        .map(([k, v]) => `${k} ${T[k] || ''} ${fmt(v)}`)
        .join(' · ') +
        (ZI.unsAfter ? ` · of which after the CJI3 data ${fmt(ZI.unsAfter)}` : '') +
        ` · included by you: ${fmt2(R.unsIn)}`
    );
  }
  if (SUB) {
    add('Subcontractor: approved certificates not yet in CJI3', SUB.unposted, 'info', SUB.unpostedN + ' lines.');
    add('Subcontractor: CJI3 documents explained by certificates', SUB.docs, 'info', 'of ' + SUB.cjiDocs + '.');
  }
  const tr = (rs) =>
    rs
      .map(([n, v, k, note]) => {
        const ok = k === 'abs' ? Math.abs(v) < 0.01 : k === 'zero' ? v === 0 : null;
        return `<tr><td>${esc(n)}</td><td>${typeof v === 'number' && k !== 'zero' && Math.abs(v) >= 100 ? (Number.isInteger(v) ? v.toLocaleString('en-US') : fmt2(v)) : v}</td><td style="text-align:center">${ok === null ? '<span class="inf">info</span>' : ok ? '<span class="okc">OK</span>' : '<span class="chk">CHECK</span>'}</td><td style="text-align:left;color:#555">${esc(note)}</td></tr>`;
      })
      .join('');
  const hd = '<tr><th>Check</th><th>Value</th><th>Status</th><th style="text-align:left">What it means</th></tr>',
    rec = rows.filter((x) => x[2] !== 'info'),
    cod = rows.filter((x) => x[2] === 'info' && /not fully coded|typed over/.test(x[0])),
    inf = rows.filter((x) => x[2] === 'info' && !cod.includes(x)),
    bad = rec.filter((x) => (x[2] === 'abs' ? Math.abs(x[1]) >= 0.01 : x[1] !== 0)).length;
  cod.forEach((x) => {
    x[0] = x[0].replace('items not fully coded', 'items not coded');
    x[3] = String(x[3]).replace(/^([\d,]+) items\.$/, (m, n) => 'out of ' + n + ' item' + (n === '1' ? '' : 's'));
  });
  $('chk').innerHTML =
    `<div class="panel"><h2>Reconciliation<span class="note">${bad ? `<b style="color:#9B2C2C">${bad} to look at</b>` : 'every check reads OK'}</span></h2><table class="s fxt" data-fx="chk1">${hd}${tr(rec)}</table></div>
   <div class="panel"><h2>Coding progress<span class="note">items still to code, per bucket</span></h2><table class="s fxt" data-fx="chk2">${hd}${tr(cod)}</table></div>
   <div class="panel"><h2>Information<span class="note">what the build found – nothing to fix</span></h2><table class="s fxt" data-fx="chk3">${hd}${tr(inf)}</table></div>`;
  fxScan($('chk'));
}
