import assert from 'node:assert/strict';
import { normalizeStore, groupEntriesAsExperience } from '../brag-book/engine.js';
import { buildBookExportDocument } from '../brag-book/book-export.js';

const clock = () => Date.parse('2026-10-08T12:00:00.000Z');
let store = normalizeStore({
  jobs: [{ id: 'j1', company: 'Co', title: 'Lead' }],
  entries: [
    { id: 'e1', kind: 'experience', title: 'One', jobId: 'j1' },
    { id: 'e2', kind: 'experience', title: 'Two', jobId: 'j1' },
  ],
}, clock);
store = groupEntriesAsExperience(store, ['e1', 'e2'], { jobId: 'j1', title: 'Launch' }, clock).store;
const html = buildBookExportDocument(store);
assert.match(html, /Launch/);
assert.match(html, /bb-export-xp/);
assert.match(html, /Two/);
console.log('test-brag-book-experiences-export.mjs: ok');
