const CACHE_NAME = 'fleettracker-pwa-v1';
const ASSETS = [
  '/',
  '/static/tracking/css/app.css',
  '/static/tracking/js/app.js',
  '/static/tracking/manifest.json',
  '/static/tracking/icons/icon-192.png',
  '/static/tracking/icons/icon-512.png'
];

function isStaticAsset(request) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/static/')) return false;
  return /\.(css|js|png|jpg|jpeg|svg|webp|json)$/i.test(url.pathname);
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  // Always go to network for API calls and admin pages to avoid stale data
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/admin')) {
    event.respondWith(fetch(event.request));
    return;
  }
  // For navigations (HTML), use network-first to keep pages fresh
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => caches.match('/'))
    );
    return;
  }
  // Cache-first only for static assets
  if (isStaticAsset(event.request)) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(resp => {
          const clone = resp.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return resp;
        });
      })
    );
  }
});
