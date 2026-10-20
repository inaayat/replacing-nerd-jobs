/** Home: recent postings sort; no recent bullets/knowledge sections. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  addEntry,
  addEntryBullet,
  addPosting,
  addRequirement,
  emptyStore,
  postingLastChangedMs,
  postingsByRecentActivity,
  updateEntry,
  updatePosting,
  updatePostingResume,
} from '../brag-book/engine.js';

let clockMs = Date.parse('2026-01-01T00:00:00.000Z');
const clock = () => {
  clockMs += 60_000;
  return clockMs;
};

let book = emptyStore();
book = addPosting(book, {
  id: 'job_old',
  title: 'Oldest',
  company: 'A',
}, clock);
book = addPosting(book, {
  id: 'job_mid',
  title: 'Middle',
  company: 'B',
}, clock);
book = addPosting(book, {
  id: 'job_new',
  title: 'Newest posting row',
  company: 'C',
}, clock);

let sorted = postingsByRecentActivity(book, 4).map((job) => job.id);
assert.deepEqual(sorted, ['job_new', 'job_mid', 'job_old']);

book = updatePostingResume(book, 'job_old', { mode: 'basics' }, clock);
book = updatePosting(book, 'job_old', { notes: 'touch' }, clock);
const oldPosting = book.postings.find((job) => job.id === 'job_old');
assert.ok(postingLastChangedMs(oldPosting, book) > postingLastChangedMs(
  book.postings.find((job) => job.id === 'job_new'),
  book,
));

sorted = postingsByRecentActivity(book, 4).map((job) => job.id);
assert.equal(sorted[0], 'job_old');

book = addEntry(book, {
  id: 'en_map',
  title: 'Mapped line',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}, clock);
book = addRequirement(book, 'job_mid', 'Need experience', clock);
const midReqId = book.postings.find((job) => job.id === 'job_mid').requirements[0].id;
book = addEntryBullet(book, 'job_mid', midReqId, 'en_map', '', clock);
book = updateEntry(book, 'en_map', { result: 'Fresh mapping edit' }, clock);

sorted = postingsByRecentActivity(book, 4).map((job) => job.id);
assert.equal(sorted[0], 'job_mid', 'Linked entry edit bumps mapped posting above others');

const resumeOnlyTouch = {
  id: 'job_resume_at',
  title: 'Resume timestamp',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  requirements: [],
  resume: { mode: 'basics', updatedAt: '2026-12-01T00:00:00.000Z' },
};
assert.ok(
  postingLastChangedMs(resumeOnlyTouch, book) > Date.parse('2026-06-01T00:00:00.000Z'),
  'Resume variant updatedAt counts toward posting activity',
);

const appSource = readFileSync(new URL('../brag-book/app.js', import.meta.url), 'utf8');
const homeChunk = appSource.slice(appSource.indexOf('function homeView'), appSource.indexOf('function jobMeta'));
assert.doesNotMatch(homeChunk, /Recent resume bullets/);
assert.doesNotMatch(homeChunk, /Recent knowledge/);
assert.match(homeChunk, /postingsByRecentActivity/);
assert.match(homeChunk, /Recent postings/);
assert.match(homeChunk, /Resume bullets & knowledge/);

console.log('test-brag-book-home-recent.mjs: ok');
