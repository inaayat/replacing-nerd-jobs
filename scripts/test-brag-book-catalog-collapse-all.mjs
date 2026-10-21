/** Resume bullets catalog: Collapse all / Expand all toolbar + session + chevrons. */
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
  catalogSectionsAllCollapsed,
  libraryCollapsibleSectionKeys,
  CATALOG_COLLAPSED_SECTIONS_KEY,
} from '../brag-book/experiences-ui.js';

const app = readFileSync(new URL('../brag-book/app.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../brag-book/app.css', import.meta.url), 'utf8');
assert.match(app, /bb-exp-catalog-collapse-all/);
assert.match(app, /setAllCatalogSectionsCollapsed/);
assert.match(css, /\.bb-chevron[\s\S]*transform: rotate\(-45deg\)/);

const clock = () => Date.parse('2026-10-21T16:00:00.000Z');
let store = addCareerJob(emptyStore(), {
  id: 'j1',
  company: 'GoDaddy',
  title: 'Manager',
  onResume: true,
}, clock);
store = addEntry(store, { id: 'e1', title: 'Grouped bullet', jobId: 'j1' }, clock);
store = addEntry(store, { id: 'loose1', title: 'Loose bullet', jobId: 'j1' }, clock);
store = groupEntriesAsExperience(store, ['e1'], { jobId: 'j1', title: 'Risk launch' }, clock).store;

const keys = libraryCollapsibleSectionKeys(store);
assert.ok(keys.length >= 2, 'experience + loose section keys');

const dom = new JSDOM(`<!doctype html><html><body>
<nav><a id="nav-auth-link"></a><a data-nav="experiences"></a></nav>
<main id="app"></main>
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

await import(new URL(`../brag-book/app.js?collapse-all=${Date.now()}`, import.meta.url));
await new Promise((resolve) => window.setTimeout(resolve, 100));

const collapseBtn = window.document.querySelector('.bb-exp-catalog-collapse-all');
assert.ok(collapseBtn, 'collapse all control in toolbar');
assert.match(collapseBtn.textContent, /Collapse all/i);

const scrollTopBefore = window.document.querySelector('.bb-book-catalog')?.scrollTop ?? 0;
collapseBtn.click();
await new Promise((resolve) => window.setTimeout(resolve, 80));

const collapsedBodies = window.document.querySelectorAll('.bb-exp-section-body');
assert.equal(collapsedBodies.length, 0, 'section bodies hidden when collapsed');
assert.match(window.document.querySelector('.bb-exp-catalog-collapse-all').textContent, /Expand all/i);

const saved = JSON.parse(window.sessionStorage.getItem(CATALOG_COLLAPSED_SECTIONS_KEY) || '[]');
assert.ok(saved.length >= keys.length, 'session remembers collapsed section keys');

const expandBtn = window.document.querySelector('.bb-exp-catalog-collapse-all');
expandBtn.click();
await new Promise((resolve) => window.setTimeout(resolve, 80));
assert.ok(window.document.querySelector('.bb-exp-section-body'), 'sections expand again');

assert.ok(window.document.querySelector('.bb-chevron.bb-exp-section-chevron'), 'unified chevron markup');

console.log('test-brag-book-catalog-collapse-all.mjs: ok');
