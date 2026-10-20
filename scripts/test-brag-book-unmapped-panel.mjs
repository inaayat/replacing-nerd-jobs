/** Collapsible unmapped resume panel — default collapsed, count badge. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM, VirtualConsole } from 'jsdom';
import {
  STORE_KEY,
  addCareerJob,
  addEntry,
  addEntryBullet,
  addPosting,
  addRequirement,
  emptyStore,
  placeLibraryBullet,
  postingById,
  startPostingResumeFresh,
  unmappedResumeBulletCount,
} from '../brag-book/engine.js';

const clock = () => Date.parse('2026-10-09T12:00:00.000Z');
const random = () => 0.25;

function mappedBook() {
  let book = addCareerJob(emptyStore(), {
    id: 'rj_um',
    company: 'Stripe',
    title: 'Accountant',
    onResume: false,
    groups: [{ id: 'rg_um', heading: '', bullets: [] }],
  }, clock);
  book = addEntry(book, {
    id: 'en_mapped',
    title: 'Closed books',
    jobId: 'rj_um',
  }, clock);
  book = addEntry(book, {
    id: 'en_free',
    title: 'Built dashboard',
    jobId: 'rj_um',
  }, clock);
  book = addPosting(book, { id: 'job_um', title: 'Role', company: 'Co' }, clock);
  book = addRequirement(book, 'job_um', 'Close', clock);
  const reqId = postingById(book, 'job_um').requirements[0].id;
  book = addEntryBullet(book, 'job_um', reqId, 'en_mapped', '', clock);
  book = placeLibraryBullet(book, {
    postingId: 'job_um',
    jobId: 'rj_um',
    groupId: 'rg_um',
    entryId: 'en_free',
  }, clock, random);
  return book;
}

const mapped = mappedBook();
assert.equal(unmappedResumeBulletCount(mapped, postingById(mapped, 'job_um')), 1);

const SHELL = `<!doctype html><html><body>
<nav class="nav"></nav>
<main id="app" class="shell"></main>
</body></html>`;

async function openPosting(book) {
  globalThis.__BB_TEST_UNMAPPED_PANEL__ = true;
  const dom = new JSDOM(SHELL, {
    url: 'http://127.0.0.1/brag-book/?local=1#jobs/job_um',
    pretendToBeVisual: true,
    virtualConsole: new VirtualConsole(),
  });
  const { window } = dom;
  globalThis.window = window;
  globalThis.document = window.document;
  globalThis.location = window.location;
  globalThis.localStorage = window.localStorage;
  globalThis.sessionStorage = window.sessionStorage;
  globalThis.HTMLElement = window.HTMLElement;
  globalThis.HTMLInputElement = window.HTMLInputElement;
  globalThis.HTMLTextAreaElement = window.HTMLTextAreaElement;
  globalThis.Node = window.Node;
  globalThis.Element = window.Element;
  globalThis.getComputedStyle = window.getComputedStyle.bind(window);
  globalThis.requestAnimationFrame = (fn) => window.setTimeout(fn, 0);
  globalThis.cancelAnimationFrame = (id) => window.clearTimeout(id);
  window.confirm = () => false;
  dom.window.localStorage.setItem(STORE_KEY, JSON.stringify(book));
  const href = new URL('../brag-book/app.js', import.meta.url);
  await import(`${href.href}?unmapped-panel=${Date.now()}`);
  await new Promise((resolve) => dom.window.setTimeout(resolve, 60));
  return dom;
}

const dom = await openPosting(mapped);
const { document, window } = dom.window;
const panel = globalThis.__bbTestUnmappedPanel;

assert.equal(panel.isExpanded('job_um'), false, 'collapsed by default on load');

const toggle = document.querySelector('.bb-unmapped-toggle');
const body = document.getElementById('bb-unmapped-body-job_um');
assert.ok(toggle);
assert.ok(body);
assert.equal(toggle.getAttribute('aria-expanded'), 'false');
assert.equal(body.hidden, true);

const badge = document.querySelector('.bb-unmapped-count');
assert.ok(badge);
assert.equal(badge.textContent.trim(), '1');
assert.equal(badge.classList.contains('is-zero'), false);

toggle.click();
await new Promise((resolve) => window.setTimeout(resolve, 40));
const toggleAfter = document.querySelector('.bb-unmapped-toggle');
const bodyAfter = document.getElementById('bb-unmapped-body-job_um');
assert.equal(toggleAfter?.getAttribute('aria-expanded'), 'true');
assert.equal(bodyAfter?.hidden, false);
assert.equal(panel.isExpanded('job_um'), true);

panel.resetExpanded();
assert.equal(panel.isExpanded('job_um'), false);

let emptyBook = addPosting(emptyStore(), { id: 'job_empty', title: 'Empty unmapped' }, clock);
emptyBook = startPostingResumeFresh(emptyBook, 'job_empty', clock);
assert.equal(unmappedResumeBulletCount(emptyBook, postingById(emptyBook, 'job_empty')), 0);

const appSource = readFileSync(new URL('../brag-book/app.js', import.meta.url), 'utf8');
assert.match(appSource, /bb-unmapped-count\$\{count \? '' : ' is-zero'\}/);
assert.match(appSource, /String\(count\)/);
assert.match(appSource, /aria-expanded/);
assert.match(appSource, /unmappedResumePanelExpanded/);

console.log('test-brag-book-unmapped-panel.mjs: ok');
