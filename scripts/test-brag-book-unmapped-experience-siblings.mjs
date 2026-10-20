/**
 * Unmapped panel: per resume bullet / exact entry id — sibling experience
 * versions on the same posting resume are independent.
 */
import assert from 'node:assert/strict';

import {
  addCareerJob,
  addEntry,
  addEntryBullet,
  addPosting,
  addRequirement,
  compileResumeDoc,
  emptyStore,
  groupEntriesAsExperience,
  placeLibraryBullet,
  postingById,
  unmappedPostingResumeBullets,
  unmappedResumeBulletCount,
} from '../brag-book/engine.js';

const clock = () => Date.parse('2026-10-20T12:00:00.000Z');
let seq = 0;
const random = () => {
  seq += 1;
  return seq / 1000;
};

function resumeRowForEntry(book, postingId, entryId) {
  const doc = compileResumeDoc(postingById(book, postingId), book);
  for (const job of doc.sections.experience.jobs) {
    for (const group of job.groups || []) {
      for (const bullet of group.bullets || []) {
        if ((bullet.sourceEntryIds || []).includes(entryId)) return bullet;
      }
    }
  }
  return null;
}

let book = addCareerJob(emptyStore(), {
  id: 'rj_xp',
  company: 'GoDaddy',
  title: 'Manager',
  onResume: false,
  groups: [{ id: 'rg_xp', heading: '', bullets: [] }],
}, clock);
book = addEntry(book, {
  id: 'en_v1',
  title: 'Built an embedded-risk process across twelve teams',
  jobId: 'rj_xp',
}, clock);
book = addEntry(book, {
  id: 'en_v2',
  title: 'Launched a risk program covering twelve teams',
  jobId: 'rj_xp',
}, clock);
const grouped = groupEntriesAsExperience(
  book,
  ['en_v1', 'en_v2'],
  { jobId: 'rj_xp', title: 'Embedded-risk launch' },
  clock,
  random,
);
book = grouped.store;
book = addPosting(book, { id: 'job_xp', title: 'Risk lead', company: 'Target' }, clock);
book = placeLibraryBullet(book, {
  postingId: 'job_xp',
  jobId: 'rj_xp',
  groupId: 'rg_xp',
  entryId: 'en_v1',
}, clock, random);
book = placeLibraryBullet(book, {
  postingId: 'job_xp',
  jobId: 'rj_xp',
  groupId: 'rg_xp',
  entryId: 'en_v2',
}, clock, random);

const posting = postingById(book, 'job_xp');
const rowV1 = resumeRowForEntry(book, 'job_xp', 'en_v1');
const rowV2 = resumeRowForEntry(book, 'job_xp', 'en_v2');
assert.ok(rowV1?.id);
assert.ok(rowV2?.id);
assert.notEqual(rowV1.id, rowV2.id);

assert.equal(unmappedResumeBulletCount(book, posting), 2);
let unmapped = unmappedPostingResumeBullets(book, posting);
assert.equal(unmapped.length, 2);
assert.deepEqual(new Set(unmapped.map((row) => row.id)), new Set([rowV1.id, rowV2.id]));

book = addRequirement(book, 'job_xp', 'Lead risk programs', clock);
const reqId = postingById(book, 'job_xp').requirements[0].id;
book = addEntryBullet(book, 'job_xp', reqId, 'en_v1', '', clock);

unmapped = unmappedPostingResumeBullets(book, postingById(book, 'job_xp'));
assert.equal(unmapped.length, 1);
assert.equal(unmapped[0].id, rowV2.id);
assert.match(unmapped[0].text, /Launched a risk program/);
assert.equal(unmappedResumeBulletCount(book, postingById(book, 'job_xp')), 1);

book = addEntryBullet(book, 'job_xp', reqId, 'en_v2', '', clock);
assert.equal(unmappedPostingResumeBullets(book, postingById(book, 'job_xp')).length, 0);

console.log('test-brag-book-unmapped-experience-siblings.mjs: ok');
