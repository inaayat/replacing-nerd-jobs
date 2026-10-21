/** Posting requirement: hide empty loose group; show when loose bullets mapped. */
import assert from 'node:assert/strict';
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
} from '../brag-book/engine.js';
import {
  postingMapShowsLooseGroup,
} from '../brag-book/posting-requirement-mapping.js';

const clock = () => Date.parse('2026-10-21T20:30:00.000Z');

let store = addCareerJob(emptyStore(), {
  id: 'j1',
  company: 'GoDaddy',
  title: 'Manager',
  onResume: false,
}, clock);
store = addEntry(store, { id: 'e1', title: 'Version one', jobId: 'j1' }, clock);
store = groupEntriesAsExperience(store, ['e1'], { jobId: 'j1', title: 'Jira Build-Out' }, clock).store;
const xpId = store.experiences[0].id;
store = addPosting(store, { title: 'Manager', company: 'GoDaddy' }, clock);
const postingId = store.postings[0].id;
store = addRequirement(store, postingId, 'Req A', clock);
const reqA = store.postings[0].requirements[0].id;
store = addRequirement(store, postingId, 'Req B', clock);
const reqB = store.postings[0].requirements[1].id;
store = addExperienceCoverage(store, postingId, reqA, xpId, clock);
store = addEntry(store, { id: 'loose1', title: 'Loose bullet line', jobId: 'j1' }, clock);
store = addEntryBullet(store, postingId, reqB, 'loose1', '', clock);

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

const posting = store.postings[0];
assert.equal(postingMapShowsLooseGroup(store, posting.requirements[0]), false);
assert.equal(postingMapShowsLooseGroup(store, posting.requirements[1]), true);

await import(new URL(`../brag-book/app.js?map-loose-group=${Date.now()}`, import.meta.url));
await new Promise((resolve) => window.setTimeout(resolve, 120));

const stacks = [...window.document.querySelectorAll('.bb-post-map-stack')];
assert.ok(stacks.length >= 2, 'two requirement stacks');

const reqAStack = stacks.find((node) => node.querySelector(`[data-experience-id="${xpId}"]`));
assert.ok(reqAStack, 'req A has experience bucket');
assert.equal(reqAStack.querySelector('.bb-post-map-loose-group'), null,
  'experience-only requirement has no loose group');

const reqBStack = stacks.find((node) => node.querySelector('.bb-post-map-loose-group'));
assert.ok(reqBStack, 'req B shows loose group');
assert.match(reqBStack.querySelector('.bb-post-map-loose-label')?.textContent || '', /No experience/);

console.log('test-brag-book-posting-map-loose-group.mjs: ok');
