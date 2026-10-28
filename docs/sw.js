/* Service worker för Veckohandla. Sparar appen på enheten så att den fungerar utan nät.
   Appen och datafilerna hämtas från nätet när det går (alltid senaste versionen),
   och från det sparade när det inte går. Anrop till ReceptAPI rörs inte. */
const VERSION = '2026-10-28u';
const CACHE = 'veckohandla-' + VERSION;
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './icon-maskable-512.png', './apple-touch-icon.png'];
const DATA = /\/(offers|nutrition)\.json$/;
const FONTS = /^https:\/\/fonts\.(googleapis|gstatic)\.com\//;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('veckohandla-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Nätet först, med en tidsgräns, annars det sparade. Svaret sparas för nästa gång.
async function networkFirst(req, cacheKey, timeoutMs) {
  const cache = await caches.open(CACHE);
  try {
    const res = await Promise.race([
      fetch(req, { cache: 'no-cache' }),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), timeoutMs))
    ]);
    if (res && res.ok) cache.put(cacheKey || req, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(cacheKey || req, { ignoreSearch: true });
    if (hit) return hit;
    throw err;
  }
}

// Typsnitt ändras aldrig: ta det sparade direkt och uppdatera i bakgrunden.
async function staleWhileRevalidate(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  const net = fetch(req).then(res => { if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone()); return res; }).catch(() => null);
  return hit || (await net) || Response.error();
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (FONTS.test(req.url)) { e.respondWith(staleWhileRevalidate(req)); return; }
  if (url.origin !== self.location.origin) return;               // ReceptAPI och annat externt: låt webbläsaren sköta det
  if (req.mode === 'navigate') { e.respondWith(networkFirst(req, './index.html', 4000)); return; }
  if (DATA.test(url.pathname)) { e.respondWith(networkFirst(req, null, 6000)); return; }
  e.respondWith(caches.match(req, { ignoreSearch: true }).then(hit => hit || networkFirst(req, null, 6000)));
});
