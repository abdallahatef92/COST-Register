#!/usr/bin/env node
'use strict';
// Prototype: the whole Cost Register as ONE offline HTML app, with the data of a register build.
// usage: node tools/proto-app.js --cji3 f --mb52 f --zscprg01 f --zscsrv1 f [--prev lastReport.xlsx] [--out out/Cost_Register_App.html]
const fs = require('fs'), path = require('path');
const { prepare } = require('../src/prepare');
const { toAppData } = require('../src/appdata');
const a = process.argv.slice(2), o = { project: 'SUTH', out: 'out/Cost_Register_App.html', log: console.log };
for (let i = 0; i < a.length; i += 2) o[a[i].replace(/^--/, '')] = a[i + 1];
const P = prepare(o), DATA = toAppData(P, o);

const html = require('./build-app').page('const DATA0=' + JSON.stringify(DATA) + ';');
fs.mkdirSync(path.dirname(o.out), { recursive: true }); fs.writeFileSync(o.out, html);
console.log(`${o.out}: ${DATA.L.b.length} lines, ${DATA.BK.reduce((x, b) => x + b.items.length, 0)} items, ${DATA.S.length} strings, ${(html.length / 1e6).toFixed(2)} MB`);
