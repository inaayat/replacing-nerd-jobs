/**
 * INTENTIONALLY FAILING — bug-bash phase 4.
 *
 * Run after containing the Resume bullets STAR grid:
 *   node scripts/test-brag-book-bugbash-star-layout.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { STAR_FIELDS } from '../brag-book/book-view.js';
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
const listRule = css.match(/\.bb-exp-list\s*\{[^}]*\}/)?.[0] || '';
const rowRule = css.match(/\.bb-exp-row\s*\{[^}]*\}/)?.[0] || '';
const leadRule = css.match(/\.bb-exp-lead\s*\{[^}]*\}/)?.[0] || '';
const starGridRule = css.match(/\.bb-exp-stargrid\s*\{[^}]*\}/)?.[0] || '';
const starLabelRule = css.match(/\.bb-star-cell > span\s*\{[^}]*\}/)?.[0] || '';
const sharedStarRule = css.match(/\.experience-star\s*\{[^}]*\}/)?.[0] || '';
const sharedStarLabelRule = css.match(/\.experience-star label\s*\{[^}]*\}/)?.[0] || '';
const sharedStarAreaRule = css.match(/\.experience-star textarea\s*\{[^}]*\}/)?.[0] || '';
const questionStarRule = css.match(/\.table-question-star\s*\{[^}]*\}/)?.[0] || '';
const detailStarRule = css.match(/\.detail-star\s*\{[^}]*\}/)?.[0] || '';
const areaRule = css.match(/\.bb-inline-area\s*\{[^}]*\}/)?.[0] || '';
const leadEditorRule = css.match(/\.bb-exp-lead \.experience-compose\s*\{[^}]*\}/)?.[0] || '';
const jobRowRule = css.match(/\.bb-job-catalog-row\s*\{[^}]*\}/)?.[0] || '';
const jobFieldRule = css.match(
  /\.bb-job-field > input,\s*\.bb-job-field > textarea,\s*\.bb-new-job > input\s*\{[^}]*\}/,
)?.[0] || '';
const jobTitleRule = css.match(/\.bb-job-title\s*\{[^}]*\}/)?.[0] || '';

assert.match(listRule, /gap:\s*12px/, 'bullet cards need a consistent gutter');
assert.match(rowRule, /min-width:\s*0/);
assert.match(rowRule, /border:\s*1px solid var\(--line-strong\)/);
assert.match(rowRule, /border-radius:\s*10px/);
assert.doesNotMatch(rowRule, /overflow:\s*(?:clip|hidden)/, 'the bullet card must not clip either column');
assert.doesNotMatch(leadRule, /overflow:\s*(?:clip|hidden)/, 'the lead editor content must not be clipped');
assert.match(leadEditorRule, /max-width:\s*100%/);
assert.match(leadEditorRule, /font-size:\s*16px/);
assert.match(leadEditorRule, /font-weight:\s*550/);
assert.match(leadEditorRule, /line-height:\s*1\.55/);
assert.match(leadEditorRule, /white-space:\s*pre-wrap/);
assert.match(leadEditorRule, /overflow-wrap:\s*anywhere/);
assert.match(starGridRule, /isolation:\s*isolate/, 'the STAR grid must own an isolated paint layer');
assert.match(starGridRule, /grid-template-columns:\s*minmax\(0,\s*1fr\)/);
assert.doesNotMatch(starGridRule, /1fr\s+1fr|repeat\(2/, 'Resume bullet STAR fields must be one row per field');
assert.match(starGridRule, /gap:\s*12px/, 'STAR fields need a consistent readable gutter');
assert.match(sharedStarRule, /grid-template-columns:\s*minmax\(0,\s*1fr\)/);
assert.match(sharedStarRule, /align-items:\s*start/);
assert.match(sharedStarLabelRule, /align-content:\s*start/);
assert.match(sharedStarAreaRule, /max-width:\s*100%/);
assert.match(sharedStarAreaRule, /font-size:\s*14px/);
assert.match(sharedStarAreaRule, /line-height:\s*1\.5/);
assert.match(questionStarRule, /grid-template-columns:\s*minmax\(0,\s*1fr\)/);
assert.match(detailStarRule, /grid-template-columns:\s*minmax\(0,\s*1fr\)/);
assert.match(starLabelRule, /font-size:\s*12px/);
assert.match(starLabelRule, /line-height:\s*1\.3/);
assert.doesNotMatch(starLabelRule, /text-transform:\s*uppercase/, 'STAR labels should read as labels, not tiny metadata');
assert.match(areaRule, /min-width:\s*0/);
assert.match(areaRule, /max-width:\s*100%/);
assert.match(areaRule, /font-size:\s*14px/);
assert.match(areaRule, /line-height:\s*1\.5/);
assert.match(areaRule, /white-space:\s*pre-wrap/);
assert.match(areaRule, /overflow-wrap:\s*anywhere/);
assert.doesNotMatch(areaRule, /field-sizing:\s*content/, 'content sizing must not widen STAR textareas');
assert.match(jobRowRule, /min-width:\s*0/);
assert.match(jobRowRule, /border:\s*1px solid var\(--line-strong\)/);
assert.doesNotMatch(jobRowRule, /overflow:\s*(?:clip|hidden)/, 'Jobs cards must not clip long values');
assert.match(jobFieldRule, /max-width:\s*100%/);
assert.match(jobTitleRule, /white-space:\s*pre-wrap/);
assert.match(jobTitleRule, /overflow-wrap:\s*anywhere/);
assert.match(
  css,
  /@media \(max-width:\s*980px\)[\s\S]*?\.bb-exp-row\s*\{\s*grid-template-columns:\s*minmax\(0,\s*1fr\)/,
  'the lead and STAR columns must stack before they become cramped',
);
assert.deepEqual(
  STAR_FIELDS.map((field) => field.label),
  ['Situation', 'Task', 'Action', 'Result'],
  'every STAR editor must keep the same vertical field order',
);
const appSource = readFileSync(new URL('../brag-book/app.js', import.meta.url), 'utf8');
const sharedFormSource = appSource.slice(
  appSource.indexOf('function sharedBulletForm'),
  appSource.indexOf('function experienceControl'),
);
const rowControlSource = appSource.slice(
  appSource.indexOf('function experienceControl'),
  appSource.indexOf('function experienceRow'),
);
const questionSource = appSource.slice(
  appSource.indexOf('function requirementQuestions'),
  appSource.indexOf('function requirementTableRow'),
);
assert.match(sharedFormSource, /fitArea\(area\)/, 'Shared experience STAR boxes must keep auto-growing');
assert.match(rowControlSource, /fitArea\(area\)/, 'Resume bullet STAR boxes must keep auto-growing');
assert.match(questionSource, /Object\.values\(fields\)\.forEach\(fitArea\)/, 'Question STAR boxes must keep auto-growing');

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
assert.deepEqual(
  [...dom.window.document.querySelectorAll('.bb-star-cell > span')].map((node) => node.textContent),
  ['Situation', 'Task', 'Action', 'Result'],
  'the real Resume bullets DOM must render four stacked STAR rows in order',
);
const titleEditor = dom.window.document.querySelector('[aria-label="Job title"]');
assert.equal(titleEditor?.tagName, 'TEXTAREA', 'long job titles need a wrapping editor');
assert.equal(titleEditor?.value, longTitle, 'the real Jobs editor DOM must contain the complete title');
assert.equal(titleEditor?.closest('.bb-job-field')?.querySelector('span')?.textContent, 'Title');
assert.deepEqual(
  [...dom.window.document.querySelectorAll('.bb-job-field > span')].map((node) => node.textContent),
  ['Company', 'Title', 'Dates', 'Location'],
  'the real Jobs card must label each aligned field',
);

console.log('Brag Book STAR-layout bug-bash regression passed.');
