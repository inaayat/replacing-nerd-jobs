/** Start posting resume from a saved snapshot — persist on posting, reload, isolation. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createBookSaveController } from '../brag-book/save-controller.js';
import {
  activeResumeSnapshots,
  applyImportedResume,
  addPosting,
  emptyStore,
  normalizeResumeVariant,
  normalizeStore,
  postingById,
  postingResumeMatchesSnapshot,
  postingVariantFromSnapshot,
  preserveServerHistory,
  resumeSnapshotById,
  saveResumeSnapshot,
  serializeBook,
  startPostingResumeFromSnapshot,
  updatePostingLocalBullet,
  updatePostingResume,
} from '../brag-book/engine.js';

const ISO = '2026-10-09T12:00:00.000Z';
const clock = () => Date.parse(ISO);
let seq = 0;
const random = () => {
  seq += 1;
  return seq / 1000;
};

const samplePath = join(
  dirname(fileURLToPath(import.meta.url)),
  '../brag-book/data/inaayat-gill-resume.json',
);
const sampleResume = JSON.parse(readFileSync(samplePath, 'utf8'));

const fit = {
  fontPt: 9.5,
  bulletLineHeight: 1.17,
  droppedBulletIds: [],
  droppedLabels: [],
  fits: true,
  pinnedBlocked: false,
  vars: { '--fs': '9.5pt', '--lh-bullet': '1.17' },
};

function fixture() {
  let book = applyImportedResume(emptyStore(), sampleResume, clock);
  book = addPosting(book, { id: 'posting_a', company: 'Acme', title: 'Role A' }, clock);
  book = addPosting(book, { id: 'posting_b', company: 'Beta', title: 'Role B' }, clock);
  return book;
}

function reloadFromServerPayload(serverBook) {
  return normalizeStore(JSON.parse(serializeBook(serverBook).json), clock);
}

async function flushBookThroughSaveController(clientBook, serverBook) {
  let server = normalizeStore(serverBook, clock);
  let revision = 1;
  const controller = createBookSaveController({
    initialRevision: revision,
    save: async (snapshot) => {
      server = preserveServerHistory(snapshot.book, server, clock);
      revision += 1;
      return { revision };
    },
  });
  controller.markDirty(clientBook);
  await controller.flush('navigation', clientBook);
  return server;
}

let book = fixture();
const basicsJobsJson = JSON.stringify(book.jobs);
const entryCount = book.entries.length;
const postingBResumeBefore = JSON.stringify(postingById(book, 'posting_b').resume);
const sharedBulletIds = book.jobs.flatMap((job) => job.groups.flatMap((g) => g.bullets.map((b) => b.id)));

book = updatePostingResume(book, 'posting_a', {
  excludedBulletIds: [sharedBulletIds[0]],
  pinnedBulletIds: [sharedBulletIds[1]],
}, clock);

const sourceCapture = saveResumeSnapshot(book, 'posting_a', {
  name: 'Acme – Role A – source',
  fit,
}, clock, random);
book = sourceCapture.store;
const sourceSnapshot = sourceCapture.snapshot;
const sourceDocJson = JSON.stringify(sourceSnapshot.doc);

book = updatePostingResume(book, 'posting_a', { mode: 'fresh' }, clock);
const snapshotCountBefore = activeResumeSnapshots(book).length;

const applied = startPostingResumeFromSnapshot(book, 'posting_a', sourceSnapshot.id, { fit }, clock, random);
assert.equal(applied.changed, true);
book = applied.store;

const postingA = postingById(book, 'posting_a');
const storedPostingResume = JSON.stringify(normalizeResumeVariant(postingA.resume));
assert.ok(postingResumeMatchesSnapshot(book, postingA, sourceSnapshot), 'Live compile matches chosen snapshot');

assert.ok(applied.backupSnapshotId);
assert.equal(activeResumeSnapshots(book).length, snapshotCountBefore + 1);
assert.equal(JSON.stringify(book.jobs), basicsJobsJson, 'Resume basics unchanged');
assert.equal(book.entries.length, entryCount, 'No new library entries');
assert.equal(JSON.stringify(resumeSnapshotById(book, sourceSnapshot.id).doc), sourceDocJson, 'Source snapshot unchanged');

const localBullets = (postingA.resume.localJobs || []).flatMap((job) => job.groups.flatMap((g) => g.bullets));
assert.ok(localBullets.length > 0);
const localIds = localBullets.map((b) => b.id);
assert.equal(new Set(localIds).size, localIds.length, 'No duplicate local bullet ids');

const serverAfterFlush = await flushBookThroughSaveController(book, emptyStore());
const reloaded = reloadFromServerPayload(serverAfterFlush);
const reloadedA = postingById(reloaded, 'posting_a');
const reloadedB = postingById(reloaded, 'posting_b');

assert.equal(
  JSON.stringify(normalizeResumeVariant(reloadedA.resume)),
  storedPostingResume,
  'Posting resume variant persisted on the posting id after save flush',
);
assert.ok(
  postingResumeMatchesSnapshot(reloaded, reloadedA, sourceSnapshot),
  'Reloaded posting still matches the chosen saved resume',
);
assert.equal(
  JSON.stringify(normalizeResumeVariant(reloadedB.resume)),
  postingBResumeBefore,
  'Other posting resume unchanged after flush and reload',
);

const serializedPosting = JSON.parse(serializeBook(reloaded).json).postings
  .find((row) => row.id === 'posting_a');
assert.ok(serializedPosting?.resume?.localJobs?.length, 'Serialized book carries posting resume on posting id');

const variant = postingVariantFromSnapshot(sourceSnapshot, book, clock, random);
assert.equal(variant.mode, 'fresh');
assert.ok(variant.localJobs.length);

const firstJob = postingA.resume.localJobs[0];
const firstGroup = firstJob.groups[0];
const firstBullet = firstGroup.bullets[0];
const editedLead = 'POSTING-ONLY EDIT after snapshot copy';
book = updatePostingLocalBullet(
  book,
  'posting_a',
  firstJob.id,
  firstGroup.id,
  firstBullet.id,
  { lead: editedLead },
  clock,
);
const editedPosting = postingById(book, 'posting_a');
assert.equal(
  editedPosting.resume.localJobs[0].groups[0].bullets[0].lead,
  editedLead,
);

const serverAfterEdit = await flushBookThroughSaveController(book, serverAfterFlush);
const afterEditReload = reloadFromServerPayload(serverAfterEdit);
const reloadedAfterEdit = postingById(afterEditReload, 'posting_a');
assert.equal(
  reloadedAfterEdit.resume.localJobs[0].groups[0].bullets[0].lead,
  editedLead,
  'Posting-only edit survives flush and reload',
);
assert.equal(JSON.stringify(afterEditReload.jobs), basicsJobsJson, 'Resume basics unchanged after posting edit');
assert.equal(
  JSON.stringify(resumeSnapshotById(afterEditReload, sourceSnapshot.id).doc),
  sourceDocJson,
  'Source saved snapshot unchanged after posting edit',
);
assert.equal(
  JSON.stringify(normalizeResumeVariant(postingById(afterEditReload, 'posting_b').resume)),
  postingBResumeBefore,
  'Other posting unchanged after posting edit',
);

const appSource = readFileSync(new URL('../brag-book/app.js', import.meta.url), 'utf8');
assert.match(appSource, /Start from saved resume/);
assert.match(appSource, /flushSave\('navigation'\)/);

console.log('test-brag-book-start-from-snapshot: ok');
