/** Phase 1 — experience metadata preservation for old clients (no UI). */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  EXPERIENCE_SCHEMA,
  bookSchemaVersion,
  emptyStore,
  normalizeStore,
  preserveExperienceMetadataForOldClient,
  preserveServerHistory,
  serializeBook,
  shouldBlockEmptyOverwrite,
} from '../brag-book/engine.js';

const fixtureDir = new URL('./fixtures/brag-book/', import.meta.url);
const schema3 = JSON.parse(readFileSync(new URL('schema-3-sample.json', fixtureDir), 'utf8'));
const schema4Server = JSON.parse(readFileSync(new URL('schema-4-grouped-server.json', fixtureDir), 'utf8'));

const clock = () => Date.parse('2026-10-20T12:00:00.000Z');

assert.equal(bookSchemaVersion({ v: 3 }), 3);
assert.equal(bookSchemaVersion({ v: 4 }), EXPERIENCE_SCHEMA);
assert.equal(bookSchemaVersion({}), 3);

const server = normalizeStore(schema4Server, clock);
assert.equal(server.experiences.length, 1);
assert.equal(server.entries.find((e) => e.id === 'en_fixture_a')?.experienceId, 'xp_embedded');
assert.equal(server.experienceGroupingBackups.length, 1);

const legacyClientPayload = {
  ...schema3,
  entries: schema3.entries.map((entry) => (
    entry.id === 'en_fixture_a'
      ? { ...entry, title: 'Edited wording from an old client', updatedAt: '2026-10-20T12:00:00.000Z' }
      : entry
  )),
};
const merged = preserveServerHistory(legacyClientPayload, server, clock);
const mergedEntry = merged.entries.find((e) => e.id === 'en_fixture_a');
assert.equal(mergedEntry?.title, 'Edited wording from an old client');
assert.equal(mergedEntry?.experienceId, 'xp_embedded', 'grouping restored from server');
assert.equal(merged.experiences.length, 1);
assert.equal(merged.experiences[0].title, 'Embedded-risk launch');
assert.equal(merged.experienceGroupingBackups.length, 1);

const roundTrip = JSON.parse(serializeBook(merged).json);
assert.equal(roundTrip.entries.find((e) => e.id === 'en_fixture_a')?.experienceId, 'xp_embedded');
assert.equal(roundTrip.experiences[0].id, 'xp_embedded');

const v3Normalized = normalizeStore(schema3, clock);
assert.equal(v3Normalized.experiences.length, 0);
assert.equal(v3Normalized.entries.every((e) => !e.experienceId), true);

const explicitUngroup = normalizeStore({
  v: EXPERIENCE_SCHEMA,
  ...schema4Server,
  entries: schema4Server.entries.map((entry) => (
    entry.id === 'en_fixture_a' ? { ...entry, experienceId: '' } : entry
  )),
}, clock);
const saved = normalizeStore(schema4Server, clock);
const kept = preserveExperienceMetadataForOldClient(explicitUngroup, saved, EXPERIENCE_SCHEMA);
assert.equal(
  kept.entries.find((e) => e.id === 'en_fixture_a')?.experienceId,
  '',
  'v4 client explicit ungroup is not overwritten',
);

assert.equal(
  shouldBlockEmptyOverwrite(emptyStore(), server),
  true,
  'experiences count as real book content for empty-overwrite guard',
);

console.log('test-brag-book-experiences-preservation.mjs: ok');
