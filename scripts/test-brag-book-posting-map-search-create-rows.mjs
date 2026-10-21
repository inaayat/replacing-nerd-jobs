/** Requirement map search: zero matches still shows create rows (not "No matches."). */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import {
  STORE_KEY,
  addCareerJob,
  addPosting,
  addRequirement,
  emptyStore,
} from '../brag-book/engine.js';

const uiSrc = readFileSync(new URL('../brag-book/posting-requirement-mapping-ui.js', import.meta.url), 'utf8');
assert.doesNotMatch(uiSrc, /No matches\./);
assert.match(uiSrc, /appendPostingMapSearchCreateRows/);

const swSrc = readFileSync(new URL('../brag-book/service-worker.js', import.meta.url), 'utf8');
assert.match(swSrc, /BUILD_ID = '2026-10-21c'/);

const clock = () => Date.parse('2026-10-21T20:00:00.000Z');

let store = addCareerJob(emptyStore(), {
  id: 'j1',
  company: 'GoDaddy',
  title: 'Manager',
  onResume: false,
}, clock);
store = addPosting(store, { title: 'Manager', company: 'GoDaddy' }, clock);
const postingId = store.postings[0].id;
store = addRequirement(store, postingId, 'Lead programs', clock);

const dom = new JSDOM(`<!doctype html><html><body>
<nav><a id="nav-auth-link"></a><a data-nav="jobs"></a></nav>
<main id="app"></main>
</body></html>`, {
  url: `http://127.0.0.1/brag-book/?local=1&experiences=1#jobs/${postingId}`,
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
window.localStorage.setItem(STORE_KEY, JSON.stringify(store));

await import(new URL(`../brag-book/app.js?map-create-rows=${Date.now()}`, import.meta.url));
await new Promise((resolve) => window.setTimeout(resolve, 100));

const mapSearch = window.document.querySelector('.bb-post-map-search');
assert.ok(mapSearch, 'requirement map search');
Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(mapSearch, 'zzzz-no-match-query');
mapSearch.dispatchEvent(new window.InputEvent('input', { bubbles: true }));
await new Promise((resolve) => window.setTimeout(resolve, 80));

const results = window.document.querySelector('.bb-post-map-results');
assert.ok(results, 'search results overlay');
assert.equal(results.querySelector('.bb-post-map-empty'), null, 'no "No matches." placeholder');
const expCreate = results.querySelector('.bb-exp-picker-create-row');
const looseCreate = results.querySelector('.bb-post-map-add-loose-row');
assert.ok(expCreate, 'create experience row');
assert.ok(looseCreate, 'add loose bullet row');
assert.match(expCreate.textContent, /zzzz-no-match-query/);
assert.match(looseCreate.textContent, /zzzz-no-match-query/);

console.log('test-brag-book-posting-map-search-create-rows.mjs: ok');
