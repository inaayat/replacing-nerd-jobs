/** Resume bullets STAR panel — collapsed by default, session expand. */
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
import { experienceStarDefaultExpanded } from '../brag-book/book-view.js';

const clock = () => Date.parse('2026-10-20T12:00:00.000Z');

assert.equal(experienceStarDefaultExpanded(), false);

let book = addEntry(emptyStore(), { id: 'en_coll', title: 'Built dashboards' }, clock);
book = addCareerJob(book, {
  id: 'rj_coll',
  company: 'Acme',
  title: 'Analyst',
  onResume: false,
}, clock);
book = updateEntry(book, 'en_coll', {
  jobId: 'rj_coll',
  situation: 'Before expand',
  task: '',
  action: '',
  result: '',
}, clock);

const dom = new JSDOM(`<!doctype html><html><body>
<nav><a id="nav-auth-link"></a><a data-nav="home"></a><a data-nav="jobs"></a><a data-nav="profile"></a><a data-nav="log"></a><a data-nav="kb"></a></nav>
<main id="app"></main><footer class="legal"></footer>
</body></html>`, {
  url: 'http://127.0.0.1/brag-book/?local=1#experiences',
  pretendToBeVisual: true,
});
const { window } = dom;
globalThis.window = window;
globalThis.document = window.document;
globalThis.location = window.location;
globalThis.localStorage = window.localStorage;
globalThis.sessionStorage = window.sessionStorage;
globalThis.HTMLElement = window.HTMLElement;
globalThis.HTMLInputElement = window.HTMLInputElement;
globalThis.HTMLTextAreaElement = window.HTMLTextAreaElement;
globalThis.Node = window.Node;
globalThis.Element = window.Element;
globalThis.getComputedStyle = window.getComputedStyle.bind(window);
globalThis.requestAnimationFrame = (fn) => window.setTimeout(fn, 0);
globalThis.cancelAnimationFrame = (id) => window.clearTimeout(id);
globalThis.confirm = () => false;
window.scrollTo = () => {};
window.open = () => null;
window.localStorage.setItem(STORE_KEY, JSON.stringify(book));

const appSource = readFileSync(new URL('../brag-book/app.js', import.meta.url), 'utf8');
assert.match(appSource, /expandedExperienceStar/);
assert.match(appSource, /aria-expanded/);
assert.doesNotMatch(appSource, /localStorage.*expandedExperienceStar|sessionStorage.*expandedExperienceStar/);

await import(new URL(`../brag-book/app.js?star-collapsed=${Date.now()}`, import.meta.url));
await new Promise((resolve) => window.setTimeout(resolve, 25));

const row = window.document.querySelector('.bb-exp-row[data-entry-id="en_coll"]');
assert.ok(row, 'resume bullet row renders');
assert.equal(row.getAttribute('data-star'), 'hidden');
const toggle = row.querySelector('.bb-exp-star-toggle');
assert.ok(toggle, 'STAR toggle renders');
assert.equal(toggle.getAttribute('aria-expanded'), 'false');
const panel = row.querySelector('.bb-exp-star-panel');
assert.ok(panel?.hasAttribute('hidden'), 'STAR panel hidden by default');

toggle.click();
await new Promise((resolve) => window.setTimeout(resolve, 25));

const rowAfter = window.document.querySelector('.bb-exp-row[data-entry-id="en_coll"]');
const toggleAfter = rowAfter.querySelector('.bb-exp-star-toggle');
const panelAfter = rowAfter.querySelector('.bb-exp-star-panel');
assert.equal(toggleAfter.getAttribute('aria-expanded'), 'true');
assert.equal(panelAfter.hasAttribute('hidden'), false);
assert.equal(rowAfter.getAttribute('data-star'), 'always');
assert.equal(window.document.querySelectorAll('[aria-label="Situation"]').length, 1);
assert.match(appSource, /toggleExperienceStar[\s\S]*captureScroll\(\)[\s\S]*render\(\)[\s\S]*restoreScroll\(scroll\)/);

const situation = window.document.querySelector('[data-focus-key="exp-situation-en_coll"]');
assert.ok(situation);
situation.value = 'Typed before collapse';
situation.dispatchEvent(new window.Event('input', { bubbles: true }));
toggleAfter.click();
await new Promise((resolve) => window.setTimeout(resolve, 25));

const stored = JSON.parse(window.localStorage.getItem(STORE_KEY));
const entry = stored.entries.find((item) => item.id === 'en_coll');
assert.equal(entry.situation, 'Typed before collapse', 'collapse flushes STAR edits');

console.log('test-brag-book-star-collapsed.mjs: ok');
