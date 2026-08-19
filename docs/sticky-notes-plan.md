# Sticky Notes — product plan + implementation spec

Status: **v0 shipped (localStorage cork board), v1 specced below, not started**
Site: `/sticky-notes/` on [inaayat.xyz](https://inaayat.xyz) (this repo)
Auth: Neon Auth + Postgres (same pattern as A-Lister / Packing Cubes / Table Manners)

This document is written so a coding agent can build v1 without making product
decisions. Sections 1–3 are the product; section 4 is the prescriptive spec.
Where the spec says MUST, deviation needs owner sign-off.

---

## 1. One sentence

A board you dump onto and think on — add notes fast, shove them around, cluster
related ones into named collections — then **file collections into memory and
wipe the board**, with everything recoverable, so the board stays a clean fast
thinking surface and memory does the remembering.

## 2. Locked decisions

| Decision | Call |
|----------|------|
| Surface | Web app at `/sticky-notes/`, replacing the v0 page. v0 extension stays in the repo untouched; extension revival is deferred |
| Auth | Signed-in only. Signed-out visitors see the landing hero + "Sign in" CTA via `/account.html?next=/sticky-notes/` (copy `table-manners/engine/auth.js` wiring) |
| Two tiers | **Board** (spatial, small, draggable) and **Memory** (structured table). Same notes, one `status` field |
| Collections | First-class named objects. Openable, appendable later, restorable as a unit. Memory is a list of collections plus loose notes |
| Recall | Two-way. Filing keeps `x`/`y`, so restoring a collection reproduces the arrangement |
| Wipe | Files everything, destroys nothing, no confirm dialog, 10-second Undo toast. Delete is separate and lives only in the memory table |
| Categorizing | Two optional axes per note: one **color** key and one **icon** key. Renameable per-user legend; notes store keys, never labels. No free-text tags |
| Typography | No handwriting font. Body text in the site sans, metadata in `DM Mono`, `Fraunces` for page headings only |
| Cards | Light card, color as a left edge bar, fixed width, height follows content. No user resizing (v0's `resize: both` is gone) |
| Board bounds | One fixed screen, no pan/zoom. Filling up is pressure to wipe, by design |
| Arrows / connectors | Not in v1 |
| Pinned notes that survive wipes | Not in v1 |
| Mobile | Memory table must be usable on phones; the board is desktop-first (it renders, but drag ergonomics are not a v1 goal) |
| Collaboration, images, reminders, due dates | Not in v1. This is deliberately not a todo app |

## 3. UX walkthrough

**Dump.** `N`, the "+ New note" button, or double-clicking empty board creates a
note (in edit mode) at the click point or the first free slot. Pasting onto the
board creates a note from clipboard text; a pasted URL becomes a link card that
shows the raw URL instantly and upgrades to the page title when the unfurl
lands. No required fields, ever.

**Think.** Drag notes freely. Drag on empty board rubber-band selects;
shift-click toggles membership; dragging any selected note moves the whole
selection rigidly. A selection raises a floating action bar: color swatches,
icon picker, collection name input (typeahead over existing collections), and
**File to memory**.

**Categorize when you have time.** Color/icon applied to a selection stamps
every note in it. Naming a selection makes a collection — a name chip renders at
the cluster's top-left, and the collection can keep living on the board; naming
and filing are separate acts.

**File / wipe.** File sends the selection or collection to memory (cards animate
out, ~200 ms). Wipe files everything: named collections as themselves, loose
notes loose. Toast: "Board wiped — 14 notes filed. **Undo**".

**Remember.** The Memory tab lists collections (collapsible header rows with
name, count, filed date) then loose notes. Filter by color, icon, collection;
search full-text; sort by date or text. Row actions: Restore to board, Move to
collection, Delete. Collection actions: Restore all, Rename, Delete (choice:
keep notes as loose / delete notes too). Restoring a collection re-places its
notes at their stored positions, offset into free space if occupied.

---

## 4. Implementation spec

### 4.1 Files and import graph

| File | Responsibility | Imports |
|------|----------------|---------|
| `sticky-notes/index.html` | Shell: nav (copy structure from `table-manners/index.html`), board pane, memory pane, action bar, toast | — |
| `sticky-notes/app.css` | All styles. Rewrite; keep the `sn-` prefix | — |
| `sticky-notes/notes.js` | **Pure model.** Note/collection normalizers, `LEGEND_DEFAULTS`, `applyOps(state, ops)` reducer, merge (LWW by `updatedAt`), rubber-band hit-test, free-slot placement. Dependency-free ESM, no DOM, no `node:` | — |
| `sticky-notes/sync.js` | In-memory state + `localStorage` mirror + op queue + flush loop + initial load/merge | `./notes.js`, `./engine/auth.js` |
| `sticky-notes/board.js` | Board rendering and interactions | `./notes.js`, `./sync.js` |
| `sticky-notes/memory.js` | Memory table rendering, filters, actions | `./notes.js`, `./sync.js` |
| `sticky-notes/app.js` | Boot: auth gate, tab toggle, keyboard shortcuts, wiring | all of the above |
| `sticky-notes/engine/auth.js` | Copy of `table-manners/engine/auth.js` with paths swapped to `/sticky-notes/` | `engine/neon-browser-auth.js` |
| `api/sticky-notes.js` | The one new serverless function (repo currently at 9 of Hobby's 12) | `lib/neon-auth.js`, `lib/a-list.js` (`upsertUser`), `lib/sticky-notes.js` |
| `lib/sticky-notes.js` | Server-only SQL. MUST NOT be imported by any browser file (`scripts/test-public-imports.mjs` enforces) | `lib/db.js` |
| `scripts/test-sticky-notes.mjs` | Tests for `sticky-notes/notes.js` (§4.9) | `sticky-notes/notes.js` |

Browser files MUST stay dependency-free ESM (no npm imports, no build step) and
MUST NOT import anything under `/lib/` (middleware 404s it in production).

### 4.2 Client data shapes (in `notes.js`)

```js
// Note
{
  id: string,            // crypto.randomUUID()
  text: string,          // plain text, may contain newlines
  colorKey: string|null, // 'c1'..'c6'
  iconKey: string|null,  // key from LEGEND_DEFAULTS.icons
  status: 'board'|'memory',
  collectionId: string|null,
  x: number, y: number,  // px from board top-left; kept after filing
  sourceUrl: string|null, sourceTitle: string|null,
  createdAt: ISO string, updatedAt: ISO string, filedAt: ISO string|null
}
// Collection
{ id, name, status: 'board'|'memory', createdAt, filedAt }
// Legend overrides (per user)
{ colors: { c1: 'Work', ... }, icons: { star: 'Important', ... } }  // sparse
```

`LEGEND_DEFAULTS` (exact keys; labels are the renameable defaults):

```js
colors: { c1: ['Yellow', '#ffea56'], c2: ['Pink',   '#fe9ec6'],
          c3: ['Blue',   '#9ed4ff'], c4: ['Green',  '#b8f28a'],
          c5: ['Purple', '#d4b8ff'], c6: ['Orange', '#ffc48a'] }
icons:  { link: 'Link', idea: 'Idea', remember: 'Remember', errand: 'Errand',
          read: 'Read', food: 'Food', travel: 'Travel', money: 'Money',
          home: 'Home', work: 'Work', media: 'Media', star: 'Starred' }
```

Icons are inline SVGs defined in `notes.js` as strings: 24×24 viewBox,
`stroke="currentColor"`, `stroke-width="1.8"`, `fill="none"`, simple outline
shapes (Lucide-style). No icon font, no image files.

### 4.3 The op protocol (single source of truth for mutations)

Every mutation — local or remote — is one of these ops. `applyOps(state, ops)`
in `notes.js` is a pure reducer used by the client; the server applies the same
ops as SQL. Op `ts` is the client ISO timestamp used for LWW.

| Op | Payload | Semantics |
|----|---------|-----------|
| `note.upsert` | `{ note }` | Insert or LWW-update by `updatedAt` |
| `note.move` | `{ id, x, y, ts }` | Set position |
| `note.categorize` | `{ ids, colorKey?, iconKey?, ts }` | Stamp only provided keys onto all `ids` (null clears) |
| `note.delete` | `{ ids }` | Hard delete |
| `collection.create` | `{ id, name, ts }` | New collection, status `board` |
| `collection.rename` | `{ id, name, ts }` | Rename |
| `collection.assign` | `{ ids, collectionId, ts }` | Set/clear (`null`) membership |
| `collection.delete` | `{ id, deleteNotes: bool }` | If false, member notes get `collectionId: null` |
| `file` | `{ ids?, collectionId?, ts }` | Status → `memory`, stamp `filedAt`; with `collectionId`, files the collection row too |
| `restore` | `{ ids?, collectionId?, ts }` | Status → `board`, clear `filedAt`; restores the collection row too |
| `wipe` | `{ ts }` | `file` for every board note and board collection |
| `legend.set` | `{ kind: 'color'|'icon', key, label }` | Upsert override |

Wipe undo = the client remembers the ids it just filed and emits `restore` ops.
No special undo machinery.

### 4.4 Sync engine (`sync.js`)

- State lives in memory: `{ notes: Map, collections: Map, legend }`.
- Every UI mutation: `applyOps` locally → render delta → append ops to a queue.
- Queue persists in `localStorage['sticky-notes-oplog-v2']`; state mirror in
  `localStorage['sticky-notes-v2']` (debounced 200 ms).
- Flush: debounced 800 ms, `POST /api/sn-ops` with `{ ops: [...] }` and the JWT.
  On success, drop sent ops. On failure, keep them and retry with backoff 2 s →
  4 s → 8 s → … capped at 60 s. Nothing in the UI ever waits for a flush.
- Initial load: `GET /api/sn-state`, then merge server state with the local
  mirror via LWW on `updatedAt`, then flush any queued ops from a previous
  session.
- v0 migration: on first signed-in load, if `localStorage['sticky-notes-v1']`
  exists, convert its notes (`color: 'yellow'` → `c1`, `pink` → `c2`, `blue` →
  `c3`, `green` → `c4`, `purple` → `c5`; drop `rotation`/`width`/`height`) to
  `note.upsert` ops, then delete the old key.

### 4.5 Server

**Schema** — add to `ensureSchema()` in `lib/db.js`, house style (TEXT ids,
`CREATE TABLE IF NOT EXISTS`, `REFERENCES users(id) ON DELETE CASCADE`):

```sql
CREATE TABLE IF NOT EXISTS sn_collections (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'board',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  filed_at    TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS sn_notes (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text          TEXT NOT NULL DEFAULT '',
  color_key     TEXT,
  icon_key      TEXT,
  status        TEXT NOT NULL DEFAULT 'board',
  collection_id TEXT REFERENCES sn_collections(id) ON DELETE SET NULL,
  x REAL NOT NULL DEFAULT 24,  y REAL NOT NULL DEFAULT 24,
  source_url TEXT, source_title TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  filed_at   TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS sn_notes_user_status ON sn_notes (user_id, status, filed_at DESC);
CREATE TABLE IF NOT EXISTS sn_legend (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind    TEXT NOT NULL,
  key     TEXT NOT NULL,
  label   TEXT NOT NULL,
  PRIMARY KEY (user_id, kind, key)
);
```

**Handler** — `api/sticky-notes.js`, structured exactly like
`api/table-manners.js` (`requireDb`, `requireUser` via `getAuth` +
`upsertUser`, `route` switch). Routes and `vercel.json` rewrites:

| Rewrite | Destination | Method → response |
|---------|-------------|-------------------|
| `/api/sn-state` | `?route=state` | GET → `{ board: { notes, collections }, legend, memoryCounts: { notes, collections } }` |
| `/api/sn-memory` | `?route=memory` | GET, query `search, color, icon, collection, offset` → `{ notes, collections, total }`, 200 rows/page, newest `filed_at` first. `search` uses `ILIKE '%…%'` on `text` |
| `/api/sn-ops` | `?route=ops` | POST `{ ops }` → `{ ok: true, applied: n }`. Applied in order; every statement scoped `WHERE user_id = $user`. Upserts use `ON CONFLICT (id) DO UPDATE … WHERE sn_notes.updated_at <= EXCLUDED.updated_at` for LWW. Unknown op kinds → 400. Cap 200 ops/request |
| `/api/sn-legend` | `?route=legend` | PUT `{ kind, key, label }` → `{ ok: true }`. Reject unknown keys (validate against `LEGEND_DEFAULTS` — import from `sticky-notes/notes.js`, which is browser-safe and legal for the server to import) |
| `/api/sn-unfurl` | `?route=unfurl` | GET `?url=` → `{ title }`. Server-side fetch, 5 s timeout, `<title>` regex, http(s) only; on any failure `{ title: null }`. Client follows up with a `note.upsert` setting `sourceTitle` |

Errors follow house style: `{ error: string }` with 401/400/405/502/503.

### 4.6 Visual spec

- Page: cream background and nav identical in structure to the current
  `sticky-notes/index.html`; keep the hero but shrink it — the board is the
  point. Tabs **Board | Memory** in the toolbar; active tab persisted in
  `localStorage['sticky-notes-view']`.
- Board: fills viewport below toolbar (`height: calc(100vh - nav - toolbar)`,
  min 520 px), `position: relative`, `overflow: hidden`, flat panel background
  (`--panel`, 1.5 px `--line` border, 18 px radius). **No cork texture.**
- Card: `width: 220px`, height auto (`min-height: 64px`), background `--panel`,
  `border: 1.5px solid var(--line)`, `border-radius: 10px`,
  `box-shadow: 0 1px 4px rgba(28,28,28,.08)`, `contain: layout style`.
  Color = 6 px left edge bar in the legend hex (no bar when `colorKey` null).
  Icon = 16 px, top-right, ink at 60 % opacity. Body: site sans `.92rem`,
  line-height 1.4, padding `10px 12px`. Source line: `DM Mono .62rem`,
  domain only, ellipsized. Selected: `outline: 2px solid var(--ink)`,
  offset 2 px. No rotation anywhere.
- Collection chip on board: pill at the cluster bbox top-left minus 14 px,
  `DM Mono .62rem` uppercase, ink on cream, recomputed on drag end only.
- Action bar: floats 12 px above the selection bbox (clamped to viewport),
  `--ink` background, cream content, radius 999, one row: count · 6 swatches ·
  icon button (opens a 6×2 grid popover) · name input (`<datalist>` of
  collections) · "File" button.
- Memory table: full-width rows, 1 px `--line` separators, collection header
  rows in `Fraunces`, cells in site sans, metadata in `DM Mono`. Color shown as
  a 10 px dot, icon at 16 px. Filters as chip buttons above the table.
- Toast: reuse v0's `.sn-toast`, plus an inline Undo button variant.

### 4.7 Interaction spec

- Drag: pointer events with `setPointerCapture`; 4 px movement threshold;
  during drag position via `transform: translate(x, y)` with one write per
  `requestAnimationFrame`; `will-change: transform` only while dragging;
  on drop, commit `note.move` (or one per selected note). Dragged note moves to
  the end of the render order (top of z-stack) and stays there.
- Clamping: positions clamp to `[8, boardWidth - 228] × [8, boardHeight - 72]`
  on drop and on render (board resize just clamps; it never rescales).
- Rubber band: starts on pointerdown on empty board; dashed 1.5 px ink rect,
  6 % ink fill; hit-test = rect intersection against in-memory note rects
  (note height read once per note from the DOM at drag start, cached).
- Keyboard: `N` new note (ignored while any input/contentEditable is focused),
  `Escape` clears selection / cancels edit, `Cmd/Ctrl+Enter` commits edit,
  `Delete/Backspace` with a selection prompts nothing — it *files* (safe
  default; destruction only in the table).
- Editing: double-click body → `contentEditable`; blur commits; committing
  empty text deletes the note (`note.delete`).
- Paste: `paste` on the board pane when not editing → new note; if the text
  parses as a lone http(s) URL → `sourceUrl = url`, `text = url`, queue unfurl.
- New-note placement: scan a 24 px grid left-to-right / top-to-bottom for the
  first free 236×140 slot; if none, cascade from top-left with a 16 px step.
- Filing animation: card gets a class transitioning `transform` (toward the
  Memory tab, scale .6) and `opacity` to 0 over 200 ms, then element removal.
  Transform/opacity only — never animate size or shadow.

### 4.8 Performance budget (hard rules)

1. No full board re-render after initial paint — every mutation patches only
   the affected card elements. (v0 re-rendered everything on each change; do
   not copy that.)
2. Zero network waits in any interaction path; all server I/O goes through the
   §4.4 queue.
3. Drag path allocates nothing per frame beyond the transform string.
4. Memory table renders at most 200 rows per page; search/filter re-queries
   rather than rendering everything and hiding.

### 4.9 Tests — `scripts/test-sticky-notes.mjs` (pure, no DOM, no network)

Assert at minimum:

1. `normalizeNote` fills defaults, rejects empty text, coerces bad keys to null
2. v0-store migration maps the five legacy colors and drops rotation/size
3. LWW merge: newer `updatedAt` wins in both directions; unknown ids append
4. `applyOps`: categorize stamps only provided axes; `file` sets
   status+`filedAt` and keeps x/y; `restore` reverses it; `wipe` files loose
   notes without inventing a collection; `collection.delete` with
   `deleteNotes: false` orphans members to loose
5. Undo-of-wipe round-trip: state before wipe === state after wipe+restore
   (modulo `filedAt`/`updatedAt`)
6. Rubber-band hit-test: overlap, containment, edge-touch (counts as hit),
   miss
7. Free-slot placement never overlaps existing rects and cascades when full
8. Legend: override lookup falls back to defaults; unknown key rejected

Also run `node scripts/test-public-imports.mjs` — it must stay green.

### 4.10 Build slices (each ends green + pushed)

1. **Model + tests**: `notes.js` complete with reducer, migration, hit-test,
   placement; `scripts/test-sticky-notes.mjs` passing
2. **Board, local-only**: index.html/app.css rewrite, capture (N /
   double-click / paste), drag, edit, localStorage mirror. No auth, no server.
   Testable via `python3 -m http.server 8080`
3. **Select + categorize**: rubber band, action bar, legend rename, collection
   naming with typeahead
4. **Server + auth**: schema in `lib/db.js`, `lib/sticky-notes.js`,
   `api/sticky-notes.js`, rewrites, auth gate, sync queue wired end to end
5. **Memory + wipe + recall**: memory routes and table, file/wipe/undo/restore,
   filing animation
6. **Polish**: unfurl, search, empty states, mobile pass on the table

### 4.11 Chores that ride along

- `vercel.json`: add the five rewrites (§4.5)
- `AGENTS.md`: function count line (currently says 8; it is 9 before this work,
  10 after) + add the new test to the test list + one bullet on the two-tier
  model and the op protocol
- `README.md`: refresh the Sticky Notes section (v1 shipped state)
- Do NOT touch `middleware.js` — nothing new lives under `/lib/` that the
  browser needs

---

## Non-goals for v1

No extension work, no collaboration, no images, no due dates or reminders, no
second serverless function, no build step, no npm dependencies in browser code.
