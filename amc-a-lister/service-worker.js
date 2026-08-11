/**
 * Network-first for the app shell, cache-first for immutable assets.
 *
 * The previous version was cache-first for everything and purged only when the
 * CACHE string was hand-edited. Two things went wrong with that: a deploy that
 * forgot to bump the version served stale JS indefinitely, and the PRECACHE list
 * omitted most engine modules, so those were runtime-cached on their own
 * schedule and could mix old and new module versions against each other.
 *
 * BUILD_ID is rewritten on deploy (or falls back to the date below), so a new
 * deploy always lands in a fresh cache.
 */
const BUILD_ID = '2026-08-11a';
const CACHE = `amc-a-lister-${BUILD_ID}`;

// Only genuinely static, rarely-changing assets. HTML and JS are fetched fresh
// and merely fall back to the cache when offline.
const PRECACHE = [
  '/amc-a-lister/',
  '/amc-a-lister/manifest.webmanifest',
  '/amc-a-lister/icon.svg',
  '/amc-a-lister/icons/icon-192.png',
  '/amc-a-lister/icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      // A single missing entry must not fail the whole install.
      .then((cache) => Promise.allSettled(PRECACHE.map((url) => cache.add(url))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key.startsWith('amc-a-lister-') && key !== CACHE)
          .map((key) => caches.delete(key)),
      ))
      .then(() => self.clients.claim()),
  );
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
  if (!url.pathname.startsWith('/amc-a-lister/')) return;

  if (isImmutableAsset(url.pathname)) {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetchAndCache(request)),
    );
    return;
  }

  // HTML and JS: always try the network so a deploy takes effect on the next
  // load, and fall back to the cache only when genuinely offline.
  event.respondWith(
    fetchAndCache(request).catch(() => caches.match(request).then(
      (cached) => cached || caches.match('/amc-a-lister/'),
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
