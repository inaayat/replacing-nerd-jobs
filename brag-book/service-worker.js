/**
 * Network-first for the app shell, cache-first for immutable assets.
 *
 * BUILD_ID is hand-edited — bump when icons or the manifest change. HTML and JS
 * are network-first so deploys take effect on the next load; cache is fallback
 * only when fetch fails. API and auth are never intercepted.
 */
const BUILD_ID = '2026-10-15a';
const CACHE = `brag-book-${BUILD_ID}`;

const PRECACHE = [
  '/brag-book/',
  '/brag-book/manifest.webmanifest',
  '/brag-book/icon.svg',
  '/brag-book/icons/icon-192.png',
  '/brag-book/icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => Promise.allSettled(PRECACHE.map((url) => cache.add(url))))
      .catch(() => undefined),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key.startsWith('brag-book-') && key !== CACHE)
          .map((key) => caches.delete(key)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

function isImmutableAsset(pathname) {
  return /\.(png|svg|webmanifest|woff2?)$/.test(pathname);
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;
  if (!url.pathname.startsWith('/brag-book/')) return;

  if (isImmutableAsset(url.pathname)) {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetchAndCache(request)),
    );
    return;
  }

  event.respondWith(
    fetchAndCache(request).catch(() => caches.match(request).then(
      (cached) => cached || caches.match('/brag-book/'),
    )),
  );
});

function fetchAndCache(request) {
  return fetch(request).then((response) => {
    if (response.ok) {
      const copy = response.clone();
      caches.open(CACHE).then((cache) => cache.put(request, copy));
    }
    return response;
  });
}
