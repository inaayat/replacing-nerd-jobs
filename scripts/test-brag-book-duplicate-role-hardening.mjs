/** Snapshot jobId links, preview dedupe, duplicate warnings (non-destructive). */
import assert from 'node:assert/strict';

import {
  addCareerJob,
  addPosting,
  compileResumeDoc,
  compileResumePreviewDoc,
  duplicateCatalogRoleIds,
  resolvedCatalogJobIdForCompiledJob,
  emptyStore,
  placeJobOnResume,
  postingVariantFromSnapshot,
  saveResumeSnapshot,
  startPostingResumeFresh,
  startPostingResumeFromSnapshot,
  updatePostingLocalJob,
  updatePostingResume,
} from '../brag-book/engine.js';

const ISO = '2026-10-09T12:00:00.000Z';
const clock = () => Date.parse(ISO);
let seq = 0;
const random = () => {
  seq += 1;
  return seq / 1000;
};

function countCatalogRows(posting, book, catalogId) {
  return (compileResumeDoc(posting, book).sections.experience.jobs || [])
    .filter((job) => job.included !== false && resolvedCatalogJobIdForCompiledJob(job, book) === catalogId)
    .length;
}

function previewCount(posting, book, catalogId) {
  return (compileResumePreviewDoc(posting, book).sections.experience.jobs || [])
    .filter((job) => job.included !== false && resolvedCatalogJobIdForCompiledJob(job, book) === catalogId)
    .length;
}

let book = emptyStore(clock);
book = addCareerJob(book, {
  id: 'rj_godaddy',
  company: 'GoDaddy',
  title: 'Manager | Business Risk',
  onResume: true,
  groups: [{ id: 'rg_g', heading: '', bullets: [{ id: 'rb_g', lead: 'Basics bullet', body: '' }] }],
}, clock);
book = addPosting(book, { id: 'post_x', company: 'Amer Sports', title: 'Finance role' }, clock);

const snapOut = saveResumeSnapshot(book, 'post_x', { name: 'Copy', fit: {} }, clock, random);
book = snapOut.store;
const snapshot = snapOut.snapshot;

const applied = startPostingResumeFromSnapshot(book, 'post_x', snapshot.id, {}, clock, random);
book = applied.store;
let posting = book.postings.find((row) => row.id === 'post_x');
const localGodaddy = (posting.resume.localJobs || []).find((job) => /godaddy/i.test(job.company));
assert.ok(localGodaddy, 'snapshot apply creates local GoDaddy');
assert.equal(localGodaddy.jobId, 'rj_godaddy', 'local copy keeps catalog jobId from snapshot source');

const variantOnly = postingVariantFromSnapshot(snapshot, book, clock, random);
const fromBasics = variantOnly.localJobs.find((job) => job.jobId === 'rj_godaddy');
assert.ok(fromBasics, 'postingVariantFromSnapshot links catalog jobId without title guessing');

book = startPostingResumeFresh(book, 'post_x', clock);
book = updatePostingLocalJob(book, 'post_x', 'loc_legacy', {
  id: 'loc_legacy',
  company: 'GoDaddy',
  title: 'Manager | Business Risk',
  groups: [{ id: 'rg_l', heading: '', bullets: [] }],
}, clock);
book = updatePostingResume(book, 'post_x', { includedJobIds: ['rj_godaddy'] }, clock);
posting = book.postings.find((row) => row.id === 'post_x');
assert.ok(duplicateCatalogRoleIds(posting, book).has('rj_godaddy'), 'legacy duplicate rows still detected');
assert.equal(countCatalogRows(posting, book, 'rj_godaddy'), 2, 'editor compile still shows both stored rows');
assert.equal(previewCount(posting, book, 'rj_godaddy'), 1, 'preview doc shows one GoDaddy');
assert.ok((posting.resume.localJobs || []).length >= 1, 'stored localJobs untouched');

book = startPostingResumeFresh(book, 'post_x', clock);
book = updatePostingLocalJob(book, 'post_x', 'loc_linked', {
  id: 'loc_linked',
  jobId: 'rj_godaddy',
  company: 'GoDaddy',
  title: 'Manager | Business Risk',
  groups: [{ id: 'rg_l2', heading: '', bullets: [] }],
}, clock);
book = placeJobOnResume(book, 'post_x', 'rj_godaddy', clock);
posting = book.postings.find((row) => row.id === 'post_x');
assert.equal(
  countCatalogRows(posting, book, 'rj_godaddy'),
  1,
  'jobId link merges local + catalog in compile without deleting stored localJobs',
);
assert.equal(duplicateCatalogRoleIds(posting, book).size, 0);

console.log('test-brag-book-duplicate-role-hardening: ok');
