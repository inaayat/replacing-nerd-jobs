/** Experience catalog rows: readable list headers, overflow menu, no wall of buttons. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import {
  STORE_KEY,
  addCareerJob,
  addEntry,
  emptyStore,
  groupEntriesAsExperience,
} from '../brag-book/engine.js';

const clock = () => Date.parse('2026-10-20T19:00:00.000Z');

const css = readFileSync(new URL('../brag-book/app.css', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('../brag-book/app.js', import.meta.url), 'utf8');

assert.match(css, /\.bb-exp-section-row-title/);
assert.match(css, /\.bb-exp-section-more/);
assert.match(css, /\.bb-exp-section-list/);
assert.match(appSource, /experienceSectionOverflowMenu/);
assert.match(appSource, /bb-exp-section-row-meta/);
assert.doesNotMatch(
  appSource.slice(appSource.indexOf('function experienceSectionHeader'), appSource.indexOf('function bulkExperienceBar')),
  /btn\('Rename'/,
  'Rename should live in the overflow menu, not as a row button',
);

let store = addCareerJob(emptyStore(), {
  id: 'j1',
  company: 'GoDaddy',
  title: 'Manager',
  start: 'June 2025',
  end: 'Present',
  onResume: false,
}, clock);
store = addEntry(store, { id: 'e1', title: 'Alpha', jobId: 'j1' }, clock);
store = addEntry(store, { id: 'e2', title: 'Beta', jobId: 'j1' }, clock);
store = addEntry(store, { id: 'e3', title: 'Loose line', jobId: 'j1' }, clock);
store = groupEntriesAsExperience(store, ['e1', 'e2'], { jobId: 'j1', title: 'Risk launch' }, clock).store;

const dom = new JSDOM(`<!doctype html><html><body>
<nav><a id="nav-auth-link"></a><a data-nav="log"></a></nav>
<main id="app"></main><footer class="legal"></footer>
</body></html>`, {
  url: 'http://127.0.0.1/brag-book/?local=1#experiences',
  pretendToBeVisual: true,
});
const { window } = dom;
Object.assign(globalThis, {
  window,
  document: window.document,
  location: window.location,
  localStorage: window.localStorage,
  sessionStorage: window.sessionStorage,
  HTMLElement: window.HTMLElement,
  HTMLInputElement: window.HTMLInputElement,
  HTMLTextAreaElement: window.HTMLTextAreaElement,
  Node: window.Node,
  Element: window.Element,
  getComputedStyle: window.getComputedStyle.bind(window),
  requestAnimationFrame: (fn) => window.setTimeout(fn, 0),
  cancelAnimationFrame: (id) => window.clearTimeout(id),
});
window.scrollTo = () => {};
window.open = () => null;

window.localStorage.setItem(STORE_KEY, JSON.stringify(store));

await import(new URL(`../brag-book/app.js?catalog-rows=${Date.now()}`, import.meta.url));
await new Promise((resolve) => window.setTimeout(resolve, 40));

const list = window.document.querySelector('.bb-exp-section-list');
assert.ok(list, 'experience sections grouped in a list');

const title = window.document.querySelector('.bb-exp-section-row-title');
assert.ok(title);
assert.equal(title.textContent, 'Risk launch');

const meta = window.document.querySelector('.bb-exp-section-row-meta');
assert.ok(meta);
assert.match(meta.textContent, /2 versions/);

const looseTitle = [...window.document.querySelectorAll('.bb-exp-section-row-title')]
  .find((node) => node.textContent === 'Not in an experience');
assert.ok(looseTitle, 'loose section uses the same row header pattern');

const headerRenameButtons = [...window.document.querySelectorAll('.bb-exp-section-row .btn')]
  .filter((node) => node.textContent === 'Rename');
assert.equal(headerRenameButtons.length, 0, 'Rename is not a visible row button');

const more = window.document.querySelector('.bb-exp-section-more');
assert.ok(more, 'overflow menu trigger');
more.click();
await new Promise((resolve) => window.setTimeout(resolve, 20));

const menuRename = [...window.document.querySelectorAll('.bb-exp-section-menu-item')]
  .find((node) => node.textContent === 'Rename');
assert.ok(menuRename);
menuRename.click();
await new Promise((resolve) => window.setTimeout(resolve, 20));

assert.ok(window.document.querySelector('.bb-exp-section-rename-input'), 'inline rename field');

console.log('test-brag-book-experiences-catalog-rows.mjs: ok');
