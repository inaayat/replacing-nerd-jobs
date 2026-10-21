// Brag Book PWA contract (A-Lister–style shell, online-first, plan save/update UI).
// Run: node scripts/test-brag-book-pwa.mjs
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

function pngSize(buffer) {
  assert.equal(buffer.readUInt32BE(0), 0x89504e47);
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

// --- Manifest and HTML (plan + A-Lister conventions) ---
const manifest = JSON.parse(await readFile(join(root, 'brag-book/manifest.webmanifest'), 'utf8'));
const html = await readFile(join(root, 'brag-book/index.html'), 'utf8');
const workerSrc = await readFile(join(root, 'brag-book/service-worker.js'), 'utf8');
const enginePwa = await readFile(join(root, 'brag-book/engine/pwa.js'), 'utf8');
const appSrc = await readFile(join(root, 'brag-book/app.js'), 'utf8');

assert.equal(manifest.id, '/brag-book/');
assert.equal(manifest.start_url, '/brag-book/');
assert.equal(manifest.scope, '/brag-book/');
assert.equal(manifest.name, 'Brag Book');
assert.equal(manifest.short_name, 'Brag Book');
assert.equal(manifest.display, 'standalone');
assert.equal(manifest.background_color, '#ffffff');
assert.equal(manifest.theme_color, '#ffffff');
assert(manifest.icons.some((i) => i.purpose === 'maskable' && i.src.endsWith('icon-512.png')));

for (const icon of manifest.icons) {
  assert(icon.src.startsWith('/brag-book/'), icon.src);
  await access(join(root, icon.src.replace(/^\//, '')));
}

const icon192 = pngSize(await readFile(join(root, 'brag-book/icons/icon-192.png')));
assert.equal(icon192.width, 192);
assert.equal(icon192.height, 192);
const icon512 = pngSize(await readFile(join(root, 'brag-book/icons/icon-512.png')));
assert.equal(icon512.width, 512);
assert.equal(icon512.height, 512);
await access(join(root, 'brag-book/icons/app-icon.svg'));

assert(html.includes('rel="manifest" href="./manifest.webmanifest"'));
assert(html.includes('apple-mobile-web-app-capable'));
assert(html.includes('apple-mobile-web-app-title" content="Brag Book"'));
assert(html.includes('rel="apple-touch-icon" href="./icons/icon-192.png"'));
assert(html.includes('content="width=device-width, initial-scale=1, viewport-fit=cover"'));
assert(html.includes('id="pwa-status"'));

const css = await readFile(join(root, 'brag-book/app.css'), 'utf8');
assert(css.includes('.bb-pwa-status'));
assert(css.includes('max(40px, calc(16px + env(safe-area-inset-bottom)))'));

assert(enginePwa.includes("register('/brag-book/service-worker.js'"));
assert(appSrc.includes("import './engine/pwa.js'"));
assert(!appSrc.includes('bootOfflineSignedIn'));
assert(appSrc.includes('networkOnlineForEdits'));

// --- Service worker (mirror A-Lister: network-first shell, no API cache) ---
assert(workerSrc.includes('fetchAndCache'));
assert(workerSrc.includes('isImmutableAsset'));
assert(workerSrc.includes('brag-book-'));
assert(workerSrc.includes('PRECACHE'));
assert(workerSrc.includes("type === 'SKIP_WAITING'"));
assert(!workerSrc.includes('skipWaiting()') || workerSrc.includes("type === 'SKIP_WAITING'"));
assert(workerSrc.includes("url.pathname.startsWith('/api/')"));
assert(workerSrc.match(/fetchAndCache\(request\)\.catch/));
assert(!workerSrc.includes('cacheFirstShell'));
assert(!workerSrc.includes('sw-policy'));

for (const url of [
  '/brag-book/',
  '/brag-book/manifest.webmanifest',
  '/brag-book/icon.svg',
  '/brag-book/icons/icon-192.png',
  '/brag-book/icons/icon-512.png',
]) {
  assert(workerSrc.includes(url), `precache lists ${url}`);
}

// --- Worker lifecycle ---
const deleted = [];
const opened = [];
const fakeCaches = {
  open(name) {
    opened.push(name);
    return Promise.resolve({
      add: (url) => Promise.resolve(url),
    });
  },
  keys: () => Promise.resolve(['brag-book-old', 'brag-book-2026-10-15a', 'brag-book-2026-10-21b', 'brag-book-2026-10-21c', 'other-app']),
  delete(key) {
    deleted.push(key);
    return Promise.resolve(true);
  },
  match: () => Promise.resolve(null),
};
let skipWaitingCalled = false;
let claimCalled = false;
const installHandlers = [];
const activateHandlers = [];
const messageHandlers = [];
const swSandbox = {
  self: {
    skipWaiting() { skipWaitingCalled = true; },
    clients: { claim: () => { claimCalled = true; return Promise.resolve(); } },
    addEventListener(type, fn) {
      if (type === 'install') installHandlers.push(fn);
      if (type === 'activate') activateHandlers.push(fn);
      if (type === 'message') messageHandlers.push(fn);
    },
  },
  caches: fakeCaches,
  fetch: () => Promise.reject(new Error('offline')),
  Promise: globalThis.Promise,
};
vm.runInNewContext(workerSrc, swSandbox);

await installHandlers[0]({ waitUntil: async (p) => { await p; } });
assert(opened.some((n) => n.startsWith('brag-book-')));
assert(!skipWaitingCalled, 'install must not auto skipWaiting (flush-gated updates)');

await activateHandlers[0]({ waitUntil: async (p) => { await p; } });
assert.deepEqual(deleted.sort(), ['brag-book-2026-10-15a', 'brag-book-2026-10-21b', 'brag-book-old'].sort());
assert(workerSrc.includes('clients.claim'));

messageHandlers[0]({ data: { type: 'SKIP_WAITING' } });
assert(skipWaitingCalled);

// --- pwa.js UI ---
const { setOfflineBanner, activateWaitingWorker, initBragBookPwa } = await import(
  pathToFileURL(join(root, 'brag-book/pwa.js')).href
);

const dom = new JSDOM('<!doctype html><div id="pwa-status" hidden><span id="pwa-offline" hidden></span><span id="pwa-update" hidden></span></div><button id="pwa-reload"></button>', {
  url: 'https://inaayat.xyz/brag-book/',
});
const { document } = dom.window;
const elements = {
  status: document.getElementById('pwa-status'),
  offline: document.getElementById('pwa-offline'),
  update: document.getElementById('pwa-update'),
};
setOfflineBanner(elements, false);
assert.equal(elements.offline.hidden, false);
setOfflineBanner(elements, true);
assert.equal(elements.offline.hidden, true);
assert.equal(elements.status.hidden, true);

let posted = false;
let reloaded = false;
const registration = { waiting: {} };
await activateWaitingWorker({
  registration,
  flushBeforeReload: async () => true,
  reload: () => { reloaded = true; },
  serviceWorker: {
    addEventListener(type, fn) {
      if (type === 'controllerchange') fn();
    },
    removeEventListener() {},
  },
  postMessage: () => { posted = true; },
});
assert(posted);
assert(reloaded);

posted = false;
reloaded = false;
const blocked = await activateWaitingWorker({
  registration,
  flushBeforeReload: async () => false,
  reload: () => { reloaded = true; },
  serviceWorker: { addEventListener() {}, removeEventListener() {} },
});
assert.equal(blocked.ok, false);
assert(!posted);
assert(!reloaded);

assert(appSrc.includes('initBragBookPwa'));
assert(appSrc.includes('reconnectBook'));
assert(appSrc.includes('setShellReadOnly') || (await readFile(join(root, 'brag-book/pwa.js'), 'utf8')).includes('setShellReadOnly'));

console.log('brag-book PWA tests passed');
