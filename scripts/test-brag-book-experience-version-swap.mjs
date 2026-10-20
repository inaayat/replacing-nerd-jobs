/** Posting resume experience version swap — per row, per-entry requirement links. */
import assert from 'node:assert/strict';

import {
  VERSION_SWAP_NOTE_ALREADY_ON_RESUME,
  addCareerJob,
  addEntry,
  addEntryBullet,
  addPosting,
  addRequirement,
  compileResumeDoc,
  emptyStore,
  experienceVersionSwapMenu,
  groupEntriesAsExperience,
  placeLibraryBullet,
  postingById,
  postingRequirementResumeLinks,
  swapPostingResumeExperienceVersion,
  unmappedPostingResumeBullets,
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

function reqEntryIds(book, postingId) {
  const links = postingRequirementResumeLinks(postingById(book, postingId));
  return links.entryIds;
}

let book = addCareerJob(emptyStore(), {
  id: 'rj_swap',
  company: 'GoDaddy',
  title: 'Manager',
  onResume: false,
  groups: [{ id: 'rg_swap', heading: '', bullets: [] }],
}, clock);
book = addEntry(book, { id: 'en_a', title: 'Built embedded-risk process', jobId: 'rj_swap' }, clock);
book = addEntry(book, { id: 'en_b', title: 'Launched risk program', jobId: 'rj_swap' }, clock);
book = addEntry(book, { id: 'en_c', title: 'Cut review time with embedded risk', jobId: 'rj_swap' }, clock);
book = groupEntriesAsExperience(
  book,
  ['en_a', 'en_b', 'en_c'],
  { jobId: 'rj_swap', title: 'Embedded-risk launch' },
  clock,
  random,
).store;
book = addPosting(book, { id: 'job_swap', title: 'Risk lead' }, clock);
book = placeLibraryBullet(book, {
  postingId: 'job_swap', jobId: 'rj_swap', groupId: 'rg_swap', entryId: 'en_a',
}, clock, random);
book = placeLibraryBullet(book, {
  postingId: 'job_swap', jobId: 'rj_swap', groupId: 'rg_swap', entryId: 'en_b',
}, clock, random);
book = addRequirement(book, 'job_swap', 'Lead programs', clock);
const reqId = postingById(book, 'job_swap').requirements[0].id;
book = addEntryBullet(book, 'job_swap', reqId, 'en_a', '', clock);
book = addEntryBullet(book, 'job_swap', reqId, 'en_b', '', clock);

const rowA = resumeRowForEntry(book, 'job_swap', 'en_a');
const rowB = resumeRowForEntry(book, 'job_swap', 'en_b');
assert.ok(rowA?.id);
assert.ok(rowB?.id);

const menuA = experienceVersionSwapMenu(book, 'job_swap', rowA.id);
assert.equal(menuA.ok, true);
const choiceB = menuA.choices.find((row) => row.entryId === 'en_b');
const choiceC = menuA.choices.find((row) => row.entryId === 'en_c');
assert.equal(choiceB.onResume, true);
assert.equal(choiceB.onResumeBulletId, rowB.id);
assert.equal(choiceC.onResume, false);

const blocked = swapPostingResumeExperienceVersion(book, {
  postingId: 'job_swap',
  resumeBulletId: rowA.id,
  toEntryId: 'en_b',
});
assert.equal(blocked.ok, false);
assert.equal(blocked.reason, 'already-on-resume');
assert.equal(blocked.note, VERSION_SWAP_NOTE_ALREADY_ON_RESUME);
assert.equal(blocked.existingResumeBulletId, rowB.id);

const swappedNoTransfer = swapPostingResumeExperienceVersion(book, {
  postingId: 'job_swap',
  resumeBulletId: rowA.id,
  toEntryId: 'en_c',
  transferRequirementLinks: false,
});
book = swappedNoTransfer.store;
assert.equal(swappedNoTransfer.ok, true);
const docAfter = compileResumeDoc(postingById(book, 'job_swap'), book);
let swappedRow = null;
for (const job of docAfter.sections.experience.jobs) {
  for (const group of job.groups || []) {
    for (const bullet of group.bullets || []) {
      if (bullet.id === rowA.id) swappedRow = bullet;
    }
  }
}
assert.equal(swappedRow?.sourceEntryIds?.[0], 'en_c');
assert.equal(resumeRowForEntry(book, 'job_swap', 'en_b')?.id, rowB.id);
assert.ok(reqEntryIds(book, 'job_swap').has('en_a'));
assert.ok(reqEntryIds(book, 'job_swap').has('en_b'));
const unmappedAfterSwap = unmappedPostingResumeBullets(book, postingById(book, 'job_swap'));
assert.ok(
  unmappedAfterSwap.some((row) => row.text.includes('Cut review time')),
  'swapped-in version stays unmapped until its entry id is linked on a requirement',
);

let bookX = addCareerJob(emptyStore(), {
  id: 'rj_x',
  company: 'Co',
  title: 'Role',
  onResume: false,
  groups: [{ id: 'rg_x', heading: '', bullets: [] }],
}, clock);
bookX = addEntry(bookX, { id: 'en_x1', title: 'Alpha version', jobId: 'rj_x' }, clock);
bookX = addEntry(bookX, { id: 'en_x2', title: 'Beta version', jobId: 'rj_x' }, clock);
bookX = addEntry(bookX, { id: 'en_x3', title: 'Gamma version', jobId: 'rj_x' }, clock);
bookX = groupEntriesAsExperience(
  bookX,
  ['en_x1', 'en_x2', 'en_x3'],
  { jobId: 'rj_x', title: 'Pack' },
  clock,
  random,
).store;
book = bookX;
book = addPosting(book, { id: 'job_x', title: 'Post' }, clock);
book = placeLibraryBullet(book, {
  postingId: 'job_x', jobId: 'rj_x', groupId: 'rg_x', entryId: 'en_x1',
}, clock, random);
book = placeLibraryBullet(book, {
  postingId: 'job_x', jobId: 'rj_x', groupId: 'rg_x', entryId: 'en_x2',
}, clock, random);
book = addRequirement(book, 'job_x', 'Req one', clock);
const reqX = postingById(book, 'job_x').requirements[0].id;
book = addEntryBullet(book, 'job_x', reqX, 'en_x1', '', clock);
book = addEntryBullet(book, 'job_x', reqX, 'en_x2', '', clock);

const rowX1 = resumeRowForEntry(book, 'job_x', 'en_x1');
const transfer = swapPostingResumeExperienceVersion(book, {
  postingId: 'job_x',
  resumeBulletId: rowX1.id,
  toEntryId: 'en_x3',
  transferRequirementLinks: true,
});
book = transfer.store;
assert.equal(transfer.ok, true);
const links = reqEntryIds(book, 'job_x');
assert.ok(!links.has('en_x1'));
assert.ok(links.has('en_x3'));
assert.ok(links.has('en_x2'));
assert.equal(resumeRowForEntry(book, 'job_x', 'en_x3')?.id, rowX1.id);
assert.ok(resumeRowForEntry(book, 'job_x', 'en_x2'));

console.log('test-brag-book-experience-version-swap.mjs: ok');
