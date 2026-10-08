/**
 * INTENTIONALLY FAILING — bug-bash phase 4.
 *
 * Run after containing the Resume bullets STAR grid:
 *   node scripts/test-brag-book-bugbash-star-layout.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import {
  STORE_KEY,
  addCareerJob,
  addEntry,
  emptyStore,
  entryById,
  normalizeStore,
  serializeBook,
  updateEntry,
} from '../brag-book/engine.js';

const clock = () => Date.parse('2026-10-08T12:00:00.000Z');
const exactStar = {
  situation: 'Our three teams, Internal Audit, SOX, and ERM, tracked work across multiple Jira instances.',
  task: 'Nobody asked me to build this.',
  action: 'I connected to Jira through its API and built a live dashboard.',
  result: 'It replaced the manual trackers.',
};

let book = addEntry(emptyStore(), { id: 'en-star', title: 'Built the dashboard' }, clock);
book = updateEntry(book, 'en-star', exactStar, clock);
const reloaded = normalizeStore(JSON.parse(serializeBook(book).json), clock);
const entry = entryById(reloaded, 'en-star');
for (const [key, value] of Object.entries(exactStar)) {
  assert.equal(entry[key], value, `${key} data must keep its first and last characters`);
}

// The screenshot's missing characters recur only at the left edge of the
// right-hand grid, including the labels. That is paint overflow, not the JSON
// mutation above. Pin the containment rules that prevent the left editor or a
// content-sized textarea from painting across that boundary.
const css = readFileSync(new URL('../brag-book/app.css', import.meta.url), 'utf8');
const leadRule = css.match(/\.bb-exp-lead\s*\{[^}]*\}/)?.[0] || '';
const starGridRule = css.match(/\.bb-exp-stargrid\s*\{[^}]*\}/)?.[0] || '';
const areaRule = css.match(/\.bb-inline-area\s*\{[^}]*\}/)?.[0] || '';
const leadEditorRule = css.match(/\.bb-exp-lead \.experience-compose\s*\{[^}]*\}/)?.[0] || '';
const jobTitleRule = css.match(/\.bb-job-title\s*\{[^}]*\}/)?.[0] || '';

assert.doesNotMatch(leadRule, /overflow:\s*(?:clip|hidden)/, 'the lead editor content must not be clipped');
assert.match(leadEditorRule, /max-width:\s*100%/);
assert.match(leadEditorRule, /white-space:\s*pre-wrap/);
assert.match(leadEditorRule, /overflow-wrap:\s*anywhere/);
assert.match(starGridRule, /isolation:\s*isolate/, 'the STAR grid must own an isolated paint layer');
assert.match(areaRule, /min-width:\s*0/);
assert.match(areaRule, /max-width:\s*100%/);
assert.doesNotMatch(areaRule, /field-sizing:\s*content/, 'content sizing must not widen STAR textareas');
assert.match(jobTitleRule, /white-space:\s*pre-wrap/);
assert.match(jobTitleRule, /overflow-wrap:\s*anywhere/);

const longBullet = 'AI Decision Framework: Built a framework to help 25+ non-technical colleagues choose between automated and agentic solutions and pick the right approach';
const longTitle = 'Senior Associate | Data Analytics & Technology Consulting';
let layoutBook = addEntry(emptyStore(), { id: 'en-long', title: longBullet }, clock);
layoutBook = addCareerJob(layoutBook, {
  id: 'rj-long',
  company: 'PwC',
  title: longTitle,
  onResume: false,
}, clock);
const dom = new JSDOM(`<!doctype html><html><body>
  <nav><a id="nav-auth-link"></a><a data-nav="home"></a><a data-nav="jobs"></a><a data-nav="profile"></a><a data-nav="log"></a><a data-nav="kb"></a></nav>
  <main id="app"></main><footer class="legal"></footer>
</body></html>`, {
  url: 'http://127.0.0.1/brag-book/?local=1#experiences',
  pretendToBeVisual: true,
});
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.location = dom.window.location;
globalThis.localStorage = dom.window.localStorage;
globalThis.sessionStorage = dom.window.sessionStorage;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.HTMLInputElement = dom.window.HTMLInputElement;
globalThis.HTMLTextAreaElement = dom.window.HTMLTextAreaElement;
globalThis.Node = dom.window.Node;
globalThis.NodeFilter = dom.window.NodeFilter;
globalThis.Element = dom.window.Element;
globalThis.requestAnimationFrame = (fn) => dom.window.setTimeout(() => fn(Date.now()), 0);
globalThis.cancelAnimationFrame = (id) => dom.window.clearTimeout(id);
globalThis.confirm = () => false;
dom.window.scrollTo = () => {};
dom.window.open = () => null;
dom.window.localStorage.setItem(STORE_KEY, JSON.stringify(layoutBook));
await import(new URL(`../brag-book/app.js?layout=${Date.now()}`, import.meta.url));
await new Promise((resolve) => setTimeout(resolve, 20));
const leadEditor = dom.window.document.querySelector('[aria-label="Resume line"]');
assert.equal(leadEditor?.textContent, longBullet, 'the real lead editor DOM must contain the complete bullet');
const titleEditor = dom.window.document.querySelector('[aria-label="Job title"]');
assert.equal(titleEditor?.tagName, 'TEXTAREA', 'long job titles need a wrapping editor');
assert.equal(titleEditor?.value, longTitle, 'the real Jobs editor DOM must contain the complete title');

console.log('Brag Book STAR-layout bug-bash regression passed.');
