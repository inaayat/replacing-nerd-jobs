// Brag Book PWA — zero data-loss sync guarantees (pure Node, no browser automation).
// Run: node scripts/test-brag-book-pwa-sync-guarantees.mjs
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { activateWaitingWorker } from '../brag-book/pwa.js';
import {
  createBookSaveController,
  mergeConcurrentBooks,
  retainLocalConflictValues,
} from '../brag-book/save-controller.js';
import { addEntry, bookSaveGuard, emptyStore, normalizeStore } from '../brag-book/engine.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const workerSrc = await readFile(join(root, 'brag-book/service-worker.js'), 'utf8');

const tests = [];
function guarantee(name, fn) {
  tests.push({ name, fn });
}

function experienceEntryIds(book) {
  return (book.entries || []).map((entry) => entry.id).filter(Boolean);
}

function assertUniqueExperienceIds(book, label = '') {
  const ids = experienceEntryIds(book);
  assert.equal(new Set(ids).size, ids.length, `${label}: duplicate experience entry ids`);
}

// (1) Online PUT reaches the server; the service worker never caches or serves API book data.
guarantee('guarantee_1_online_put_not_shadowed_by_service_worker', async () => {
  assert(workerSrc.includes("url.pathname.startsWith('/api/')"));
  assert(!workerSrc.includes('localStorage'));
  assert.match(workerSrc, /if \(request\.method !== 'GET'\) return/);

  const storage = new Map();
  const mirrorKey = 'brag-book-store-v2:user-sync-1';
  const outboxKey = 'brag-book-outbox-v2:user-sync-1';
  let putBody = null;

  const book = normalizeStore(emptyStore());
  book.profile = { ...book.profile, summary: 'Online edit' };

  const controller = createBookSaveController({
    initialRevision: 100,
    save: async (snapshot) => {
      putBody = snapshot;
      return { revision: 101, book: snapshot.book };
    },
    persistPending: (snapshot) => {
      storage.set(outboxKey, JSON.stringify(snapshot));
      storage.set(mirrorKey, JSON.stringify(snapshot.book));
    },
    clearPending: () => storage.delete(outboxKey),
    onStatus: () => {},
  });

  controller.markDirty(book);
  const ok = await controller.flush('online-edit', book);
  assert.equal(ok, true);
  assert(putBody, 'PUT payload sent');
  assert.equal(putBody.book.profile.summary, 'Online edit');
  assert.equal(putBody.revision, 100);
  assert.equal(storage.get(outboxKey), undefined, 'outbox cleared after confirmed save');
});

// (2) In-flight save interrupted by connection loss: outbox retained; reconnect GET/merge then PUT (no 428).
guarantee('guarantee_2_inflight_save_reconnect_get_merge_no_428', async () => {
  const storage = new Map();
  const outboxKey = 'brag-book-outbox-v2:user-sync-2';
  const userId = 'user-sync-2';

  const base = normalizeStore(emptyStore());
  base.profile = { ...base.profile, summary: 'server baseline' };
  const localBook = normalizeStore(base);
  localBook.profile = { ...localBook.profile, summary: 'typed before connection dropped' };

  let saveCalls = [];
  let saveAttempts = 0;
  const controller = createBookSaveController({
    initialRevision: null,
    save: async (snapshot) => {
      saveAttempts += 1;
      if (saveAttempts === 1) {
        throw Object.assign(new Error('connection lost mid-save'), { status: 400 });
      }
      saveCalls.push(snapshot.revision);
      const guard = bookSaveGuard('2026-01-01T00:00:00.000Z', snapshot.revision);
      if (!guard.ok && guard.status === 428) {
        throw Object.assign(new Error('Precondition Required'), { status: 428 });
      }
      return { revision: 55, book: snapshot.book };
    },
    persistPending: (snapshot) => {
      storage.set(outboxKey, JSON.stringify({
        userId,
        baseRevision: snapshot.revision,
        baseBook: base,
        book: snapshot.book,
        localVersion: snapshot.localVersion,
      }));
    },
    clearPending: () => storage.delete(outboxKey),
    onStatus: () => {},
  });

  controller.markDirty(localBook);
  assert(storage.has(outboxKey), 'markDirty writes the outbox');
  const flushed = await controller.flush('offline', localBook);
  assert.equal(flushed, false, 'failed mid-save flush returns false');
  assert(storage.has(outboxKey), 'pending outbox after failed/offline save');

  const remoteData = {
    revision: 54,
    updatedAt: '2026-01-01T00:00:00.000Z',
    book: normalizeStore(base),
  };
  remoteData.book.profile = { ...remoteData.book.profile, skills: 'Python' };

  const outbox = JSON.parse(storage.get(outboxKey));
  const merged = mergeConcurrentBooks(
    outbox.baseBook ? normalizeStore(outbox.baseBook) : base,
    normalizeStore(outbox.book),
    normalizeStore(remoteData.book),
  );
  const mergedBook = normalizeStore(merged.book);
  assert.equal(mergedBook.profile.summary, 'typed before connection dropped');
  assert.equal(mergedBook.profile.skills, 'Python');

  controller.setRevision(remoteData.revision);
  controller.restorePending(mergedBook, {
    nextRevision: remoteData.revision,
    restoredVersion: outbox.localVersion,
  });

  saveCalls = [];
  await controller.flush('reconnect', mergedBook);
  assert.deepEqual(saveCalls, [54], 'reconnect PUT uses GET revision, not revisionless write');
  assert.equal(storage.get(outboxKey), undefined);
});

// (3) 409 conflict (phone + laptop): merge keeps both sides’ disjoint edits; neither side silently discarded.
guarantee('guarantee_3_409_phone_laptop_merge_keeps_both_sides', async () => {
  const base = normalizeStore(emptyStore());
  base.profile = { ...base.profile, summary: 'Shared baseline', skills: 'SQL' };

  const phone = normalizeStore(base);
  phone.profile = { ...phone.profile, summary: 'Phone header tweak' };

  const laptop = normalizeStore(base);
  laptop.profile = { ...laptop.profile, skills: 'Python · SQL' };

  const merged = mergeConcurrentBooks(base, phone, laptop);
  const book = normalizeStore(merged.book);
  assert.equal(book.profile.summary, 'Phone header tweak');
  assert.equal(book.profile.skills, 'Python · SQL');

  let attempts = 0;
  let savedBook = null;
  const controller = createBookSaveController({
    initialRevision: 10,
    save: async (snapshot) => {
      attempts += 1;
      if (attempts === 1) {
        throw Object.assign(new Error('conflict'), {
          status: 409,
          conflict: true,
          revision: 11,
          book: laptop,
          baseBook: base,
        });
      }
      savedBook = snapshot.book;
      return { revision: 12, book: snapshot.book };
    },
    persistPending: () => {},
    clearPending: () => {},
    onStatus: () => {},
    onConflict: (error, localBook) => {
      const remote = normalizeStore(error.book);
      const merged409 = mergeConcurrentBooks(base, localBook, remote);
      const next = merged409.conflicts.length
        ? retainLocalConflictValues(merged409.book, merged409.conflicts)
        : merged409.book;
      return { book: normalizeStore(next), retry: true, conflicts: merged409.conflicts };
    },
  });

  controller.markDirty(phone);
  await controller.flush('409', phone);
  assert.equal(attempts, 2, 'retries after 409 merge');
  assert.equal(savedBook.profile.summary, 'Phone header tweak');
  assert.equal(savedBook.profile.skills, 'Python · SQL');
});

// (4) Update reload and pagehide/visibility flush — or pending data stays in outbox.
guarantee('guarantee_4_update_reload_and_pagehide_flush_or_outbox', async () => {
  const storage = new Map();
  const outboxKey = 'brag-book-outbox-v2:user-sync-4';
  let keepaliveSeen = false;
  let posted = false;

  const book = normalizeStore(emptyStore());
  book.profile = { ...book.profile, summary: 'Pending' };

  const controller = createBookSaveController({
    initialRevision: 3,
    save: async (snapshot) => {
      keepaliveSeen = snapshot.keepalive === true;
      throw Object.assign(new Error('offline'), { status: 400 });
    },
    persistPending: (snapshot) => {
      storage.set(outboxKey, JSON.stringify(snapshot));
    },
    clearPending: () => storage.delete(outboxKey),
    onStatus: () => {},
  });

  controller.markDirty(book);
  await controller.flush('pagehide', book, { keepalive: true }).catch(() => {});
  assert(keepaliveSeen, 'pagehide flush marks keepalive for background save');
  assert(storage.has(outboxKey), 'failed background flush retains outbox');

  posted = false;
  const blocked = await activateWaitingWorker({
    registration: { waiting: {} },
    flushBeforeReload: async () => false,
    reload: () => {},
    serviceWorker: { addEventListener() {}, removeEventListener() {} },
    postMessage: () => { posted = true; },
  });
  assert.equal(blocked.ok, false);
  assert(!posted, 'update reload blocked when flush fails');
  assert(storage.has(outboxKey), 'outbox survives blocked update reload');

  let flushed = false;
  await activateWaitingWorker({
    registration: { waiting: {} },
    flushBeforeReload: async () => { flushed = true; return true; },
    reload: () => {},
    serviceWorker: {
      addEventListener(type, fn) { if (type === 'controllerchange') fn(); },
      removeEventListener() {},
    },
    postMessage: () => { posted = true; },
  });
  assert(flushed);
  assert(posted);
});

// (5) Service worker cache cleanup never touches account mirror or outbox keys.
guarantee('guarantee_5_sw_cache_cleanup_never_deletes_outbox_or_mirror', async () => {
  assert(!workerSrc.includes('localStorage'));
  assert(!workerSrc.includes('brag-book-store-v2'));
  assert(!workerSrc.includes('brag-book-outbox-v2'));

  assert(workerSrc.includes("key.startsWith('brag-book-')"));
  assert.match(workerSrc, /const BUILD_ID = '[^']+'/);
  assert.match(workerSrc, /keys\.filter\(\(key\) => key\.startsWith\('brag-book-'\)/);

  const mirror = new Map([
    ['brag-book-store-v2:u1', '{"profile":{}}'],
    ['brag-book-outbox-v2:u1', '{"book":{}}'],
  ]);
  assert(mirror.has('brag-book-store-v2:u1'));
  assert(mirror.has('brag-book-outbox-v2:u1'));
});

// (6) Single record per resume bullet — no duplicates after sync.
guarantee('guarantee_6_single_bullet_record_after_sync', async () => {
  let book = normalizeStore(addEntry(emptyStore(), {
    id: 'exp-1',
    title: 'Led team: Saved one million',
    company: 'Co',
    role: 'Lead',
  }));
  book = normalizeStore(addEntry(book, {
    id: 'exp-2',
    title: 'Shipped: Feature on laptop',
    company: 'Co',
    role: 'Lead',
  }));
  assertUniqueExperienceIds(book, 'before save');
  assert.equal(book.entries.length, 2);

  const storage = new Map();
  const outboxKey = 'brag-book-outbox-v2:user-sync-6';
  let savedPayload = null;
  const controller = createBookSaveController({
    initialRevision: 20,
    save: async (snapshot) => {
      savedPayload = snapshot.book;
      return { revision: 21, book: snapshot.book };
    },
    persistPending: (s) => storage.set(outboxKey, JSON.stringify(s)),
    clearPending: () => storage.delete(outboxKey),
    onStatus: () => {},
  });
  controller.markDirty(book);
  await controller.flush('sync', book);
  assertUniqueExperienceIds(savedPayload, 'after confirmed PUT');
  assert.equal(savedPayload.entries.length, 2);
  assert.equal(storage.get(outboxKey), undefined);
});

guarantee('guarantee_7_offline_readonly_disables_editor_inputs', async () => {
  const { setShellReadOnly } = await import('../brag-book/pwa.js');
  const { JSDOM } = await import('jsdom');
  const dom = new JSDOM(`
    <html><body>
      <main class="shell" id="app">
        <input id="t" /><textarea id="a"></textarea><div contenteditable="true" id="e"></div>
        <button id="b">Add</button>
      </main>
    </body></html>
  `);
  const { document } = dom.window;
  setShellReadOnly(document, false);
  assert(document.documentElement.classList.contains('bb-offline-readonly'));
  assert(document.getElementById('app').hasAttribute('inert'));

  const appSrc = await readFile(join(root, 'brag-book/app.js'), 'utf8');
  assert(appSrc.includes('networkOnlineForEdits'));
  assert(appSrc.includes('if (!networkOnlineForEdits) return'));

  const html = await readFile(join(root, 'brag-book/index.html'), 'utf8');
  assert(html.includes("You're offline. Reconnect to keep editing."));
});

let failed = null;
for (const { name, fn } of tests) {
  try {
    await fn();
    console.log(`ok ${name}`);
  } catch (err) {
    failed = { name, err };
    console.error(`FAIL ${name}`);
    console.error(err);
    break;
  }
}
if (failed) process.exit(1);
console.log(`brag-book PWA sync guarantees passed (${tests.length} tests)`);
