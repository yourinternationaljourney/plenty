/* Plenty service worker. Scope is the directory this file is served from ("./"), which is the GitHub Pages subpath.
   Strategy: precache the app shell; serve navigations from cache first (offline plan and grocery list), then update in the background.
   The version string and precache list are stamped in by build.js. A new version installs alongside the old one and activates when the page
   sends SKIP_WAITING (the app shows "Reload to update"), so users are never stuck on an old version. */
const VERSION = '__VERSION__';
const CACHE = 'plenty-' + VERSION;
const PRECACHE = __PRECACHE__;
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE.map(p => new Request(p, { cache: 'reload' })))).catch(() => {})); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('plenty-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('message', e => { if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting(); });
self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) { // fonts and other cross-origin: network, fall back to cache
    e.respondWith(fetch(req).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {}); return r; }).catch(() => caches.match(req))); return; }
  if (req.mode === 'navigate') { // the app shell: cache first so it opens offline, refresh in the background
    e.respondWith(caches.match('./index.html').then(hit => { const net = fetch(req).then(r => { if (r.ok) caches.open(CACHE).then(c => c.put('./index.html', r.clone())).catch(() => {}); return r; }).catch(() => hit); return hit || net; })); return; }
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(r => { if (r.ok) caches.open(CACHE).then(c => c.put(req, r.clone())).catch(() => {}); return r; })));
});
