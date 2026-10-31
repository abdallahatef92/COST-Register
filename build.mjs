// Builds the single offline file: node build.mjs  ->  cost-register.html
// Everything (SheetJS, sql.js + its WASM, Chart.js, the worker) is embedded: no network is needed at run time.
import { readFileSync, writeFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(p, import.meta.url));
const text = (p) => read(p).toString('utf8');
const b64 = (buf) => Buffer.from(buf).toString('base64');

// the worker = libraries, then the shared code, then the worker itself
const worker = [text('vendor/xlsx.full.min.js'), text('vendor/sql-wasm.js'), text('src/headers.js'), text('src/util.js'), text('src/reports.js'), text('src/worker.js')].join('\n;\n');
const shared = [text('src/headers.js'), text('src/util.js'), text('src/reports.js')].join('\n;\n');
const chart = text('vendor/chart.umd.js');
for (const [name, code] of [['chart', chart], ['shared', shared], ['app', text('src/app.js')]]) {
  if (/<\/script/i.test(code)) throw new Error(`${name} contains "</script" and cannot be inlined`);
}

const html = text('src/template.html')
  .replace('/*__CSS__*/', () => text('src/styles.css'))
  .replace('/*__WASM__*/', () => b64(read('vendor/sql-wasm.wasm')))
  .replace('/*__WORKER__*/', () => b64(Buffer.from(worker, 'utf8')))
  .replace('/*__CHART__*/', () => chart)
  .replace('/*__SHARED__*/', () => shared)
  .replace('/*__APP__*/', () => text('src/app.js'));

writeFileSync(new URL('cost-register.html', import.meta.url), html);
console.log('cost-register.html', (html.length / 1e6).toFixed(2), 'MB');
