/** First-time posting resume chooser: start from a saved resume copy. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createBookSaveController } from '../brag-book/save-controller.js';
import {
  activeResumeSnapshots,
  addPosting,
  applyImportedResume,
  compileResumeDoc,
  emptyStore,
  normalizeResumeVariant,
  normalizeStore,
  postingById,
  postingResumeMatchesSnapshot,
  preserveServerHistory,
  resumeSnapshotById,
  saveResumeSnapshot,
  serializeBook,
  startPostingResumeFromSnapshot,
  updatePostingLocalBullet,
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

let book = applyImportedResume(emptyStore(), sampleResume, clock);
const basicsJson = JSON.stringify(book.jobs);
book = addPosting(book, { id: 'posting_source', company: 'Acme', title: 'Source role' }, clock);
book = addPosting(book, { id: 'posting_choose', company: 'Beta', title: 'New role' }, clock);
assert.equal(postingById(book, 'posting_choose').resume.mode, 'choose');

const snapCapture = saveResumeSnapshot(book, 'posting_source', { name: 'Acme layout', fit }, clock, random);
book = snapCapture.store;
const sourceSnapshot = snapCapture.snapshot;
const sourceDocJson = JSON.stringify(sourceSnapshot.doc);

const applied = startPostingResumeFromSnapshot(
  book,
  'posting_choose',
  sourceSnapshot.id,
  { fit },
  clock,
  random,
);
assert.equal(applied.changed, true);
book = applied.store;

const chosen = postingById(book, 'posting_choose');
assert.notEqual(chosen.resume.mode, 'choose');
assert.ok(postingResumeMatchesSnapshot(book, chosen, sourceSnapshot));
const headerName = compileResumeDoc(chosen, book).header.name;
assert.equal(headerName, book.profile.name, 'Header still from Resume basics');

const server = await flushBookThroughSaveController(book, emptyStore());
const reloaded = normalizeStore(JSON.parse(serializeBook(server).json), clock);
const reloadedChoose = postingById(reloaded, 'posting_choose');
assert.ok(postingResumeMatchesSnapshot(reloaded, reloadedChoose, sourceSnapshot));
assert.equal(JSON.stringify(reloaded.jobs), basicsJson);
assert.equal(
  JSON.stringify(resumeSnapshotById(reloaded, sourceSnapshot.id).doc),
  sourceDocJson,
);

const localJob = reloadedChoose.resume.localJobs[0];
const localBullet = localJob.groups[0].bullets[0];
book = updatePostingLocalBullet(
  reloaded,
  'posting_choose',
  localJob.id,
  localJob.groups[0].id,
  localBullet.id,
  { lead: 'Chooser-only edit' },
  clock,
);
const afterEdit = postingById(book, 'posting_choose');
assert.equal(afterEdit.resume.localJobs[0].groups[0].bullets[0].lead, 'Chooser-only edit');
assert.equal(JSON.stringify(book.jobs), basicsJson);

const appSource = readFileSync(new URL('../brag-book/app.js', import.meta.url), 'utf8');
const cssSource = readFileSync(new URL('../brag-book/app.css', import.meta.url), 'utf8');
assert.match(appSource, /Start from a saved resume/);
assert.match(appSource, /resumeSnapshotChooserOpen/);
assert.match(appSource, /fromChooser: true/);
assert.match(appSource, /flushSave\('navigation'\)/);
assert.match(cssSource, /grid-template-columns: repeat\(3/);
assert.match(cssSource, /@media \(max-width: 720px\)[\s\S]*?\.bb-choose-cards \{ grid-template-columns: 1fr/);

assert.equal(activeResumeSnapshots(emptyStore()).length, 0);

console.log('test-brag-book-resume-choose-snapshot.mjs: ok');
