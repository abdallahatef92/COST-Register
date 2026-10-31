/* Report definitions. Adding a report = adding one entry to SPEC (and its caption list to headers.js).
 *
 * id         short name, also the table name
 * detect     captions that must all be in the header row (case, spacing ignored); the filename is never used
 * key        captions that identify a line (upsert) - mode 'upsert' only
 * mode       upsert          new lines insert, known lines update in place (key must be unique inside the file)
 *            replace_period  the months present in the file are deleted, then the file's rows are inserted
 *                            (reports with no line id, where identical rows are real money: ZINTC1)
 *            replace_latest  the whole table is replaced by the newest snapshot (MB52)
 * blank      a row with nothing in this column is a SAP subtotal / total row: skipped and counted
 * period     where the month (YYYY-MM) comes from: { date: caption } or { ym: [yearCaption, monthCaption] }
 * project    where the project code comes from (WBS root, else plant)
 * join       caption feeding each normalised join helper column
 * cjiJoinField  how the report links to CJI3 (used by the joined view and, later, the reconciliation)
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./headers.js'), require('./util.js'));
  else root.CRR = factory(root.REPORT_HEADERS, root.CRU);
})(typeof self !== 'undefined' ? self : this, function (HEADERS, U) {
  'use strict';

  const OPENING_TYPES = ['UE', 'ZB', 'MD', 'HT'];      // go-live opening balances: never month activity

  const SPEC = {
    cji3: {
      label: 'CJI3 - actual cost line items', short: 'CJI3', table: 'cji3', mode: 'upsert',
      detect: ['Document Number', 'Posting Row', 'Fiscal Year', 'Cost Element', 'WBS Element', 'Val/COArea Crcy', 'Posting Date'],
      key: ['Document Number', 'Posting Row', 'Fiscal Year'],
      blank: 'Document Number', amount: 'Val/COArea Crcy', footer: true,
      types: {
        num: ['Val/COArea Crcy', 'Vbl. value/Obj. curr', 'Value TranCurr', 'Total quantity', 'Variable value', 'Value in Obj. Crcy', 'Val.in rep.cur.', 'Var.val.in rep.cur.'],
        int: ['Posting Row', 'Fiscal Year', 'Item', 'From Period', 'To Period', 'Period', 'FI Posting Item', 'Ref. Fiscal Year', 'Value Type', 'Profitab. Segmt No.'],
        date: ['Document Date', 'Posting Date', 'Created on', 'Value Date'],
        time: ['Time of Entry', 'Time created'],
        wbs: ['WBS Element'],
      },
      names: { 'Val/COArea Crcy': 'amount', 'Document Number': 'document_number', 'Posting Row': 'posting_row', 'Fiscal Year': 'fiscal_year', 'Cost Element': 'cost_element',
        'Cost element name': 'cost_element_name', 'WBS Element': 'wbs_element', 'Posting Date': 'posting_date', 'Document Type': 'document_type',
        'Purchasing Document': 'purchasing_document', 'Partner Object Type': 'partner_object_type', 'Partner Object': 'partner_object', 'Total quantity': 'total_quantity' },
      period: { date: 'Posting Date' },
      project: { wbs: 'WBS Element', plant: 'Plant' },
      join: { po: 'Purchasing Document', wbs: 'WBS Element', material: 'Material', order: 'Partner Object', orderWhen: ['Partner Object Type', 'Order'] },
      defaultCols: ['Posting Date', 'Document Type', '@bucket', 'Document Number', 'Posting Row', 'Cost Element', 'Cost element name', 'WBS Element', 'Val/COArea Crcy',
        'Name', 'Document Header Text', 'Purchasing Document', 'Material', 'Name of offsetting account', 'Partner Object'],
      search: ['Name', 'Document Header Text', 'Cost element name', 'Document Number', 'WBS Element', 'Purchasing Document', 'Material Description', 'Name of offsetting account', 'Partner object name'],
    },
    zscprg01: {
      label: 'ZSCPRG01 - subcontract certificate lines', short: 'ZSCPRG01', table: 'zscprg01', mode: 'upsert',
      detect: ['Pur. Doc.', 'Invoice Serial (new)', 'SC Work Current Cost', 'Current Quantity'],
      key: ['Pur. Doc.', 'Invoice Serial (new)', 'Item', 'Number', 'Line', 'WBS Element'],   // SAP repeats a line on every WBS it is split over
      blank: 'Pur. Doc.', amount: 'SC Work Current Cost',
      types: {
        num: ['SC Work Current + Vat', 'ZMSC_HD_STATUS-ZNET_FINL', 'Gross Price', 'Total Quantity', 'Previous Quantity', 'Current Quantity', 'Progress %', 'VAT Current', 'SC Work Current Cost', 'Quantity'],
        int: ['Year'], date: ['Date', 'Doc. Date'], time: ['Time'], wbs: ['WBS Element'],
      },
      names: { 'Pur. Doc.': 'pur_doc', 'Invoice Serial (new)': 'invoice_serial', 'نوع العقد': 'contract_type', 'SC Work Current Cost': 'sc_work_current_cost', 'VAT Current': 'vat_current',
        'Account Number of Supplier': 'supplier_name', 'Supplier': 'supplier_code', 'Character 1': 'approved', 'Date': 'cert_date', 'WBS Element': 'wbs_element' },   // SAP labels name/code the wrong way round
      period: { date: 'Date' },
      project: { wbs: 'WBS Element', plant: 'Plnt' },
      join: { po: 'Pur. Doc.', wbs: 'WBS Element' },
      defaultCols: ['Date', 'Pur. Doc.', 'Invoice Serial (new)', 'Character 1', 'Flag', 'Account Number of Supplier', 'Service', 'Short Text 1', 'Current Quantity', 'Gross Price',
        'SC Work Current Cost', 'VAT Current', 'WBS Element'],
      search: ['Pur. Doc.', 'Account Number of Supplier', 'Service', 'Short Text 1', 'Invoice Serial (new)', 'WBS Element'],
    },
    zscsrv1: {
      label: 'ZSCSRV1 - PO service lines', short: 'ZSCSRV1', table: 'zscsrv1', mode: 'upsert',
      detect: ['Purchase Order', 'PO item', 'PO Service Code', 'PO Service Line no.'],
      key: ['Purchase Order', 'PO item', 'PO Service Line no.'],
      blank: 'Purchase Order', amount: 'PO Service Price',
      types: {
        num: ['Contractual VAT %', 'Contractual Advance Payment', 'Contractual Downpayment', 'Contractual Retention', 'Contractual Hold Amount', 'Service Unit Price', 'PO Service Qty',
          'PO Service Price', 'Total Cost', 'PO Service Tolerance (Percentage)', 'Total Qty Received', 'Total Qty Accepted', 'Current (Last Qty Received)'],
        date: ['User Field N1 (Date)', 'Last Date ( Work Date)'], wbs: ['WBS'],
      },
      names: { 'Purchase Order': 'purchase_order', 'PO item': 'po_item', 'PO Service Line no.': 'po_service_line', 'WBS': 'wbs' },
      period: null,
      project: { wbs: 'WBS', plant: 'Plant' },
      join: { po: 'Purchase Order', wbs: 'WBS' },
      defaultCols: ['Purchase Order', 'PO item', 'Subcontractor Name', 'Type of Works for PO', 'PO Service Code', 'Service Short Text', 'PO Service Qty', 'PO Service UOM', 'Service Unit Price',
        'PO Service Price', 'Total Qty Received', 'WBS'],
      search: ['Purchase Order', 'Subcontractor Name', 'Type of Works for PO', 'PO Service Code', 'Service Short Text', 'WBS'],
    },
    zintc1: {
      label: 'ZINTC1 - internal order lines', short: 'ZINTC1', table: 'zintc1', mode: 'replace_period',
      detect: ['Order', 'Order Type', 'Actual', 'Year', 'Month', 'Category', 'Activity Type'],
      blank: 'Order', amount: 'Actual',
      types: { num: ['Value Transaction sourc', 'Actual', 'Total Qty'], int: ['Year', 'Month'], wbs: ['WBS'] },
      names: { 'Order': 'order_no', 'Actual': 'actual', 'Year': 'year', 'Month': 'month', 'WBS': 'wbs', 'Category': 'category' },
      period: { ym: ['Year', 'Month'] },
      project: { wbs: 'WBS', plant: 'Plant' },
      join: { order: 'Order', wbs: 'WBS' },
      defaultCols: ['Year', 'Month', 'Order', 'Order Description', 'Order Type Description', 'Cost Element Descriptio', 'Activity Type Descripti', 'Actual', 'Total Qty', 'Activity type UOM', 'WBS', 'Category'],
      search: ['Order', 'Order Description', 'Order Type Description', 'Cost Element Descriptio', 'Activity Type Descripti', 'WBS'],
    },
    mb51: {
      label: 'MB51 - material movements', short: 'MB51', table: 'mb51', mode: 'upsert',
      detect: ['Material Document', 'Material Doc.Item', 'Material Doc. Year', 'Movement Type', 'Amt.in Loc.Cur.'],
      key: ['Material Document', 'Material Doc. Year', 'Material Doc.Item'],
      blank: 'Material', amount: 'Amt.in Loc.Cur.',
      types: { num: ['Qty in unit of entry', 'Amt.in Loc.Cur.', 'Ext. Amount in LC'], int: ['Material Doc. Year'], date: ['Posting Date', 'Document Date', 'Entry Date'], time: ['Time of Entry'], wbs: ['WBS Element'] },
      names: { 'Material Document': 'material_document', 'Material Doc.Item': 'material_doc_item', 'Material Doc. Year': 'material_doc_year', 'Movement Type': 'movement_type',
        'Amt.in Loc.Cur.': 'amount', 'Qty in unit of entry': 'qty', 'Posting Date': 'posting_date', 'WBS Element': 'wbs_element' },
      period: { date: 'Posting Date' },
      project: { wbs: 'WBS Element', plant: 'Plant' },
      join: { po: 'Purchase order', wbs: 'WBS Element', material: 'Material' },
      defaultCols: ['Posting Date', 'Movement Type', 'Material Document', 'Material Doc.Item', 'Material', 'Material Description', 'Qty in unit of entry', 'Unit of Entry', 'Amt.in Loc.Cur.', 'WBS Element', 'Supplier'],
      search: ['Material', 'Material Description', 'Material Document', 'WBS Element', 'Document Header Text', 'Text'],
    },
    me2n: {
      label: 'ME2N - purchase order lines', short: 'ME2N', table: 'me2n', mode: 'upsert',
      detect: ['Purchasing Document', 'Item', 'Material Group', 'Net Order Value', 'Supplier/Supplying Plant'],
      key: ['Purchasing Document', 'Item'],
      blank: 'Purchasing Document', amount: 'Net Order Value',
      types: { num: ['Order Quantity', 'Price Unit', 'Net Price', 'Net Order Value', 'Still to be delivered (qty)', 'Still to be delivered (value)', 'Still to be invoiced (qty)', 'Still to be invoiced (val.)'], date: ['Document Date'] },
      names: { 'Purchasing Document': 'purchasing_document', 'Item': 'item', 'Net Order Value': 'net_order_value', 'Document Date': 'document_date' },
      period: { date: 'Document Date' },
      project: { plant: 'Plant' },
      join: { po: 'Purchasing Document', material: 'Material' },
      defaultCols: ['Document Date', 'Purchasing Document', 'Item', 'Supplier/Supplying Plant', 'Material', 'Material Group', 'Short Text', 'Order Quantity', 'Order Unit', 'Net Price', 'Net Order Value',
        'Still to be delivered (qty)', 'Still to be invoiced (val.)'],
      search: ['Purchasing Document', 'Supplier/Supplying Plant', 'Material', 'Short Text'],
    },
    mb52: {
      label: 'MB52 - warehouse stock', short: 'MB52', table: 'mb52', mode: 'replace_latest',
      detect: ['Material', 'Plant', 'Storage Location', 'Unrestricted', 'Value Unrestricted'],
      blank: 'Material', amount: 'Value Unrestricted',
      types: { num: ['Unrestricted', 'Value Unrestricted', 'Stock in Transit', 'Value in Stock Tfr', 'Transit and Transfer', 'Val. in Trans./Tfr', 'Blocked Stock', 'Quality Inspection'] },
      names: { 'Material': 'material', 'Plant': 'plant', 'Storage Location': 'storage_location' },
      period: null,
      project: { plant: 'Plant' },
      join: { material: 'Material' },
      defaultCols: ['Material', 'Material Description', 'Material Group', 'Plant', 'Storage Location', 'Unrestricted', 'Value Unrestricted', 'Base Unit of Measure', 'Stock in Transit', 'Blocked Stock'],
      search: ['Material', 'Material Description', 'Material Group'],
    },
  };

  // ------------------------------------------------------------------ columns
  // The columns of a report's table: every known caption (typed), then the helper columns the tool adds.
  const EXTRA = [
    { col: 'project', label: 'Project', type: 'text' },
    { col: 'source_file', label: 'Source file', type: 'text' },
    { col: 'period_ym', label: 'Month', type: 'text' },
    { col: 'join_po', label: 'Join: PO', type: 'text' },
    { col: 'join_wbs', label: 'Join: WBS', type: 'text' },
    { col: 'join_order', label: 'Join: order', type: 'text' },
    { col: 'join_material', label: 'Join: material', type: 'text' },
  ];
  const CJI3_EXTRA = [
    { col: 'kind', label: 'Kind', type: 'text' },             // cost | revenue (4xxxxxxx)
    { col: 'is_opening', label: 'Opening', type: 'int' },      // 1 = go-live opening balance (UE, ZB, MD, HT)
    { col: 'bucket', label: 'Bucket', type: 'text' },          // cost bucket from the mapping rules
  ];

  function build(id) {
    const def = SPEC[id];
    def.id = id;
    const T = def.types, typeOf = {};
    for (const [t, list] of Object.entries(T)) for (const h of list) typeOf[U.normH(h)] = t;
    const used = new Set(EXTRA.map((e) => e.col).concat(id === 'cji3' ? CJI3_EXTRA.map((e) => e.col) : []));
    const names = {}; for (const [h, n] of Object.entries(def.names || {})) names[U.normH(h)] = n;
    const wbsSet = new Set((T.wbs || []).map(U.normH));
    def.columns = HEADERS[id].map((h) => {
      const n = U.normH(h);
      let col = names[n] || U.slug(h), base = col, i = 2;
      while (used.has(col)) col = base + '_' + i++;
      used.add(col);
      return { src: h, norm: n, col, label: h, type: typeOf[n] || 'text', wbs: wbsSet.has(n) };
    });
    def.extra = EXTRA.concat(id === 'cji3' ? CJI3_EXTRA : []).map((e) => Object.assign({ extra: true }, e));
    def.all = def.columns.concat(def.extra);
    def.byNorm = new Map(def.columns.map((c) => [c.norm, c]));
    def.colOf = (header) => { const c = def.byNorm.get(U.normH(header)); if (!c) throw new Error(`${id}: unknown caption "${header}"`); return c.col; };
    def.keyCols = (def.key || []).map(def.colOf);
    def.defaultVisible = def.defaultCols.map((h) => (h.startsWith('@') ? h.slice(1) : def.colOf(h)));
    def.searchCols = def.search.map(def.colOf);
    return def;
  }
  const REPORTS = Object.keys(SPEC).map(build);
  const byId = Object.fromEntries(REPORTS.map((d) => [d.id, d]));

  // ---------------------------------------------------------------- detection
  // aoa = the first rows of a sheet. Returns { def, headerRow } for the report whose required captions are all present, else null.
  // (Some exports carry a title block above the header, so the first 15 rows are searched.)
  function detect(aoa) {
    const rows = (aoa || []).slice(0, 15);
    for (let i = 0; i < rows.length; i++) {
      const set = new Set((rows[i] || []).map(U.normH).filter(Boolean));
      if (set.size < 3) continue;
      let best = null;
      for (const def of REPORTS) if (def.detect.every((h) => set.has(U.normH(h)))) if (!best || def.detect.length > best.detect.length) best = def;
      if (best) return { def: best, headerRow: i };
    }
    return null;
  }

  // ------------------------------------------------------------------ prepare
  // Turns the sheet (array of rows) into rows ready for the table. Pure: no database here.
  function prepare(def, aoa, headerRow, ctx) {
    ctx = ctx || {};
    const hdr = (aoa[headerRow] || []).map(U.normH);
    const first = new Map(); hdr.forEach((h, i) => { if (h && !first.has(h)) first.set(h, i); });     // first copy of a repeated caption wins
    const idx = def.columns.map((c) => (first.has(c.norm) ? first.get(c.norm) : -1));
    const missing = def.columns.filter((c, i) => idx[i] < 0).map((c) => c.src);
    const known = new Set(def.columns.map((c) => c.norm));
    const unknown = [...first.keys()].filter((h) => !known.has(h));
    const at = (header) => { const i = first.get(U.normH(header)); return i == null ? -1 : i; };

    const blankIx = at(def.blank), amountIx = def.amount ? at(def.amount) : -1;
    const keyIx = (def.key || []).map((h) => ({ i: at(h), col: def.byNorm.get(U.normH(h)) }));
    const periodDate = def.period && def.period.date ? at(def.period.date) : -1;
    const periodYm = def.period && def.period.ym ? def.period.ym.map(at) : null;
    const pj = def.project || {}, wbsIx = pj.wbs ? at(pj.wbs) : -1, plantIx = pj.plant ? at(pj.plant) : -1;
    const J = def.join || {};
    const jIx = { po: J.po ? at(J.po) : -1, wbs: J.wbs ? at(J.wbs) : -1, order: J.order ? at(J.order) : -1, material: J.material ? at(J.material) : -1 };
    const orderWhen = J.orderWhen ? { i: at(J.orderWhen[0]), v: U.normH(J.orderWhen[1]) } : null;
    const docTypeIx = def.id === 'cji3' ? at('Document Type') : -1, ceIx = def.id === 'cji3' ? at('Cost Element') : -1;
    const colType = def.columns.map((c) => c.type);
    const nCols = def.columns.length;
    const amountCol = def.amount ? def.columns.findIndex((c) => c.norm === U.normH(def.amount)) : -1;
    for (const k of keyIx) if (k.i < 0) throw new Error(`${def.short}: the file has no "${k.col.src}" column. Export it again with the standard layout.`);

    const out = { rows: [], keys: [], blankRows: 0, emptyRows: 0, rejected: 0, rejectedSample: [], badNumbers: 0, badDates: 0, dupKeys: 0, dupSample: [], missing, unknown,
      footer: null, sumAmount: 0, proj: new Map(), minPeriod: null, maxPeriod: null, periods: new Set() };
    const seen = def.mode === 'upsert' ? new Set() : null;
    const reject = (n, why) => { out.rejected++; if (out.rejectedSample.length < 5) out.rejectedSample.push(`row ${n}: ${why}`); };

    for (let r = headerRow + 1; r < aoa.length; r++) {
      const row = aoa[r];
      if (!row || !row.length || !row.some((v) => v != null && String(v).trim() !== '')) { out.emptyRows++; continue; }
      if (blankIx >= 0 && U.toText(row[blankIx]) == null) {                      // SAP subtotal / total row
        out.blankRows++;
        if (def.footer && out.footer == null && amountIx >= 0 && (ceIx < 0 || U.toText(row[ceIx]) == null) && (wbsIx < 0 || U.toText(row[wbsIx]) == null)) {
          const a = U.toNum(row[amountIx]); if (a != null && !isNaN(a)) out.footer = a;
        }
        continue;
      }
      const vals = new Array(nCols);
      let bad = null;
      for (let c = 0; c < nCols; c++) {
        const i = idx[c]; const v = i < 0 ? null : row[i], t = colType[c];
        if (t === 'num') { const n = U.toNum(v); if (n !== null && isNaN(n)) { out.badNumbers++; vals[c] = null; } else vals[c] = n; }
        else if (t === 'int') { const n = U.toNum(v); if (n !== null && (isNaN(n) || !Number.isInteger(n))) { out.badNumbers++; vals[c] = null; } else vals[c] = n; }
        else if (t === 'date') { const d = U.toDate(v); if (d == null && U.toText(v) != null && U.toText(v) !== '0') out.badDates++; vals[c] = d; }   // SAP writes 0 for an empty date
        else if (t === 'time') vals[c] = U.toTime(v);
        else if (def.columns[c].wbs) vals[c] = U.toWbs(v);
        else vals[c] = U.toText(v);
      }
      // key: text keys may be empty (stored as ''), integer keys must be present
      let key = null;
      if (def.mode === 'upsert') {
        const parts = [];
        for (const k of keyIx) {
          const ci = def.columns.indexOf(k.col);
          let v = vals[ci];
          if (k.col.type === 'int' || k.col.type === 'num') { if (v == null) { bad = `${k.col.src} is empty`; break; } }
          else if (v == null) { v = ''; vals[ci] = ''; }
          parts.push(v);
        }
        if (bad) { reject(r + 1, bad); continue; }
        key = parts.join('\u0001');
        if (seen.has(key)) { out.dupKeys++; if (out.dupSample.length < 5) out.dupSample.push(parts.join(' | ')); continue; }
        seen.add(key);
      }
      // helper columns
      const ym = periodDate >= 0 ? U.ymOf(U.toDate(row[periodDate]))
        : periodYm ? (() => { const y = U.toNum(row[periodYm[0]]), m = U.toNum(row[periodYm[1]]); return y && m ? `${y}-${String(m).padStart(2, '0')}` : null; })() : null;
      if (ym) { out.periods.add(ym); if (!out.minPeriod || ym < out.minPeriod) out.minPeriod = ym; if (!out.maxPeriod || ym > out.maxPeriod) out.maxPeriod = ym; }
      const wbsV = wbsIx >= 0 ? U.toWbs(row[wbsIx]) : null, plantV = plantIx >= 0 ? U.toText(row[plantIx]) : null;
      const pk = U.projectKey(wbsV) || U.projectKey(plantV);
      if (pk) out.proj.set(pk, (out.proj.get(pk) || 0) + 1);
      const orderOk = !orderWhen || (orderWhen.i >= 0 && U.normH(row[orderWhen.i]) === orderWhen.v);
      vals.push(ctx.project || null, ctx.sourceFile || null, ym,
        jIx.po >= 0 ? U.joinKey(row[jIx.po]) : null, jIx.wbs >= 0 ? U.toWbs(row[jIx.wbs]) : null,
        jIx.order >= 0 && orderOk ? U.joinKey(row[jIx.order]) : null, jIx.material >= 0 ? U.joinKey(row[jIx.material]) : null);
      if (def.id === 'cji3') {
        const ce = ceIx >= 0 ? U.toText(row[ceIx]) : null, dt = docTypeIx >= 0 ? U.toText(row[docTypeIx]) : null;
        vals.push(ce && ce.startsWith('4') ? 'revenue' : 'cost', dt && OPENING_TYPES.includes(dt.toUpperCase()) ? 1 : 0, null);
      }
      if (amountCol >= 0 && typeof vals[amountCol] === 'number') out.sumAmount += vals[amountCol];
      out.rows.push(vals);
      if (key != null) out.keys.push(key);          // parallel to rows, upsert reports only
    }
    return out;
  }

  // the project code a file talks about: the most common one among its rows ('' when it has none)
  const projectOf = (proj) => { let best = '', n = 0; for (const [k, c] of proj) if (c > n) { best = k; n = c; } return best; };

  return { SPEC, REPORTS, byId, EXTRA, CJI3_EXTRA, OPENING_TYPES, detect, prepare, projectOf };
});
