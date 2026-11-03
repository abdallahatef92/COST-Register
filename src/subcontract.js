'use strict';
// Subcontractor bucket from the certificate report (ZSCPRG01) and the PO service list (ZSCSRV1).
// CJI3 stays the truth: every CJI3 subcontractor line that a certificate explains is replaced by the certificate lines (net of VAT, month = CJI3 posting month);
// what the certificates do not explain stays visible – one adjustment row per document, one for the opening, and the CJI3 lines no certificate covers.
const { XLSX, readBook } = require('./io');
const { str, num, r2, r3, isoDate } = require('./util');
const { indexHeader } = require('./cji3');

const PROG = { plant: 'Plnt', serial: 'Invoice Serial (new)', date: 'Date', po: 'Pur. Doc.', supName: 'Account Number of Supplier', supCode: 'Supplier', appr: 'Character 1', flag: 'Flag', docNo: 'DocumentNo',
  item: 'Item', pkg: 'Number', line: 'Line', price: 'Gross Price', svc: 'Service', text: 'Short Text 1', tax: 'Tx', ctype: 'نوع العقد', qty: 'Current Quantity', vat: 'VAT Current', amt: 'SC Work Current Cost',
  certText: 'Short Text', wbs: 'WBS Element', gl: 'G/L Acct' };
const SERV = { po: 'Purchase Order', svc: 'PO Service Code', uom: 'PO Service UOM', type: 'Type of Works for PO', supName: 'Subcontractor Name', itemText: 'PO item description', value: 'PO Service Price', text: 'Service Short Text' };
const VAT_KNOWN = { P0: 0, P2: 0.1, P3: 0.14 };

// descriptions are typed by hand on POs: spacing and Arabic letter variants must not split a coding row
const normText = (t) => str(t).replace(/[ً-ْـ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/\s*([-+*/()])\s*/g, '$1').replace(/\s+/g, ' ').trim().toLowerCase();
const normTow = (t) => str(t).replace(/\s+/g, ' ').replace(/\s*-\s*/, '-');
const top = (m) => { let b = '', n = 0; if (m) for (const [k, v] of m) if (v > n) { n = v; b = k; } return b; };
const tally = (m, k, w = 1) => m.set(k, (m.get(k) || 0) + w);

function sheetRows(file) { const wb = readBook(file, { cellDates: true }); return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: null }); }

function readProg(file) {
  const sh = sheetRows(file), h = sh.findIndex((r) => r.some((c) => str(c) === 'SC Work Current Cost')); if (h < 0) throw new Error('ZSCPRG01: column "SC Work Current Cost" not found.');
  const ix = indexHeader(sh[h]), C = {}; for (const [k, n] of Object.entries(PROG)) { if (ix.has(n)) C[k] = ix.get(n); else if (!['gl', 'wbs', 'certText', 'docNo'].includes(k)) throw new Error('ZSCPRG01: column "' + n + '" is missing.'); }
  const g = (r, k) => (C[k] === undefined ? null : r[C[k]]), rows = [];
  for (const r of sh.slice(h + 1)) {
    if (!r) continue; const po = str(g(r, 'po')); if (!po) continue;                                   // SAP subtotal and grand-total rows have no PO
    rows.push({ serial: str(g(r, 'serial')), date: isoDate(g(r, 'date')), po, supName: str(g(r, 'supName')), supCode: str(g(r, 'supCode')), appr: str(g(r, 'appr')).toUpperCase(), flag: str(g(r, 'flag')).toUpperCase(),
      docNo: str(g(r, 'docNo')).replace(/\.0+$/, ''), item: str(g(r, 'item')), pkg: str(g(r, 'pkg')), line: str(g(r, 'line')), price: num(g(r, 'price')), svc: str(g(r, 'svc')), text: str(g(r, 'text')).replace(/\s+/g, ' '),
      tax: str(g(r, 'tax')).toUpperCase(), ctype: str(g(r, 'ctype')).toUpperCase(), qty: num(g(r, 'qty')), vat: num(g(r, 'vat')), amt: num(g(r, 'amt')), certText: str(g(r, 'certText')), wbs: str(g(r, 'wbs')), gl: str(g(r, 'gl')) });
  }
  // WBS repeats: one certificate line shown on several WBS rows with the full amount on each -> keep the first (same rule as the Subcontract report)
  const byId = new Map(); for (const x of rows) { x.lid = [x.po, x.serial, x.item, x.pkg, x.line].join('|'); (byId.get(x.lid) || byId.set(x.lid, []).get(x.lid)).push(x); }
  const lines = []; let dupRows = 0, dupAmt = 0;
  for (const [lid, grp] of byId) {
    if (grp.length === 1) { lines.push(grp[0]); continue; }
    const f = grp[0], same = grp.every((x) => x.amt === f.amt && x.qty === f.qty && x.vat === f.vat), differ = new Set(grp.map((x) => x.wbs)).size === grp.length;
    if (same && differ) { lines.push(f); dupRows += grp.length - 1; dupAmt += f.amt * (grp.length - 1); } else grp.forEach((x, j) => { if (j) x.lid = lid + '#' + (j + 1); lines.push(x); });
  }
  // VAT rate per tax code from the data, then the net unit rate (A2 contracts quote prices with VAT)
  const vt = new Map(); for (const l of lines) if (Math.abs(l.amt) > 100) { const m = vt.get(l.tax) || vt.set(l.tax, new Map()).get(l.tax); tally(m, String(Math.round((l.vat / l.amt) * 100) / 100)); }
  const vat = {}; for (const l of lines) if (!(l.tax in vat)) { const t = top(vt.get(l.tax)); vat[l.tax] = t !== '' ? +t : l.tax in VAT_KNOWN ? VAT_KNOWN[l.tax] : 0; }
  for (const l of lines) { l.net = l.ctype === 'A2' ? l.price / (1 + (vat[l.tax] || 0)) : l.price; l.pol = [l.po, l.item, l.pkg, l.line].join('|');
    l.kind = !l.amt ? (l.qty ? 'Qty only' : 'Zero') : l.qty && Math.abs(l.amt - l.qty * l.net) <= Math.max(1, Math.abs(l.amt) * 0.001) ? 'Normal' : 'Adjustment'; }
  // quantity moves with the money: an adjustment becomes quantity at the rate its PO line was certified at
  const pol = new Map(); for (const l of lines) if (l.kind === 'Normal') { const x = pol.get(l.pol) || { a: 0, q: 0 }; x.a += l.amt; x.q += l.qty; pol.set(l.pol, x); }
  for (const l of lines) { if (l.kind === 'Normal') { l.rq = l.qty; continue; } const x = pol.get(l.pol), cr = x && Math.abs(x.q) > 1e-9 ? x.a / x.q : 0, rate = cr || l.net; l.rq = l.amt ? (rate ? l.amt / rate : l.qty) : 0; }
  return { lines: lines.filter((l) => l.amt !== 0), allLines: lines.length, rawRows: rows.length, dupRows, dupAmt: r2(dupAmt), vat };
}

function readServ(file) {
  const sh = sheetRows(file), h = sh.findIndex((r) => r.some((c) => str(c) === 'PO Service Code')); if (h < 0) throw new Error('ZSCSRV1: column "PO Service Code" not found.');
  const ix = indexHeader(sh[h]), g = (r, k) => (ix.has(SERV[k]) ? str(r[ix.get(SERV[k])]) : ''), unit = new Map(), poType = new Map(), poTitle = new Map(), poSup = new Map();
  for (const r of sh.slice(h + 1)) { const po = g(r, 'po'); if (!po) continue; const t = normTow(g(r, 'type')); if (t && !poType.has(po)) poType.set(po, t); const sn = g(r, 'supName'); if (sn && !poSup.has(po)) poSup.set(po, sn);
    const svc = g(r, 'svc'); if (!svc) continue; const u = g(r, 'uom'); if (u) { const m = unit.get(svc) || unit.set(svc, new Map()).get(svc); tally(m, u); }
    const t2 = g(r, 'itemText'); if (t2) { const m = poTitle.get(po) || poTitle.set(po, new Map()).get(po); tally(m, t2, Math.abs(num(r[ix.get(SERV.value)])) + 1); } }
  const U = new Map(); for (const [k, m] of unit) U.set(k, top(m)); const T = new Map(); for (const [k, m] of poTitle) T.set(k, top(m));
  return { unit: U, poType, poTitle: T, poSup };
}
const unitFromCode = (svc) => { const m = /-([A-Za-z0-9]{1,4})$/.exec(str(svc)); return m ? m[1].toUpperCase() : ''; };

function buildSubcontractor(cjiSub, prog, serv, ceNames, vatOpt) {
  const vmode = (vatOpt && vatOpt.mode) || 'Exclude VAT', vfrom = vatOpt && vatOpt.from ? vatOpt.from : '';
  // the VAT a line carries into its amount: none, all, or only certificates dated before the VAT date (no date: opening invoices count as before)
  const vatIn = (l) => (vmode === 'Include VAT' ? l.vat : vmode === 'Include VAT before date' ? ((l.date ? !!vfrom && l.date < vfrom : l.flag === 'X') ? l.vat : 0) : 0);
  const cjiOpen = cjiSub.filter((l) => l.open), cjiRest = cjiSub.filter((l) => !l.open);
  const scDocs = new Map(); for (const l of cjiRest) if (l.type === 'SC' && l.refDoc) (scDocs.get(l.refDoc) || scDocs.set(l.refDoc, []).get(l.refDoc)).push(l);
  const approved = prog.lines.filter((l) => l.appr === 'X'), opening = approved.filter((l) => l.flag === 'X'), rest = approved.filter((l) => l.flag !== 'X');
  const posted = rest.filter((l) => l.docNo && scDocs.has(l.docNo)), unposted = rest.filter((l) => !(l.docNo && scDocs.has(l.docNo)));
  const notApproved = prog.lines.filter((l) => l.appr !== 'X');
  const unitOf = (svc) => (serv && serv.unit.get(svc)) || unitFromCode(svc), towOf = (po) => (serv && serv.poType.get(po)) || '';
  const ceName = (ce) => (ceNames && ceNames.get(ce)) || '';
  const mk = (l, extra) => ({ id: l.lid, doc: '', row: '', fy: '', date: '', ym: '', type: 'SC', ce: l.gl, cen: ceName(l.gl), net: r2(l.amt), vat: r2(l.vat), vin: r2(vatIn(l)), amt: r2(l.amt + vatIn(l)), tax: l.tax, vrate: prog.vat[l.tax] || 0, gross: l.price, ctype: l.ctype, wbs: l.wbs, mat: '', matDesc: '', qty: Math.round(l.rq * 1e6) / 1e6, unit: unitOf(l.svc), name: '', header: l.certText, poText: l.text,
    po: l.po, order: '', orderName: '', offset: l.supName, refDoc: l.docNo, bucket: 'Subcontractor', sub: '', open: false, svc: l.svc, desc: l.text, tow: towOf(l.po), sup: l.supName, cert: l.serial, cdate: l.date,
    ikey: l.svc + '|' + normText(l.text), source: 'Certificate', ...extra });
  const out = [];
  // 1. certificates posted in CJI3: month = the CJI3 posting date of their document
  const docDate = new Map(), certDoc = new Map();
  for (const [d, ls] of scDocs) docDate.set(d, ls.map((l) => l.date).sort()[0]);
  for (const l of posted) { const dt = docDate.get(l.docNo); out.push(mk(l, { doc: l.docNo, date: dt, ym: dt.slice(0, 7) })); certDoc.set(l.docNo, r2((certDoc.get(l.docNo) || 0) + l.amt)); }
  // 2. opening invoices (flag X): the report's detail of the CJI3 opening balance
  const openDate = cjiOpen.map((l) => l.date).sort()[0] || '';
  for (const l of opening) out.push(mk(l, { type: 'UE', open: true, date: l.date || openDate, ym: (l.date || openDate).slice(0, 7), source: 'Opening certificate', ce: l.gl || '' }));
  // 3. what the certificates do not explain stays visible
  let docAdj = 0, docAdjN = 0, roundN = 0, roundAmt = 0; const adjDocs = [], rnd = new Map();   // differences under 1 EGP on a document are cents of rounding: one row per month
  for (const [d, ls] of scDocs) {
    if (!certDoc.has(d)) continue; const diff = r2(ls.reduce((s, l) => s + l.amt, 0) - certDoc.get(d)); if (Math.abs(diff) < 0.005) continue;
    const f = ls[0], cert = posted.find((x) => x.docNo === d);
    if (Math.abs(diff) < 1) { rnd.set(f.ym, r2((rnd.get(f.ym) || 0) + diff)); roundN++; roundAmt += diff; continue; }
    out.push({ id: 'ADJ|' + d, doc: d, row: '', fy: '', date: f.date, ym: f.ym, type: 'SC', ce: f.ce, cen: f.cen, amt: diff, wbs: '', mat: '', matDesc: '', qty: 0, unit: '', name: '', header: '', poText: 'CJI3 and the certificate differ on this document', po: cert ? cert.po : f.po || '',
      order: '', orderName: '', offset: '', refDoc: d, bucket: 'Subcontractor', sub: '', open: false, svc: '(adjustment)', desc: 'Difference between CJI3 and the certificate report', tow: '', sup: cert ? cert.supName : '', cert: '', cdate: '', ikey: 'ADJ', source: 'Document difference' });
    docAdj += diff; docAdjN++; adjDocs.push([d, diff]);
  }
  for (const [ym, v] of rnd) { if (Math.abs(v) < 0.005) continue; const [y, mo] = ym.split('-'), last = new Date(Date.UTC(+y, +mo, 0)).toISOString().slice(0, 10);
    out.push({ id: 'ADJ|ROUND|' + ym, doc: '', row: '', fy: '', date: last, ym, type: 'SC', ce: '', cen: '', amt: v, wbs: '', mat: '', matDesc: '', qty: 0, unit: '', name: '', header: '', poText: 'Rounding: documents where CJI3 and the certificates differ by under 1 EGP', po: '', order: '', orderName: '',
      offset: '', refDoc: '', bucket: 'Subcontractor', sub: '', open: false, svc: '(adjustment)', desc: 'Rounding differences (under 1 EGP per document)', tow: '', sup: '', cert: '', cdate: '', ikey: 'ADJ', source: 'Rounding' }); }
  const openCji = r2(cjiOpen.reduce((s, l) => s + l.amt, 0)), openRep = r2(opening.reduce((s, l) => s + l.amt, 0)), openDiff = r2(openCji - openRep);
  const openVatIn = r2(out.filter((x) => x.source === 'Opening certificate').reduce((t, x) => t + x.vin, 0));
  if (cjiOpen.length && Math.abs(openDiff) >= 0.005) out.push({ id: 'ADJ|OPENING', offsetVat: true, net: openDiff, vat: 0, vin: -openVatIn, doc: '', row: '', fy: '', date: openDate, ym: openDate.slice(0, 7), type: 'UE', ce: cjiOpen[0].ce, cen: cjiOpen[0].cen, amt: r2(openDiff - openVatIn), wbs: '', mat: '', matDesc: '', qty: 0, unit: '', name: '', header: '',
    poText: 'CJI3 opening balance minus the opening certificates (to confirm – VAT?)', po: '', order: '', orderName: '', offset: '', refDoc: '', bucket: 'Subcontractor', sub: '', open: true, svc: '(adjustment)', desc: 'Opening difference to CJI3 (to confirm)', tow: '', sup: '', cert: '', cdate: '', ikey: 'ADJ', source: 'Opening difference' });
  // CJI3 subcontractor lines that no certificate explains (reversals, other documents)
  const only = cjiRest.filter((l) => !(l.type === 'SC' && scDocs.has(l.refDoc) && certDoc.has(l.refDoc)));
  for (const l of only) out.push({ ...l, svc: '(CJI3 only)', desc: l.poText || l.name || l.header || l.cen, tow: '', sup: l.offset, cert: '', cdate: '', po: l.po, ikey: 'CJI3', source: 'CJI3 only', qty: 0, unit: '' });
  // a CJI3 document the certificates cover but with no certificate lines left after zero-line removal still needs its CJI3 lines kept
  const noCert = [...scDocs.keys()].filter((d) => !certDoc.has(d) && posted.every((x) => x.docNo !== d));
  void noCert;
  for (const l of out) { if (!l.po) l.po = '(no PO)'; if (l.net === undefined) { l.net = l.amt; l.vat = 0; l.vin = 0; } }
  const sumA = (ls) => r2(ls.reduce((s, l) => s + l.amt, 0));
  return { lines: out, stats: { cjiTotal: sumA(cjiSub), cjiOpen: openCji, certPosted: sumA(posted), certPostedN: posted.length, docs: certDoc.size, cjiDocs: scDocs.size, openRep, openN: opening.length, openDiff, docAdj: r2(docAdj), docAdjN, roundN, roundAmt: r2(roundAmt),
    cjiOnly: sumA(only), cjiOnlyN: only.length, unposted: sumA(unposted), unpostedN: unposted.length, notApproved: sumA(notApproved), notApprovedN: notApproved.length,
    vatPosted: r2(posted.reduce((s, l) => s + l.vat, 0) + opening.reduce((s, l) => s + l.vat, 0)), vatOnPosted: r2(posted.reduce((s, l) => s + l.vat, 0)), vatOnOpening: r2(opening.reduce((s, l) => s + l.vat, 0)), vatCounted: r2(out.reduce((t, x) => t + x.vin, 0)), vmode, vfrom, dup: { rows: prog.dupRows, amt: prog.dupAmt }, zero: prog.allLines - prog.lines.length,
    unpostedByPo: (() => { const m = new Map(); for (const l of unposted) m.set(l.po, r2((m.get(l.po) || 0) + l.amt)); return m; })(),
    certByPo: (() => { const m = new Map(); for (const l of [...posted, ...opening]) { const x = m.get(l.po) || { n: new Set(), first: '', last: '', contract: '' }; x.n.add(l.serial); if (l.date && (!x.first || l.date < x.first)) x.first = l.date; if (l.date && l.date > x.last) x.last = l.date; x.contract = l.ctype; m.set(l.po, x); } return m; })() } };
}
module.exports = { readProg, readServ, buildSubcontractor, normText };
