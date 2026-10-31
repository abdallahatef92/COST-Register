/* Bucket rules: which sheet a CJI3 line belongs to, and its "nature" (what it really is, used for the MNL code).
 * First matching rule wins. These are the defaults; the same table is written to the Rules sheet of the workbook. */
'use strict';

// sheet order = the order of the workbook. code = prefix of the named ranges (SUB_Amt, SUB_PKG ...)
const SHEETS = [
  { bucket: 'Subcontractor', sheet: 'Subcontractor', code: 'SUB', tab: 'BF8F00', cost: true },
  { bucket: 'Material', sheet: 'Material', code: 'MAT', tab: 'BF8F00', cost: true },
  { bucket: 'Labor', sheet: 'Labor', code: 'LAB', tab: 'BF8F00', cost: true },
  { bucket: 'Equipment / fuel', sheet: 'Equipment-fuel', code: 'EQF', tab: 'BF8F00', cost: true },
  { bucket: 'Fleet / transportation', sheet: 'Fleet-transport', code: 'FLT', tab: 'BF8F00', cost: true },
  { bucket: 'House rent', sheet: 'House rent', code: 'HSE', tab: 'BF8F00', cost: true },
  { bucket: 'Asset depreciation', sheet: 'Depreciation', code: 'DEP', tab: 'BF8F00', cost: true },
  { bucket: 'G&A', sheet: 'G&A', code: 'GNA', tab: 'BF8F00', cost: true },
  { bucket: 'Unclassified', sheet: 'Unclassified', code: 'UNC', tab: 'C55A11', cost: true },
  { bucket: 'Opening balance', sheet: 'Opening balance', code: 'OPN', tab: '7F7F7F', cost: true },
  { bucket: 'Revenue', sheet: 'Revenue', code: 'REV', tab: '548235', cost: false },
];

const OPENING_TYPES = ['UE', 'ZB', 'MD', 'HT'];

// [bucket, { doc_type, ce_name, ce_name_prefix, ce_prefix }]
const RULES = [];
const add = (bucket, o) => RULES.push([bucket, Object.assign({ doc_type: null, ce_name: null, ce_name_prefix: null, ce_prefix: null }, o)]);
add('Revenue', { ce_prefix: '4' });
for (const t of OPENING_TYPES) add('Opening balance', { doc_type: t });
add('Subcontractor', { doc_type: 'SC' });
add('Material', { doc_type: 'WA' });
add('Asset depreciation', { doc_type: 'AF' });
add('Equipment / fuel', { doc_type: 'KR', ce_name: 'Fuel' });
add('Equipment / fuel', { doc_type: 'KR', ce_name: 'Diesel' });
add('Asset depreciation', { ce_name_prefix: 'DC-' });
for (const n of ['Main Material', 'Consumables Material', 'Spare Parts', 'Material Damages', 'Fuel', 'Diesel']) add('Material', { ce_name: n });
add('Labor', { ce_name: 'Casual Labour' });
for (const n of ['Subcontractor Cost', 'Equip Rent - Outside', 'Other Deduction']) add('Subcontractor', { ce_name: n });
for (const n of ['Inhouse Charge EQ', 'Inhouse Charge Fuel']) add('Equipment / fuel', { ce_name: n });
add('Fleet / transportation', { ce_name: 'Inhouse Charge Fleet' });
for (const n of ['Housing Rent', 'Housing expenses']) add('House rent', { ce_name: n });
for (const n of ['LG Comm charges', 'Salaries', 'Miscel. allowances', 'Buffet & hosp allow', 'Other Equip Exp.', 'Utilities Wat & Elec', 'Transp & Car Allow', 'Meals Night Staff']) add('G&A', { ce_name: n });

const low = (s) => String(s || '').toLowerCase();
function matches(r, l) {
  if (r.doc_type && r.doc_type !== (l.dt || '(blank)')) return false;
  if (r.ce_name && low(r.ce_name) !== low(l.ceName)) return false;
  if (r.ce_name_prefix && !low(l.ceName).startsWith(low(r.ce_name_prefix))) return false;
  if (r.ce_prefix && !String(l.ce || '').startsWith(r.ce_prefix)) return false;
  return true;
}
// -> { bucket, nature }. nature ignores the opening-balance rules: an opening "Salaries" line is still G&A in nature.
function classify(l) {
  let bucket = null, nature = null;
  for (const [b, r] of RULES) {
    if (!matches(r, l)) continue;
    if (!bucket) bucket = b;
    if (b !== 'Opening balance') { nature = b; break; }
  }
  return { bucket: bucket || 'Unclassified', nature: nature || 'Unclassified' };
}

// the first-pass coding (replace with the project's own code lists on the Rules sheet / by typing on the lines)
const MNLS = [['MAT', 'Material'], ['SUB', 'Subcontract'], ['EQU', 'Equipment'], ['LAB', 'Labour'], ['OTHER', 'Other resources']];
const MNL_OF = { 'Material': 'MAT', 'Subcontractor': 'SUB', 'Labor': 'LAB', 'Equipment / fuel': 'EQU', 'Fleet / transportation': 'EQU' };
const mnlOf = (nature) => MNL_OF[nature] || 'OTHER';
// work-package group of a WBS element: I-SUTH.01-03-3-08 -> I-SUTH.01-03 (a stand-in PKG until the project's own package list is given)
function wbsGroup(w) { w = String(w || ''); if (!w) return '(no WBS)'; const m = /^([^.]+\.[^-]+-[^-]+)/.exec(w); return m ? m[1] : w; }

module.exports = { SHEETS, RULES, OPENING_TYPES, classify, MNLS, mnlOf, wbsGroup };
