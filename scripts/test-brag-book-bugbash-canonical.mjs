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
  serializeBook,
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

const migrated = normalizeStore({
  entries: [{
    id: 'en_newer_override',
    kind: 'experience',
    title: 'Older library wording',
    rich: [{ text: 'Older library wording', bold: false }],
    updatedAt: '2026-10-08T09:00:00.000Z',
  }],
  jobs: [{
    id: 'rj_newer_override',
    company: 'Example Co',
    groups: [{
      id: 'rg_newer_override',
      bullets: [{
        id: 'rb_newer_override',
        body: 'Copied career wording',
        sourceEntryIds: ['en_newer_override'],
      }],
    }],
  }],
  postings: [{
    id: 'job_newer_override',
    title: 'Target role',
    updatedAt: '2026-10-08T11:00:00.000Z',
    requirements: [{
      id: 'rq_orphan',
      text: 'Lead change',
      bullets: [{
        id: 'ln_orphan',
        text: 'Unlinked requirement wording',
        situation: 'Situation survives',
        task: 'Task survives',
        action: 'Action survives',
        result: 'Result survives',
        notes: 'Notes survive',
      }],
    }],
    resume: {
      includedJobIds: ['rj_newer_override'],
      overrides: {
        rb_newer_override: {
          body: 'Newest posting wording',
          edited: true,
        },
      },
    },
  }],
  additional: [{
    id: 'ad_keep',
    label: 'Interests',
    text: 'Exact; additional text stays',
    rich: [{ text: 'Exact; additional text stays', bold: false }],
  }],
}, clock);
const migratedEntry = migrated.entries.find((entry) => entry.id === 'en_newer_override');
assert.equal(migratedEntry.title, 'Newest posting wording');
assert.ok(migratedEntry.legacyVersions.some((version) => version.text === 'Older library wording'));
const orphan = migrated.entries.find((entry) => entry.title === 'Unlinked requirement wording');
assert.ok(orphan, 'an unlinked legacy requirement must get a canonical entry');
for (const field of ['situation', 'task', 'action', 'result', 'notes']) {
  const expected = field === 'notes'
    ? 'Notes survive'
    : `${field[0].toUpperCase()}${field.slice(1)} survives`;
  assert.equal(orphan[field], expected);
}
assert.equal(migrated.additional[0].text, 'Exact; additional text stays');
const serialized = serializeBook(migrated).book;
assert.deepEqual(serialized.postings[0].resume.overrides, {});
assert.equal(
  bulletLineText(compileResumeDoc(serialized.postings[0], serialized).sections.experience.jobs[0].groups[0].bullets[0]),
  'Newest posting wording',
);
assert.deepEqual(normalizeStore(serialized, clock), serialized, 'schema-v2 migration must be idempotent');

const untimestamped = normalizeStore({
  entries: [{ id: 'en_no_time', title: 'Untimestamped entry wins ties' }],
  jobs: [{
    id: 'rj_no_time',
    company: 'Example',
    groups: [{
      id: 'rg_no_time',
      bullets: [{ id: 'rb_no_time', body: 'Copied text', sourceEntryIds: ['en_no_time'] }],
    }],
  }],
  postings: [{
    id: 'job_no_time',
    title: 'Untimestamped posting',
    resume: {
      overrides: {
        rb_no_time: { body: 'Untimestamped override', edited: true },
      },
    },
  }],
}, clock);
assert.equal(untimestamped.entries.find((entry) => entry.id === 'en_no_time').title, 'Untimestamped entry wins ties');
assert.ok(untimestamped.entries.find((entry) => entry.id === 'en_no_time').legacyVersions
  .some((version) => version.text === 'Untimestamped override'));

console.log('Brag Book canonical-bullet bug-bash regression passed.');
