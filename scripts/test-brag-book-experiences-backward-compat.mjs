/**
 * Shipping gate: pre-Experiences books must not change resume output or stored
 * resume records across upgrade, load/save, or later bullet grouping.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  assertResumeBackwardCompatEqual,
  resumePersistentRecords,
  resumeRenderSignatures,
} from '../brag-book/experiences-backward-compat.js';
import {
  groupEntriesAsExperience,
  normalizeStore,
  preserveServerHistory,
  serializeBook,
} from '../brag-book/engine.js';
import { exportBookJsonText, parseExportedBookJson } from '../brag-book/book-export.js';

const fixtureDir = new URL('./fixtures/brag-book/', import.meta.url);
const rawV3Export = readFileSync(new URL('pre-experiences-v3-export.json', fixtureDir), 'utf8');
const schema3Sample = JSON.parse(
  readFileSync(new URL('schema-3-sample.json', fixtureDir), 'utf8'),
);

const clock = () => Date.parse('2026-10-20T12:00:00.000Z');
let rand = 0;
const random = () => {
  rand += 0.13;
  return rand % 1;
};

function loadPreExperiencesRaw() {
  return JSON.parse(rawV3Export);
}

function clientLoadSave(book) {
  return normalizeStore(JSON.parse(serializeBook(book).json), clock);
}

function serverLoadSave(incoming, server) {
  return normalizeStore(
    JSON.parse(serializeBook(preserveServerHistory(incoming, server, clock)).json),
    clock,
  );
}

// --- Fixture: committed v3 JSON export (no experiences metadata) ---
const raw = loadPreExperiencesRaw();
assert.equal(Number(raw.v), 3);
assert.equal(raw.experiences, undefined);
assert.equal(raw.experienceGroupingBackups, undefined);

const beforeUpgrade = normalizeStore(raw, clock);
const beforeSignatures = resumeRenderSignatures(beforeUpgrade);
const beforeRecords = resumePersistentRecords(beforeUpgrade);

const afterUpgrade = normalizeStore(raw, clock);
assertResumeBackwardCompatEqual(beforeUpgrade, afterUpgrade, 'normalizeStore upgrade');

// Load-and-save on a v4-aware client must not mutate resume slices.
const afterClientSave = clientLoadSave(afterUpgrade);
assert.deepEqual(afterClientSave.profile, beforeUpgrade.profile);
assert.deepEqual(resumePersistentRecords(afterClientSave), beforeRecords);
assert.deepEqual(resumeRenderSignatures(afterClientSave), beforeSignatures);

// Simulated old tab (still sends v3) against a server that already upgraded.
const oldTabPayload = { ...raw, profile: { ...raw.profile, summary: 'Old client edit' } };
const afterOldClientSave = serverLoadSave(oldTabPayload, afterUpgrade);
assert.equal(afterOldClientSave.profile.summary, 'Old client edit');
assert.deepEqual(
  resumeRenderSignatures(beforeUpgrade),
  resumeRenderSignatures(afterOldClientSave),
);
assert.deepEqual(
  resumePersistentRecords(beforeUpgrade),
  resumePersistentRecords(afterOldClientSave),
);

// Old export/import path (lossless text round trip).
const exportText = exportBookJsonText(beforeUpgrade);
const reimported = parseExportedBookJson(exportText);
assertResumeBackwardCompatEqual(beforeUpgrade, reimported, 'exportBookJsonText round trip');

// Grouping bullets into an experience must not change any resume surface.
const entryIds = afterUpgrade.entries
  .filter((entry) => entry.jobId === 'job_pwc')
  .slice(0, 2)
  .map((entry) => entry.id);
assert.equal(entryIds.length, 2);
const grouped = groupEntriesAsExperience(
  afterUpgrade,
  entryIds,
  { jobId: 'job_pwc', title: 'SOX testing program' },
  clock,
  random,
);
const afterGrouping = normalizeStore(grouped.store, clock);
assertResumeBackwardCompatEqual(beforeUpgrade, afterGrouping, 'after groupEntriesAsExperience');

// Minimal schema-3 sample still upgrades without touching empty resume state.
const minimalBefore = normalizeStore(schema3Sample, clock);
const minimalAfter = clientLoadSave(minimalBefore);
assert.deepEqual(resumeRenderSignatures(minimalBefore), resumeRenderSignatures(minimalAfter));
assert.deepEqual(resumePersistentRecords(minimalBefore), resumePersistentRecords(minimalAfter));

console.log('test-brag-book-experiences-backward-compat.mjs: ok');
