/** Posting resume must not add the same catalog job twice (+ Add role / placeJobOnResume). */
import assert from 'node:assert/strict';

import {
  addCareerJob,
  addPosting,
  addPostingLocalBullet,
  catalogJobIdsOnPostingResume,
  compileResumeDoc,
  emptyStore,
  placeJobOnResume,
  startPostingResumeFresh,
  updatePostingLocalJob,
} from '../brag-book/engine.js';

const ISO = '2026-10-09T12:00:00.000Z';
const clock = () => Date.parse(ISO);
let seq = 0;
const random = () => {
  seq += 1;
  return seq / 1000;
};

function normCompany(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function countAcmeRoles(posting, book) {
  return (compileResumeDoc(posting, book).sections.experience.jobs || [])
    .filter((job) => job.included !== false && normCompany(job.company) === 'acme')
    .length;
}

let book = emptyStore(clock);
book = addCareerJob(book, {
  id: 'job_acme',
  company: 'Acme',
  title: 'Manager',
  onResume: true,
  groups: [{ id: 'rg_a', heading: '', bullets: [{ id: 'rb_a', lead: 'Basics bullet', body: '' }] }],
}, clock);
book = addCareerJob(book, {
  id: 'job_other',
  company: 'Other Co',
  title: 'Analyst',
  onResume: true,
  groups: [{ id: 'rg_o', heading: '', bullets: [] }],
}, clock);
book = addPosting(book, { id: 'post_1', company: 'Target Co', title: 'Role' }, clock);
const postingId = 'post_1';

book = startPostingResumeFresh(book, postingId, clock);
let posting = book.postings.find((row) => row.id === postingId);

const localJobId = `job_local_${seq}`;
book = updatePostingLocalJob(book, postingId, localJobId, {
  company: 'Acme',
  title: 'Manager',
  start: 'June 2025',
  end: 'Present',
  current: true,
  groups: [{ id: 'rg_local', heading: '', bullets: [] }],
}, clock);
book = addPostingLocalBullet(book, postingId, localJobId, 'rg_local', {
  lead: 'Posting-only bullet',
  body: '',
}, clock, random);

posting = book.postings.find((row) => row.id === postingId);
assert.equal(countAcmeRoles(posting, book), 1, 'One Acme row from posting-only local job');
assert.ok(catalogJobIdsOnPostingResume(posting, book).has('job_acme'));

book = placeJobOnResume(book, postingId, 'job_acme', clock);
posting = book.postings.find((row) => row.id === postingId);
assert.equal(countAcmeRoles(posting, book), 1, 'placeJobOnResume must not compile a second Acme');
assert.ok(
  !(posting.resume.includedJobIds || []).includes('job_acme'),
  'Must not add includedJobIds when local copy already represents the catalog job',
);

const addRoleChoices = (book.jobs || []).filter(
  (job) => !catalogJobIdsOnPostingResume(posting, book).has(job.id),
);
assert.deepEqual(addRoleChoices.map((job) => job.id), ['job_other']);

console.log('test-brag-book-duplicate-role: ok');
