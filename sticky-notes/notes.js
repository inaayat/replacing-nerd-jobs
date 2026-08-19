/**
 * Sticky Notes v1 — pure model. Dependency-free ESM, no DOM, no node: imports.
 * Shared by the browser (board/memory/sync) and the server (api/sticky-notes.js
 * imports LEGEND_DEFAULTS and the normalizers for validation).
 *
 * All mutations — local or remote — are ops applied by applyOps(state, ops).
 * The server mirrors the same semantics in SQL (lib/sticky-notes.js).
 */

export const STORAGE_KEY = 'sticky-notes-v2';
export const OPLOG_KEY = 'sticky-notes-oplog-v2';
export const VIEWPORT_KEY = 'sticky-notes-viewport';
export const LEGACY_KEY = 'sticky-notes-v1';

export const NOTE_W_DEFAULT = 220;
export const NOTE_H_DEFAULT = 64;
export const NOTE_W_MIN = 160;
export const NOTE_W_MAX = 480;
export const NOTE_H_MIN = 48;
export const ZOOM_MIN = 0.4;
export const ZOOM_MAX = 2;

// Keys are stored on notes; labels are the renameable defaults.
export const LEGEND_DEFAULTS = {
  colors: {
    c1: { label: 'Yellow', hex: '#ffea56' },
    c2: { label: 'Pink', hex: '#fe9ec6' },
    c3: { label: 'Blue', hex: '#9ed4ff' },
    c4: { label: 'Green', hex: '#b8f28a' },
    c5: { label: 'Purple', hex: '#d4b8ff' },
    c6: { label: 'Orange', hex: '#ffc48a' },
  },
  icons: {
    link: 'Link',
    idea: 'Idea',
    remember: 'Remember',
    errand: 'Errand',
    read: 'Read',
    food: 'Food',
    travel: 'Travel',
    money: 'Money',
    home: 'Home',
    work: 'Work',
    media: 'Media',
    star: 'Starred',
  },
};

const SVG_OPEN =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">';

export const ICON_SVGS = {
  link: `${SVG_OPEN}<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 1 0-5.7-5.7l-1.5 1.5"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 1 0 5.7 5.7l1.5-1.5"/></svg>`,
  idea: `${SVG_OPEN}<path d="M9 18h6"/><path d="M10 21h4"/><path d="M12 3a6 6 0 0 0-4 10.5c.8.7 1 1.5 1 2.5h6c0-1 .2-1.8 1-2.5A6 6 0 0 0 12 3z"/></svg>`,
  remember: `${SVG_OPEN}<path d="M6 9a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6"/><path d="M10 19a2 2 0 0 0 4 0"/></svg>`,
  errand: `${SVG_OPEN}<circle cx="12" cy="12" r="9"/><path d="M8.5 12.5l2.5 2.5 4.5-5"/></svg>`,
  read: `${SVG_OPEN}<path d="M4 5a2 2 0 0 1 2-2h13v18H6a2 2 0 0 1-2-2z"/><path d="M19 17H6a2 2 0 0 0-2 2"/></svg>`,
  food: `${SVG_OPEN}<path d="M7 3v7a2 2 0 0 0 4 0V3"/><path d="M9 3v18"/><path d="M17 3c-1.5 1.5-2 4-2 6v3h4V9c0-2-.5-4.5-2-6z"/><path d="M17 12v9"/></svg>`,
  travel: `${SVG_OPEN}<path d="M21 3L3 11l7 2 2 7z"/><path d="M21 3L10 13"/></svg>`,
  money: `${SVG_OPEN}<path d="M12 3v18"/><path d="M16.5 7.5c-.5-1.5-2-2.2-4.5-2.2s-4 1-4 3 1.5 2.7 4 3.2 4.5 1.3 4.5 3.3-2 3-4.5 3-4-.7-4.5-2.5"/></svg>`,
  home: `${SVG_OPEN}<path d="M4 11l8-7 8 7"/><path d="M6 10v10h12V10"/></svg>`,
  work: `${SVG_OPEN}<rect x="3" y="8" width="18" height="12" rx="2"/><path d="M9 8V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/></svg>`,
  media: `${SVG_OPEN}<circle cx="12" cy="12" r="9"/><path d="M10 9l5 3-5 3z"/></svg>`,
  star: `${SVG_OPEN}<path d="M12 3l2.7 5.6 6.1.8-4.5 4.2 1.1 6-5.4-3-5.4 3 1.1-6L3.2 9.4l6.1-.8z"/></svg>`,
};

export const PIN_SVG = `${SVG_OPEN}<path d="M9 4h6l-1 6 3 3v2H7v-2l3-3z"/><path d="M12 15v6"/></svg>`;

export const COLOR_KEYS = Object.keys(LEGEND_DEFAULTS.colors);
export const ICON_KEYS = Object.keys(LEGEND_DEFAULTS.icons);

function nowIso() {
  return new Date().toISOString();
}

export function randomId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `sn-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

const num = (v, fallback) => (Number.isFinite(v) ? v : fallback);

// ---------------------------------------------------------------------------
// Normalizers

export function normalizeNote(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const text = String(raw.text ?? '').trim();
  if (!text) return null;
  const created = raw.createdAt || nowIso();
  return {
    id: String(raw.id || randomId()),
    text,
    colorKey: COLOR_KEYS.includes(raw.colorKey) ? raw.colorKey : null,
    iconKey: ICON_KEYS.includes(raw.iconKey) ? raw.iconKey : null,
    status: raw.status === 'memory' ? 'memory' : 'board',
    collectionId: raw.collectionId ? String(raw.collectionId) : null,
    x: num(raw.x, 24),
    y: num(raw.y, 24),
    w: clamp(num(raw.w, NOTE_W_DEFAULT), NOTE_W_MIN, NOTE_W_MAX),
    h: Math.max(NOTE_H_MIN, num(raw.h, NOTE_H_DEFAULT)),
    pinned: Boolean(raw.pinned),
    sourceUrl: raw.sourceUrl ? String(raw.sourceUrl) : null,
    sourceTitle: raw.sourceTitle ? String(raw.sourceTitle) : null,
    createdAt: created,
    updatedAt: raw.updatedAt || created,
    filedAt: raw.filedAt || null,
  };
}

export function normalizeCollection(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const name = String(raw.name ?? '').trim();
  if (!name) return null;
  const created = raw.createdAt || nowIso();
  return {
    id: String(raw.id || randomId()),
    name,
    status: raw.status === 'memory' ? 'memory' : 'board',
    createdAt: created,
    updatedAt: raw.updatedAt || created,
    filedAt: raw.filedAt || null,
  };
}

export function normalizeArrow(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (!raw.fromId || !raw.toId || String(raw.fromId) === String(raw.toId)) return null;
  return {
    id: String(raw.id || randomId()),
    fromId: String(raw.fromId),
    toId: String(raw.toId),
    createdAt: raw.createdAt || nowIso(),
  };
}

export function normalizeLegend(raw) {
  const out = { colors: {}, icons: {} };
  if (raw && typeof raw === 'object') {
    for (const [key, label] of Object.entries(raw.colors || {})) {
      if (COLOR_KEYS.includes(key) && String(label).trim()) out.colors[key] = String(label).trim();
    }
    for (const [key, label] of Object.entries(raw.icons || {})) {
      if (ICON_KEYS.includes(key) && String(label).trim()) out.icons[key] = String(label).trim();
    }
  }
  return out;
}

export function emptyState() {
  return { version: 2, notes: [], collections: [], arrows: [], legend: { colors: {}, icons: {} } };
}

export function normalizeState(raw) {
  if (!raw || typeof raw !== 'object') return emptyState();
  const notes = Array.isArray(raw.notes) ? raw.notes.map(normalizeNote).filter(Boolean) : [];
  const collections = Array.isArray(raw.collections)
    ? raw.collections.map(normalizeCollection).filter(Boolean)
    : [];
  const noteIds = new Set(notes.map((n) => n.id));
  const arrows = Array.isArray(raw.arrows)
    ? raw.arrows
        .map(normalizeArrow)
        .filter(Boolean)
        .filter((a) => noteIds.has(a.fromId) && noteIds.has(a.toId))
    : [];
  return { version: 2, notes, collections, arrows, legend: normalizeLegend(raw.legend) };
}

// ---------------------------------------------------------------------------
// Legend lookups

export function legendLabel(legend, kind, key) {
  if (!key) return '';
  const overrides = legend?.[kind === 'color' ? 'colors' : 'icons'] || {};
  if (overrides[key]) return overrides[key];
  if (kind === 'color') return LEGEND_DEFAULTS.colors[key]?.label || key;
  return LEGEND_DEFAULTS.icons[key] || key;
}

export function colorHex(key) {
  return LEGEND_DEFAULTS.colors[key]?.hex || 'transparent';
}

// ---------------------------------------------------------------------------
// v0 migration

const LEGACY_COLOR_MAP = { yellow: 'c1', pink: 'c2', blue: 'c3', green: 'c4', purple: 'c5' };

export function migrateLegacyStore(rawV0) {
  if (!rawV0 || !Array.isArray(rawV0.notes)) return [];
  const out = [];
  for (const old of rawV0.notes) {
    if (!old || typeof old !== 'object') continue;
    const note = normalizeNote({
      id: old.id,
      text: old.text,
      colorKey: LEGACY_COLOR_MAP[old.color] || null,
      x: old.x,
      y: old.y,
      w: old.width,
      h: old.height,
      pinned: old.pinned,
      sourceUrl: old.source?.url || null,
      sourceTitle: old.source?.title || null,
      createdAt: old.createdAt,
      updatedAt: old.updatedAt,
    });
    if (note) out.push(note);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Merge (last-write-wins by updatedAt) — used when reconciling server state
// with the localStorage mirror.

function lww(list, incoming) {
  const byId = new Map(list.map((item) => [item.id, item]));
  for (const item of incoming) {
    const existing = byId.get(item.id);
    if (!existing) {
      byId.set(item.id, item);
      continue;
    }
    const a = Date.parse(existing.updatedAt) || 0;
    const b = Date.parse(item.updatedAt) || 0;
    if (b >= a) byId.set(item.id, item);
  }
  return [...byId.values()];
}

export function mergeStates(base, incoming) {
  const a = normalizeState(base);
  const b = normalizeState(incoming);
  const arrowsById = new Map(a.arrows.map((ar) => [ar.id, ar]));
  for (const ar of b.arrows) arrowsById.set(ar.id, ar);
  return normalizeState({
    notes: lww(a.notes, b.notes),
    collections: lww(a.collections, b.collections),
    arrows: [...arrowsById.values()],
    legend: {
      colors: { ...a.legend.colors, ...b.legend.colors },
      icons: { ...a.legend.icons, ...b.legend.icons },
    },
  });
}

// ---------------------------------------------------------------------------
// Op reducer — the single source of mutation semantics.

function touch(note, ts) {
  return { ...note, updatedAt: ts || nowIso() };
}

export function applyOps(state, ops) {
  let next = {
    ...state,
    notes: [...state.notes],
    collections: [...state.collections],
    arrows: [...state.arrows],
    legend: { colors: { ...state.legend.colors }, icons: { ...state.legend.icons } },
  };
  for (const op of Array.isArray(ops) ? ops : []) {
    next = applyOp(next, op);
  }
  return next;
}

function mapNotes(state, ids, fn) {
  const set = new Set(ids);
  return { ...state, notes: state.notes.map((n) => (set.has(n.id) ? fn(n) : n)) };
}

function applyOp(state, op) {
  if (!op || typeof op !== 'object') return state;
  const ts = op.ts || nowIso();
  switch (op.op) {
    case 'note.upsert': {
      const note = normalizeNote(op.note);
      if (!note) return state;
      const idx = state.notes.findIndex((n) => n.id === note.id);
      if (idx === -1) return { ...state, notes: [...state.notes, note] };
      const existing = state.notes[idx];
      if ((Date.parse(note.updatedAt) || 0) < (Date.parse(existing.updatedAt) || 0)) return state;
      const notes = [...state.notes];
      notes[idx] = note;
      return { ...state, notes };
    }
    case 'note.move':
      return mapNotes(state, [op.id], (n) => touch({ ...n, x: num(op.x, n.x), y: num(op.y, n.y) }, ts));
    case 'note.resize':
      return mapNotes(state, [op.id], (n) =>
        touch(
          {
            ...n,
            w: clamp(num(op.w, n.w), NOTE_W_MIN, NOTE_W_MAX),
            h: Math.max(NOTE_H_MIN, num(op.h, n.h)),
          },
          ts,
        ),
      );
    case 'note.pin':
      return mapNotes(state, op.ids || [], (n) => touch({ ...n, pinned: Boolean(op.pinned) }, ts));
    case 'note.categorize':
      return mapNotes(state, op.ids || [], (n) => {
        const next = { ...n };
        if ('colorKey' in op) next.colorKey = COLOR_KEYS.includes(op.colorKey) ? op.colorKey : null;
        if ('iconKey' in op) next.iconKey = ICON_KEYS.includes(op.iconKey) ? op.iconKey : null;
        return touch(next, ts);
      });
    case 'note.delete': {
      const gone = new Set(op.ids || []);
      return {
        ...state,
        notes: state.notes.filter((n) => !gone.has(n.id)),
        arrows: state.arrows.filter((a) => !gone.has(a.fromId) && !gone.has(a.toId)),
      };
    }
    case 'arrow.create': {
      const arrow = normalizeArrow({ id: op.id, fromId: op.fromId, toId: op.toId, createdAt: ts });
      if (!arrow) return state;
      const ids = new Set(state.notes.map((n) => n.id));
      if (!ids.has(arrow.fromId) || !ids.has(arrow.toId)) return state;
      const dupe = state.arrows.some((a) => a.fromId === arrow.fromId && a.toId === arrow.toId);
      if (dupe) return state;
      return { ...state, arrows: [...state.arrows, arrow] };
    }
    case 'arrow.delete': {
      const gone = new Set(op.ids || []);
      return { ...state, arrows: state.arrows.filter((a) => !gone.has(a.id)) };
    }
    case 'collection.create': {
      const col = normalizeCollection({ id: op.id, name: op.name, createdAt: ts, updatedAt: ts });
      if (!col) return state;
      if (state.collections.some((c) => c.id === col.id)) return state;
      return { ...state, collections: [...state.collections, col] };
    }
    case 'collection.rename': {
      const name = String(op.name ?? '').trim();
      if (!name) return state;
      return {
        ...state,
        collections: state.collections.map((c) =>
          c.id === op.id ? { ...c, name, updatedAt: ts } : c,
        ),
      };
    }
    case 'collection.assign':
      return mapNotes(state, op.ids || [], (n) =>
        touch({ ...n, collectionId: op.collectionId ? String(op.collectionId) : null }, ts),
      );
    case 'collection.delete': {
      const id = String(op.id || '');
      const memberIds = state.notes.filter((n) => n.collectionId === id).map((n) => n.id);
      let next = { ...state, collections: state.collections.filter((c) => c.id !== id) };
      if (op.deleteNotes) {
        next = applyOp(next, { op: 'note.delete', ids: memberIds });
      } else {
        next = mapNotes(next, memberIds, (n) => touch({ ...n, collectionId: null }, ts));
      }
      return next;
    }
    case 'file':
      return transition(state, op, 'memory', ts);
    case 'restore':
      return transition(state, op, 'board', ts);
    case 'wipe': {
      const noteIds = state.notes
        .filter((n) => n.status === 'board' && !n.pinned)
        .map((n) => n.id);
      let next = mapNotes(state, noteIds, (n) => touch({ ...n, status: 'memory', filedAt: ts }, ts));
      const stillOnBoard = new Set(
        next.notes.filter((n) => n.status === 'board').map((n) => n.collectionId).filter(Boolean),
      );
      next = {
        ...next,
        collections: next.collections.map((c) =>
          c.status === 'board' && !stillOnBoard.has(c.id)
            ? { ...c, status: 'memory', filedAt: ts, updatedAt: ts }
            : c,
        ),
      };
      return next;
    }
    case 'legend.set': {
      const kind = op.kind === 'color' ? 'colors' : op.kind === 'icon' ? 'icons' : null;
      if (!kind) return state;
      const valid = kind === 'colors' ? COLOR_KEYS : ICON_KEYS;
      if (!valid.includes(op.key)) return state;
      const label = String(op.label ?? '').trim();
      const legend = { colors: { ...state.legend.colors }, icons: { ...state.legend.icons } };
      if (label) legend[kind][op.key] = label;
      else delete legend[kind][op.key];
      return { ...state, legend };
    }
    default:
      return state;
  }
}

function transition(state, op, toStatus, ts) {
  let noteIds = [];
  let collectionIds = [];
  if (op.collectionId) {
    collectionIds = [String(op.collectionId)];
    noteIds = state.notes
      .filter((n) => n.collectionId === op.collectionId && n.status !== toStatus)
      .map((n) => n.id);
  }
  if (Array.isArray(op.ids)) noteIds = [...new Set([...noteIds, ...op.ids])];
  const filedAt = toStatus === 'memory' ? ts : null;
  let next = mapNotes(state, noteIds, (n) => touch({ ...n, status: toStatus, filedAt }, ts));
  if (collectionIds.length) {
    const set = new Set(collectionIds);
    next = {
      ...next,
      collections: next.collections.map((c) =>
        set.has(c.id) ? { ...c, status: toStatus, filedAt, updatedAt: ts } : c,
      ),
    };
  }
  return next;
}

/** Ids a wipe would file — the client captures these before wiping for Undo. */
export function wipeTargets(state) {
  const noteIds = state.notes.filter((n) => n.status === 'board' && !n.pinned).map((n) => n.id);
  const filing = new Set(noteIds);
  const keepsCollection = new Set(
    state.notes
      .filter((n) => n.status === 'board' && !filing.has(n.id))
      .map((n) => n.collectionId)
      .filter(Boolean),
  );
  const collectionIds = state.collections
    .filter((c) => c.status === 'board' && !keepsCollection.has(c.id))
    .map((c) => c.id);
  return { noteIds, collectionIds };
}

// ---------------------------------------------------------------------------
// Geometry — canvas math and board helpers. All pure.

export function screenToWorld(point, viewport) {
  return {
    x: (point.x - viewport.panX) / viewport.zoom,
    y: (point.y - viewport.panY) / viewport.zoom,
  };
}

export function worldToScreen(point, viewport) {
  return {
    x: point.x * viewport.zoom + viewport.panX,
    y: point.y * viewport.zoom + viewport.panY,
  };
}

/** Rect intersection where touching edges count as a hit. */
export function rectsIntersect(a, b) {
  return a.x <= b.x + b.w && b.x <= a.x + a.w && a.y <= b.y + b.h && b.y <= a.y + a.h;
}

/**
 * First free slot for a new note inside a world-space region, scanning a 24px
 * grid left-to-right / top-to-bottom; cascades from the region's top-left with
 * a 16px step when the region is full.
 */
export function findFreeSlot(region, rects, slotW = NOTE_W_DEFAULT + 16, slotH = 140) {
  const step = 24;
  const startX = Math.ceil((region.x + 16) / step) * step;
  const startY = Math.ceil((region.y + 16) / step) * step;
  for (let y = startY; y + slotH <= region.y + region.h; y += step) {
    for (let x = startX; x + slotW <= region.x + region.w; x += step) {
      const candidate = { x, y, w: slotW, h: slotH };
      if (!rects.some((r) => rectsIntersect(candidate, r))) return { x, y };
    }
  }
  const n = rects.length;
  return { x: region.x + 24 + (n % 12) * 16, y: region.y + 24 + (n % 12) * 16 };
}

/** Bounding box of a set of note rects (or null when empty). */
export function bbox(rects) {
  if (!rects.length) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const r of rects) {
    minX = Math.min(minX, r.x);
    minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.w);
    maxY = Math.max(maxY, r.y + r.h);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/** Viewport that frames `rects` inside a viewportW×viewportH screen, padded. */
export function fitViewport(rects, viewportW, viewportH, pad = 48) {
  const box = bbox(rects);
  if (!box) return { panX: 0, panY: 0, zoom: 1 };
  const zoom = clamp(
    Math.min((viewportW - pad * 2) / Math.max(box.w, 1), (viewportH - pad * 2) / Math.max(box.h, 1)),
    ZOOM_MIN,
    ZOOM_MAX,
  );
  return {
    panX: (viewportW - box.w * zoom) / 2 - box.x * zoom,
    panY: (viewportH - box.h * zoom) / 2 - box.y * zoom,
    zoom,
  };
}

/**
 * Clip the segment between two rect centers to the rect borders, so arrows
 * run edge-to-edge. Returns { x1, y1, x2, y2 } or null for overlapping cards.
 */
export function arrowEndpoints(fromRect, toRect) {
  const c1 = { x: fromRect.x + fromRect.w / 2, y: fromRect.y + fromRect.h / 2 };
  const c2 = { x: toRect.x + toRect.w / 2, y: toRect.y + toRect.h / 2 };
  const p1 = clipToRect(c1, c2, fromRect);
  const p2 = clipToRect(c2, c1, toRect);
  if (!p1 || !p2) return null;
  return { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y };
}

function clipToRect(inside, outside, rect) {
  const dx = outside.x - inside.x;
  const dy = outside.y - inside.y;
  if (dx === 0 && dy === 0) return null;
  let tMin = Infinity;
  if (dx > 0) tMin = Math.min(tMin, (rect.x + rect.w - inside.x) / dx);
  if (dx < 0) tMin = Math.min(tMin, (rect.x - inside.x) / dx);
  if (dy > 0) tMin = Math.min(tMin, (rect.y + rect.h - inside.y) / dy);
  if (dy < 0) tMin = Math.min(tMin, (rect.y - inside.y) / dy);
  if (!Number.isFinite(tMin) || tMin < 0) return null;
  const t = Math.min(tMin, 1);
  return { x: inside.x + dx * t, y: inside.y + dy * t };
}

/** True when `text` is a lone http(s) URL (paste-to-link-card detection). */
export function isLoneUrl(text) {
  const t = String(text || '').trim();
  if (!t || /\s/.test(t)) return false;
  try {
    const u = new URL(t);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

export function urlDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}
