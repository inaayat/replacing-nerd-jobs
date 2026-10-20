/** Resume bullets concise layout — grouped roles, inline actions, job in Details. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import {
  STORE_KEY,
  addCareerJob,
  addEntry,
  emptyStore,
  updateEntry,
} from '../brag-book/engine.js';
import {
  experienceGroupDefaultExpanded,
  experiencePanelDefaultExpanded,
} from '../brag-book/book-view.js';

const clock = () => Date.parse('2026-10-20T16:00:00.000Z');

assert.equal(experienceGroupDefaultExpanded(), true);
assert.equal(experiencePanelDefaultExpanded(), false);

let book = addCareerJob(emptyStore(), {
  id: 'rj_c',
  company: 'GoDaddy',
  title: 'Manager',
  start: 'June 2025',
  end: 'Present',
  onResume: false,
}, clock);
book = addEntry(book, { id: 'en_c', title: 'AI governance bullet' }, clock);
book = updateEntry(book, 'en_c', { jobId: 'rj_c' }, clock);

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
  confirm: () => false,
});
window.scrollTo = () => {};
window.open = () => null;
window.localStorage.setItem(STORE_KEY, JSON.stringify(book));

const appSource = readFileSync(new URL('../brag-book/app.js', import.meta.url), 'utf8');
assert.match(appSource, /row-text-action bb-exp-action/);
assert.doesNotMatch(
  appSource.slice(appSource.indexOf('function experienceRow'), appSource.indexOf('function experienceGroupHeader')),
  /bb-exp-jobrole/,
);
assert.match(appSource, /collapsedExperienceGroups/);
assert.match(appSource, /flushExperienceGroupEntries/);

await import(new URL(`../brag-book/app.js?exp-concise=${Date.now()}`, import.meta.url));
await new Promise((resolve) => window.setTimeout(resolve, 30));

const row = window.document.querySelector('.bb-exp-row[data-entry-id="en_c"]');
assert.ok(row);
assert.equal(row.querySelector('.bb-exp-jobrole'), null, 'no job dropdown on card face');
assert.ok(row.querySelector('.bb-exp-actions .bb-exp-action-details'));
assert.equal(window.document.querySelector('.bb-exp-group-toggle')?.getAttribute('aria-expanded'), 'true');
assert.equal(window.document.querySelector('.bb-exp-group-body') != null, true);

const detailsBtn = row.querySelector('.bb-exp-action-details');
detailsBtn.click();
await new Promise((resolve) => window.setTimeout(resolve, 25));
assert.equal(window.document.querySelector(`[data-focus-key="exp-jobId-en_c"]`) != null, true);

window.document.querySelector('.bb-exp-group-toggle').click();
await new Promise((resolve) => window.setTimeout(resolve, 25));
const groupToggleAfter = window.document.querySelector('.bb-exp-group-toggle');
assert.equal(groupToggleAfter.getAttribute('aria-expanded'), 'false');
assert.equal(window.document.querySelector('.bb-exp-group-body'), null);

console.log('test-brag-book-exp-concise.mjs: ok');
