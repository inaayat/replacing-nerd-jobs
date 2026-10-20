/**
 * Posting Experiences panel + mapped-bullet row layout (no overlap / no 1ch squeeze).
 * Run: node scripts/test-brag-book-posting-panel-layout.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM, VirtualConsole } from 'jsdom';
import {
  STORE_KEY,
  addCareerJob,
  addEntry,
  addEntryBullet,
  addPosting,
  addRequirement,
  createExperience,
  moveEntryToExperience,
  emptyStore,
  postingById,
} from '../brag-book/engine.js';
import { EXPERIENCES_DUAL_INLINE_MIN_PX } from '../brag-book/experiences-layout.js';

const css = readFileSync(new URL('../brag-book/app.css', import.meta.url), 'utf8');
const app = readFileSync(new URL('../brag-book/app.js', import.meta.url), 'utf8');

assert.match(css, /container-type:\s*inline-size/, 'dual wrapper is a size container');
assert.match(css, /container-name:\s*bb-book-dual/);
assert.match(css, /@container bb-book-dual \(min-width: 920px\)/);
assert.match(css, /grid-template-columns:\s*minmax\(0,\s*1fr\)\s*minmax\(0,\s*320px\)/);
assert.match(css, /\.bb-book-dual > \.job-workspace[\s\S]*min-width:\s*0/);
assert.match(css, /\.bb-exp-side-panel[\s\S]*transform:\s*none/);
assert.doesNotMatch(
  css,
  /@container bb-book-dual[\s\S]*translateX\s*\(\s*-/,
  'panel must not use negative horizontal translate',
);
assert.match(css, /\.bb-book-dual\.is-drawer-open \.bb-exp-side-panel[\s\S]*inset:\s*0 0 0 auto/);
const indexCountRule = css.match(/\.bb-exp-index-count\s*\{[^}]+\}/)?.[0] || '';
assert.match(indexCountRule, /white-space:\s*nowrap/);
assert.doesNotMatch(indexCountRule, /text-transform:\s*uppercase/);
assert.match(indexCountRule, /text-transform:\s*none/);

assert.match(css, /\.bullet-link > \.bb-posting-bullet-actions[\s\S]*grid-column:\s*1 \/ -1/);
assert.match(css, /\.bb-post-map-bullet-line[\s\S]*grid-column:\s*1 \/ -1/);
assert.match(css, /\.bb-unmapped-actions[\s\S]*grid-column:\s*1 \/ -1/);
function ruleBlock(selector) {
  return css.match(new RegExp(`${selector.replace('.', '\\.')}\\s*\\{[^}]+\\}`))?.[0] || '';
}
const wrapSelectors = [
  '.bb-exp-picker-chip',
  '.bb-exp-index-title',
  '.bb-exp-section-row-title',
  '.bb-post-map-bucket-title',
];
for (const sel of wrapSelectors) {
  const block = ruleBlock(sel);
  assert.ok(block, `missing rule ${sel}`);
  assert.match(block, /max-width:\s*100%/);
  assert.match(block, /white-space:\s*normal/);
  assert.match(block, /overflow-wrap:\s*anywhere/);
  assert.doesNotMatch(block, /text-overflow:\s*ellipsis/);
  assert.doesNotMatch(block, /word-break:\s*break-all/);
}
assert.match(ruleBlock('.bb-exp-index-line1'), /align-items:\s*flex-start/);
assert.match(ruleBlock('.bb-post-map-bucket-head'), /align-items:\s*flex-start/);
assert.match(app, /experiencesDualInlineMediaQuery/);

assert.equal(EXPERIENCES_DUAL_INLINE_MIN_PX, 920);

const clock = () => Date.parse('2026-10-09T12:00:00.000Z');

function postingBook() {
  let book = addCareerJob(emptyStore(), {
    id: 'rj_layout',
    company: 'GoDaddy',
    title: 'Manager',
    onResume: false,
    groups: [{ id: 'rg_layout', heading: '', bullets: [] }],
  }, clock);
  book = addEntry(book, {
    id: 'en_layout',
    title: 'Automating Journal Entry validation workflows',
    jobId: 'rj_layout',
  }, clock);
  const created = createExperience(book, {
    title: 'Manual Journal Entry Automation Initiative',
    jobId: 'rj_layout',
  }, clock);
  book = created.store;
  const xpId = book.experiences[book.experiences.length - 1]?.id;
  assert.ok(xpId, 'experience created');
  book = moveEntryToExperience(book, 'en_layout', xpId, { clock }).store;
  book = addPosting(book, { id: 'job_layout', title: 'Role', company: 'Co' }, clock);
  book = addRequirement(book, 'job_layout', 'Automate close', clock);
  const reqId = postingById(book, 'job_layout').requirements[0].id;
  book = addEntryBullet(book, 'job_layout', reqId, 'en_layout', '', clock);
  return book;
}

const SHELL = `<!doctype html><html><body>
<nav class="nav"></nav>
<main id="app" class="shell"></main>
</body></html>`;

async function openPostingDom(book) {
  const dom = new JSDOM(SHELL, {
    url: 'http://127.0.0.1/brag-book/?local=1&experiences=1#jobs/job_layout',
    pretendToBeVisual: true,
    virtualConsole: new VirtualConsole(),
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
  window.confirm = () => false;
  dom.window.localStorage.setItem(STORE_KEY, JSON.stringify(book));
  const href = new URL('../brag-book/app.js', import.meta.url);
  await import(`${href.href}?layout=${Date.now()}`);
  await new Promise((resolve) => window.setTimeout(resolve, 80));
  return dom;
}

const dom = await openPostingDom(postingBook());
const { document } = dom.window;

const dual = document.querySelector('.bb-book-dual.bb-posting-dual');
assert.ok(dual, 'posting uses dual layout wrapper');
const workspace = dual.querySelector('.job-workspace');
const panel = dual.querySelector('.bb-exp-side-panel');
assert.ok(workspace, 'workspace is first column child');
assert.ok(panel, 'experiences panel is a sibling, not inside the table');
assert.ok(
  workspace.compareDocumentPosition(panel) & dom.window.Node.DOCUMENT_POSITION_FOLLOWING,
  'panel follows workspace in DOM',
);

assert.ok(document.querySelector('.bb-post-map-stack'), 'experiences mapping stack renders');
const mapBullet = document.querySelector('.bb-post-map-bucket-included .bb-post-map-bullet')
  || document.querySelector('.bb-post-map-loose-bullets .bb-post-map-bullet');
if (mapBullet) {
  const line = mapBullet.querySelector('.bb-post-map-bullet-line');
  const control = mapBullet.querySelector('.bb-post-map-details, .bb-post-map-unmap');
  assert.ok(line && control, 'mapped bucket bullet has text and controls');
  assert.ok(
    line.compareDocumentPosition(control) & dom.window.Node.DOCUMENT_POSITION_FOLLOWING,
    'controls follow bullet text in DOM',
  );
}
const legacyBullet = document.querySelector('.bb-posting-bullet');
if (legacyBullet) {
  const copy = legacyBullet.querySelector('.bullet-copy, .experience-compose, .is-marked');
  const actions = legacyBullet.querySelector('.bb-posting-bullet-actions');
  assert.ok(copy && actions, 'legacy bullet has text and action row');
  assert.ok(
    copy.compareDocumentPosition(actions) & dom.window.Node.DOCUMENT_POSITION_FOLLOWING,
    'legacy actions follow bullet text in DOM',
  );
}

const unmappedActions = document.querySelector('.bb-unmapped-actions');
if (unmappedActions) {
  const row = unmappedActions.closest('.bb-unmapped-row');
  const text = row?.querySelector('.bb-unmapped-text');
  assert.ok(text);
  assert.ok(text.compareDocumentPosition(unmappedActions) & Node.DOCUMENT_POSITION_FOLLOWING);
}

console.log('test-brag-book-posting-panel-layout.mjs: ok');
