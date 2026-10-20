/** Export book — JSON completeness and print HTML sections. */
import assert from 'node:assert/strict';
import {
  activeResumeSnapshots,
  addEntry,
  addKnowledge,
  addPosting,
  addRequirement,
  addEntryBullet,
  emptyStore,
  saveResumeSnapshot,
  seedStarterResume,
} from '../brag-book/engine.js';
import {
  BOOK_EXPORT_SECTIONS,
  buildBookExportDocument,
  exportBookJsonText,
  normalizedBookSnapshot,
  parseExportedBookJson,
} from '../brag-book/book-export.js';

const clock = () => Date.parse('2026-10-20T12:00:00.000Z');
const random = () => 0.42;

const fit = {
  fontPt: 9.5,
  bulletLineHeight: 1.17,
  droppedBulletIds: [],
  droppedLabels: [],
  fits: true,
  pinnedBlocked: false,
  vars: { '--fs': '9.5pt', '--lh-bullet': '1.17' },
};

function richFixture() {
  let book = seedStarterResume(emptyStore(), clock);
  book = addKnowledge(book, {
    id: 'kb_exp',
    title: 'Metrics cheat sheet',
    body: '',
    doc: [
      { type: 'h2', indent: 0, spans: [{ text: 'Rates', bold: true }] },
      {
        type: 'table',
        align: ['left', 'right'],
        rows: [
          { cells: [{ spans: [{ text: 'KPI' }] }, { spans: [{ text: 'Target' }] }] },
          { cells: [{ spans: [{ text: 'Close days' }] }, { spans: [{ text: '5' }] }] },
        ],
      },
    ],
  }, clock);
  book = addPosting(book, { id: 'job_exp', title: 'Controller', company: 'Acme' }, clock);
  book = addRequirement(book, 'job_exp', 'Own the close', clock);
  const reqId = book.postings[0].requirements[0].id;
  const entryId = book.entries[0]?.id;
  if (entryId) {
    book = addEntryBullet(book, 'job_exp', reqId, entryId, '', clock);
  }
  book = addEntry(book, {
    id: 'en_star',
    title: 'Automated reconciliations',
    situation: 'Month-end backlog',
    task: 'Cut manual work',
    action: 'Built rules engine',
    result: '40% faster close',
    jobId: book.jobs[0]?.id,
  }, clock);
  const snapCapture = saveResumeSnapshot(book, 'job_exp', { name: 'Acme one-pager', fit }, clock, random);
  return snapCapture.store;
}

const fixture = richFixture();
const beforeJson = JSON.stringify(fixture);

const jsonText = exportBookJsonText(fixture);
assert.ok(jsonText.includes('"entries"'));
assert.ok(jsonText.includes('"knowledge"'));
assert.ok(jsonText.includes('"postings"'));
assert.ok(jsonText.includes('"resumeSnapshots"'));
assert.ok(jsonText.includes('"type": "table"') || jsonText.includes('"type":"table"'));

const roundTrip = parseExportedBookJson(jsonText);
const normalized = normalizedBookSnapshot(fixture);
const roundSnapshot = normalizedBookSnapshot(roundTrip);
assert.deepEqual(roundSnapshot, normalized);

assert.equal(JSON.stringify(fixture), beforeJson, 'exportBookJsonText must not mutate store');

const html = buildBookExportDocument(fixture, { exportedAt: new Date('2026-10-20T12:00:00.000Z') });
for (const section of BOOK_EXPORT_SECTIONS) {
  assert.match(html, new RegExp(`id="${section.id}"`), `missing section ${section.id}`);
  assert.match(html, new RegExp(`#${section.id}`), `missing TOC link ${section.id}`);
}
assert.match(html, /bb-export-table/);
assert.match(html, /Automated reconciliations/);
assert.match(html, /Own the close/);
assert.match(html, /Acme one-pager/);
assert.match(html, /page-break-inside:\s*avoid/);

buildBookExportDocument(fixture);
assert.equal(JSON.stringify(fixture), beforeJson, 'buildBookExportDocument must not mutate store');

assert.ok(normalized.entries.length >= 1);
assert.ok(normalized.knowledge.length >= 1);
assert.ok(normalized.postings.length >= 1);
assert.ok(activeResumeSnapshots(normalized).length >= 1);

console.log('test-brag-book-export: ok');
