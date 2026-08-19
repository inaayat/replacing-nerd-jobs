/**
 * Sticky Notes data layer — keep in sync with ../notes.js
 */
export const STORAGE_KEY = 'sticky-notes-v1';

export const NOTE_COLORS = ['yellow', 'pink', 'blue', 'green', 'purple'];

const DEFAULT_WIDTH = 220;
const DEFAULT_HEIGHT = 180;

function nowIso() {
  return new Date().toISOString();
}

function randomId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `sn-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function emptyStore() {
  return { version: 1, notes: [] };
}

export function normalizeStore(raw) {
  if (!raw || typeof raw !== 'object') return emptyStore();
  const notes = Array.isArray(raw.notes) ? raw.notes.map(normalizeNote).filter(Boolean) : [];
  return { version: 1, notes };
}

export function normalizeNote(note) {
  if (!note || typeof note !== 'object') return null;
  const text = String(note.text ?? '').trim();
  if (!text) return null;
  const color = NOTE_COLORS.includes(note.color) ? note.color : 'yellow';
  return {
    id: String(note.id || randomId()),
    text,
    color,
    x: Number.isFinite(note.x) ? note.x : 40 + Math.random() * 120,
    y: Number.isFinite(note.y) ? note.y : 40 + Math.random() * 80,
    width: Number.isFinite(note.width) ? note.width : DEFAULT_WIDTH,
    height: Number.isFinite(note.height) ? note.height : DEFAULT_HEIGHT,
    rotation: Number.isFinite(note.rotation) ? note.rotation : (Math.random() - 0.5) * 4,
    createdAt: note.createdAt || nowIso(),
    updatedAt: note.updatedAt || note.createdAt || nowIso(),
    source: note.source && typeof note.source === 'object'
      ? {
          url: note.source.url ? String(note.source.url) : '',
          title: note.source.title ? String(note.source.title) : '',
        }
      : null,
    pinned: Boolean(note.pinned),
  };
}

export function createNote(partial = {}) {
  return normalizeNote({
    id: randomId(),
    text: partial.text || 'New note',
    color: partial.color || 'yellow',
    x: partial.x,
    y: partial.y,
    width: partial.width,
    height: partial.height,
    rotation: partial.rotation,
    source: partial.source || null,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  });
}

export function mergeStores(target, incoming) {
  const base = normalizeStore(target);
  const add = normalizeStore(incoming);
  const byId = new Map(base.notes.map((n) => [n.id, n]));
  for (const note of add.notes) {
    const existing = byId.get(note.id);
    if (!existing) {
      byId.set(note.id, note);
      continue;
    }
    const existingTime = Date.parse(existing.updatedAt) || 0;
    const noteTime = Date.parse(note.updatedAt) || 0;
    if (noteTime >= existingTime) byId.set(note.id, { ...existing, ...note });
  }
  return { version: 1, notes: [...byId.values()] };
}

export async function loadFromExtensionStorage() {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  return normalizeStore(data[STORAGE_KEY]);
}

export async function saveToExtensionStorage(store) {
  const normalized = normalizeStore(store);
  await chrome.storage.local.set({ [STORAGE_KEY]: normalized });
  return normalized;
}

export async function addExtensionNote(partial) {
  const store = await loadFromExtensionStorage();
  const note = createNote(partial);
  store.notes.push(note);
  await saveToExtensionStorage(store);
  return note;
}
