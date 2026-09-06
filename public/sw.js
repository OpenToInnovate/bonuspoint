/* Bonus Point service worker — offline-first, cache-first with versioned precache.
 * `__BP_CACHE__` and `self.__BP_ASSETS` are injected at build time by the
 * sw-precache plugin in vite.config.mjs (every hashed asset is precached and
 * the cache name changes whenever the build output changes). */
const CACHE = '__BP_CACHE__';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png'];
const PRECACHE = SHELL.concat(self.__BP_ASSETS || []);

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  // Navigation requests: try network, fall back to cached shell (works fully offline).
  if (e.request.mode === 'navigate') {
    e.respondWith(fetch(e.request).catch(() => caches.match('./index.html')));
    return;
  }
  // Everything else (hashed assets, deps): cache-first, then cache the response.
  e.respondWith(
    caches.match(e.request).then(
      (hit) =>
        hit ||
        fetch(e.request).then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
          return res;
        })
    )
  );
});
