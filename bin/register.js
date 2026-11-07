#!/usr/bin/env node
'use strict';
const path = require('path');
const { build } = require('../src/build');
const a = process.argv.slice(2), o = { out: 'out/Cost_Register.xlsx', log: console.log };
for (let i = 0; i < a.length; i += 2) { const k = a[i].replace(/^--/, ''); o[k] = k in o && ['cji3', 'mb52', 'me2n', 'zscprg01', 'zscsrv1', 'zintc1'].includes(k) ? [].concat(o[k], a[i + 1]) : a[i + 1]; }   // --cji3 a.xlsx --cji3 b.xlsx
if (!o.cji3) { console.error('usage: register --cji3 <CJI3.xlsx> [--mb52 f] [--zscprg01 f] [--zscsrv1 f] [--zintc1 f] [--vat exclude|include|before] [--vatfrom yyyy-mm-dd] [--me2n f] [--prev lastReport.xlsx] [--project SUTH] [--out out/Cost_Register.xlsx]'); process.exit(1); }
require('fs').mkdirSync(path.dirname(o.out), { recursive: true });
build(o).then((r) => { const td = r.infos.flatMap((i) => i.b.items.flatMap((it) => it.lines)).filter((l) => l.inc === 'Yes' && l.per !== 'Pending').reduce((s, l) => s + l.amt, 0); console.log('Cost counted', Math.round(td * 100) / 100, '| CJI3 cost', r.stats.cost); }).catch((e) => { console.error(e); process.exit(1); });
