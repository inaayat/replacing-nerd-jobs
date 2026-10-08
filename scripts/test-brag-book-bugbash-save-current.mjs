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

await check('the PUT path is single-flight', () => {
  const push = appSource.slice(
    appSource.indexOf('async function pushStore'),
    appSource.indexOf('async function pullBookIfClean'),
  );
  assert.match(push, /if\s*\(bookPushing\)\s*(?:return|\{)/, 'bookPushing is set but never used as a request lock');
  assert.match(push, /localVersion|requestId/, 'responses are not tied to the local version they acknowledge');
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

if (failures.length) {
  throw new AggregateError(
    failures.map(({ error }) => error),
    `${failures.length} current Brag Book save regressions reproduced`,
  );
}

console.log('Current Brag Book save-path regressions passed.');
