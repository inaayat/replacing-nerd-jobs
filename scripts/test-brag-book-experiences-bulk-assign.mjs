/** Bulk assign model + DOM: Select all, sticky bulk bar, inline create. */
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
import {
  bulkAssignEntriesToExperience,
  jobDisplayLabel,
} from '../brag-book/experiences-forms.js';
import { selectedEntriesJobIds } from '../brag-book/experiences-index.js';

const clock = () => Date.parse('2026-10-20T18:00:00.000Z');

let store = addCareerJob(emptyStore(), {
  id: 'j1',
  company: 'GoDaddy',
  title: 'Manager',
  start: 'June 2025',
  end: 'Present',
  onResume: false,
}, clock);
store = addEntry(store, { id: 'e1', title: 'Bullet one', jobId: 'j1' }, clock);
store = addEntry(store, { id: 'e2', title: 'Bullet two', jobId: 'j1' }, clock);

assert.throws(
  () => bulkAssignEntriesToExperience(store, ['e1', 'e2'], { newTitle: '' }),
  /name required/i,
);

const created = bulkAssignEntriesToExperience(store, ['e1', 'e2'], {
  newTitle: 'Launch program',
  jobId: 'j1',
}, clock);
assert.equal(created.entryIds.length, 2);
assert.ok(created.experienceId);
assert.equal(
  created.store.entries.filter((row) => row.experienceId === created.experienceId).length,
  2,
);

store = groupEntriesAsExperience(store, ['e1'], { jobId: 'j1', title: 'Existing' }, clock).store;
const xpId = store.experiences.find((row) => row.title === 'Existing')?.id;
assert.ok(xpId);
const moved = bulkAssignEntriesToExperience(store, ['e2'], { experienceId: xpId, jobId: 'j1' }, clock);
assert.equal(moved.experienceId, xpId);
assert.equal(moved.store.entries.find((row) => row.id === 'e2').experienceId, xpId);

const job = store.jobs.find((row) => row.id === 'j1');
assert.match(jobDisplayLabel(job), /GoDaddy/);

assert.equal([...selectedEntriesJobIds(store, ['e1', 'e2'])].join(','), 'j1');
assert.equal(selectedEntriesJobIds(store, ['e1', 'e-missing']).size, 1);

let uiStore = addCareerJob(emptyStore(), {
  id: 'j1',
  company: 'GoDaddy',
  title: 'Manager',
  start: 'June 2025',
  end: 'Present',
  onResume: false,
}, clock);
uiStore = addEntry(uiStore, { id: 'e1', title: 'Bullet one', jobId: 'j1' }, clock);
uiStore = addEntry(uiStore, { id: 'e2', title: 'Bullet two', jobId: 'j1' }, clock);

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
window.prompt = () => { throw new Error('prompt must not run'); };
window.confirm = () => { throw new Error('confirm must not run'); };
window.alert = () => { throw new Error('alert must not run'); };

window.localStorage.setItem(STORE_KEY, JSON.stringify(uiStore));

const appSource = readFileSync(new URL('../brag-book/app.js', import.meta.url), 'utf8');
assert.match(appSource, /buildBulkExperienceBar/);
assert.match(appSource, /bb-exp-loose-select-all/);

await import(new URL(`../brag-book/app.js?bulk-assign=${Date.now()}`, import.meta.url));
await new Promise((resolve) => window.setTimeout(resolve, 40));

const selectBtn = [...window.document.querySelectorAll('button')].find((node) => node.textContent === 'Select');
assert.ok(selectBtn, 'Select mode button');
selectBtn.click();
await new Promise((resolve) => window.setTimeout(resolve, 20));

const selectAll = window.document.querySelector('.bb-exp-loose-select-all input[type="checkbox"]');
assert.ok(selectAll, 'Select all on loose section');
selectAll.click();
await new Promise((resolve) => window.setTimeout(resolve, 20));

const bulkBar = window.document.querySelector('.bb-exp-bulk-bar');
assert.ok(bulkBar, 'sticky bulk bar');
assert.match(bulkBar.textContent, /2 selected/);

const addBtn = [...bulkBar.querySelectorAll('button')].find((node) => node.textContent.includes('Add to experience'));
assert.ok(addBtn);
addBtn.click();
await new Promise((resolve) => window.setTimeout(resolve, 20));

const bulkSearch = window.document.querySelector('.bb-exp-bulk-menu input[type="search"]');
assert.ok(bulkSearch, 'bulk menu search');
bulkSearch.value = 'Bulk grouped';
bulkSearch.dispatchEvent(new window.Event('input', { bubbles: true }));
await new Promise((resolve) => window.setTimeout(resolve, 40));

const createBtn = window.document.querySelector('.bb-exp-bulk-menu .bb-exp-picker-create-row');
assert.ok(createBtn, 'create row in bulk menu');
assert.match(createBtn.textContent, /Bulk grouped/);
createBtn.click();
await new Promise((resolve) => window.setTimeout(resolve, 40));

const book = JSON.parse(window.localStorage.getItem(STORE_KEY));
assert.equal(book.experiences.filter((row) => row.title === 'Bulk grouped' && !row.deletedAt).length, 1);
const xp = book.experiences.find((row) => row.title === 'Bulk grouped');
assert.equal(book.entries.filter((row) => row.experienceId === xp.id).length, 2);

console.log('test-brag-book-experiences-bulk-assign.mjs: ok');
