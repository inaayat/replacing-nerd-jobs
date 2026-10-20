/** Unmapped posting resume bullets — visible on compile, not tied to requirements. */
import assert from 'node:assert/strict';

import {
  addCareerJob,
  addEntry,
  addEntryBullet,
  addPosting,
  addPostingResumeJob,
  addRequirement,
  compileResumeDoc,
  emptyStore,
  placeLibraryBullet,
  postingById,
  resumeBulletMappedToPostingRequirements,
  unmappedPostingResumeBullets,
  updatePostingResume,
} from '../brag-book/engine.js';

const ISO = '2026-10-09T12:00:00.000Z';
const clock = () => Date.parse(ISO);
let seq = 0;
const random = () => {
  seq += 1;
  return seq / 1000;
};

function unmappedIds(book, postingId) {
  const posting = postingById(book, postingId);
  return unmappedPostingResumeBullets(book, posting).map((row) => row.id);
}

function resumeBulletId(book, postingId, entryId) {
  const doc = compileResumeDoc(postingById(book, postingId), book);
  for (const job of doc.sections.experience.jobs) {
    for (const group of job.groups || []) {
      for (const bullet of group.bullets || []) {
        if ((bullet.sourceEntryIds || []).includes(entryId)) return bullet.id;
      }
    }
  }
  return null;
}

let book = addCareerJob(emptyStore(), {
  id: 'rj_main',
  company: 'Stripe',
  title: 'Accountant',
  onResume: false,
  groups: [{ id: 'rg_main', heading: '', bullets: [] }],
}, clock);
book = addCareerJob(book, {
  id: 'rj_off',
  company: 'Hidden Co',
  title: 'Intern',
  onResume: false,
}, clock);
book = addEntry(book, {
  id: 'en_mapped',
  title: 'Closed the month in two days',
  company: 'Stripe',
  role: 'Accountant',
  jobId: 'rj_main',
}, clock);
book = addEntry(book, {
  id: 'en_unmapped',
  title: 'Built a reconciliation dashboard',
  company: 'Stripe',
  role: 'Accountant',
  jobId: 'rj_main',
}, clock);
book = addEntry(book, {
  id: 'en_off',
  title: 'Fetched coffee',
  company: 'Hidden Co',
  role: 'Intern',
  jobId: 'rj_off',
}, clock);
book = addPosting(book, { id: 'job_um', title: 'Posting' }, clock);
book = addRequirement(book, 'job_um', 'Close experience', clock);
const reqId = postingById(book, 'job_um').requirements[0].id;
book = addEntryBullet(book, 'job_um', reqId, 'en_mapped', '', clock);
book = placeLibraryBullet(book, {
  postingId: 'job_um',
  jobId: 'rj_main',
  groupId: 'rg_main',
  entryId: 'en_unmapped',
}, clock, random);

const mappedBulletId = resumeBulletId(book, 'job_um', 'en_mapped');
const unmappedBulletId = resumeBulletId(book, 'job_um', 'en_unmapped');
assert.ok(mappedBulletId);
assert.ok(unmappedBulletId);

let rows = unmappedPostingResumeBullets(book, postingById(book, 'job_um'));
assert.deepEqual(unmappedIds(book, 'job_um'), [unmappedBulletId]);
assert.ok(rows.some((row) => row.text.includes('reconciliation')));
assert.ok(rows.every((row) => row.roleLabel.includes('Stripe')));
assert.ok(!rows.some((row) => row.id === mappedBulletId));

const links = postingById(book, 'job_um').requirements.reduce(
  (acc, req) => {
    for (const line of req.bullets || []) {
      if (line.id) acc.lineIds.add(line.id);
      if (line.entryId) acc.entryIds.add(line.entryId);
    }
    return acc;
  },
  { entryIds: new Set(), lineIds: new Set() },
);
assert.equal(
  resumeBulletMappedToPostingRequirements({ sourceEntryIds: ['en_mapped'] }, links),
  true,
);
assert.equal(
  resumeBulletMappedToPostingRequirements({ sourceEntryIds: ['en_unmapped'] }, links),
  false,
);

assert.equal(compileResumeDoc(postingById(book, 'job_um'), book)
  .sections.experience.jobs.some((job) => job.id === 'rj_off'), false);
assert.deepEqual(unmappedIds(book, 'job_um').filter((id) => id === 'en_off'), []);

book = updatePostingResume(book, 'job_um', { excludedBulletIds: [unmappedBulletId] }, clock);
assert.deepEqual(unmappedIds(book, 'job_um'), []);

book = updatePostingResume(book, 'job_um', { excludedBulletIds: [] }, clock);
assert.deepEqual(unmappedIds(book, 'job_um'), [unmappedBulletId]);

book = addEntryBullet(book, 'job_um', reqId, 'en_unmapped', '', clock);
assert.deepEqual(unmappedIds(book, 'job_um'), []);

book = addPostingResumeJob(book, 'job_um', 'rj_off', {}, clock, random);
book = placeLibraryBullet(book, {
  postingId: 'job_um',
  jobId: 'rj_off',
  groupId: '',
  entryId: 'en_off',
}, clock, random);
const offBulletId = resumeBulletId(book, 'job_um', 'en_off');
assert.ok(offBulletId);
assert.deepEqual(unmappedIds(book, 'job_um'), [offBulletId]);

console.log('test-brag-book-unmapped-resume.mjs: ok');
