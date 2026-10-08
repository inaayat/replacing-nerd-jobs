/**
 * INTENTIONALLY FAILING — bug-bash phase 1.
 *
 * Run after implementing the canonical-bullet migration:
 *   node scripts/test-brag-book-bugbash-canonical.mjs
 *
 * This stays separate from test-brag-book.mjs so the migration can be landed
 * without making unrelated CI red first.
 */
import assert from 'node:assert/strict';
import {
  bulletLineText,
  compileResumeDoc,
  normalizeStore,
  postingById,
} from '../brag-book/engine.js';

const clock = () => Date.parse('2026-10-08T12:00:00.000Z');

const book = normalizeStore({
  entries: [{
    id: 'en_canonical',
    kind: 'experience',
    title: 'Current library wording with every saved edit',
    rich: [{ text: 'Current library wording with every saved edit', bold: false }],
    updatedAt: '2026-10-08T11:00:00.000Z',
  }],
  jobs: [{
    id: 'rj_canonical',
    company: 'Example Co',
    title: 'Manager',
    groups: [{
      id: 'rg_canonical',
      heading: '',
      bullets: [{
        id: 'rb_canonical',
        lead: '',
        body: 'Older copied wording',
        sourceEntryIds: ['en_canonical'],
      }],
    }],
  }],
  postings: [{
    id: 'job_canonical',
    title: 'Target role',
    updatedAt: '2026-10-07T11:00:00.000Z',
    resume: {
      includedJobIds: ['rj_canonical'],
      overrides: {
        rb_canonical: {
          lead: '',
          body: 'Stale posting override',
          edited: true,
        },
      },
    },
  }],
}, clock);

const posting = postingById(book, 'job_canonical');
const postingDoc = compileResumeDoc(posting, book);
const postingBullet = postingDoc.sections.experience.jobs[0].groups[0].bullets[0];
const basicsBullet = compileResumeDoc(null, book).sections.experience.jobs[0].groups[0].bullets[0];

assert.equal(
  bulletLineText(postingBullet),
  book.entries[0].title,
  'a stale edited:true posting override must not beat the newer canonical entry',
);
assert.equal(
  bulletLineText(basicsBullet),
  book.entries[0].title,
  'Resume basics must render the same canonical text as a posting',
);
assert.equal(
  postingBullet.hasOverride,
  false,
  'legacy wording must be resolved during migration instead of remaining a live fork',
);

console.log('Brag Book canonical-bullet bug-bash regression passed.');
