/**
 * Single-flight book save queue with durable local pending snapshots.
 * Browser-safe ESM — no node: imports.
 */

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

function mergePlainObject(base, local, remote) {
  if (sameValue(local, remote)) return local ?? remote ?? null;
  if (sameValue(base, local)) return remote ?? null;
  if (sameValue(base, remote)) return local ?? null;
  return remote ?? local ?? null;
}

export function mergeConcurrentBooks(base, local, remote) {
  const book = { ...(remote || {}) };
  const conflicts = [];
  const entries = mergeRecordLists(base?.entries, local?.entries, remote?.entries, mergeEntryRecord);
  book.entries = entries.list;
  conflicts.push(...entries.conflicts);
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
  conflicts.push(...knowledge.conflicts);
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
    conflicts.push(...merged.conflicts);
  }
  book.profile = mergePlainObject(base?.profile, local?.profile, remote?.profile);
  book.resumeSettings = mergePlainObject(base?.resumeSettings, local?.resumeSettings, remote?.resumeSettings);
  book.basicsBackup = mergePlainObject(base?.basicsBackup, local?.basicsBackup, remote?.basicsBackup);
  book.jobSetup = mergePlainObject(base?.jobSetup, local?.jobSetup, remote?.jobSetup);
  book.v = remote?.v ?? local?.v ?? base?.v;
  return { book, conflicts };
}

export function createBookSaveController({
  initialRevision = null,
  save,
  persistPending,
  clearPending,
  onStatus,
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
      const errMessage = error?.message && /retry/i.test(error.message)
        ? error.message
        : 'Couldn\'t save — retrying…';
      emit('error', errMessage);
      scheduleRetry(snapshot);
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
    flush(reason, book, { keepalive = false } = {}) {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }
      if (book) currentBook = clone(book);
      if (!currentBook && !queuedSnapshot && !activeRequest && localVersion <= confirmedVersion) {
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
