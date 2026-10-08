/**
 * INTENTIONALLY FAILING — bug-bash phase 4.
 *
 * Run after containing the Resume bullets STAR grid:
 *   node scripts/test-brag-book-bugbash-star-layout.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
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

assert.match(leadRule, /overflow:\s*(?:clip|hidden)/, 'the lead column must not paint over STAR');
assert.match(starGridRule, /isolation:\s*isolate/, 'the STAR grid must own an isolated paint layer');
assert.match(areaRule, /min-width:\s*0/);
assert.match(areaRule, /max-width:\s*100%/);
assert.doesNotMatch(areaRule, /field-sizing:\s*content/, 'content sizing must not widen STAR textareas');

console.log('Brag Book STAR-layout bug-bash regression passed.');
