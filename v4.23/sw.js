const C = 'cost-register-app', FILES = ['./', 'manifest.webmanifest', 'icon-192-88d1293a.png', 'icon-512-88d1293a.png'];
self.addEventListener('install', (e) => { self.skipWaiting(); e.waitUntil(caches.open(C).then((c) => c.match('./').then((m) => (m ? null : c.addAll(FILES))))); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== C).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => { const u = new URL(e.request.url); if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  if (u.pathname.slice(new URL('./', location).pathname.length).includes('/')) return; // a fixed release in a sub-folder (v4.23/ …) is not this app's
  if (/version\.json$/.test(u.pathname) || e.request.cache === 'reload' || e.request.cache === 'no-store') return; // Update and the version check: always the web address
  const page = e.request.mode === 'navigate';
  e.respondWith(caches.open(C).then((c) => c.match(page ? './' : e.request, { ignoreSearch: true }).then((m) => m || fetch(e.request).then((r) => { if (r.ok) c.put(page ? './' : e.request, r.clone()); return r; }))));
});
