/**
 * INTENTIONALLY FAILING — current save-path reproductions for bug-bash phase 2.
 *
 * This complements test-brag-book-bugbash-save.mjs: this file proves the
 * defects in today's app/merge code, while that file pins the replacement
 * save-controller contract.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mergeBook, normalizeStore } from '../brag-book/engine.js';

const failures = [];

async function check(name, fn) {
  try {
    await fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    failures.push({ name, error });
    console.error(`FAIL ${name}: ${error.message}`);
  }
}

const appSource = readFileSync(new URL('../brag-book/app.js', import.meta.url), 'utf8');
const apiSource = readFileSync(new URL('../api/brag-book.js', import.meta.url), 'utf8');
const libSource = readFileSync(new URL('../lib/brag-book.js', import.meta.url), 'utf8');

await check('in-app navigation flushes pending saves', () => {
  const hashHandler = appSource.match(/window\.addEventListener\('hashchange',[\s\S]*?\n\}\);/)?.[0] || '';
  assert.match(hashHandler, /flush|pushStore/, 'hashchange currently renders without flushing');
});

await check('visibility/page lifecycle flush all dirty states', () => {
  const lifecycle = appSource.slice(appSource.indexOf("window.addEventListener('pagehide'"));
  assert.match(lifecycle, /beforeunload/, 'beforeunload has no save hook');
  const visibility = lifecycle.match(/document\.addEventListener\('visibilitychange',[\s\S]*?\n\}\);/)?.[0] || '';
  assert.match(visibility, /hidden[\s\S]*(?:flush|pushStore)/, 'hidden documents currently do not flush');
  const pagehide = lifecycle.match(/window\.addEventListener\('pagehide',[\s\S]*?\n\}\);/)?.[0] || '';
  assert.doesNotMatch(
    pagehide,
    /if\s*\(!persistTimer\)\s*return/,
    'a failed save is dirty with no timer, so this guard drops its last retry',
  );
});

await check('editable fields enter the model on input, before blur or local timers', () => {
  const jobCatalog = appSource.slice(
    appSource.indexOf('function jobCatalogRow'),
    appSource.indexOf('function jobCatalogSection'),
  );
  assert.doesNotMatch(
    jobCatalog,
    /let saveTimer\s*=\s*null/,
    'job catalog text currently lives only in a component timer for 300 ms',
  );
  const jobMeta = appSource.slice(
    appSource.indexOf('function jobMeta'),
    appSource.indexOf('function pasteMore'),
  );
  assert.match(
    jobMeta,
    /onInput:[\s\S]*updatePosting/,
    'posting role/company/link currently enter the model only on change/blur',
  );
  const requirement = appSource.slice(
    appSource.indexOf('function requirementTableRow'),
    appSource.indexOf('function requirementTable(job'),
  );
  assert.match(
    requirement,
    /onInput:[\s\S]*updateRequirement/,
    'requirement text currently enters the model only on change/blur',
  );
});

await check('the PUT path is single-flight', () => {
  assert.match(appSource, /createBookSaveController/, 'cloud saves must use the single-flight save controller');
  assert.match(appSource, /performCloudSave[\s\S]*revision/, 'each PUT must carry the expected revision');
  assert.doesNotMatch(
    appSource.slice(appSource.indexOf('async function pushStore'), appSource.indexOf('async function pullBookIfClean')),
    /bookPushing\s*=\s*true[\s\S]*saveBook\(/,
    'pushStore must not run overlapping saveBook calls',
  );
});

await check('same-entry edits from two tabs are not overwritten by client timestamps', () => {
  const clock = () => Date.parse('2026-10-08T13:00:00.000Z');
  const base = normalizeStore({
    entries: [{
      id: 'en-conflict',
      title: 'base',
      rich: [{ text: 'base', bold: false }],
      updatedAt: '2026-10-08T10:00:00.000Z',
    }],
  }, clock);
  const local = normalizeStore({
    ...base,
    entries: [{
      ...base.entries[0],
      title: 'local unsaved',
      rich: [{ text: 'local unsaved', bold: false }],
      updatedAt: '2026-10-08T12:00:00.000Z',
    }],
  }, clock);
  const remote = normalizeStore({
    ...base,
    entries: [{
      ...base.entries[0],
      title: 'remote committed',
      rich: [{ text: 'remote committed', bold: false }],
      updatedAt: '2026-10-08T11:00:00.000Z',
    }],
  }, clock);
  const merged = mergeBook(base, local, remote);
  assert.equal(
    merged.entries[0].title,
    'remote committed',
    'the current merge silently chooses the client-clock winner and overwrites confirmed remote text',
  );
});

await check('deployment guards preserve old clients and browser-only edits', () => {
  assert.match(
    libSource,
    /hasLegacyTimestamp[\s\S]*bookSaveGuard/,
    'timestamp-guarded old clients must remain safe during the revision rollout',
  );
  assert.match(
    libSource,
    /preserveServerHistory\(raw,\s*current\.book\)/,
    'timestamp-compatible writes must retain schema-v2 recovery history that old clients strip',
  );
  assert.match(apiSource, /err\.status === 428/);
  assert.match(apiSource, /res\.status\(err\.status\)/, 'missing revisions must be returned as 428, not hidden as 502');
  assert.match(appSource, /Download older browser backup/);
  assert.match(appSource, /retainLocalConflictValues/, 'reload conflicts must keep local text visible');
  assert.match(appSource, /restorePending/, 'a conflicted outbox must not be rewritten as a clean remote snapshot');
});

if (failures.length) {
  throw new AggregateError(
    failures.map(({ error }) => error),
    `${failures.length} current Brag Book save regressions reproduced`,
  );
}

console.log('Current Brag Book save-path regressions passed.');
