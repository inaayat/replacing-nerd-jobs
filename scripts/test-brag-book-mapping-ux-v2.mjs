import assert from 'node:assert/strict';
import {
  normalizeStore,
  groupEntriesAsExperience,
  moveEntryToExperience,
} from '../brag-book/engine.js';
import {
  compactExperienceIndex,
  experienceRepresentativeEntry,
  pruneOrphanExperiences,
  readSessionEmptyExperienceIds,
  rememberSessionEmptyExperience,
} from '../brag-book/experiences-index.js';
import { experiencePickerLabel } from '../brag-book/experience-picker.js';

const clock = () => Date.parse('2026-10-20T12:00:00.000Z');

let store = normalizeStore({
  jobs: [{ id: 'j1', company: 'Co', title: 'Lead' }],
  entries: [
    { id: 'e1', kind: 'experience', title: 'Older', jobId: 'j1', updatedAt: '2026-10-01T12:00:00.000Z' },
    { id: 'e2', kind: 'experience', title: 'Newer preview', jobId: 'j1', updatedAt: '2026-10-19T12:00:00.000Z' },
  ],
}, clock);
store = groupEntriesAsExperience(store, ['e1', 'e2'], { jobId: 'j1', title: 'Launch' }, clock).store;

const rep = experienceRepresentativeEntry(store, store.experiences[0].id);
assert.equal(rep.id, 'e2', 'preview uses most recently edited version');

const index = compactExperienceIndex(store);
assert.equal(index.length, 1);
assert.equal(index[0].preview, 'Newer preview');
assert.equal(index[0].versionCount, 2);

const posting = {
  id: 'p1',
  requirements: [{
    id: 'r1',
    text: 'Req',
    bullets: [{ id: 'b1', entryId: 'e1', text: 'Older' }],
    entryIds: ['e1'],
    questions: [],
  }],
  resume: { mode: 'basics' },
};
const postingIndex = compactExperienceIndex(store, { posting });
assert.match(postingIndex[0].postingFact, /1 mapped/);

assert.equal(experiencePickerLabel(store, store.entries[0]), 'Launch');

store = pruneOrphanExperiences(store, { keepExperienceIds: new Set() }, clock);
assert.equal(store.experiences.filter((row) => !row.deletedAt).length, 1);

const mem = new Map();
globalThis.sessionStorage = {
  getItem: (k) => mem.get(k) ?? null,
  setItem: (k, v) => mem.set(k, String(v)),
};
rememberSessionEmptyExperience('xp_empty');
assert.ok(readSessionEmptyExperienceIds().has('xp_empty'));

let moved = moveEntryToExperience(store, 'e1', store.experiences[0].id, clock);
assert.equal(moved.store.entries.find((e) => e.id === 'e1').experienceId, store.experiences[0].id);

console.log('test-brag-book-mapping-ux-v2.mjs: ok');
