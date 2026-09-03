/**
 * Sticky Notes sync engine — local-first store with a background op queue.
 *
 * Every mutation applies to in-memory state synchronously (applyOps), mirrors
 * to localStorage (debounced), and appends to an op queue that flushes to
 * /api/sn-ops in the background with backoff. Nothing in the UI ever waits on
 * the network.
 *
 * A signed-out visitor gets the same store in `guest` mode: its own storage key,
 * no op queue, and no server at all. Their board is handed to the account on
 * sign-in (app.js), never uploaded behind their back.
 */
import {
  GUEST_STORAGE_KEY,
  LEGACY_KEY,
  OPLOG_KEY,
  STORAGE_KEY,
  applyOps,
  emptyState,
  mergeStates,
  migrateLegacyStore,
  normalizeHref,
  normalizeState,
  mediaNeedsThumbRefresh,
  shouldAcceptUnfurl,
} from './notes.js';

const MIRROR_DEBOUNCE_MS = 200;
const FLUSH_DEBOUNCE_MS = 800;
const BACKOFF_BASE_MS = 2000;
const BACKOFF_MAX_MS = 60000;
const OPS_PER_REQUEST = 200;

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

/** The board a signed-out visitor built, or null when there isn't one. */
export function readGuestState() {
  const raw = readJson(GUEST_STORAGE_KEY, null);
  return raw ? normalizeState(raw) : null;
}

export function clearGuestState() {
  try {
    localStorage.removeItem(GUEST_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function createStore({ token = null, guest = false } = {}) {
  const stateKey = guest ? GUEST_STORAGE_KEY : STORAGE_KEY;
  let state = normalizeState(readJson(stateKey, null));
  let queue = !guest && Array.isArray(readJson(OPLOG_KEY, [])) ? readJson(OPLOG_KEY, []) : [];
  const subscribers = new Set();
  const thumbRefresh = new Set();

  let mirrorTimer = null;
  let flushTimer = null;
  let backoffMs = 0;
  let flushing = false;

  function notify(kind, ops) {
    for (const fn of subscribers) fn(kind, ops, state);
  }

  function scheduleMirror() {
    clearTimeout(mirrorTimer);
    mirrorTimer = setTimeout(() => {
      try {
        localStorage.setItem(stateKey, JSON.stringify(state));
        if (!guest) localStorage.setItem(OPLOG_KEY, JSON.stringify(queue));
      } catch {
        /* storage full or unavailable — server queue still holds the ops */
      }
    }, MIRROR_DEBOUNCE_MS);
  }

  function scheduleFlush(delay = FLUSH_DEBOUNCE_MS) {
    if (!token) return;
    clearTimeout(flushTimer);
    flushTimer = setTimeout(flush, delay);
  }

  async function flush() {
    if (flushing || !token || !queue.length) return;
    flushing = true;
    const batch = queue.slice(0, OPS_PER_REQUEST);
    try {
      const res = await fetch('/api/sn-ops', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ops: batch }),
      });
      if (!res.ok) throw new Error(`ops flush ${res.status}`);
      queue = queue.slice(batch.length);
      backoffMs = 0;
      scheduleMirror();
      if (queue.length) scheduleFlush(0);
    } catch {
      backoffMs = Math.min(backoffMs ? backoffMs * 2 : BACKOFF_BASE_MS, BACKOFF_MAX_MS);
      scheduleFlush(backoffMs);
    } finally {
      flushing = false;
    }
  }

  const store = {
    get state() {
      return state;
    },
    /** True when nothing here can reach the server. The UI has to say so. */
    guest,
    subscribe(fn) {
      subscribers.add(fn);
      return () => subscribers.delete(fn);
    },
    /** Apply ops locally, notify renderers, queue for the server. */
    dispatch(ops, { kind = 'ops' } = {}) {
      if (!ops.length) return;
      state = applyOps(state, ops);
      notify(kind, ops);
      // A guest has nowhere to send ops, and a queue nobody drains only grows.
      if (!guest) queue.push(...ops);
      scheduleMirror();
      scheduleFlush();
    },
    /** Pull server state and reconcile (LWW); then flush anything queued. */
    async loadFromServer() {
      if (!token) return;
      try {
        const res = await fetch('/api/sn-state', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const server = await res.json();
        state = mergeStates(server.state || emptyState(), state);
        notify('reset', []);
        scheduleMirror();
        scheduleFlush(0);
      } catch {
        /* offline is fine — local mirror is authoritative until we reconnect */
      }
    },
    /** One-time v0 localStorage migration → upsert ops. */
    migrateLegacy() {
      // A guest cannot save, so consuming (and deleting) the v0 store would
      // trade real notes for a session. It waits for a signed-in board.
      if (guest) return;
      const legacy = readJson(LEGACY_KEY, null);
      if (!legacy) return;
      const notes = migrateLegacyStore(legacy);
      if (notes.length) {
        store.dispatch(notes.map((note) => ({ op: 'note.upsert', note })));
      }
      try {
        localStorage.removeItem(LEGACY_KEY);
      } catch {
        /* ignore */
      }
    },
    /** Fetch title + compact visual metadata for a URL; local-only still works. */
    async unfurlData(url) {
      if (!token) return null;
      try {
        const res = await fetch(`/api/sn-unfurl?url=${encodeURIComponent(url)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return null;
        return await res.json();
      } catch {
        return null;
      }
    },
    /** Existing link-pill contract: only return the page title. */
    async unfurl(url) {
      const data = await store.unfurlData(url);
      return data?.title || null;
    },
    /**
     * Attach server unfurl metadata if this note still wants `url`. Known
     * kinds already have local media; generic pages keep waiting for an OG image.
     */
    queueUnfurl(id, url) {
      const href = normalizeHref(url);
      if (!href) return;
      store.unfurlData(href).then((data) => {
        if (!data) return;
        const current = store.state.notes.find((n) => n.id === id);
        if (!shouldAcceptUnfurl(current, href)) return;
        const incoming = data.media && (data.media.kind !== 'link' || data.media.thumbnail)
          ? data.media
          : null;
        const media = incoming
          ? {
              ...incoming,
              position: current.media?.position || incoming.position,
              title: incoming.title || current.media?.title || '',
              thumbnail: incoming.thumbnail || current.media?.thumbnail || null,
            }
          : current.media;
        const sourceTitle = data.title || current.sourceTitle;
        if (
          media?.thumbnail === current.media?.thumbnail
          && media?.title === current.media?.title
          && sourceTitle === current.sourceTitle
        ) return;
        store.dispatch([{
          op: 'note.upsert',
          note: {
            ...current,
            media,
            sourceTitle,
            updatedAt: new Date().toISOString(),
          },
        }]);
      });
    },
    /**
     * Existing Instagram (and other social) cards stored `kind` with no
     * thumbnail because unfurl used to miss. Idle cards never refetch on
     * their own — call this from board/table render, once per note id.
     */
    refreshMissingThumb(note) {
      if (guest || !token) return;
      if (!note?.id || thumbRefresh.has(note.id)) return;
      if (!mediaNeedsThumbRefresh(note.media)) return;
      const href = normalizeHref(note.media.url || note.media.canonical);
      if (!href) return;
      thumbRefresh.add(note.id);
      store.queueUnfurl(note.id, href);
    },
    async saveLegendLabel(kind, key, label) {
      store.dispatch([{ op: 'legend.set', kind, key, label }], { kind: 'legend' });
    },
  };

  // Extension bridge: the v0 Chrome extension posts a v0-shaped store; the
  // bridge converts and re-dispatches it as this event.
  window.addEventListener('sticky-notes-extension-notes', (event) => {
    const notes = Array.isArray(event.detail) ? event.detail : [];
    if (notes.length) store.dispatch(notes.map((note) => ({ op: 'note.upsert', note })));
  });

  return store;
}
