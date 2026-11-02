#!/usr/bin/env node
'use strict';
const path = require('path');
const { build } = require('../src/build');
const a = process.argv.slice(2), o = { project: 'SUTH', out: 'out/Cost_Register.xlsx', log: console.log };
for (let i = 0; i < a.length; i += 2) { const k = a[i].replace(/^--/, ''); o[k] = a[i + 1]; }
if (!o.cji3) { console.error('usage: register --cji3 <CJI3.xlsx> [--mb52 f] [--zscprg01 f] [--zscsrv1 f] [--me2n f] [--prev lastReport.xlsx] [--project SUTH] [--out out/Cost_Register.xlsx]'); process.exit(1); }
require('fs').mkdirSync(path.dirname(o.out), { recursive: true });
build(o).then((r) => { console.log('Cost counted', r.ex.total, '| CJI3 cost', r.stats.cost); }).catch((e) => { console.error(e); process.exit(1); });
