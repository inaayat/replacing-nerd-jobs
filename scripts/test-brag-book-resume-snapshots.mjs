/** Immutable saved resume snapshots — model, merge, preservation, and UI hooks. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const engine = await import('../brag-book/engine.js');
const save = await import('../brag-book/save-controller.js');
const template = await import('../brag-book/resume-template.js');
const docx = await import('../brag-book/resume-docx.js');
const storeApi = await import('../brag-book/store.js');

const REQUIRED = [
  'RESUME_SNAPSHOT_SCHEMA',
  'saveResumeSnapshot',
  'renameResumeSnapshot',
  'deleteResumeSnapshot',
  'resumeSnapshotById',
  'activeResumeSnapshots',
  'resumeSnapshotToDoc',
  'preserveResumeSnapshots',
];
const missing = REQUIRED.filter((name) => !(name in engine));
if (missing.length) {
  assert.fail(
    `PENDING resume snapshots implementation: missing engine exports ${missing.join(', ')}`,
  );
}

const {
  RESUME_SNAPSHOT_SCHEMA,
  emptyStore,
  normalizeStore,
  serializeBook,
  addPosting,
  applyImportedResume,
  compileResumeDoc,
  updatePostingResume,
  saveResumeSnapshot,
  renameResumeSnapshot,
  deleteResumeSnapshot,
  resumeSnapshotById,
  activeResumeSnapshots,
  resumeSnapshotToDoc,
  preserveResumeSnapshots,
  preserveServerHistory,
} = engine;
const { mergeConcurrentBooks } = save;
const { renderResumeHtml, resumeDocument } = template;

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

function fixture() {
  let book = applyImportedResume(emptyStore(), sampleResume, clock);
  book = addPosting(book, {
    id: 'posting_snapshot',
    company: 'Example Company',
    title: 'Senior Manager',
  }, clock);
  const bulletIds = book.jobs.flatMap((job) => (
    job.groups.flatMap((group) => group.bullets.map((bullet) => bullet.id))
  ));
  book = updatePostingResume(book, 'posting_snapshot', {
    excludedBulletIds: [bulletIds[0]],
    pinnedBulletIds: [bulletIds[1]],
  }, clock);
  return book;
}

function capture(book, name, fit, at = clock) {
  const result = saveResumeSnapshot(
    book,
    'posting_snapshot',
    { name, fit },
    at,
    random,
  );
  assert.ok(result?.store, 'saveResumeSnapshot returns { store, snapshot }');
  assert.ok(result?.snapshot?.id, 'capture returns the created snapshot');
  return result;
}

const fit = {
  fontPt: 9.5,
  bulletLineHeight: 1.17,
  droppedBulletIds: [],
  droppedLabels: [],
  fits: true,
  pinnedBlocked: false,
  vars: {
    '--fs': '9.5pt',
    '--lh-bullet': '1.17',
    '--group-gap': '5pt',
    '--sec-gap': '6pt',
  },
};

// Capture must be a deep-frozen resolved document, not posting/library refs.
let book = fixture();
const posting = book.postings.find((row) => row.id === 'posting_snapshot');
const liveDoc = compileResumeDoc(posting, book);
const expectedHtml = renderResumeHtml(liveDoc, {
  droppedBulletIds: fit.droppedBulletIds,
});
const created = capture(book, 'Example Company – Senior Manager – 2026-10-09', fit);
book = created.store;
const snapshot = created.snapshot;
assert.equal(snapshot.v, RESUME_SNAPSHOT_SCHEMA);
assert.equal(snapshot.savedAt, ISO);
assert.equal(snapshot.sourcePostingId, 'posting_snapshot');
assert.equal(snapshot.sourcePosting.company, 'Example Company');
assert.equal(snapshot.sourcePosting.title, 'Senior Manager');
assert.deepEqual(snapshot.fit.vars, fit.vars);
assert.notEqual(snapshot.doc, liveDoc, 'the snapshot owns a deep copy');
const frozenBullets = snapshot.doc.sections.experience.jobs
  .flatMap((job) => job.groups.flatMap((group) => group.bullets));
assert.ok(frozenBullets.some((bullet) => bullet.included === false), 'hidden state is frozen');
assert.ok(frozenBullets.some((bullet) => bullet.pinned === true), 'pinned state is frozen');
assert.equal(
  renderResumeHtml(resumeSnapshotToDoc(snapshot)),
  expectedHtml,
  'read-only snapshot render matches the live resume at capture time',
);
assert.deepEqual(
  docx.resumeDocxBytes(resumeSnapshotToDoc(snapshot)),
  docx.resumeDocxBytes({
    ...liveDoc,
    fit: {
      ...liveDoc.fit,
      ...fit,
      fitVars: fit.vars,
    },
  }),
  'read-only Word export matches the live Word export at capture time',
);

// Mutating basics/header, a job, and bullet formatting later cannot move the
// frozen render or export document.
const frozenJson = JSON.stringify(snapshot.doc);
book.profile.name = 'Changed Person';
book.profile.email = 'changed@example.com';
book.jobs[0].company = 'Changed Company';
book.jobs[0].title = 'Changed Job';
book.jobs[0].groups[0].heading = 'Changed heading';
book.jobs[0].groups[0].bullets[0].lead = 'Changed bullet';
book.jobs[0].groups[0].bullets[0].body = 'Changed body';
book.jobs[0].groups[0].bullets[0].rich = [
  { text: 'Changed', bold: true, italic: true },
];
book.additional[0].label = 'Changed additional';
assert.equal(JSON.stringify(resumeSnapshotById(book, snapshot.id).doc), frozenJson);
assert.equal(
  renderResumeHtml(resumeSnapshotToDoc(resumeSnapshotById(book, snapshot.id))),
  expectedHtml,
);

// Rename changes metadata only and retains an append-only metadata event.
const beforeRenameDoc = JSON.stringify(resumeSnapshotById(book, snapshot.id).doc);
book = renameResumeSnapshot(
  book,
  snapshot.id,
  'Board application – final',
  () => Date.parse('2026-10-10T12:00:00.000Z'),
  random,
);
const renamed = resumeSnapshotById(book, snapshot.id);
assert.equal(renamed.name, 'Board application – final');
assert.equal(JSON.stringify(renamed.doc), beforeRenameDoc);
assert.ok(renamed.events.some((event) => event.kind === 'rename'));

// Delete is a tombstone event: hidden from the bank, retained for no-loss
// merge/recovery, and never physically removed from the book payload.
book = deleteResumeSnapshot(
  book,
  snapshot.id,
  () => Date.parse('2026-10-11T12:00:00.000Z'),
  random,
);
assert.equal(activeResumeSnapshots(book).some((row) => row.id === snapshot.id), false);
const deleted = resumeSnapshotById(book, snapshot.id, { includeDeleted: true });
assert.ok(deleted, 'deleted snapshot remains recoverable in normalized data');
assert.equal(JSON.stringify(deleted.doc), beforeRenameDoc);
assert.ok(deleted.events.some((event) => event.kind === 'delete'));

// Two tabs creating different snapshots from the same base must merge as a
// conflict-free id-keyed union.
const base = fixture();
const local = capture(base, 'Local snapshot', fit).store;
const remote = capture(base, 'Remote snapshot', fit).store;
const merged = mergeConcurrentBooks(base, local, remote);
assert.equal(merged.conflicts.filter((row) => row.collection === 'resumeSnapshots').length, 0);
assert.deepEqual(
  activeResumeSnapshots(merged.book).map((row) => row.name).sort(),
  ['Local snapshot', 'Remote snapshot'],
);

// Concurrent metadata events on the same immutable snapshot are unioned. A
// stale tab cannot resurrect a deleted snapshot or erase a rename event.
const sharedBase = capture(fixture(), 'Shared snapshot', fit).store;
const sharedId = activeResumeSnapshots(sharedBase)[0].id;
const renamedSide = renameResumeSnapshot(
  sharedBase,
  sharedId,
  'Renamed in tab A',
  () => Date.parse('2026-10-12T12:00:00.000Z'),
  random,
);
const deletedSide = deleteResumeSnapshot(
  sharedBase,
  sharedId,
  () => Date.parse('2026-10-12T12:00:01.000Z'),
  random,
);
const metadataMerge = mergeConcurrentBooks(sharedBase, renamedSide, deletedSide);
const metadataRow = resumeSnapshotById(metadataMerge.book, sharedId, { includeDeleted: true });
assert.ok(metadataRow.events.some((event) => event.kind === 'rename'));
assert.ok(metadataRow.events.some((event) => event.kind === 'delete'));
assert.equal(activeResumeSnapshots(metadataMerge.book).length, 0);

// Old clients that do not know the collection cannot strip it during a valid
// revision-preconditioned PUT.
const oldClientPayload = structuredClone(sharedBase);
delete oldClientPayload.resumeSnapshots;
const preserved = preserveResumeSnapshots(oldClientPayload, sharedBase, clock);
assert.equal(preserved.resumeSnapshots.length, sharedBase.resumeSnapshots.length);

// Normalize/serialize/reload preserves immutable docs, metadata events, and
// the snapshot schema. Rendered page vars must be usable by print/PDF.
const roundTrip = normalizeStore(JSON.parse(serializeBook(book).json), clock);
const roundTripSnapshot = resumeSnapshotById(roundTrip, snapshot.id, { includeDeleted: true });
assert.equal(roundTripSnapshot.v, RESUME_SNAPSHOT_SCHEMA);
assert.equal(JSON.stringify(roundTripSnapshot.doc), beforeRenameDoc);
assert.match(
  resumeDocument(renderResumeHtml(resumeSnapshotToDoc(roundTripSnapshot)), {
    fittedVars: roundTripSnapshot.fit.vars,
  }),
  /--fs: 9\.5pt/,
);

// Exercise the browser API contract through PUT and GET while using the same
// server preservation/normalization boundary as lib/brag-book.js.
const apiBook = capture(fixture(), 'API round trip', fit).store;
let serverPayload = emptyStore();
let serverRevision = 1;
const originalFetch = globalThis.fetch;
globalThis.fetch = async (path, options = {}) => {
  assert.equal(path, '/api/bb-book');
  if (options.method === 'PUT') {
    const body = JSON.parse(options.body);
    serverPayload = JSON.parse(serializeBook(
      preserveServerHistory(body.book, serverPayload, clock),
    ).json);
    serverRevision += 1;
  }
  return new Response(JSON.stringify({
    book: serverPayload,
    updatedAt: ISO,
    revision: serverRevision,
    created: false,
  }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
};
try {
  await storeApi.saveBook('test-token', JSON.parse(serializeBook(apiBook).json), {
    revision: 1,
  });
  const loaded = await storeApi.loadBook('test-token');
  const loadedBook = normalizeStore(loaded.book, clock);
  assert.deepEqual(
    activeResumeSnapshots(loadedBook).map((row) => row.name),
    ['API round trip'],
    'resumeSnapshots survive the PUT/GET JSON boundary',
  );
} finally {
  globalThis.fetch = originalFetch;
}

// UI/source contract: additive routes and compact responsive bank.
const appSource = readFileSync(new URL('../brag-book/app.js', import.meta.url), 'utf8');
const routeSource = readFileSync(new URL('../brag-book/routes.js', import.meta.url), 'utf8');
const cssSource = readFileSync(new URL('../brag-book/app.css', import.meta.url), 'utf8');
const apiSource = readFileSync(new URL('../api/brag-book.js', import.meta.url), 'utf8');
const serverSource = readFileSync(new URL('../lib/brag-book.js', import.meta.url), 'utf8');
assert.match(appSource, /Save a copy/);
assert.match(appSource, /Saved resumes/);
assert.match(appSource, /function savedResumesBank/);
assert.match(appSource, /function refreshResumeSnapshotPreview/);
assert.match(appSource, /paintResumeSnapshotSaveButton\(current\?\.id\)/);
const scaleSource = appSource.slice(
  appSource.indexOf('function scaleResumeFrame'),
  appSource.indexOf('\nasync function ', appSource.indexOf('function scaleResumeFrame')),
);
assert.match(scaleSource, /RESUME_PAGE_WIDTH_PX \* scale/);
assert.match(scaleSource, /\(wrap\.clientWidth - scaledWidth\) \/ 2/);
assert.match(scaleSource, /translateX\(\$\{offset\}px\) scale\(\$\{scale\}\)/);
const frozenPreviewSource = appSource.slice(
  appSource.indexOf('function refreshResumeSnapshotPreview'),
  appSource.indexOf('\nfunction ', appSource.indexOf('function refreshResumeSnapshotPreview') + 9),
);
assert.doesNotMatch(frozenPreviewSource, /fitOnePage|updatePostingResume|saveStore/);
assert.match(routeSource, /saved-resumes/);
assert.match(apiSource, /req\.method === 'PUT'[\s\S]*putBook/);
assert.match(apiSource, /req\.method === 'GET'[\s\S]*getBook/);
assert.match(serverSource, /serializeBook\(preserveServerHistory\(raw,\s*current\.book\)\)/);
assert.match(serverSource, /book:\s*serializeBook\(row\.payload\)\.book/);
assert.match(cssSource, /\.bb-snapshot-list\s*\{/);
assert.match(cssSource, /\.bb-snapshot-row\s*\{/);
assert.match(cssSource, /@media \(max-width:\s*860px\)[\s\S]*?\.bb-snapshot-row/);

console.log('Brag Book immutable resume snapshot tests passed.');
