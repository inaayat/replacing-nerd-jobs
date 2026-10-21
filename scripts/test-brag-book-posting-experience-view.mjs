/** By-experience posting view: grouping, coverage counts, toggle + DOM shell. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import {
  STORE_KEY,
  addCareerJob,
  addEntry,
  addPosting,
  addRequirement,
  addExperienceCoverage,
  createExperience,
  emptyStore,
} from '../brag-book/engine.js';
import {
  postingExperienceViewGroups,
  requirementOrdinalsForPosting,
  requirementHasMapping,
  requirementShortLabel,
  mapEntryToRequirement,
} from '../brag-book/posting-requirement-mapping.js';

const css = readFileSync(new URL('../brag-book/app.css', import.meta.url), 'utf8');
assert.match(css, /\.bb-posting-view-toggle/);
assert.match(css, /\.bb-post-xp-card/);
assert.match(css, /\.bb-seg-btn\.is-on/);

const clock = () => Date.parse('2026-10-21T22:00:00.000Z');

let store = addCareerJob(emptyStore(), {
  id: 'j1',
  company: 'GoDaddy',
  title: 'Manager',
  onResume: false,
}, clock);
const xp = createExperience(store, { jobId: 'j1', title: 'Risk program' });
store = xp.store;
const xpId = xp.changedExperienceIds[0];
store = addEntry(store, { id: 'e1', title: 'Built a risk program', jobId: 'j1', experienceId: xpId }, clock);
store = addEntry(store, { id: 'e2', title: 'Loose mapped line', jobId: 'j1' }, clock);
store = addPosting(store, { title: 'Manager', company: 'GoDaddy' }, clock);
const posting = store.postings[0];
store = addRequirement(store, posting.id, 'Lead cross-functional programs', clock);
store = addRequirement(store, posting.id, 'Automate evidence collection', clock);
const [req1, req2] = store.postings[0].requirements;

store = mapEntryToRequirement(store, posting.id, req1.id, 'e1');
store = addExperienceCoverage(store, posting.id, req2.id, xpId);
store = mapEntryToRequirement(store, posting.id, req2.id, 'e2');

const { experienceGroups, looseRows } = postingExperienceViewGroups(store, store.postings[0]);
assert.equal(experienceGroups.length, 1);
assert.equal(experienceGroups[0].experienceId, xpId);
assert.equal(experienceGroups[0].coversCount, 2);
assert.deepEqual(
  experienceGroups[0].requirements.map((row) => row.ordinal),
  ['R1', 'R2'],
);
assert.equal(looseRows.length, 1);
assert.equal(looseRows[0].entry.id, 'e2');

const ordinals = requirementOrdinalsForPosting(store.postings[0]);
assert.equal(ordinals.get(req1.id).ordinal, 'R1');
assert.equal(ordinals.get(req2.id).ordinal, 'R2');
const liveReq1 = store.postings[0].requirements.find((r) => r.id === req1.id);
assert.equal(requirementHasMapping(liveReq1), true);
assert.equal(requirementHasMapping({ bullets: [], coveredExperienceIds: [] }), false);
assert.match(requirementShortLabel('A'.repeat(80)), /…$/);

const dom = new JSDOM(`<!doctype html><html><body><main id="app"></main></body></html>`, {
  url: `http://127.0.0.1/brag-book/?local=1&experiences=1#jobs/${posting.id}`,
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
window.sessionStorage.setItem(`bb-posting-req-view:${posting.id}`, 'experience');

await import(new URL(`../brag-book/app.js?xp-view=${Date.now()}`, import.meta.url));
await new Promise((resolve) => window.setTimeout(resolve, 120));

const toggle = window.document.querySelector('.bb-posting-view-toggle');
assert.ok(toggle, 'segmented toggle');
assert.ok(toggle.querySelector('.bb-seg-btn.is-on'), 'active segment');
const card = window.document.querySelector('.bb-post-xp-card[data-experience-id]');
assert.ok(card, 'experience card');
assert.match(card.textContent, /Covers 2 requirements/);
assert.ok(card.querySelector('.bb-post-xp-req-link'), 'requirement jump link');
const looseCard = window.document.querySelector('.bb-post-xp-card-loose');
assert.ok(looseCard, 'No experience card when loose bullets exist');

console.log('test-brag-book-posting-experience-view.mjs: ok');
