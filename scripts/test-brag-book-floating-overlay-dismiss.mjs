/** Floating search overlays: dismiss without trapping clicks or focus. */
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import {
  STORE_KEY,
  addCareerJob,
  addEntry,
  addPosting,
  addRequirement,
  emptyStore,
} from '../brag-book/engine.js';
import { postingMapSearchOverlayId } from '../brag-book/posting-requirement-mapping-ui.js';
import { refreshFloatingOverlays } from '../brag-book/floating-overlay.js';

const clock = () => Date.parse('2026-10-21T21:00:00.000Z');

let store = addCareerJob(emptyStore(), {
  id: 'j1',
  company: 'GoDaddy',
  title: 'Manager',
  onResume: false,
}, clock);
store = addEntry(store, { id: 'e1', title: 'Shipped a feature', jobId: 'j1' }, clock);
store = addPosting(store, { title: 'Manager', company: 'GoDaddy' }, clock);
const postingId = store.postings[0].id;
store = addRequirement(store, postingId, 'Lead programs', clock);
store = addRequirement(store, postingId, 'Build teams', clock);
const reqIds = store.postings[0].requirements.map((r) => r.id);

const dom = new JSDOM(`<!doctype html><html><body>
<nav><a id="nav-auth-link"></a><a data-nav="jobs"></a></nav>
<button type="button" id="outside-target">Outside</button>
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

await import(new URL(`../brag-book/app.js?float-dismiss=${Date.now()}`, import.meta.url));
await new Promise((resolve) => window.setTimeout(resolve, 120));

function setSearchValue(input, value) {
  Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(input, value);
  input.dispatchEvent(new window.InputEvent('input', { bubbles: true }));
}

function openMapSearchForReq(reqId) {
  const input = window.document.querySelector(`[data-bb-overlay-anchor="${postingMapSearchOverlayId(postingId, reqId)}"]`);
  assert.ok(input, `map search for req ${reqId}`);
  setSearchValue(input, 'query-alpha');
  refreshFloatingOverlays();
  const panel = window.document.querySelector(`[data-bb-overlay-panel="${postingMapSearchOverlayId(postingId, reqId)}"]`);
  assert.ok(panel && !panel.hidden, 'overlay panel open');
  return { input, panel };
}

// Outside pointerdown closes overlay and still delivers the click.
{
  const { input, panel } = openMapSearchForReq(reqIds[0]);
  let outsideClicked = false;
  const outside = window.document.getElementById('outside-target');
  outside.addEventListener('click', () => { outsideClicked = true; });
  outside.dispatchEvent(new window.PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
  await new Promise((resolve) => window.setTimeout(resolve, 40));
  const overlayId0 = postingMapSearchOverlayId(postingId, reqIds[0]);
  assert.equal(window.document.querySelector(`[data-bb-overlay-panel="${overlayId0}"]`), null, 'overlay removed after outside pointerdown');
  const inputAfter = window.document.querySelector(`[data-bb-overlay-anchor="${overlayId0}"]`);
  assert.equal(String(inputAfter?.value || ''), '', 'search cleared');
  outside.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  assert.ok(outsideClicked, 'click reached outside target (no full-screen swallow)');
}

// Esc closes and returns focus to the search input.
{
  const { input } = openMapSearchForReq(reqIds[0]);
  input.focus();
  window.document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  await new Promise((resolve) => window.setTimeout(resolve, 40));
  const overlayId0 = postingMapSearchOverlayId(postingId, reqIds[0]);
  assert.equal(window.document.querySelector(`[data-bb-overlay-panel="${overlayId0}"]`), null, 'overlay gone after Esc');
  const inputLive = window.document.querySelector(`[data-bb-overlay-anchor="${overlayId0}"]`);
  assert.equal(window.document.activeElement, inputLive, 'focus returned to search input');
}

// Tab away from search closes overlay without refocusing the search on dismiss.
{
  const { input } = openMapSearchForReq(reqIds[0]);
  input.focus();
  const outside = window.document.getElementById('outside-target');
  outside.focus();
  await new Promise((resolve) => window.setTimeout(resolve, 40));
  assert.equal(window.document.querySelector(`[data-bb-overlay-panel="${postingMapSearchOverlayId(postingId, reqIds[0])}"]`), null, 'overlay closed on tab away');
  assert.equal(window.document.activeElement, outside, 'focus stayed on tab target, not trapped in search');
}

// Only one overlay open: second requirement search closes the first.
{
  openMapSearchForReq(reqIds[0]);
  const firstId = postingMapSearchOverlayId(postingId, reqIds[0]);
  const secondId = postingMapSearchOverlayId(postingId, reqIds[1]);
  assert.ok(window.document.querySelector(`[data-bb-overlay-panel="${firstId}"]`), 'first overlay open');
  openMapSearchForReq(reqIds[1]);
  await new Promise((resolve) => window.setTimeout(resolve, 40));
  assert.equal(window.document.querySelector(`[data-bb-overlay-panel="${firstId}"]`), null, 'first overlay closed');
  assert.ok(window.document.querySelector(`[data-bb-overlay-panel="${secondId}"]`), 'second overlay open');
}

// Picking a result still runs (pointerdown on option does not dismiss before click).
{
  const oid = postingMapSearchOverlayId(postingId, reqIds[0]);
  const input = window.document.querySelector(`[data-bb-overlay-anchor="${oid}"]`);
  setSearchValue(input, 'Ship');
  refreshFloatingOverlays();
  const panel = window.document.querySelector(`[data-bb-overlay-panel="${oid}"]`);
  assert.ok(panel, 'overlay for pick test');
  const choice = panel.querySelector('.bb-post-map-choice');
  assert.ok(choice, 'bullet/experience choice row');
  let clicked = false;
  choice.addEventListener('click', () => { clicked = true; });
  choice.dispatchEvent(new window.PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
  choice.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await new Promise((resolve) => window.setTimeout(resolve, 60));
  assert.ok(clicked, 'option click fired');
}

console.log('test-brag-book-floating-overlay-dismiss.mjs: ok');
