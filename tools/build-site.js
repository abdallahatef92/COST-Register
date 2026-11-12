#!/usr/bin/env node
'use strict';
// Builds the Tool as an installable browser app (own window and icon in Edge / Chrome): out/site/ = the same Tool page + a manifest, an icon and an offline cache.
// The page is the empty Tool (no data inside). Publish the folder at a web address (GitHub Pages: branch gh-pages); the SAP files a user drops never leave their PC.
// usage: node tools/build-site.js [out dir]
const fs = require('fs'), path = require('path'), { page } = require('./build-app.js');
const ROOT = path.join(__dirname, '..'), VER = 'v' + fs.readFileSync(path.join(ROOT, 'VERSION'), 'utf8').trim().padStart(2, '0'), out = process.argv[2] || path.join(ROOT, 'out', 'site'), PWA = path.join(ROOT, 'app', 'pwa');
// the icon files carry a short fingerprint of their content: a new icon = a new file name, so an installed app sees the change
const IH = require('crypto').createHash('sha1').update(fs.readFileSync(path.join(PWA, 'icon-512.png'))).digest('hex').slice(0, 8), I192 = `icon-192-${IH}.png`, I512 = `icon-512-${IH}.png`;
let html = page();
const head = '<meta charset="utf-8">', headAdd = head + `\n<link rel="manifest" href="manifest.webmanifest">\n<meta name="theme-color" content="#14254A">\n<link rel="icon" href="${I192}">\n<link rel="apple-touch-icon" href="${I192}">`;
if (!html.includes(head)) throw new Error('build-site: <meta charset> not found in the page');
html = html.replace(head, headAdd);
// the offline cache only works from a web address; the same page opened as a file skips it
const reg = `<script>if (location.protocol.indexOf('http') === 0 && 'serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(function () { /* the Tool works without it */ });</script>\n`;
const i = html.lastIndexOf('</body>'); if (i < 0) throw new Error('build-site: </body> not found'); html = html.slice(0, i) + reg + html.slice(i);
const manifest = { name: 'Cost Register', short_name: 'Cost Register', description: 'Project cost register from SAP CJI3 – coding, checks, reports. Your files stay on your PC.', start_url: './', scope: './', display: 'standalone', background_color: '#14254A', theme_color: '#14254A',
  id: '/COST-Register/', icons:   // './' resolves against the github.io origin and clashed with other apps there
  [{ src: I192, sizes: '192x192', type: 'image/png', purpose: 'any' }, { src: I512, sizes: '512x512', type: 'image/png', purpose: 'any' }] };
// newest page first when online (so a new version shows by itself), the saved copy when offline
const sw = `const C = 'cost-register-${VER}', FILES = ['./', 'manifest.webmanifest', '${I192}', '${I512}'];
self.addEventListener('install', (e) => { self.skipWaiting(); e.waitUntil(caches.open(C).then((c) => c.addAll(FILES))); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== C).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => { if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(fetch(e.request).then((r) => { if (r.ok) { const cp = r.clone(); caches.open(C).then((c) => c.put(e.request, cp)); } return r; }).catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('./')))); });
`;
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'index.html'), html); fs.writeFileSync(path.join(out, 'manifest.webmanifest'), JSON.stringify(manifest, null, 1)); fs.writeFileSync(path.join(out, 'sw.js'), sw); fs.writeFileSync(path.join(out, '.nojekyll'), '');
[['icon-192.png', I192], ['icon-512.png', I512]].forEach(([f, t]) => fs.copyFileSync(path.join(PWA, f), path.join(out, t)));
console.log(`${out}: Cost Register ${VER} as a browser app – index.html ${(html.length / 1e6).toFixed(2)} MB, manifest, offline cache, icons`);
