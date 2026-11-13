'use strict';
// the code and include every line ends up with: its item's, unless it was typed over last month
function applyCodes(bucket, over) {
  const m = over && over.get(bucket.def.id);
  for (const it of bucket.items)
    for (const l of it.lines) {
      l.pkg = it.pkg;
      l.mnl = it.mnl;
      l.cec = it.ce;
      l.inc = it.inc === 'No' ? 'No' : 'Yes';
      l.typed = {};
      const o = m && m.get(l.id);
      if (!o) continue;
      if (o.pkg !== undefined && o.pkg !== it.pkg) {
        l.pkg = o.pkg;
        l.typed.pkg = 1;
      }
      if (o.mnl !== undefined && o.mnl !== it.mnl) {
        l.mnl = o.mnl;
        l.typed.mnl = 1;
      }
      if (o.ce !== undefined && o.ce !== it.ce) {
        l.cec = o.ce;
        l.typed.cec = 1;
      }
      if (o.inc !== undefined && o.inc !== l.inc) {
        l.inc = o.inc === 'No' ? 'No' : 'Yes';
        l.typed.inc = 1;
      }
      l.s = 0;
    }
  for (const it of bucket.items) for (const l of it.lines) l.s = l.pkg !== it.pkg || l.mnl !== it.mnl || l.cec !== it.ce ? 1 : 0;
}

const DIVS = ['03', '04', '05', '06', '07', '08', '09', '10', '21', '22', '23', '26', '27', '31', '32', '33'];
const divOfService = (svc) => {
  const m = /^S(\d\d)/i.exec(String(svc || ''));
  return m && DIVS.includes(m[1]) ? 'DIV ' + m[1] : String(svc || '').startsWith('(') ? '' : 'INDIRECT';
};
module.exports = { applyCodes, divOfService, DIVS };
