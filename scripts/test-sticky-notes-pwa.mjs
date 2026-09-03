// Sticky Notes installed-app contract: manifest, shell cache, and offline auth.
// Run: node scripts/test-sticky-notes-pwa.mjs
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(await readFile(join(root, 'sticky-notes/manifest.webmanifest'), 'utf8'));
const worker = await readFile(join(root, 'sticky-notes/service-worker.js'), 'utf8');
const app = await readFile(join(root, 'sticky-notes/app.js'), 'utf8');
const auth = await readFile(join(root, 'sticky-notes/engine/auth.js'), 'utf8');
const html = await readFile(join(root, 'sticky-notes/index.html'), 'utf8');

assert.equal(manifest.id, '/sticky-notes/');
assert.equal(manifest.scope, '/sticky-notes/');
assert.equal(manifest.display, 'standalone');
assert.equal(manifest.share_target?.method, 'GET');
assert.equal(manifest.share_target?.action, '/sticky-notes/?share=1');
assert(manifest.shortcuts?.some((shortcut) => shortcut.url === '/sticky-notes/?new=1'));

for (const icon of manifest.icons || []) {
  assert(icon.src.startsWith('/sticky-notes/'), `icon stays in app scope: ${icon.src}`);
  await access(join(root, icon.src.replace(/^\//, '')));
}

assert(worker.includes("url.pathname.startsWith('/api/')"), 'service worker never caches API responses');
assert(worker.includes("sticky-notes-shell-v3"), 'shell cache name busts the v2 cache-first worker');
assert(!worker.includes("sticky-notes-shell-v2"), 'the stale v2 cache name is gone');
assert(worker.includes('function networkFirst'), 'JS/CSS are network-first so deploys land on the next open');
assert(worker.includes('function cacheFirst'), 'icons stay cache-first');
assert(worker.includes('function isScriptOrStyle'), 'network-first applies to JS and CSS, not icons');
assert(worker.includes('navigationResponse'), 'service worker has an offline navigation fallback');
assert(worker.includes('/engine/neon-browser-auth.js'), 'offline shell includes shared auth code');
assert(app.includes("serviceWorker.register('./service-worker.js'"), 'app registers its scoped worker');
assert(app.includes("launch.get('share') === '1'"), 'app consumes OS share-target launches');
assert(auth.includes('return offlineAuth();'), 'stored auth can open the account mirror offline');
assert(html.includes('id="install-app"'), 'browser version exposes an install affordance');
assert(html.includes('id="connection-status"'), 'app exposes offline status');

console.log('sticky-notes PWA tests passed');
