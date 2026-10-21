/** Posting requirement buckets: inline version edit + Add bullet (model/DOM). */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import {
  STORE_KEY,
  addCareerJob,
  addEntry,
  addEntryBullet,
  addExperienceCoverage,
  addPosting,
  addRequirement,
  emptyStore,
  groupEntriesAsExperience,
  updateEntry,
} from '../brag-book/engine.js';
import { postingMapAddBulletFocusKey } from '../brag-book/posting-requirement-mapping-ui.js';

const uiSource = readFileSync(new URL('../brag-book/posting-requirement-mapping-ui.js', import.meta.url), 'utf8');
assert.match(uiSource, /updateEntry/);
assert.match(uiSource, /bb-post-map-add-bullet/);
assert.match(uiSource, /bb-post-map-version-edit/);
assert.match(uiSource, /buildMapEntryEditor/);

const clock = () => Date.parse('2026-10-21T14:00:00.000Z');

let store = addCareerJob(emptyStore(), {
  id: 'j1',
  company: 'GoDaddy',
  title: 'Manager',
  onResume: false,
}, clock);
store = addEntry(store, { id: 'e1', title: 'Alpha version', jobId: 'j1' }, clock);
store = addEntry(store, { id: 'e2', title: 'Beta version', jobId: 'j1' }, clock);
store = groupEntriesAsExperience(store, ['e1', 'e2'], { jobId: 'j1', title: 'Risk launch' }, clock).store;
const xpId = store.experiences[0].id;
store = addPosting(store, { title: 'Manager', company: 'GoDaddy' }, clock);
const postingId = store.postings[0].id;
store = addRequirement(store, postingId, 'Lead programs', clock);
const reqId = store.postings[0].requirements[0].id;
store = addExperienceCoverage(store, postingId, reqId, xpId, clock);
store = addEntryBullet(store, postingId, reqId, 'e1', '', clock);

store = updateEntry(store, 'e2', { title: 'Beta edited inline', rich: [{ text: 'Beta edited inline', bold: false }] }, clock);
assert.equal(store.entries.find((row) => row.id === 'e2').title, 'Beta edited inline');

assert.ok(postingMapAddBulletFocusKey(postingId, reqId, xpId).includes('add'));

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

await import(new URL(`../brag-book/app.js?map-inline=${Date.now()}`, import.meta.url));
await new Promise((resolve) => window.setTimeout(resolve, 100));

const bucket = window.document.querySelector('.bb-post-map-bucket.is-collapsed');
assert.ok(bucket, 'experience bucket');
bucket.querySelector('.bb-post-map-bucket-head').click();
await new Promise((resolve) => window.setTimeout(resolve, 40));

const expanded = window.document.querySelector('.bb-post-map-bucket.is-expanded');
assert.ok(expanded, 'bucket expands');
assert.ok(expanded.querySelector('.bb-post-map-version-edit'), 'version line is editable');
assert.ok(expanded.querySelector('.bb-post-map-add-bullet'), 'add bullet row');

const addBtn = expanded.querySelector('.bb-post-map-add-bullet');
addBtn.click();
await new Promise((resolve) => window.setTimeout(resolve, 60));

const editors = window.document.querySelectorAll('.bb-post-map-version-edit');
assert.ok(editors.length >= 3, 'draft version appears after add bullet');

console.log('test-brag-book-posting-map-inline.mjs: ok');
