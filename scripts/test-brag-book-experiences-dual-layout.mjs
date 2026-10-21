/**
 * Experiences side panel: viewport dual column (≥1100px) or fixed drawer — never inline below catalog.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import {
  EXPERIENCES_DUAL_VIEWPORT_MIN_PX,
  EXPERIENCES_DRAWER_VIEWPORT_MAX_PX,
  experiencesDualColumnMediaQuery,
  experiencesDrawerMediaQuery,
} from '../brag-book/experiences-layout.js';
import { STORE_KEY, addCareerJob, addEntry, addPosting, addRequirement, emptyStore } from '../brag-book/engine.js';

const css = readFileSync(new URL('../brag-book/app.css', import.meta.url), 'utf8');
assert.equal(EXPERIENCES_DUAL_VIEWPORT_MIN_PX, 1100);
assert.equal(EXPERIENCES_DRAWER_VIEWPORT_MAX_PX, 1099);
assert.match(css, new RegExp(`@media \\(min-width: ${EXPERIENCES_DUAL_VIEWPORT_MIN_PX}px\\)[\\s\\S]*grid-template-columns:[\\s\\S]*minmax\\(280px, 320px\\)`));
assert.match(css, new RegExp(`@media \\(max-width: ${EXPERIENCES_DRAWER_VIEWPORT_MAX_PX}px\\)[\\s\\S]*\\.bb-exp-mobile-toggle`));
assert.match(css, /\.bb-book-dual\.is-drawer-open > \.bb-exp-side-panel/);
assert.match(css, /\.bb-exp-side-panel[\s\S]*display: none !important/);
assert.doesNotMatch(css, /@container bb-book-dual \(min-width: 920px\)/);

const clock = () => Date.parse('2026-10-21T23:00:00.000Z');

function installMatchMedia(window, mode) {
  const wide = mode === 'wide';
  window.matchMedia = (query) => ({
    matches: wide
      ? query.includes(String(EXPERIENCES_DUAL_VIEWPORT_MIN_PX))
      : query.includes(String(EXPERIENCES_DRAWER_VIEWPORT_MAX_PX)),
    media: query,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent: () => false,
  });
}

async function bootExperiencesPage(window, { wide }) {
  installMatchMedia(window, wide ? 'wide' : 'narrow');
  let store = addCareerJob(emptyStore(), {
    id: 'j1',
    company: 'GoDaddy',
    title: 'Manager',
    onResume: true,
  }, clock);
  store = addEntry(store, { id: 'e1', title: 'Shipped sync', jobId: 'j1' }, clock);
  window.localStorage.setItem(STORE_KEY, JSON.stringify(store));
  await import(new URL(`../brag-book/app.js?dual-${wide}-${Date.now()}`, import.meta.url));
  await new Promise((resolve) => window.setTimeout(resolve, 100));
}

async function bootPostingPage(window, { wide }) {
  installMatchMedia(window, wide ? 'wide' : 'narrow');
  let store = addCareerJob(emptyStore(), {
    id: 'j1',
    company: 'GoDaddy',
    title: 'Manager',
    onResume: false,
  }, clock);
  store = addPosting(store, { title: 'Role', company: 'GoDaddy' }, clock);
  const postingId = store.postings[0].id;
  store = addRequirement(store, postingId, 'Lead programs', clock);
  window.localStorage.setItem(STORE_KEY, JSON.stringify(store));
  window.location.hash = `#jobs/${postingId}`;
  await import(new URL(`../brag-book/app.js?post-dual-${wide}-${Date.now()}`, import.meta.url));
  await new Promise((resolve) => window.setTimeout(resolve, 100));
  return postingId;
}

function assertDualShell(window, label) {
  const dual = window.document.querySelector('.bb-book-dual');
  assert.ok(dual, `${label}: dual shell`);
  const catalog = dual.querySelector('.bb-book-catalog-wrap') || dual.querySelector('.job-workspace');
  assert.ok(catalog, `${label}: primary column`);
  const panel = dual.querySelector('.bb-exp-side-panel') || dual.querySelector('.bb-exp-panel-rail');
  assert.ok(panel, `${label}: experiences panel or rail`);
  assert.ok(!catalog.contains(panel), `${label}: panel not nested under catalog/workspace`);
  assert.equal(panel.parentElement, dual, `${label}: panel is direct child of dual shell`);
}

{
  const dom = new JSDOM('<!doctype html><html><body><main id="app"></main></body></html>', {
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
    Node: window.Node,
    Element: window.Element,
    getComputedStyle: window.getComputedStyle.bind(window),
    requestAnimationFrame: (fn) => window.setTimeout(fn, 0),
  });
  window.scrollTo = () => {};
  await bootExperiencesPage(window, { wide: true });
  assertDualShell(window, 'resume bullets wide');
  assert.match(
    css,
    /@media \(min-width: 1100px\)[\s\S]*\.bb-exp-mobile-toggle[\s\S]*display: none !important/,
    'drawer pill hidden at dual viewport via CSS',
  );
}

{
  const dom = new JSDOM('<!doctype html><html><body><main id="app"></main></body></html>', {
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
    Node: window.Node,
    Element: window.Element,
    getComputedStyle: window.getComputedStyle.bind(window),
    requestAnimationFrame: (fn) => window.setTimeout(fn, 0),
  });
  window.scrollTo = () => {};
  await bootExperiencesPage(window, { wide: false });
  assertDualShell(window, 'resume bullets narrow');
  assert.ok(window.document.querySelector('.bb-exp-mobile-toggle'), 'Experiences pill when drawer breakpoint');
}

{
  const dom = new JSDOM('<!doctype html><html><body><main id="app"></main></body></html>', {
    url: 'http://127.0.0.1/brag-book/?local=1&experiences=1#jobs/x',
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
  await bootPostingPage(window, { wide: true });
  assert.ok(window.document.querySelector('.bb-posting-dual'), 'posting dual shell');
  assertDualShell(window, 'posting wide');
}

assert.match(experiencesDualColumnMediaQuery(), /1100/);
assert.match(experiencesDrawerMediaQuery(), /1099/);

console.log('test-brag-book-experiences-dual-layout.mjs: ok');
