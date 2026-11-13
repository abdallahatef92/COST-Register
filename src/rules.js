'use strict';
// The classification rules: every CJI3 line goes to exactly one bucket. First match wins. Edit here, not in the workbook.
const { r2 } = require('./util');
const OPENING_TYPES = new Set(['UE', 'ZB', 'MD', 'HT']); // opening-balance document types: own Opening column

const GA = {
  'Staff payroll': ['Salaries', 'Wages', 'Bonus'],
  'Social insurance and levy': ['Contra insurance exp', 'Manpower cost', 'General Expenses'],
  'Finance charges': ['LG Comm charges', 'Debit interes', 'Debit interest', 'Bank Charges', 'Bank Charges&comm.'],
  'CAR insurance': ['Insurance Charges'],
  'Taxes and government fees': ['Stamp Taxes', 'Governmental Charges'],
  'Site running costs': [
    'Meals Night Staff',
    'Miscel. allowances',
    'Buffet & hosp allow',
    'Buffet & Cleaning',
    'Consultant fees',
    'Consultant Fees',
    'Tech Consul & Insp',
    'Utilities Wat & Elec',
    'Location service',
    'Location treatment',
    'Donations',
    'Stationary &supplies',
    'Others',
    'Other Expenses',
    'Miscel consultancy',
    'Miscel. consultancy',
    'Cash consultancy',
    'Security expenses',
    'Utilities',
    'Advertising',
  ],
};

function classifyOne(l) {
  const { cen, type, wbs } = l;
  if (l.ce.startsWith('4')) return ['Revenue', ''];
  if (/^Client-?\s*Deduction/i.test(cen)) return ['Revenue', 'Client deductions']; // decision: shown with revenue
  if (type === 'SC') return cen === 'Other Deduction' || cen === 'Main Material' ? ['Subcontractor deductions', ''] : ['Subcontractor', ''];
  if (cen === 'Other Deduction') return ['Subcontractor deductions', ''];
  if (type === 'WA') return ['Material', ''];
  if (type === 'AF' || cen.startsWith('DC-')) return ['Asset depreciation', ''];
  if (cen === 'Inhouse Charge EQ' || cen === 'Inhouse Charge Fuel') return ['Equipment / fuel', ''];
  if (cen === 'Inhouse Charge Fleet') return ['Fleet / transportation', ''];
  if (['Housing Rent', 'Housing expenses', 'Housing Commission', 'HO-Housing Rent'].includes(cen)) return ['House rent', ''];
  if (cen === 'Casual Labour') return ['Labor', ''];
  if (cen === 'Subcontractor Cost' || cen === 'Equip Rent - Outside') return ['Subcontractor', ''];
  if (l.mat && type !== '(blank)') return ['Material', ''];
  if (
    ['Fuel', 'Diesel', 'Oil and Lubricant', 'Other Equip Exp.', 'Maintenace & repairs', 'Insurance For Equip', 'Spare Parts'].includes(cen)
  )
    return cen === 'Spare Parts' ? ['Other direct cost', ''] : ['Equipment / fuel', ''];
  if (cen === 'Transp & Car Allow' || cen === 'Transp.of Material') return ['Fleet / transportation', ''];
  if (['Main Material', 'Consumables Material', 'Material Damages'].includes(cen)) return ['Other direct cost', ''];
  if (cen === 'Outside Hire manp.' || (/^[A-Z]-[A-Z0-9]+\.IN-02-1$/.test(wbs) && ['Salaries', 'Wages', 'Bonus'].includes(cen)))
    return ['G&A', 'Other labour / payroll'];
  for (const [sub, list] of Object.entries(GA))
    if (list.includes(cen) || (sub === 'Finance charges' && cen.startsWith('Debit inter'))) return ['G&A', sub];
  return ['Unclassified', ''];
}

// YOUR rules (edited in the app, carried in the codes file / Excel export): checked BEFORE the built-in rules.
// A rule: { ce, cen, type, wbs, bucket, sub } – every field you fill must match (cost element exact, name case-insensitive,
// document type exact, WBS = starts with); empty fields are ignored. First matching rule wins.
const BUCKET_IDS = [
  'Material',
  'Subcontractor',
  'Subcontractor deductions',
  'Other direct cost',
  'Labor',
  'Equipment / fuel',
  'Fleet / transportation',
  'House rent',
  'Asset depreciation',
  'G&A',
  'Revenue',
  'Unclassified',
];
const norm = (x) =>
  String(x || '')
    .trim()
    .toLowerCase();
const userMatch = (r, l) =>
  (r.ce || r.cen || r.type || r.wbs) &&
  (!r.ce || norm(l.ce) === norm(r.ce)) &&
  (!r.cen || norm(l.cen) === norm(r.cen)) &&
  (!r.type || norm(l.type) === norm(r.type)) &&
  (!r.wbs || norm(l.wbs).startsWith(norm(r.wbs)));
function classify(lines, userRules = []) {
  const ur = (userRules || []).filter((r) => r && BUCKET_IDS.includes(r.bucket));
  for (const l of lines) {
    const u = ur.find((r) => userMatch(r, l));
    const [b, s] = u ? [u.bucket, u.sub || ''] : classifyOne(l);
    l.bucket = b;
    l.sub = s;
    l.rule = u ? 'yours' : '';
    l.open = OPENING_TYPES.has(l.type);
  }
  // ZY (accrual reversal) lines take the bucket of the equal-and-opposite line in the same cost element and month
  const pool = new Map();
  lines.forEach((l, i) => {
    if (l.type !== 'ZY') {
      const k = l.ce + '|' + l.ym;
      (pool.get(k) || pool.set(k, []).get(k)).push(i);
    }
  });
  const taken = new Set();
  let paired = 0;
  for (const l of lines) {
    if (l.type !== 'ZY') continue;
    const c = pool.get(l.ce + '|' + l.ym) || [];
    const j = c.find((i) => !taken.has(i) && Math.abs(lines[i].amt + l.amt) < 0.005);
    if (j !== undefined) {
      taken.add(j);
      l.bucket = lines[j].bucket;
      l.sub = lines[j].sub;
      paired++;
    }
  }
  return paired;
}

const RULES = [
  ['1', 'Cost element starts with 4', 'Revenue', 'Revenue is never netted against cost.'],
  ['2', 'Cost element "Client-Deductions"', 'Revenue (client deductions)', 'Decision: shown with revenue, reported on its own line.'],
  ['3', 'Document type SC (subcontract), cost element Other Deduction or Main Material', 'Subcontractor deductions', 'Own sheet.'],
  ['4', 'Document type SC, any other cost element', 'Subcontractor', ''],
  ['5', 'Document type WA (goods issue)', 'Material', 'The line carries a SAP material number and a quantity.'],
  ['6', 'Document type AF or cost element DC-…', 'Asset depreciation', 'Offline sheet may be added later.'],
  ['7', 'Cost element Inhouse Charge EQ / Fuel', 'Equipment / fuel', 'ZINTC1 orders.'],
  ['8', 'Cost element Inhouse Charge Fleet', 'Fleet / transportation', 'ZINTC1 orders.'],
  ['9', 'Housing Rent / Housing expenses / Housing Commission', 'House rent', 'One item per apartment order.'],
  ['10', 'Casual Labour', 'Labor', ''],
  ['11', 'Any other line that has a material number', 'Material', ''],
  [
    '12',
    'Fuel, diesel, oil, other equipment expenses, maintenance, equipment insurance',
    'Equipment / fuel',
    'Not posted through a goods issue.',
  ],
  ['13', 'Transport', 'Fleet / transportation', ''],
  ['14', 'Main Material, Consumables, Material Damages, Spare Parts without a material number', 'Other direct cost', ''],
  ['15', 'Outside Hire manpower, salary-type lines on the project WBS …IN-02-1 (e.g. I-SUTH.IN-02-1)', 'G&A · Other labour / payroll', ''],
  [
    '16',
    'Remaining cost elements by name',
    'G&A · Staff payroll / Social insurance / Finance charges / CAR insurance / Taxes / Site running',
    'See the list on the Rules sheet.',
  ],
  [
    '17',
    'Document type ZY (accrual reversal)',
    'Same bucket as the equal-and-opposite line (same cost element, same month)',
    'Pairs net to zero.',
  ],
  ['18', 'Anything else', 'Unclassified', 'Shows on Checks – add a rule.'],
];
module.exports = { classify, RULES, GA, OPENING_TYPES, BUCKET_IDS };
