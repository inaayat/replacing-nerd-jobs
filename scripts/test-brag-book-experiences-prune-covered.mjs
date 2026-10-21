/** Mapped coverage-only experiences are never pruned as orphans. */
import assert from 'node:assert/strict';
import {
  addCareerJob,
  addExperienceCoverage,
  addPosting,
  addRequirement,
  createExperience,
  emptyStore,
} from '../brag-book/engine.js';
import {
  coveredExperienceIdsFromPostings,
  pruneOrphanExperiences,
} from '../brag-book/experiences-index.js';

const clock = () => Date.parse('2026-10-21T18:00:00.000Z');

let store = addCareerJob(emptyStore(), {
  id: 'j1',
  company: 'GoDaddy',
  title: 'Manager',
}, clock);
const created = createExperience(store, { jobId: 'j1', title: 'Empty mapped bucket' }, clock);
store = created.store;
const emptyXpId = created.changedExperienceIds[0];

store = addPosting(store, { title: 'Manager', company: 'GoDaddy' }, clock);
const postingId = store.postings[0].id;
store = addRequirement(store, postingId, 'Req one', clock);
const reqId = store.postings[0].requirements[0].id;
store = addExperienceCoverage(store, postingId, reqId, emptyXpId, clock);

assert.ok(coveredExperienceIdsFromPostings(store).has(emptyXpId));

const pruned = pruneOrphanExperiences(store, { keepExperienceIds: new Set() }, clock);
const row = pruned.experiences.find((xp) => xp.id === emptyXpId);
assert.ok(row && !row.deletedAt, 'coverage-only experience survives prune');

let orphanStore = addCareerJob(emptyStore(), {
  id: 'j2',
  company: 'Co',
  title: 'Role',
}, clock);
const orphanCreated = createExperience(orphanStore, { jobId: 'j2', title: 'Truly orphan' }, clock);
orphanStore = orphanCreated.store;
const orphanId = orphanCreated.changedExperienceIds[0];
const pruned2 = pruneOrphanExperiences(orphanStore, { keepExperienceIds: new Set() }, clock);
const orphan = pruned2.experiences.find((xp) => xp.id === orphanId);
assert.ok(orphan?.deletedAt, 'memberless unmapped experience is pruned');

console.log('test-brag-book-experiences-prune-covered.mjs: ok');
