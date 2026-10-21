/** Typed query becomes new experience name (per-bullet + bulk pickers). */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import {
  STORE_KEY,
  addCareerJob,
  addEntry,
  emptyStore,
} from '../brag-book/engine.js';
import { formatCreateExperienceLabel } from '../brag-book/experience-search-picker.js';
import { experiencePickerOverlayId } from '../brag-book/experience-picker.js';

assert.equal(formatCreateExperienceLabel('DSA Control Gap'), '+ Create experience "DSA Control Gap"');
assert.equal(formatCreateExperienceLabel('  '), '+ Create experience');

const pickerSrc = readFileSync(new URL('../brag-book/experience-picker.js', import.meta.url), 'utf8');
const formsSrc = readFileSync(new URL('../brag-book/experiences-forms.js', import.meta.url), 'utf8');
const sharedSrc = readFileSync(new URL('../brag-book/experience-search-picker.js', import.meta.url), 'utf8');
assert.match(pickerSrc, /buildExperienceSearchPickerBody/);
assert.match(formsSrc, /buildExperienceSearchPickerBody/);
assert.match(sharedSrc, /bb-exp-picker-create-row/);

const clock = () => Date.parse('2026-10-21T16:00:00.000Z');

let store = addCareerJob(emptyStore(), {
  id: 'j1',
  company: 'PwC',
  title: 'Senior Associate',
  onResume: true,
}, clock);
store = addEntry(store, { id: 'e1', title: 'Audit bullet one', jobId: 'j1' }, clock);
store = addEntry(store, { id: 'e2', title: 'Audit bullet two', jobId: 'j1' }, clock);

const dom = new JSDOM(`<!doctype html><html><body>
<nav><a id="nav-auth-link"></a><a data-nav="log"></a></nav>
<main id="app"></main><footer class="legal"></footer>
</body></html>`, {
  url: 'http://127.0.0.1/brag-book/?local=1&experiences=1#experiences',
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

await import(new URL(`../brag-book/app.js?xp-create=${Date.now()}`, import.meta.url));
await new Promise((resolve) => window.setTimeout(resolve, 80));

const chip = window.document.querySelector(`[data-bb-overlay-anchor="${experiencePickerOverlayId('e1')}"]`)
  || window.document.querySelector('.bb-exp-picker-chip');
assert.ok(chip, 'experience picker chip');
chip.click();
await new Promise((resolve) => window.setTimeout(resolve, 60));

const panel = window.document.querySelector(`[data-bb-overlay-panel="${experiencePickerOverlayId('e1')}"]`);
assert.ok(panel, 'picker panel');
const search = panel.querySelector('.bb-exp-picker-search');
assert.ok(search, 'picker search');
search.focus();
search.value = 'DSA Control Gap';
search.dispatchEvent(new window.InputEvent('input', { bubbles: true }));
await new Promise((resolve) => window.setTimeout(resolve, 100));

const panelLive = window.document.querySelector(`[data-bb-overlay-panel="${experiencePickerOverlayId('e1')}"]`);
assert.ok(panelLive, 'picker panel after typing');
const searchLive = panelLive.querySelector('.bb-exp-picker-search');
assert.ok(searchLive, 'live picker search');
assert.equal(searchLive.value, 'DSA Control Gap', 'typed text stays in search');
const createRow = panelLive.querySelector('.bb-exp-picker-create-row');
assert.ok(createRow, 'create row');
assert.match(createRow.textContent, /DSA Control Gap/);
createRow.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true }));
createRow.click();
await new Promise((resolve) => window.setTimeout(resolve, 80));

let book = JSON.parse(window.localStorage.getItem(STORE_KEY));
let xp = book.experiences.find((row) => row.title === 'DSA Control Gap' && !row.deletedAt);
assert.ok(xp, 'experience created from typed query');
assert.equal(book.entries.find((row) => row.id === 'e1').experienceId, xp.id);

const selectBtn = [...window.document.querySelectorAll('button')].find((node) => node.textContent === 'Select');
assert.ok(selectBtn, 'Select mode');
selectBtn.click();
await new Promise((resolve) => window.setTimeout(resolve, 30));
const selectAll = window.document.querySelector('.bb-exp-loose-select-all input[type="checkbox"]');
assert.ok(selectAll, 'Select all');
selectAll.click();
await new Promise((resolve) => window.setTimeout(resolve, 30));

const addBtn = [...window.document.querySelectorAll('button')].find((node) => node.textContent.includes('Add to experience'));
addBtn.click();
await new Promise((resolve) => window.setTimeout(resolve, 40));

const bulkSearch = window.document.querySelector('.bb-exp-bulk-menu .bb-exp-picker-search')
  || window.document.querySelector('.bb-exp-bulk-menu input[type="search"]');
assert.ok(bulkSearch, 'bulk search');
bulkSearch.value = 'Bulk Risk Theme';
bulkSearch.dispatchEvent(new window.Event('input', { bubbles: true }));
await new Promise((resolve) => window.setTimeout(resolve, 60));

const bulkCreate = window.document.querySelector('.bb-exp-bulk-menu .bb-exp-picker-create-row');
assert.ok(bulkCreate, 'bulk create row');
bulkCreate.click();
await new Promise((resolve) => window.setTimeout(resolve, 80));

book = JSON.parse(window.localStorage.getItem(STORE_KEY));
xp = book.experiences.find((row) => row.title === 'Bulk Risk Theme' && !row.deletedAt);
assert.ok(xp, 'bulk create from typed query');
const bulkAssigned = book.entries.filter((row) => row.experienceId === xp.id);
assert.ok(bulkAssigned.length >= 1, 'bulk assign at least one loose bullet');
assert.equal(bulkAssigned[0].id, 'e2');

console.log('test-brag-book-experience-picker-create.mjs: ok');
