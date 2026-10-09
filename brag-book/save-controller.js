/**
 * Single-flight book save queue with durable local pending snapshots.
 * Browser-safe ESM — no node: imports.
 */

import { mergeResumeSnapshotLists } from './resume-snapshots.js';

export const SAVE_FLUSH_EVENTS = new Set([
  'blur',
  'navigation',
  'visibilitychange:hidden',
  'pagehide',
  'beforeunload',
]);

const RETRY_BASE_MS = 2000;
const RETRY_MAX_MS = 60000;
const DEBOUNCE_MS = 500;

function clone(value) {
  return structuredClone(value);
}

function sameValue(a, b) {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

function mapById(list) {
  const out = new Map();
  for (const item of list || []) {
    if (item?.id) out.set(item.id, item);
  }
  return out;
}

function mergeScalarField(base, local, remote, field) {
  const bv = base?.[field];
  const lv = local?.[field];
  const rv = remote?.[field];
  const lChanged = !sameValue(bv, lv);
  const rChanged = !sameValue(bv, rv);
  if (lChanged && rChanged && !sameValue(lv, rv)) {
    return { value: rv, conflict: { field, local: lv, remote: rv } };
  }
  if (lChanged && !rChanged) return { value: lv, conflict: null };
  if (rChanged) return { value: rv, conflict: null };
  return { value: rv ?? lv ?? bv ?? null, conflict: null };
}

function mergeEntryRecord(base, local, remote) {
  if (!local && !remote) return { record: null, conflicts: [] };
  if (!local) return { record: remote, conflicts: [] };
  if (!remote) return { record: local, conflicts: [] };
  const fields = [
    'title', 'rich', 'role', 'company', 'jobId', 'when', 'tags',
    'situation', 'task', 'action', 'result', 'notes', 'kind',
    'createdAt', 'updatedAt', 'legacyVersions',
  ];
  const record = { ...remote };
  const conflicts = [];
  for (const field of fields) {
    const { value, conflict } = mergeScalarField(base, local, remote, field);
    if (conflict) conflicts.push({ id: remote.id, field, ...conflict });
    if (value !== undefined) record[field] = value;
  }
  if (!record.id) record.id = local.id || remote.id;
  return { record, conflicts: conflicts.length ? [{ id: record.id, local, remote, fields: conflicts }] : [] };
}

function mergeRecordLists(baseList, localList, remoteList, mergeFn) {
  const base = mapById(baseList);
  const local = mapById(localList);
  const remote = mapById(remoteList);
  const ids = new Set([...base.keys(), ...local.keys(), ...remote.keys()]);
  const out = [];
  const conflicts = [];
  for (const id of ids) {
    const merged = mergeFn(base.get(id), local.get(id), remote.get(id));
    if (merged.record) out.push(merged.record);
    conflicts.push(...merged.conflicts);
  }
  const order = [];
  for (const item of localList || []) if (item?.id && !order.includes(item.id)) order.push(item.id);
  for (const item of remoteList || []) if (item?.id && !order.includes(item.id)) order.push(item.id);
  const byId = new Map(out.map((item) => [item.id, item]));
  return {
    list: order.map((id) => byId.get(id)).filter(Boolean),
    conflicts,
  };
}

function mergePlainObject(base, local, remote, id) {
  if (sameValue(local, remote)) return { value: local ?? remote ?? null, conflict: null };
  if (sameValue(base, local)) return { value: remote ?? null, conflict: null };
  if (sameValue(base, remote)) return { value: local ?? null, conflict: null };
  const objects = [base, local, remote].every(
    (value) => value == null || (typeof value === 'object' && !Array.isArray(value)),
  );
  if (!objects || local == null || remote == null) {
    return {
      value: remote ?? local ?? null,
      conflict: { id, local, remote, fields: [], replace: true },
    };
  }
  const value = {};
  const fields = [];
  const keys = new Set([
    ...Object.keys(base || {}),
    ...Object.keys(local || {}),
    ...Object.keys(remote || {}),
  ]);
  for (const field of keys) {
    const merged = mergeScalarField(base, local, remote, field);
    if (merged.value !== undefined) value[field] = merged.value;
    if (merged.conflict) fields.push(merged.conflict);
  }
  return {
    value,
    conflict: fields.length ? { id, local, remote, fields } : null,
  };
}

export function mergeConcurrentBooks(base, local, remote) {
  const book = { ...(remote || {}) };
  const conflicts = [];
  const entries = mergeRecordLists(base?.entries, local?.entries, remote?.entries, mergeEntryRecord);
  book.entries = entries.list;
  conflicts.push(...entries.conflicts.map((conflict) => ({ ...conflict, collection: 'entries' })));
  const knowledge = mergeRecordLists(base?.knowledge, local?.knowledge, remote?.knowledge, (b, l, r) => {
    if (!l && !r) return { record: null, conflicts: [] };
    if (!l) return { record: r, conflicts: [] };
    if (!r) return { record: l, conflicts: [] };
    const merged = { ...r };
    const rowConflicts = [];
    for (const field of ['title', 'body', 'rich', 'doc', 'createdAt', 'updatedAt']) {
      const { value, conflict } = mergeScalarField(b, l, r, field);
      if (conflict) rowConflicts.push(conflict);
      if (value !== undefined) merged[field] = value;
    }
    return {
      record: merged,
      conflicts: rowConflicts.length ? [{ id: merged.id, local: l, remote: r, fields: rowConflicts }] : [],
    };
  });
  book.knowledge = knowledge.list;
  conflicts.push(...knowledge.conflicts.map((conflict) => ({ ...conflict, collection: 'knowledge' })));
  for (const key of ['postings', 'jobs', 'education', 'credentials', 'additional']) {
    const merged = mergeRecordLists(base?.[key], local?.[key], remote?.[key], (b, l, r) => {
      if (!l && !r) return { record: null, conflicts: [] };
      if (!l) return { record: r, conflicts: [] };
      if (!r) return { record: l, conflicts: [] };
      if (sameValue(l, r)) return { record: l, conflicts: [] };
      if (sameValue(b, l)) return { record: r, conflicts: [] };
      if (sameValue(b, r)) return { record: l, conflicts: [] };
      const lv = Date.parse(l.updatedAt || '') || 0;
      const rv = Date.parse(r.updatedAt || '') || 0;
      const winner = rv >= lv ? r : l;
      const loser = winner === r ? l : r;
      return {
        record: winner,
        conflicts: sameValue(l, r) ? [] : [{ id: l.id, local: l, remote: r }],
      };
    });
    book[key] = merged.list;
    conflicts.push(...merged.conflicts.map((conflict) => ({ ...conflict, collection: key })));
  }
  for (const key of ['profile', 'resumeSettings', 'basicsBackup', 'jobSetup']) {
    const merged = mergePlainObject(base?.[key], local?.[key], remote?.[key], key);
    book[key] = merged.value;
    if (merged.conflict) conflicts.push({ ...merged.conflict, collection: 'root' });
  }
  book.resumeSnapshots = mergeResumeSnapshotLists(
    base?.resumeSnapshots,
    local?.resumeSnapshots,
    remote?.resumeSnapshots,
  );
  book.v = remote?.v ?? local?.v ?? base?.v;
  return { book, conflicts };
}

export function retainLocalConflictValues(book, conflicts = []) {
  const next = clone(book || {});
  for (const conflict of conflicts) {
    const key = conflict?.collection;
    if (key === 'root' && conflict?.id) {
      if (conflict.replace) {
        next[conflict.id] = clone(conflict.local);
        continue;
      }
      const record = { ...(next[conflict.id] || {}) };
      for (const field of conflict.fields || []) {
        if (!field?.field) continue;
        if (field.local === undefined) delete record[field.field];
        else record[field.field] = clone(field.local);
      }
      next[conflict.id] = record;
      continue;
    }
    if (!key || !Array.isArray(next[key]) || !conflict?.id) continue;
    const index = next[key].findIndex((record) => record?.id === conflict.id);
    if (index < 0) continue;
    if (!Array.isArray(conflict.fields) || !conflict.fields.length) {
      next[key][index] = clone(conflict.local);
      continue;
    }
    const record = { ...next[key][index] };
    for (const field of conflict.fields) {
      if (!field?.field) continue;
      if (field.local === undefined) delete record[field.field];
      else record[field.field] = clone(field.local);
    }
    next[key][index] = record;
  }
  return next;
}

export function createBookSaveController({
  initialRevision = null,
  save,
  persistPending,
  clearPending,
  onStatus,
  onConflict,
} = {}) {
  let revision = initialRevision;
  let localVersion = 0;
  let confirmedVersion = 0;
  let status = 'local';
  let message = '';
  let activeRequest = null;
  let queuedSnapshot = null;
  let debounceTimer = null;
  let retryTimer = null;
  let retryAttempt = 0;
  let idleWaiters = [];
  let currentBook = null;

  function emit(nextStatus, nextMessage = '') {
    status = nextStatus;
    message = nextMessage;
    onStatus?.({ status, message, revision, localVersion, confirmedVersion });
  }

  function resolveIdle() {
    if (activeRequest || queuedSnapshot || debounceTimer || localVersion > confirmedVersion) return;
    const waiters = idleWaiters;
    idleWaiters = [];
    for (const resolve of waiters) resolve();
  }

  function buildSnapshot(book, { keepalive = false } = {}) {
    return {
      book: clone(book),
      revision,
      localVersion,
      requestId: `${localVersion}:${Date.now()}`,
      keepalive,
    };
  }

  let flushImpl = null;
  function scheduleDebounce() {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      flushImpl?.('debounce');
    }, DEBOUNCE_MS);
  }

  async function runSave(snapshot) {
    activeRequest = snapshot;
    emit('saving');
    try {
      const result = await save(snapshot);
      if (activeRequest?.requestId !== snapshot.requestId) return result;
      revision = result.revision ?? revision;
      confirmedVersion = Math.max(confirmedVersion, snapshot.localVersion);
      activeRequest = null;
      retryAttempt = 0;
      if (localVersion > confirmedVersion) {
        const keepalive = Boolean(queuedSnapshot?.keepalive);
        queuedSnapshot = null;
        const next = buildSnapshot(currentBook ?? snapshot.book, { keepalive });
        void runSave(next);
        return result;
      }
      queuedSnapshot = null;
      clearPending?.();
      emit('saved');
      resolveIdle();
      return result;
    } catch (error) {
      if (activeRequest?.requestId !== snapshot.requestId) throw error;
      activeRequest = null;
      if (error?.conflict || error?.status === 409) {
        if (retryTimer) {
          clearTimeout(retryTimer);
          retryTimer = null;
        }
        if (error.revision != null) revision = error.revision;
        const candidate = clone(currentBook ?? queuedSnapshot?.book ?? snapshot.book);
        const reconciliation = onConflict?.(error, candidate) || {};
        currentBook = clone(reconciliation.book ?? error.pendingBook ?? candidate);
        queuedSnapshot = null;
        persistPending?.(clone(buildSnapshot(currentBook)));
        if (reconciliation.retry === true && !(reconciliation.conflicts || []).length) {
          emit('retrying', 'Reconciled with the saved copy — saving…');
          return runSave(buildSnapshot(currentBook, { keepalive: snapshot.keepalive }));
        }
        emit(
          'conflict',
          error.message || 'This book changed in another tab. Your edits are kept on this device.',
        );
        throw error;
      }
      const errMessage = error?.message && /retry/i.test(error.message)
        ? error.message
        : 'Couldn\'t save — retrying…';
      const permanent = [400, 401, 403, 413, 428].includes(Number(error?.status));
      emit(
        'error',
        permanent ? (error?.message || 'Couldn\'t save. Your edits are kept on this device.') : errMessage,
      );
      if (!permanent) scheduleRetry(snapshot);
      resolveIdle();
      throw error;
    }
  }

  function scheduleRetry(snapshot) {
    if (retryTimer) clearTimeout(retryTimer);
    const delay = Math.min(RETRY_BASE_MS * (2 ** retryAttempt), RETRY_MAX_MS);
    retryAttempt += 1;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      emit('retrying', message || 'Couldn\'t save — retrying…');
      if (!activeRequest) void runSave(snapshot);
    }, delay);
  }

  function enqueueNetwork(snapshot) {
    persistPending?.(clone(snapshot));
    if (activeRequest) {
      queuedSnapshot = snapshot;
      return Promise.resolve(false);
    }
    return runSave(snapshot).then(() => true).catch(() => false);
  }

  const api = {
    get state() {
      return { status, message, revision, localVersion, confirmedVersion };
    },
    markDirty(book) {
      currentBook = clone(book);
      localVersion += 1;
      persistPending?.(clone(buildSnapshot(currentBook)));
      if (localVersion > confirmedVersion) emit('dirty');
      scheduleDebounce();
    },
    restorePending(book, {
      nextRevision = revision,
      restoredVersion = 1,
      conflictMessage = '',
    } = {}) {
      currentBook = clone(book);
      revision = nextRevision;
      localVersion = Math.max(localVersion + 1, Number(restoredVersion) || 1);
      persistPending?.(clone(buildSnapshot(currentBook)));
      if (conflictMessage) emit('conflict', conflictMessage);
      else emit('dirty');
    },
    flush(reason, book, { keepalive = false } = {}) {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }
      if (book) currentBook = clone(book);
      if (!queuedSnapshot && !activeRequest && localVersion <= confirmedVersion) {
        return Promise.resolve(true);
      }
      const snapshot = buildSnapshot(currentBook ?? queuedSnapshot?.book ?? activeRequest?.book, { keepalive });
      if (reason === 'pagehide' || reason === 'beforeunload') snapshot.keepalive = true;
      return enqueueNetwork(snapshot);
    },
    retryNow() {
      if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }
      if (!currentBook) return Promise.resolve(false);
      const snapshot = buildSnapshot(currentBook);
      return runSave(snapshot).then(() => true).catch(() => false);
    },
    whenIdle() {
      if (!activeRequest && !queuedSnapshot && !debounceTimer && localVersion <= confirmedVersion) {
        return Promise.resolve();
      }
      return new Promise((resolve) => { idleWaiters.push(resolve); });
    },
    setRevision(nextRevision) {
      revision = nextRevision;
    },
    setConfirmed(book, nextRevision) {
      if (nextRevision != null) revision = nextRevision;
      confirmedVersion = localVersion;
      clearPending?.();
      emit('saved');
    },
  };
  flushImpl = (reason, book, opts) => api.flush(reason, book, opts);
  return api;
}
