// Service worker: app shell and data are precached so calculators and texts
// work offline. Network-first keeps content fresh when online.
// Bump CACHE_VERSION whenever PRECACHE changes.
const CACHE_VERSION = 'da-v0.1.0';

const PRECACHE = [
  './',
  'index.html',
  'manifest.webmanifest',
  'config/app.json',
  'css/tokens.css',
  'css/base.css',
  'js/theme-init.js',
  'js/app.js',
  'js/core/i18n.js',
  'js/core/config.js',
  'js/core/storage.js',
  'data/navigation.json',
  'data/i18n/uz.json',
  'data/i18n/ru.json',
  'data/i18n/en.json',
  'assets/icons/sprite.svg',
  'assets/icons/app-icon.svg',
  'assets/icons/app-icon-maskable.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  // Only same-origin GETs; API calls (server/ proxy) are never cached.
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) {
    return;
  }
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request, { ignoreSearch: true })
        .then((cached) => cached || (request.mode === 'navigate' ? caches.match('index.html') : Response.error()))),
  );
});
