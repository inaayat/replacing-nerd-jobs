/**
 * Want Reorder: whole-tile pointer + iOS-safe touch drag, any slot.
 * Run: node scripts/test-alist-want-mobile-drag.mjs
 */
import assert from 'node:assert/strict';
import http from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { sortByWantPriority } from '../amc-a-lister/engine/want-order.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));

function homeItems() {
  return [
    { id: 'a', title: 'Alpha', release_date: '2020-01-01', poster_path: '/a.jpg', priority: 0 },
    { id: 'b', title: 'Bravo', release_date: '2019-01-01', poster_path: '/b.jpg', priority: 1 },
    { id: 'c', title: 'Charlie', release_date: '2018-01-01', poster_path: '/c.jpg', priority: 2 },
    { id: 'd', title: 'Delta', release_date: '2017-01-01', poster_path: '/d.jpg', priority: 3 },
    { id: 'e', title: 'Echo', release_date: '2016-01-01', poster_path: '/e.jpg', priority: 4 },
    { id: 'f', title: 'Foxtrot', release_date: '2015-01-01', poster_path: '/f.jpg', priority: 5 },
  ];
}

function tvItems() {
  return [
    { id: 'show1', title: 'The Pitt', release_date: '2025-01-01', poster_path: '/pitt.jpg', priority: 0 },
    { id: 'show2', title: 'Severance', release_date: '2022-02-01', poster_path: '/sev.jpg', priority: 1 },
    { id: 'show3', title: 'Shogun', release_date: '2024-02-01', poster_path: '/sho.jpg', priority: 2 },
    { id: 'show4', title: 'The Bear', release_date: '2023-06-01', poster_path: '/bear.jpg', priority: 3 },
    { id: 'show5', title: 'Slow Horses', release_date: '2022-04-01', poster_path: '/horses.jpg', priority: 4 },
    { id: 'show6', title: 'Andor', release_date: '2022-09-01', poster_path: '/andor.jpg', priority: 5 },
  ];
}

const CASES = [
  { name: 'last to first', fromIndex: 5, toIndex: 0, expected: [5, 0, 1, 2, 3, 4] },
  { name: 'first to last', fromIndex: 0, toIndex: 5, expected: [1, 2, 3, 4, 5, 0] },
  { name: 'middle across rows', fromIndex: 1, toIndex: 4, expected: [0, 2, 3, 4, 1, 5] },
];

function installLiveRects(window, grid) {
  const proto = window.HTMLElement.prototype;
  const original = proto.getBoundingClientRect;
  proto.getBoundingClientRect = function getBoundingClientRect() {
    const item = this.closest?.('.al-watchlist-grid-item');
    if (!item || !grid.contains(item)) {
      return original.call(this);
    }
    const items = [...grid.querySelectorAll(':scope > .al-watchlist-grid-item')];
    const i = Math.max(0, items.indexOf(item));
    const col = i % 3;
    const row = Math.floor(i / 3);
    const left = col * 110;
    const top = row * 170;
    return {
      x: left,
      y: top,
      left,
      top,
      width: 100,
      height: 150,
      right: left + 100,
      bottom: top + 150,
      toJSON() {},
    };
  };
}

function makeTouch(window, target, id, x, y) {
  if (typeof window.Touch === 'function') {
    try {
      return new window.Touch({
        identifier: id,
        target,
        clientX: x,
        clientY: y,
        pageX: x,
        pageY: y,
        screenX: x,
        screenY: y,
        radiusX: 2.5,
        radiusY: 2.5,
        rotationAngle: 0,
        force: 1,
      });
    } catch {
      /* fall through */
    }
  }
  return {
    identifier: id,
    target,
    clientX: x,
    clientY: y,
    pageX: x,
    pageY: y,
    screenX: x,
    screenY: y,
    radiusX: 2.5,
    radiusY: 2.5,
    rotationAngle: 0,
    force: 1,
  };
}

function dispatchTouch(window, target, type, x, y, id = 1) {
  const touch = makeTouch(window, target, id, x, y);
  const init = {
    bubbles: true,
    cancelable: true,
    composed: true,
    touches: type === 'touchend' || type === 'touchcancel' ? [] : [touch],
    targetTouches: type === 'touchend' || type === 'touchcancel' ? [] : [touch],
    changedTouches: [touch],
  };
  let event;
  if (typeof window.TouchEvent === 'function') {
    try {
      event = new window.TouchEvent(type, init);
    } catch {
      event = new window.Event(type, { bubbles: true, cancelable: true });
      Object.assign(event, init);
    }
  } else {
    event = new window.Event(type, { bubbles: true, cancelable: true });
    Object.assign(event, init);
  }
  target.dispatchEvent(event);
}

function dispatchPointer(window, target, type, { x, y, pointerId = 1, pointerType = 'mouse', button = 0 } = {}) {
  const init = {
    bubbles: true,
    cancelable: true,
    composed: true,
    clientX: x,
    clientY: y,
    pointerId,
    pointerType,
    button,
    buttons: type === 'pointerup' || type === 'pointercancel' ? 0 : 1,
    isPrimary: true,
  };
  let event;
  if (typeof window.PointerEvent === 'function') {
    event = new window.PointerEvent(type, init);
  } else {
    event = new window.MouseEvent(type === 'pointerdown' ? 'mousedown' : type === 'pointerup' ? 'mouseup' : 'mousemove', init);
    Object.assign(event, init);
  }
  target.dispatchEvent(event);
}

function stubCapture(el) {
  if (!el.setPointerCapture) el.setPointerCapture = () => {};
  if (!el.releasePointerCapture) el.releasePointerCapture = () => {};
}

async function dragWithTouch(window, card, from, to) {
  stubCapture(card);
  dispatchTouch(window, card, 'touchstart', from.x, from.y);
  dispatchTouch(window, window, 'touchmove', from.x + 8, from.y);
  dispatchTouch(window, window, 'touchmove', to.x, to.y);
  dispatchTouch(window, window, 'touchend', to.x, to.y);
}

async function dragWithMouse(window, card, from, to) {
  stubCapture(card);
  dispatchPointer(window, card, 'pointerdown', { x: from.x, y: from.y, pointerType: 'mouse' });
  dispatchPointer(window, window, 'pointermove', { x: from.x + 8, y: from.y, pointerType: 'mouse' });
  dispatchPointer(window, window, 'pointermove', { x: to.x, y: to.y, pointerType: 'mouse' });
  dispatchPointer(window, window, 'pointerup', { x: to.x, y: to.y, pointerType: 'mouse' });
}

async function waitForSave(saved) {
  return Promise.race([
    saved,
    new Promise((_, reject) => setTimeout(() => reject(new Error('order was not saved')), 1000)),
  ]);
}

async function runDomDrag({ label, items, fromId, toId, expectedIds, mode }) {
  const dom = new JSDOM(`<!doctype html><html><body>
    <div id="list"></div>
    <p id="status"></p>
  </body></html>`, {
    url: 'http://127.0.0.1/amc-a-lister/',
    pretendToBeVisual: true,
  });
  const { window } = dom;
  window.scrollBy = () => {};
  window.visualViewport = { offsetTop: 0, height: 800, width: 390 };
  Object.assign(globalThis, {
    window,
    document: window.document,
    HTMLElement: window.HTMLElement,
    Element: window.Element,
    Node: window.Node,
    DocumentFragment: window.DocumentFragment,
  });
  if (!window.Element.prototype.setPointerCapture) {
    window.Element.prototype.setPointerCapture = () => {};
    window.Element.prototype.releasePointerCapture = () => {};
  }

  const { wireWatchlistLogList } = await import('../amc-a-lister/engine/watchlist-ui.js');
  const state = {
    watchlist: items.map((item) => ({ ...item })),
    expandedId: null,
    detailsCache: new Map(),
  };
  let resolveSave;
  const saved = new Promise((resolve) => { resolveSave = resolve; });
  const watchlistApi = {
    update: async (_token, body) => {
      resolveSave(body);
      return {};
    },
  };
  const listEl = window.document.getElementById('list');
  wireWatchlistLogList({ token: 't' }, state, {
    listEl,
    statusEl: window.document.getElementById('status'),
    getItems: () => sortByWantPriority(state.watchlist, state.watchlist),
    emptyMessage: 'empty',
    watchlistApi,
    reorderable: true,
  });

  const grid = listEl.querySelector('.al-watchlist-grid');
  assert.ok(grid, `${label}: rendered a grid`);
  installLiveRects(window, grid);

  const fromTile = grid.querySelector(`[data-entry-id="${fromId}"]`);
  const toTile = grid.querySelector(`[data-entry-id="${toId}"]`);
  const card = fromTile.querySelector('.al-watchlist-card');
  const fromBox = card.getBoundingClientRect();
  const toBox = toTile.querySelector('.al-watchlist-card').getBoundingClientRect();
  const from = { x: fromBox.left + fromBox.width / 2, y: fromBox.top + fromBox.height / 2 };
  const to = { x: toBox.left + toBox.width / 2, y: toBox.top + toBox.height / 2 };

  if (mode === 'touch') {
    dispatchPointer(window, card, 'pointerdown', {
      x: from.x, y: from.y, pointerType: 'touch', pointerId: 7,
    });
    await dragWithTouch(window, card, from, to);
  } else {
    await dragWithMouse(window, card, from, to);
  }

  const body = await waitForSave(saved);
  const ids = sortByWantPriority(state.watchlist, state.watchlist).map((item) => item.id);
  assert.deepEqual(ids, expectedIds, `${label}: saved display order`);
  assert.ok(Array.isArray(body.ranks), `${label}: drop persisted ranks`);
  assert.equal(
    listEl.querySelector('.al-want-drag-ghost'),
    null,
    `${label}: the lifted preview is gone after drop`,
  );
  return body;
}

async function runJsdomSuite() {
  const lists = [
    { label: 'Watch at Home', items: homeItems() },
    { label: 'TV want', items: tvItems() },
  ];
  for (const list of lists) {
    const ids = list.items.map((item) => item.id);
    for (const mode of ['touch', 'mouse']) {
      for (const scenario of CASES) {
        await runDomDrag({
          label: `${list.label} ${mode} ${scenario.name}`,
          items: list.items,
          fromId: ids[scenario.fromIndex],
          toId: ids[scenario.toIndex],
          expectedIds: scenario.expected.map((i) => ids[i]),
          mode,
        });
      }
    }
  }
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
};

function startStaticServer() {
  return new Promise((resolveServer) => {
    const server = http.createServer((req, res) => {
      const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
      const filePath = join(ROOT, urlPath === '/' ? 'index.html' : urlPath);
      if (!filePath.startsWith(ROOT) || !existsSync(filePath) || !statSync(filePath).isFile()) {
        res.writeHead(404);
        res.end('not found');
        return;
      }
      res.writeHead(200, { 'Content-Type': MIME[extname(filePath)] || 'application/octet-stream' });
      createReadStream(filePath).pipe(res);
    });
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolveServer({ server, url: `http://127.0.0.1:${port}` });
    });
  });
}

async function tryLaunch(kind) {
  const playwright = await import('playwright-core');
  const launcher = playwright[kind];
  if (!launcher?.launch) return null;
  const candidates = kind === 'chromium'
    ? ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser']
    : [];
  for (const executablePath of candidates) {
    if (!existsSync(executablePath)) continue;
    try {
      const browser = await launcher.launch({ headless: true, executablePath });
      return { kind, browser };
    } catch {
      /* try next */
    }
  }
  try {
    const browser = await launcher.launch({ headless: true });
    return { kind, browser };
  } catch {
    return null;
  }
}

function touchScript() {
  return ({ from, to }) => {
    const el = document.elementFromPoint(from.x, from.y)
      || document.querySelector('[data-want-drag] .al-watchlist-card');
    const fire = (type, x, y) => {
      const target = type === 'touchstart' ? el : window;
      const ctor = window.Touch
        ? new Touch({
          identifier: 1,
          target: el,
          clientX: x,
          clientY: y,
          pageX: x,
          pageY: y,
          radiusX: 2.5,
          radiusY: 2.5,
          rotationAngle: 0,
          force: 1,
        })
        : {
          identifier: 1,
          target: el,
          clientX: x,
          clientY: y,
          pageX: x,
          pageY: y,
        };
      const init = {
        bubbles: true,
        cancelable: true,
        composed: true,
        touches: type === 'touchend' ? [] : [ctor],
        targetTouches: type === 'touchend' ? [] : [ctor],
        changedTouches: [ctor],
      };
      let event;
      try {
        event = new TouchEvent(type, init);
      } catch {
        event = new Event(type, { bubbles: true, cancelable: true });
        Object.assign(event, init);
      }
      target.dispatchEvent(event);
    };
    fire('touchstart', from.x, from.y);
    fire('touchmove', from.x + (to.x - from.x) / 2, from.y + (to.y - from.y) / 2);
    fire('touchmove', to.x, to.y);
    fire('touchend', to.x, to.y);
  };
}

async function centers(page, fromId, toId) {
  const from = await page.locator(`[data-entry-id="${fromId}"] .al-watchlist-card`).boundingBox();
  const to = await page.locator(`[data-entry-id="${toId}"] .al-watchlist-card`).boundingBox();
  assert.ok(from && to, `poster tiles ${fromId} → ${toId} have boxes`);
  return {
    from: { x: from.x + from.width / 2, y: from.y + from.height / 2 },
    to: { x: to.x + to.width / 2, y: to.y + to.height / 2 },
  };
}

async function runPlaywrightScenario(page, { name, fromId, toId, expected, mode }) {
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('.al-watchlist-card--reorder');
  const { from, to } = await centers(page, fromId, toId);
  const savesBefore = await page.evaluate(() => (window.__wantSaves || []).length);
  if (mode === 'touch') {
    await page.evaluate(touchScript(), { from, to });
  } else {
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 12 });
    await page.mouse.up();
  }
  await page.waitForFunction(
    (before) => (window.__wantSaves || []).length > before,
    savesBefore,
    { timeout: 4000 },
  );
  const payload = await page.evaluate(() => ({
    order: window.__wantOrder,
    ghost: Boolean(document.querySelector('.al-want-drag-ghost')),
  }));
  assert.deepEqual(payload.order, expected, `playwright ${mode} ${name}`);
  assert.equal(payload.ghost, false, `playwright ${mode} ${name}: ghost gone`);
}

async function runPlaywrightBrowser({ kind, browser }, baseUrl) {
  const playwright = await import('playwright-core');
  const iPhone = playwright.devices['iPhone 13'] || playwright.devices['iPhone 12'] || {
    viewport: { width: 390, height: 844 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1',
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 3,
  };
  const context = await browser.newContext({
    ...iPhone,
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  await page.setViewportSize(iPhone.viewport || { width: 390, height: 844 });
  await page.goto(`${baseUrl}/scripts/fixtures/want-reorder-harness.html`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.al-watchlist-card--reorder');

  const ids = ['a', 'b', 'c', 'd', 'e', 'f'];
  for (const mode of ['touch', 'mouse']) {
    for (const scenario of CASES) {
      await runPlaywrightScenario(page, {
        name: scenario.name,
        fromId: ids[scenario.fromIndex],
        toId: ids[scenario.toIndex],
        expected: scenario.expected.map((i) => ids[i]),
        mode,
      });
    }
  }

  await context.close();
  return true;
}

async function runPlaywrightSuite() {
  const { server, url } = await startStaticServer();
  const tried = [];
  try {
    for (const kind of ['chromium', 'webkit']) {
      const launched = await tryLaunch(kind);
      if (!launched) {
        tried.push(`${kind}: skipped (no browser)`);
        continue;
      }
      try {
        await runPlaywrightBrowser(launched, url);
        tried.push(`${kind}: ok`);
      } finally {
        await launched.browser.close();
      }
    }
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
  if (!tried.some((row) => row.endsWith('ok'))) {
    console.log('Playwright browsers unavailable; jsdom touch coverage still ran.');
  }
  return tried;
}

const jsdomPassed = await runJsdomSuite()
  .then(() => true)
  .catch((err) => {
    console.error(err);
    return false;
  });
assert.equal(jsdomPassed, true, 'jsdom touch and mouse drags update order and save');

const playwrightTried = await runPlaywrightSuite();
console.log(`want mobile drag ok (playwright: ${playwrightTried.join(', ') || 'none'})`);
