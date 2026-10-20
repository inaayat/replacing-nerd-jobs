/** Posting requirement mapping: grouped search, buckets, nest, collapse UI. */
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
  normalizeStore,
} from '../brag-book/engine.js';
import {
  mapEntryToRequirement,
  mapExperienceBucketToRequirement,
  requirementMappingBuckets,
  searchPostingMapTargets,
} from '../brag-book/posting-requirement-mapping.js';

const clock = () => Date.parse('2026-10-20T20:00:00.000Z');

let store = addCareerJob(emptyStore(), {
  id: 'j1',
  company: 'GoDaddy',
  title: 'Manager',
  start: '2025',
  end: 'Present',
  onResume: false,
}, clock);
store = addEntry(store, { id: 'e1', title: 'Alpha version', jobId: 'j1' }, clock);
store = addEntry(store, { id: 'e2', title: 'Beta version', jobId: 'j1' }, clock);
store = addEntry(store, { id: 'e3', title: 'Gamma version', jobId: 'j1' }, clock);
store = addEntry(store, { id: 'loose', title: 'Loose only', jobId: 'j1' }, clock);
store = groupEntriesAsExperience(store, ['e1', 'e2', 'e3'], { jobId: 'j1', title: 'Risk launch' }, clock).store;
const xpId = store.experiences[0].id;

store = addPosting(store, { title: 'Target role', company: 'Co' }, clock);
const postingId = store.postings[0].id;
store = addRequirement(store, postingId, 'Lead programs', clock);
const reqId = store.postings[0].requirements[0].id;

const search = searchPostingMapTargets(store, 'risk');
assert.ok(search.experiences.some((row) => row.experienceId === xpId));
assert.ok(searchPostingMapTargets(store, 'loose').bullets.some((row) => row.entryId === 'loose'));

store = mapExperienceBucketToRequirement(store, postingId, reqId, xpId, clock);
let req = store.postings[0].requirements[0];
assert.ok(req.coveredExperienceIds.includes(xpId));
assert.equal(req.bullets.length, 0);

store = mapEntryToRequirement(store, postingId, reqId, 'e2', clock);
req = store.postings[0].requirements[0];
assert.equal(req.bullets.filter((line) => line.entryId === 'e2').length, 1);

const buckets = requirementMappingBuckets(store, req);
assert.equal(buckets.experienceBuckets.length, 1);
assert.equal(buckets.experienceBuckets[0].selectedCount, 1);
assert.equal(buckets.experienceBuckets[0].totalVersions, 3);

store = addEntryBullet(store, postingId, reqId, 'loose', '', clock);
req = store.postings[0].requirements[0];
const grouped = requirementMappingBuckets(store, req);
assert.equal(grouped.otherBullets.length, 1);
assert.equal(grouped.experienceBuckets[0].lines.length, 1);

const appSource = readFileSync(new URL('../brag-book/app.js', import.meta.url), 'utf8');
const uiSource = readFileSync(new URL('../brag-book/posting-requirement-mapping-ui.js', import.meta.url), 'utf8');
assert.match(appSource, /buildRequirementMappingStack/);
assert.match(uiSource, /No experience/);

let domStore = addCareerJob(emptyStore(), {
  id: 'j1',
  company: 'GoDaddy',
  title: 'Manager',
  start: '2025',
  end: 'Present',
  onResume: false,
}, clock);
domStore = addEntry(domStore, { id: 'e1', title: 'Alpha version', jobId: 'j1' }, clock);
domStore = addEntry(domStore, { id: 'e2', title: 'Beta version', jobId: 'j1' }, clock);
domStore = addEntry(domStore, { id: 'e3', title: 'Gamma version', jobId: 'j1' }, clock);
domStore = groupEntriesAsExperience(domStore, ['e1', 'e2', 'e3'], { jobId: 'j1', title: 'Risk launch' }, clock).store;
domStore = addPosting(domStore, { title: 'Target role', company: 'Co' }, clock);
const domPostingId = domStore.postings[0].id;
domStore = addRequirement(domStore, domPostingId, 'Lead programs', clock);
const domReqId = domStore.postings[0].requirements[0].id;
domStore = addEntryBullet(domStore, domPostingId, domReqId, 'e1', '', clock);
domStore = addExperienceCoverage(domStore, domPostingId, domReqId, xpId, clock);
domStore = normalizeStore(domStore, clock);
store = domStore;
const postingIdForDom = domPostingId;

const dom = new JSDOM(`<!doctype html><html><body>
<nav><a id="nav-auth-link"></a><a data-nav="jobs"></a></nav>
<main id="app"></main><footer class="legal"></footer>
</body></html>`, {
  url: `http://127.0.0.1/brag-book/?local=1&experiences=1#jobs/${postingIdForDom}`,
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

await import(new URL(`../brag-book/app.js?post-req-map=${Date.now()}`, import.meta.url));
await new Promise((resolve) => window.setTimeout(resolve, 80));

const bucket = window.document.querySelector('.bb-post-map-bucket.is-collapsed[data-selected-count="1"]');
assert.ok(bucket, 'collapsed bucket with one selected version');
assert.equal(bucket.querySelectorAll('.bb-post-map-bucket-included .bb-post-map-bullet').length, 1,
  'collapsed bucket shows only included bullets');
assert.equal(bucket.querySelector('.bb-post-map-bucket-versions'), null,
  'collapsed bucket hides version checklist');

const compactHead = bucket.querySelector('.bb-post-map-bucket-head.has-selected');
assert.ok(compactHead, 'compact muted header when bullets are included');
assert.match(compactHead.textContent, /Risk launch/);
assert.match(compactHead.textContent, /1 of 3/);

const toggle = bucket.querySelector('.bb-post-map-bucket-head');
toggle.click();
await new Promise((resolve) => window.setTimeout(resolve, 30));

const expanded = window.document.querySelector('.bb-post-map-bucket.is-expanded');
assert.ok(expanded, 'bucket expands on header click');
assert.equal(expanded.querySelectorAll('.bb-post-map-version input[type="checkbox"]').length, 3);

console.log('test-brag-book-posting-requirement-mapping.mjs: ok');
