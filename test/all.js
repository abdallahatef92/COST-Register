#!/usr/bin/env node
'use strict';
// npm test: builds the Tool once, then checks both projects (SUTH and SBAY) at the same time.
//   node test/all.js [--quick] [--only 7e,8]   (the options go on to test/run.js)
const { spawn, execFileSync } = require('child_process'),
  path = require('path');
const ROOT = path.join(__dirname, '..'),
  pass = process.argv.slice(2),
  t0 = Date.now();
// the code stays formatted (one statement per line – a comment can never hide code after it): npm run format fixes it
try {
  execFileSync(
    'npx',
    ['prettier', '--check', '--log-level', 'warn', 'app/js/*.js', 'app/engine-entry.js', 'src/*.js', 'tools/*.js', 'test/*.js'],
    { cwd: ROOT, stdio: 'inherit' }
  );
} catch (e) {
  console.error('Code not formatted – run: npm run format');
  process.exit(1);
}
execFileSync('node', ['tools/build-app.js'], { cwd: ROOT, stdio: 'inherit' });
const run = (set) =>
  new Promise((ok) => {
    let out = '';
    const c = spawn('node', [path.join(__dirname, 'run.js'), '--set', set, '--built', ...pass], { cwd: ROOT });
    c.stdout.on('data', (d) => {
      out += d;
    });
    c.stderr.on('data', (d) => {
      out += d;
    });
    c.on('close', (code) => ok({ set, code, out }));
  });
Promise.all(['suth', 'sbay'].map(run)).then((rs) => {
  rs.forEach((r) => process.stdout.write('\n' + '='.repeat(70) + '\n' + r.out));
  const sum = rs
    .map((r) => `${r.set.toUpperCase()}: ${(r.out.match(/(\d+ passed · \d+ failed)/) || [])[1] || 'did not finish'}`)
    .join('   ');
  console.log('\n' + sum + `   · ${((Date.now() - t0) / 1000).toFixed(0)} s in all${pass.length ? ' · ' + pass.join(' ') : ''}`);
  process.exit(rs.some((r) => r.code) ? 1 : 0);
});
