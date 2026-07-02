// Velora service worker — SAFE offline support.
// Key rule: NEVER cache-first the HTML document or hashed build assets,
// otherwise a new deploy serves a stale index.html pointing at deleted
// chunk hashes and the app fails to load. We use network-first for
// navigations and let the browser handle versioned assets normally.
const CACHE = 'velora-v3';

self.addEventListener('install', (e) => {
  // Activate immediately, don't pre-cache the shell (avoids stale HTML).
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.map((k) => caches.delete(k)))) // wipe old caches
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (e) => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Network-first for the customer's bookings (offline shows last-known).
  if (url.pathname.startsWith('/api/my-bookings')) {
    e.respondWith(
      fetch(request)
        .then((res) => { const c = res.clone(); caches.open(CACHE).then((k) => k.put(request, c)); return res; })
        .catch(() => caches.match(request))
    );
    return;
  }

  // All other API calls: always network, never cache.
  if (url.pathname.startsWith('/api/')) return;

  // HTML / navigations: NETWORK-FIRST so new deploys always load.
  if (request.mode === 'navigate' || request.destination === 'document') {
    e.respondWith(
      fetch(request).catch(() => caches.match('/offline-shell') || caches.match(request))
    );
    return;
  }

  // Images only: cache-first is safe (content-addressed by path, not critical).
  if (request.destination === 'image') {
    e.respondWith(
      caches.match(request).then((cached) => cached || fetch(request).then((res) => {
        if (res.ok) { const c = res.clone(); caches.open(CACHE).then((k) => k.put(request, c)); }
        return res;
      }).catch(() => cached))
    );
    return;
  }

  // Scripts/styles (hashed): plain network — let the browser cache normally.
});
