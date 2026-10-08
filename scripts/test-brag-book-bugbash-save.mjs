/**
 * INTENTIONALLY FAILING — bug-bash phase 2.
 *
 * Run after adding brag-book/save-controller.js:
 *   node scripts/test-brag-book-bugbash-save.mjs
 *
 * The module is deliberately absent before phase 2. Its contract is pinned
 * here so the implementation cannot regress into overlapping whole-book PUTs.
 */
import assert from 'node:assert/strict';
import {
  SAVE_FLUSH_EVENTS,
  createBookSaveController,
  mergeConcurrentBooks,
  retainLocalConflictValues,
} from '../brag-book/save-controller.js';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

const expectedFlushEvents = ['blur', 'navigation', 'visibilitychange:hidden', 'pagehide', 'beforeunload'];
for (const event of expectedFlushEvents) {
  assert.ok(SAVE_FLUSH_EVENTS.has(event), `${event} must flush pending edits`);
}

const requests = [];
const statuses = [];
let pendingSnapshot = null;
let active = 0;
let maxActive = 0;
const controller = createBookSaveController({
  initialRevision: 'rev-0',
  save: (request) => {
    const wait = deferred();
    active += 1;
    maxActive = Math.max(maxActive, active);
    requests.push({
      request: structuredClone(request),
      resolve(value) {
        active -= 1;
        wait.resolve(value);
      },
      reject(error) {
        active -= 1;
        wait.reject(error);
      },
    });
    return wait.promise;
  },
  persistPending: (snapshot) => { pendingSnapshot = structuredClone(snapshot); },
  clearPending: () => { pendingSnapshot = null; },
  onStatus: (status) => statuses.push(status),
});

controller.markDirty({ value: 'first edit' });
const firstFlush = controller.flush('navigation');
assert.equal(requests.length, 1);
assert.equal(requests[0].request.book.value, 'first edit');
assert.equal(requests[0].request.revision, 'rev-0');

controller.markDirty({ value: 'newer edit' });
controller.flush('pagehide');
assert.equal(requests.length, 1, 'a pagehide during a PUT must queue, not overlap, the next PUT');
assert.equal(pendingSnapshot.book.value, 'newer edit', 'the latest unsaved edit must be durable locally');
assert.notEqual(statuses.at(-1), 'saved', 'Saved cannot be shown while a newer edit is pending');

requests[0].resolve({ book: { value: 'first edit' }, revision: 'rev-1' });
await firstFlush;
await Promise.resolve();
assert.equal(requests.length, 2, 'the queued edit must start after the first response');
assert.equal(requests[1].request.book.value, 'newer edit');
assert.equal(requests[1].request.revision, 'rev-1');
assert.equal(requests[1].request.keepalive, true);

requests[1].resolve({ book: { value: 'newer edit' }, revision: 'rev-2' });
await controller.whenIdle();
assert.equal(maxActive, 1, 'out-of-order responses are prevented by a single-flight queue');
assert.equal(controller.state.revision, 'rev-2');
assert.equal(controller.state.status, 'saved');
assert.equal(pendingSnapshot, null);
await controller.flush('blur');
assert.equal(requests.length, 2, 'a clean blur must not replay an already acknowledged snapshot');

const retryRequests = [];
const retryStatuses = [];
let retryPending = null;
const retrying = createBookSaveController({
  initialRevision: 'rev-a',
  save: (request) => {
    const wait = deferred();
    retryRequests.push({ request: structuredClone(request), ...wait });
    return wait.promise;
  },
  persistPending: (snapshot) => { retryPending = structuredClone(snapshot); },
  clearPending: () => { retryPending = null; },
  onStatus: (status) => retryStatuses.push(status),
});
retrying.markDirty({ value: 'must survive failure' });
const failed = retrying.flush('blur');
retryRequests[0].reject(new Error('offline'));
assert.equal(await failed, false);
assert.equal(retrying.state.status, 'error');
assert.equal(retryPending.book.value, 'must survive failure');
assert.match(retrying.state.message, /retry/i);
assert.notEqual(retryStatuses.at(-1), 'saved');

const retried = retrying.retryNow();
assert.equal(retryRequests.length, 2);
retryRequests[1].resolve({ book: { value: 'must survive failure' }, revision: 'rev-b' });
assert.equal(await retried, true);
assert.equal(retrying.state.status, 'saved');

const base = {
  entries: [{ id: 'en-1', title: 'base', updatedAt: '2026-10-08T10:00:00.000Z' }],
};
const local = {
  entries: [{ id: 'en-1', title: 'local unsaved', updatedAt: '2026-10-08T12:00:00.000Z' }],
};
const remote = {
  entries: [{ id: 'en-1', title: 'remote committed', updatedAt: '2026-10-08T11:00:00.000Z' }],
};
const conflict = mergeConcurrentBooks(base, local, remote);
assert.equal(conflict.book.entries[0].title, 'remote committed');
assert.equal(conflict.conflicts.length, 1, 'same-record two-tab edits require explicit resolution');
assert.equal(conflict.conflicts[0].local.title, 'local unsaved');
assert.equal(conflict.conflicts[0].remote.title, 'remote committed');

const disjoint = mergeConcurrentBooks(
  { entries: [] },
  { entries: [{ id: 'local', title: 'local' }] },
  { entries: [{ id: 'remote', title: 'remote' }] },
);
assert.equal(disjoint.conflicts.length, 0);
assert.deepEqual(new Set(disjoint.book.entries.map((entry) => entry.id)), new Set(['local', 'remote']));

const conflictRequests = [];
let conflictPending = null;
const conflicting = createBookSaveController({
  initialRevision: 1,
  save: (request) => {
    const wait = deferred();
    conflictRequests.push({ request: structuredClone(request), ...wait });
    return wait.promise;
  },
  persistPending: (snapshot) => { conflictPending = structuredClone(snapshot); },
  clearPending: () => { conflictPending = null; },
  onConflict: (error, newestLocal) => {
    const merged = mergeConcurrentBooks(error.baseBook, newestLocal, error.book);
    return {
      book: retainLocalConflictValues(merged.book, merged.conflicts),
      conflicts: merged.conflicts,
      retry: false,
    };
  },
});
conflicting.markDirty(local);
const conflictFlush = conflicting.flush('blur');
conflictRequests[0].reject(Object.assign(new Error('conflict'), {
  status: 409,
  conflict: true,
  revision: 2,
  baseBook: base,
  book: remote,
}));
assert.equal(await conflictFlush, false);
assert.equal(conflicting.state.status, 'conflict');
assert.equal(conflicting.state.revision, 2);
assert.equal(conflictPending.book.entries[0].title, 'local unsaved');
assert.equal(conflictRequests.length, 1, 'field conflicts must stop automatic retries');
const keepLocal = conflicting.retryNow();
assert.equal(conflictRequests[1].request.revision, 2);
assert.equal(conflictRequests[1].request.book.entries[0].title, 'local unsaved');
conflictRequests[1].resolve({ book: local, revision: 3 });
assert.equal(await keepLocal, true);

console.log('Brag Book save-controller bug-bash regression passed.');
