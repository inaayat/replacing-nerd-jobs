const CACHE_PREFIX = 'sticky-notes-shell-';
const CACHE_NAME = `${CACHE_PREFIX}v1`;
const ROOT = '/sticky-notes/';
const APP_SHELL = [
  ROOT,
  `${ROOT}app.css`,
  `${ROOT}app.js`,
  `${ROOT}board.js`,
  `${ROOT}body.js`,
  `${ROOT}extension-bridge.js`,
  `${ROOT}memory.js`,
  `${ROOT}notes.js`,
  `${ROOT}sync.js`,
  `${ROOT}table.js`,
  `${ROOT}wiki.js`,
  `${ROOT}engine/auth.js`,
  `${ROOT}manifest.webmanifest`,
  `${ROOT}icon.svg`,
  `${ROOT}icons/icon-192.png`,
  `${ROOT}icons/icon-512.png`,
  '/engine/neon-browser-auth.js',
  '/ugly-dog-images/dog-3.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
          .map((key) => caches.delete(key)),
      ))
      .then(() => self.clients.claim()),
  );
});

async function navigationResponse(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(ROOT, response.clone());
    }
    return response;
  } catch {
    return (await caches.match(ROOT)) || Response.error();
  }
}

async function assetResponse(request) {
  const cached = await caches.match(request);
  const network = fetch(request)
    .then(async (response) => {
      if (response.ok && response.type === 'basic') {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => null);
  return cached || network || Response.error();
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Auth and sync must always reflect the network. Sticky note state already
  // has its own local-first mirror and operation queue.
  if (url.pathname.startsWith('/api/')) return;
  if (request.mode === 'navigate') {
    event.respondWith(navigationResponse(request));
    return;
  }
  event.respondWith(assetResponse(request));
});
