/** Experience / bulk / map search overlays mount on body (not clipped). */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import {
  STORE_KEY,
  addCareerJob,
  addEntry,
  emptyStore,
} from '../brag-book/engine.js';
import { experiencePickerOverlayId } from '../brag-book/experience-picker.js';
import { refreshFloatingOverlays } from '../brag-book/floating-overlay.js';

const css = readFileSync(new URL('../brag-book/app.css', import.meta.url), 'utf8');
assert.match(css, /\.bb-float-overlay[\s\S]*position:\s*fixed/);
assert.match(css, /\.bb-float-overlay[\s\S]*z-index:\s*120/);
assert.match(css, /\.bb-float-overlay-body[\s\S]*overflow-y:\s*auto/);
assert.match(css, /\.bb-exp-picker-chip[\s\S]*width:\s*auto/);
assert.doesNotMatch(css.match(/\.bb-exp-picker-chip\s*\{[^}]+\}/)?.[0] || '', /width:\s*100%/);

const pickerSrc = readFileSync(new URL('../brag-book/experience-picker.js', import.meta.url), 'utf8');
assert.match(pickerSrc, /data-bb-overlay-panel/);
assert.match(pickerSrc, /row-text-action bb-exp-picker-chip/);

const clock = () => Date.parse('2026-10-21T15:00:00.000Z');
let store = addCareerJob(emptyStore(), {
  id: 'j1',
  company: 'GoDaddy',
  title: 'Manager',
  onResume: true,
}, clock);
store = addEntry(store, { id: 'e1', title: 'Loose bullet line here', jobId: 'j1' }, clock);

const dom = new JSDOM(`<!doctype html><html><body style="overflow:hidden;height:200px">
<div class="bb-book-catalog" style="overflow:hidden;height:120px">
<main id="app"></main>
</div></body></html>`, {
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

await import(new URL(`../brag-book/app.js?float-overlay=${Date.now()}`, import.meta.url));
await new Promise((resolve) => window.setTimeout(resolve, 120));

const chip = window.document.querySelector(`[data-bb-overlay-anchor="${experiencePickerOverlayId('e1')}"]`)
  || window.document.querySelector('.bb-exp-picker-chip');
assert.ok(chip, 'experience picker chip');
chip.click();
await new Promise((resolve) => window.setTimeout(resolve, 80));

const panel = window.document.querySelector(`[data-bb-overlay-panel="${experiencePickerOverlayId('e1')}"]`);
assert.ok(panel, 'picker panel in DOM');
refreshFloatingOverlays();
assert.equal(panel.parentElement, window.document.body, 'picker panel portaled to body');
assert.ok(panel.querySelector('.bb-float-overlay-head .bb-exp-picker-search'), 'search pinned in overlay head');

console.log('test-brag-book-floating-overlays.mjs: ok');
