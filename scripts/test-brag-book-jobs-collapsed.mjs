/** Jobs catalog on Resume bullets — collapsed by default, session expand. */
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
import { jobsCatalogDefaultExpanded } from '../brag-book/book-view.js';

const clock = () => Date.parse('2026-10-20T14:00:00.000Z');

assert.equal(jobsCatalogDefaultExpanded(), false);

let book = addCareerJob(emptyStore(), {
  id: 'rj_jobs',
  company: 'Acme',
  title: 'Analyst',
  onResume: false,
}, clock);
book = addEntry(book, { id: 'en_jobs', title: 'Bullet' }, clock);
book = updateEntry(book, 'en_jobs', { jobId: 'rj_jobs' }, clock);

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
assert.match(appSource, /jobsCatalogExpanded/);
assert.doesNotMatch(appSource, /localStorage.*jobsCatalogExpanded|sessionStorage.*jobsCatalogExpanded/);
assert.match(appSource, /toggleJobsCatalog[\s\S]*captureScroll\(\)[\s\S]*restoreScroll\(scroll\)/);

await import(new URL(`../brag-book/app.js?jobs-collapsed=${Date.now()}`, import.meta.url));
await new Promise((resolve) => window.setTimeout(resolve, 25));

const toggle = window.document.querySelector('.bb-jobs-catalog-toggle');
const body = window.document.getElementById('bb-jobs-catalog-body');
assert.ok(toggle, 'Jobs toggle renders');
assert.ok(body, 'Jobs body panel renders');
assert.equal(toggle.getAttribute('aria-expanded'), 'false');
assert.equal(body.hasAttribute('hidden'), true);
assert.equal(toggle.querySelector('.bb-jobs-catalog-count')?.textContent, '1');
assert.equal(body.querySelectorAll('.bb-job-catalog-row').length, 1, 'job rows stay in collapsed panel');

const newBtn = [...window.document.querySelectorAll('button')].find((node) => node.textContent.includes('+ New job'));
assert.ok(newBtn);
newBtn.click();
await new Promise((resolve) => window.setTimeout(resolve, 25));

assert.equal(window.document.querySelector('.bb-jobs-catalog-toggle')?.getAttribute('aria-expanded'), 'true');
assert.equal(window.document.getElementById('bb-jobs-catalog-body')?.hasAttribute('hidden'), false);
assert.equal(window.document.querySelectorAll('.bb-job-catalog-row').length, 2);

console.log('test-brag-book-jobs-collapsed.mjs: ok');
