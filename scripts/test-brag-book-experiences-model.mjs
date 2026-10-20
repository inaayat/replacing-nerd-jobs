/** Phase 2 — pure experience grouping model (no UI). */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  SCHEMA,
  addCareerJob,
  addEntry,
  createExperience,
  draftExperienceVersion,
  emptyStore,
  groupEntriesAsExperience,
  entryIsLoose,
  experienceVersions,
  moveEntryToExperience,
  normalizeStore,
  removeEntryFromExperience,
  ungroupExperience,
  mergeBook,
} from '../brag-book/engine.js';

const clock = () => Date.parse('2026-10-20T12:00:00.000Z');
let rand = 0;
const random = () => {
  rand += 0.11;
  return rand % 1;
};

assert.equal(SCHEMA, 4);

let book = addCareerJob(emptyStore(), {
  id: 'job_a',
  company: 'GoDaddy',
  title: 'Manager',
}, clock);
book = addEntry(book, { id: 'en_1', title: 'Built access reviews', jobId: 'job_a' }, clock);
book = addEntry(book, { id: 'en_2', title: 'Cut audit prep forty percent', jobId: 'job_a' }, clock);
book = normalizeStore(book, clock);

assert.equal(book.experiences.length, 0);
assert(entryIsLoose(book.entries[0], book));

const grouped = groupEntriesAsExperience(
  book,
  ['en_1', 'en_2'],
  { jobId: 'job_a', title: 'Access-review program' },
  clock,
  random,
);
book = normalizeStore(grouped.store, clock);
assert.equal(grouped.changedEntryIds.length, 2);
assert.equal(book.experiences.length, 1);
assert.equal(experienceVersions(book, grouped.experienceId).length, 2);
assert.equal(book.entries.find((e) => e.id === 'en_1')?.experienceId, grouped.experienceId);
assert.equal(book.entries.find((e) => e.id === 'en_1')?.title, 'Built access reviews');

const beforeTitles = book.entries.map((e) => e.title);
const ungrouped = ungroupExperience(book, grouped.experienceId, clock, random);
book = normalizeStore(ungrouped.store, clock);
assert.equal(book.experiences[0]?.deletedAt, '2026-10-20T12:00:00.000Z');
assert(book.entries.every((entry) => entryIsLoose(entry, book)));
assert.deepEqual(book.entries.map((e) => e.title), beforeTitles);

book = grouped.store;
let withSecondJob = addCareerJob(book, { id: 'job_b', company: 'PwC', title: 'Associate' }, clock);
withSecondJob = createExperience(withSecondJob, { jobId: 'job_b', title: 'Controls automation' }, clock, random).store;
const xpB = withSecondJob.experiences.find((row) => row.title === 'Controls automation')?.id;
assert.ok(xpB);
assert.throws(
  () => moveEntryToExperience(withSecondJob, 'en_1', xpB, { allowCrossJob: false }),
  /different jobs/,
);

const merged = mergeBook(
  book,
  removeEntryFromExperience(book, 'en_1', clock).store,
  book,
);
const solo = merged.entries.find((e) => e.id === 'en_1');
assert.equal(solo?.experienceId, '');

const fixture = JSON.parse(
  readFileSync(new URL('./fixtures/brag-book/schema-3-sample.json', import.meta.url), 'utf8'),
);
const fromLegacy = normalizeStore(fixture, clock);
assert.equal(fromLegacy.v, 4);
assert.equal(fromLegacy.experiences.length, 0);
assert(fromLegacy.entries.every((entry) => !entry.experienceId));

console.log('test-brag-book-experiences-model.mjs: ok');
