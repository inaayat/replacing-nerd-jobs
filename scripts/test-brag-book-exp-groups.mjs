/** Resume bullets list — display-only grouping by career job. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  addCareerJob,
  addEntry,
  careerJobRecencyKey,
  experienceCatalogGroups,
  emptyStore,
  updateEntry,
} from '../brag-book/engine.js';

const clock = () => Date.parse('2026-10-20T12:00:00.000Z');

let book = addCareerJob(emptyStore(), {
  id: 'job_old',
  company: 'Old Co',
  title: 'Analyst',
  start: '2018',
  end: '2020',
  onResume: false,
}, clock);
book = addCareerJob(book, {
  id: 'job_new',
  company: 'New Co',
  title: 'Lead',
  start: '2022',
  end: 'Present',
  onResume: false,
}, clock);
book = addEntry(book, { id: 'en_old', title: 'Legacy bullet' }, clock);
book = addEntry(book, { id: 'en_new', title: 'Recent bullet' }, clock);
book = addEntry(book, { id: 'en_free', title: 'Unassigned bullet' }, clock);
book = updateEntry(book, 'en_old', { jobId: 'job_old' }, clock);
book = updateEntry(book, 'en_new', { jobId: 'job_new' }, clock);

assert.ok(careerJobRecencyKey(book.jobs.find((j) => j.id === 'job_new'))
  > careerJobRecencyKey(book.jobs.find((j) => j.id === 'job_old')));

const groups = experienceCatalogGroups(book);
assert.deepEqual(groups.map((g) => g.label), ['New Co · Lead', 'Old Co · Analyst', 'No role']);
assert.deepEqual(groups.map((g) => g.count), [1, 1, 1]);
assert.equal(groups[0].dates.includes('2022'), true);
assert.deepEqual(groups[0].rows.map((r) => r.id), ['en_new']);
assert.deepEqual(groups[2].rows.map((r) => r.id), ['en_free']);

const filtered = experienceCatalogGroups(book, { query: 'Recent' });
assert.equal(filtered.length, 1);
assert.equal(filtered[0].label, 'New Co · Lead');
assert.deepEqual(filtered[0].rows.map((r) => r.id), ['en_new']);

const none = experienceCatalogGroups(book, { query: 'zzznomatch' });
assert.deepEqual(none, []);

const before = JSON.stringify(book);
experienceCatalogGroups(book, { query: 'Recent' });
assert.equal(JSON.stringify(book), before, 'grouping must not mutate store');

const appSource = readFileSync(new URL('../brag-book/app.js', import.meta.url), 'utf8');
const tools = appSource.slice(appSource.indexOf('function experienceTools'), appSource.indexOf('function experienceLineCell'));
assert.match(tools, /captureScroll\(\)/);
assert.match(tools, /restoreScroll\(scroll\)/);
assert.match(appSource, /experienceCatalogGroups/);

console.log('test-brag-book-exp-groups.mjs: ok');
