/** Mapped requirement rows get is-requirement-mapped on both table columns. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import {
  STORE_KEY,
  addCareerJob,
  addEntry,
  addPosting,
  addRequirement,
  createExperience,
  emptyStore,
} from '../brag-book/engine.js';
import {
  mapEntryToRequirement,
  requirementHasMapping,
} from '../brag-book/posting-requirement-mapping.js';

const css = readFileSync(new URL('../brag-book/app.css', import.meta.url), 'utf8');
assert.match(css, /\.job-table-row\.is-requirement-mapped/);
assert.match(css, /rgba\(122,\s*148,\s*118/);

const clock = () => Date.parse('2026-10-21T22:30:00.000Z');
let store = addCareerJob(emptyStore(), {
  id: 'j1',
  company: 'GoDaddy',
  title: 'Manager',
  onResume: false,
}, clock);
const xp = createExperience(store, { jobId: 'j1', title: 'Program' });
store = xp.store;
store = addEntry(store, { id: 'e1', title: 'Did the thing', jobId: 'j1', experienceId: xp.changedExperienceIds[0] }, clock);
store = addPosting(store, { title: 'Role', company: 'GoDaddy' }, clock);
const postingId = store.postings[0].id;
store = addRequirement(store, postingId, 'Mapped requirement', clock);
store = addRequirement(store, postingId, 'Empty requirement', clock);
const [mappedReq, emptyReq] = store.postings[0].requirements;
store = mapEntryToRequirement(store, postingId, mappedReq.id, 'e1');

const liveMapped = store.postings[0].requirements.find((r) => r.id === mappedReq.id);
const liveEmpty = store.postings[0].requirements.find((r) => r.id === emptyReq.id);
assert.equal(requirementHasMapping(liveMapped), true);
assert.equal(requirementHasMapping(liveEmpty), false);

const dom = new JSDOM(`<!doctype html><html><body><main id="app"></main></body></html>`, {
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
  Node: window.Node,
  Element: window.Element,
  getComputedStyle: window.getComputedStyle.bind(window),
  requestAnimationFrame: (fn) => window.setTimeout(fn, 0),
});
window.scrollTo = () => {};
window.localStorage.setItem(STORE_KEY, JSON.stringify(store));
window.sessionStorage.setItem(`bb-posting-req-view:${postingId}`, 'requirement');

await import(new URL(`../brag-book/app.js?row-shade=${Date.now()}`, import.meta.url));
await new Promise((resolve) => window.setTimeout(resolve, 120));

const mappedRow = window.document.querySelector(`tr[data-requirement-id="${mappedReq.id}"]`);
const emptyRow = window.document.querySelector(`tr[data-requirement-id="${emptyReq.id}"]`);
assert.ok(mappedRow?.classList.contains('is-requirement-mapped'), 'mapped row shaded');
assert.equal(mappedRow?.getAttribute('data-requirement-mapped'), 'true');
assert.ok(!emptyRow?.classList.contains('is-requirement-mapped'), 'unmapped row plain');
assert.equal(emptyRow?.getAttribute('data-requirement-mapped'), 'false');
assert.ok(mappedRow.querySelector('.requirement-cell'), 'requirement cell present');
assert.ok(mappedRow.querySelector('.bullets-cell'), 'experiences cell present');

console.log('test-brag-book-posting-requirement-row-shading.mjs: ok');
