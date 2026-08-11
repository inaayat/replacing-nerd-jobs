const CACHE = 'amc-a-lister-v6';

const PRECACHE = [
  '/amc-a-lister/',
  '/amc-a-lister/index.html',
  '/amc-a-lister/manifest.webmanifest',
  '/amc-a-lister/icon.svg',
  '/amc-a-lister/icons/icon-192.png',
  '/amc-a-lister/icons/icon-512.png',
  '/amc-a-lister/engine/app.css',
  '/amc-a-lister/engine/nav.js',
  '/amc-a-lister/engine/auth.js',
  '/amc-a-lister/engine/api.js',
  '/amc-a-lister/engine/format.js',
  '/amc-a-lister/engine/billing.js',
  '/amc-a-lister/what-to-watch.html',
  '/amc-a-lister/tv.html',
  '/amc-a-lister/insights.html',
  '/amc-a-lister/leaderboard.html',
  '/amc-a-lister/settings.html',
  '/amc-a-lister/add.html',
  '/amc-a-lister/bulk-ratings.html',
  '/amc-a-lister/engine/bulk-ratings.js',
  '/amc-a-lister/member.html',
  '/amc-a-lister/sign-in.html',
  '/amc-a-lister/engine/sign-in.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;
  if (!url.pathname.startsWith('/amc-a-lister/')) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);

      return cached || network;
    }),
  );
});
