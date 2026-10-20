import assert from 'node:assert/strict';
import {
  emptyStore,
  normalizeStore,
  libraryCatalogGroups,
  experiencesPanelRows,
  experienceRequirementCoverageCount,
  groupEntriesAsExperience,
} from '../brag-book/engine.js';

const clock = () => Date.parse('2026-10-08T12:00:00.000Z');

const base = normalizeStore({
  jobs: [
    { id: 'j1', company: 'Go', title: 'Mgr', start: '2020', end: 'Present' },
    { id: 'j2', company: 'PwC', title: 'Assoc', start: '2017', end: '2019' },
  ],
  entries: [
    { id: 'e1', kind: 'experience', title: 'Alpha bullet', jobId: 'j1' },
    { id: 'e2', kind: 'experience', title: 'Beta bullet', jobId: 'j1' },
    { id: 'e3', kind: 'experience', title: 'Loose only', jobId: 'j1' },
    { id: 'e4', kind: 'experience', title: 'No job', jobId: '' },
  ],
  postings: [{
    id: 'p1',
    title: 'Target',
    requirements: [{
      id: 'r1',
      text: 'Lead risk',
      bullets: [{ id: 'b1', entryId: 'e1', text: 'Alpha bullet' }],
      entryIds: ['e1'],
      questions: [],
    }],
  }],
}, clock);

let store = groupEntriesAsExperience(base, ['e1', 'e2'], { jobId: 'j1', title: 'Risk launch' }, clock).store;
store = normalizeStore(store, clock);

const groups = libraryCatalogGroups(store);
const goDaddy = groups.find((g) => g.jobId === 'j1');
assert.ok(goDaddy);
const xpSection = goDaddy.sections.find((s) => s.kind === 'experience');
assert.equal(xpSection.label, 'Risk launch');
assert.equal(xpSection.rows.length, 2);
const loose = goDaddy.sections.find((s) => s.kind === 'loose');
assert.ok(loose);
assert.equal(loose.rows.length, 1);
assert.equal(loose.rows[0].id, 'e3');

const panel = experiencesPanelRows(store, { jobId: 'j1', postingId: 'p1' });
assert.equal(panel.length, 1);
assert.equal(panel[0].versionCount, 2);
assert.equal(panel[0].coversRequirements, 1);

const posting = store.postings[0];
assert.equal(experienceRequirementCoverageCount(store, posting, panel[0].id), 1);

console.log('test-brag-book-experiences-ui-catalog.mjs: ok');
