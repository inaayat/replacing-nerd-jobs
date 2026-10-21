/** Requirement map search: create experience from typed query, expand bucket, focus + Add bullet. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import {
  STORE_KEY,
  addCareerJob,
  addEntry,
  addPosting,
  addRequirement,
  emptyStore,
} from '../brag-book/engine.js';
import { postingMapAddBulletFocusKey } from '../brag-book/posting-requirement-mapping-ui.js';

const uiSrc = readFileSync(new URL('../brag-book/posting-requirement-mapping-ui.js', import.meta.url), 'utf8');
assert.match(uiSrc, /buildCreateExperienceOption/);
assert.match(uiSrc, /onCreateExperienceFromQuery/);

const clock = () => Date.parse('2026-10-21T19:00:00.000Z');

let store = addCareerJob(emptyStore(), {
  id: 'j1',
  company: 'GoDaddy',
  title: 'Manager',
  onResume: false,
}, clock);
store = addEntry(store, { id: 'e1', title: 'Existing bullet', jobId: 'j1' }, clock);
store = addPosting(store, { title: 'Manager', company: 'GoDaddy' }, clock);
const postingId = store.postings[0].id;
store = addRequirement(store, postingId, 'Lead programs', clock);
const reqId = store.postings[0].requirements[0].id;

const dom = new JSDOM(`<!doctype html><html><body>
<nav><a id="nav-auth-link"></a><a data-nav="jobs"></a></nav>
<main id="app"></main><footer class="legal"></footer>
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

await import(new URL(`../brag-book/app.js?post-map-create=${Date.now()}`, import.meta.url));
await new Promise((resolve) => window.setTimeout(resolve, 100));

const mapSearch = window.document.querySelector('.bb-post-map-search');
assert.ok(mapSearch, 'requirement map search');
Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(mapSearch, 'DSA Control Gap');
mapSearch.dispatchEvent(new window.InputEvent('input', { bubbles: true }));
await new Promise((resolve) => window.setTimeout(resolve, 80));

const createRow = window.document.querySelector('.bb-post-map-results .bb-exp-picker-create-row');
assert.ok(createRow, 'create row in map results');
assert.match(createRow.textContent, /DSA Control Gap/);
createRow.click();
await new Promise((resolve) => window.setTimeout(resolve, 100));

const book = JSON.parse(window.localStorage.getItem(STORE_KEY));
const xp = book.experiences.find((row) => row.title === 'DSA Control Gap' && !row.deletedAt);
assert.ok(xp, 'experience created from map search');
const req = book.postings[0].requirements.find((row) => row.id === reqId);
assert.ok(req.coveredExperienceIds.includes(xp.id), 'mapped to requirement');

const expanded = window.document.querySelector(`.bb-post-map-bucket.is-expanded[data-experience-id="${xp.id}"]`);
assert.ok(expanded, 'bucket expanded after create');

const addBulletFocus = postingMapAddBulletFocusKey(postingId, reqId, xp.id);
const addBtn = window.document.querySelector(`[data-focus-key="${addBulletFocus}"]`);
assert.ok(addBtn, '+ Add bullet focused target exists');
assert.equal(window.document.activeElement, addBtn, 'focus lands on + Add bullet');

console.log('test-brag-book-posting-map-create-experience.mjs: ok');
