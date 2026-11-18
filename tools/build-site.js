#!/usr/bin/env node
'use strict';
// Builds the Tool as an installable browser app (own window and icon in Edge / Chrome): out/site/ = the same Tool page + a manifest, an icon and an offline cache.
// The page is the empty Tool (no data inside). Publish the folder at a web address (GitHub Pages: branch gh-pages); the SAP files a user drops never leave their PC.
// usage: node tools/build-site.js [out dir]
const fs = require('fs'),
  path = require('path'),
  { page } = require('./build-app.js');
const ROOT = path.join(__dirname, '..'),
  VER = 'v' + fs.readFileSync(path.join(ROOT, 'VERSION'), 'utf8').trim().padStart(2, '0'),
  out = process.argv[2] || path.join(ROOT, 'out', 'site'),
  PWA = path.join(ROOT, 'app', 'pwa');
// the icon files carry a short fingerprint of their content: a new icon = a new file name, so an installed app sees the change
const IH = require('crypto')
    .createHash('sha1')
    .update(fs.readFileSync(path.join(PWA, 'icon-512.png')))
    .digest('hex')
    .slice(0, 8),
  I192 = `icon-192-${IH}.png`,
  I512 = `icon-512-${IH}.png`;
let html = page();
const head = '<meta charset="utf-8">',
  headAdd =
    head +
    `\n<link rel="manifest" href="manifest.webmanifest">\n<meta name="theme-color" content="#14254A">\n<link rel="icon" href="${I192}">\n<link rel="apple-touch-icon" href="${I192}">`;
if (!html.includes(head)) throw new Error('build-site: <meta charset> not found in the page');
html = html.replace(head, headAdd);
// the offline cache only works from a web address; the same page opened as a file skips it
const reg = `<script>if (location.protocol.indexOf('http') === 0 && 'serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(function () { /* the Tool works without it */ });</script>\n`;
const i = html.lastIndexOf('</body>');
if (i < 0) throw new Error('build-site: </body> not found');
html = html.slice(0, i) + reg + html.slice(i);
const manifest = {
  name: 'Cost Register',
  short_name: 'Cost Register',
  description: 'Project cost register from SAP CJI3 – coding, checks, reports. Your files stay on your PC.',
  start_url: './',
  scope: './',
  display: 'standalone',
  background_color: '#14254A',
  theme_color: '#14254A',
  id: '/COST-Register/',
  // './' resolves against the github.io origin and clashed with other apps there
  icons: [
    { src: I192, sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: I512, sizes: '512x512', type: 'image/png', purpose: 'any' },
  ],
};
// the kept page first: the app stays on its version until the user presses Update (24-app-update.js puts the new page in the cache).
// version.json always from the web address. The worker itself has no version in it, so a release does not replace it.
const sw = `const C = 'cost-register-app', FILES = ['./', 'manifest.webmanifest', '${I192}', '${I512}'];
self.addEventListener('install', (e) => { self.skipWaiting(); e.waitUntil(caches.open(C).then((c) => c.match('./').then((m) => (m ? null : c.addAll(FILES))))); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== C).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => { const u = new URL(e.request.url); if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  if (u.pathname.slice(new URL('./', location).pathname.length).includes('/')) return; // a fixed release in a sub-folder (v4.23/ …) is not this app's
  if (/version\\.json$/.test(u.pathname) || e.request.cache === 'reload' || e.request.cache === 'no-store') return; // Update and the version check: always the web address
  const page = e.request.mode === 'navigate';
  e.respondWith(caches.open(C).then((c) => c.match(page ? './' : e.request, { ignoreSearch: true }).then((m) => m || fetch(e.request).then((r) => { if (r.ok) c.put(page ? './' : e.request, r.clone()); return r; }))));
});
`;
const notes = JSON.parse(fs.readFileSync(path.join(PWA, 'whatsnew.json'), 'utf8'));
const V = VER.replace(/^v/, '');
if (!notes.length || notes[0].v !== V) throw new Error('build-site: app/pwa/whatsnew.json – add the notes of v' + V + ' on top');
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'index.html'), html);
fs.writeFileSync(path.join(out, 'manifest.webmanifest'), JSON.stringify(manifest, null, 1));
fs.writeFileSync(path.join(out, 'sw.js'), sw);
fs.writeFileSync(path.join(out, 'version.json'), JSON.stringify({ v: V, notes: notes.slice(0, 12) }));
fs.writeFileSync(path.join(out, '.nojekyll'), '');
[
  ['icon-192.png', I192],
  ['icon-512.png', I512],
].forEach(([f, t]) => fs.copyFileSync(path.join(PWA, f), path.join(out, t)));
console.log(
  `${out}: Cost Register ${VER} as a browser app – index.html ${(html.length / 1e6).toFixed(2)} MB, manifest, offline cache, icons`
);
