/** Experiences side panel: loose bullets section (model + DOM). */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import {
  STORE_KEY,
  addCareerJob,
  addEntry,
  addEntryBullet,
  addPosting,
  addRequirement,
  emptyStore,
  groupEntriesAsExperience,
} from '../brag-book/engine.js';
import {
  compactLooseBulletPanelGroups,
  postingPrimaryCatalogJobId,
  readPanelLooseSectionOpen,
  writePanelLooseSectionOpen,
} from '../brag-book/experiences-index.js';

const clock = () => Date.parse('2026-10-21T12:00:00.000Z');

const sessionBacking = new Map();
globalThis.sessionStorage = {
  getItem: (key) => (sessionBacking.has(key) ? sessionBacking.get(key) : null),
  setItem: (key, value) => { sessionBacking.set(key, String(value)); },
  removeItem: (key) => { sessionBacking.delete(key); },
};

let store = addCareerJob(emptyStore(), {
  id: 'j1',
  company: 'GoDaddy',
  title: 'Manager',
  start: '2025',
  end: 'Present',
  onResume: false,
}, clock);
store = addCareerJob(store, {
  id: 'j2',
  company: 'PwC',
  title: 'Senior',
  start: '2020',
  end: '2024',
  onResume: false,
}, clock);
store = addEntry(store, { id: 'e1', title: 'Grouped bullet', jobId: 'j1' }, clock);
store = addEntry(store, { id: 'loose1', title: 'Loose posting job bullet', jobId: 'j1' }, clock);
store = addEntry(store, { id: 'loose2', title: 'Other job loose', jobId: 'j2' }, clock);
store = groupEntriesAsExperience(store, ['e1'], { jobId: 'j1', title: 'Grouped xp' }, clock).store;

store = addPosting(store, { id: 'post1', title: 'Manager', company: 'GoDaddy' }, clock);
const posting = store.postings[0];
assert.equal(postingPrimaryCatalogJobId(store, posting), 'j1');

store = addRequirement(store, 'post1', 'Lead', clock);
const reqId = store.postings.find((row) => row.id === 'post1').requirements[0].id;
store = addEntryBullet(store, 'post1', reqId, 'loose1', '', clock);

const postingLive = store.postings.find((row) => row.id === 'post1');
const grouped = compactLooseBulletPanelGroups(store, { posting: postingLive, primaryJobId: 'j1' });
assert.equal(grouped.totalCount, 2);
assert.equal(grouped.groups[0].jobId, 'j1');
assert.equal(grouped.groups[0].rows.some((row) => row.entryId === 'loose1'), true);
assert.match(grouped.groups[0].rows.find((row) => row.entryId === 'loose1').postingFact, /1 mapped/);

writePanelLooseSectionOpen('posting:post1', false);
assert.equal(readPanelLooseSectionOpen('posting:post1', { count: 9 }), false);
assert.equal(readPanelLooseSectionOpen('posting:post1', { count: 3 }), false);
assert.equal(readPanelLooseSectionOpen('posting:other', { count: 3 }), true);

const panelSource = readFileSync(new URL('../brag-book/experiences-panel.js', import.meta.url), 'utf8');
assert.match(panelSource, /No experience/);
assert.match(panelSource, /bb-exp-panel-loose-section/);

const dom = new JSDOM(`<!doctype html><html><body>
<nav><a id="nav-auth-link"></a><a data-nav="jobs"></a></nav>
<main id="app"></main>
</body></html>`, {
  url: 'http://127.0.0.1/brag-book/?local=1&experiences=1#jobs/post1',
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

await import(new URL(`../brag-book/app.js?panel-loose=${Date.now()}`, import.meta.url));
await new Promise((resolve) => window.setTimeout(resolve, 100));

const looseHead = window.document.querySelector('.bb-exp-panel-loose-head');
assert.ok(looseHead, 'loose section header');
assert.match(looseHead.textContent, /No experience/);
assert.match(looseHead.textContent, /2/);

const looseRows = window.document.querySelectorAll('.bb-exp-loose-row');
assert.equal(looseRows.length, 2);
assert.ok(window.document.querySelector('.bb-exp-panel-loose-actions .bb-exp-picker-chip'), 'Experience picker on loose row');
assert.ok(window.document.querySelector('.bb-exp-panel-loose-actions .compact-action'), '+ Map or add control');

console.log('test-brag-book-experiences-panel-loose.mjs: ok');
