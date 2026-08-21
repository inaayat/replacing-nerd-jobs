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
| Cards | Light card, color as a left edge bar. **User-resizable** by a bottom-right handle: width 160–480 px, stored height acts as min-height so content never clips. Default 220 px wide |
| Board bounds | **Pannable, zoomable canvas.** Wheel/trackpad pans, Ctrl/Cmd+wheel zooms at the cursor (40 %–200 %), Space+drag or middle-drag pans, a Fit button frames all notes. Note coordinates are world coordinates, unbounded |
| Arrows / connectors | **In v1.** Drag from a card's edge handle onto another card to connect them. Arrows are first-class rows that survive filing and reappear when both endpoints are back on the board |
| Pinned notes | **In v1.** A pinned note survives Wipe. Pin is a toggle on the card and in the action bar. Explicitly filing a pinned note (select → File) still works — pin guards against bulk wipe, not intent |
| Mobile | Memory table must be usable on phones; the board is desktop-first (it renders, but drag ergonomics are not a v1 goal) |
| Collaboration, images, reminders, due dates | Not in v1. This is deliberately not a todo app |

## 3. UX walkthrough

**Dump.** `N`, the "+ New note" button, or double-clicking empty board creates a
note (in edit mode) at the click point or the first free slot. Pasting onto the
board creates a note from clipboard text; a pasted URL becomes a link card that
shows the raw URL instantly and upgrades to the page title when the unfurl
lands. No required fields, ever.

**Think.** Drag notes freely on a pannable, zoomable canvas — scroll to pan,
Ctrl/Cmd+scroll to zoom, Fit to frame everything. Drag on empty board
rubber-band selects; shift-click toggles membership; dragging any selected note
moves the whole selection rigidly. Resize a card by its corner handle. Hovering
a card shows a connector dot on each edge; drag a dot onto another card to draw
an **arrow** between them. A selection raises a floating action bar: color
swatches, icon picker, pin toggle, collection name input (typeahead over
existing collections), and **File to memory**. Pin a note and it stays through
board wipes.

**Categorize when you have time.** Color/icon applied to a selection stamps
every note in it. Naming a selection makes a collection — a name chip renders at
the cluster's top-left, and the collection can keep living on the board; naming
and filing are separate acts.

**File / wipe.** File sends the selection or collection to memory (cards animate
out, ~200 ms). Wipe files everything **except pinned notes**: named collections
as themselves, loose notes loose. Arrows ride along invisibly and come back on
restore. Toast: "Board wiped — 14 notes filed. **Undo**".

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
  x: number, y: number,  // world coordinates on the canvas; kept after filing
  w: number, h: number,  // card size; w clamped 160–480, h is a min-height
  pinned: boolean,       // pinned notes are skipped by wipe
  sourceUrl: string|null, sourceTitle: string|null,
  createdAt: ISO string, updatedAt: ISO string, filedAt: ISO string|null
}
// Collection
{ id, name, status: 'board'|'memory', createdAt, filedAt }
// Arrow — directed connector between two notes
{ id, fromId, toId, createdAt }
// Viewport (client-only, localStorage, never synced)
{ panX: number, panY: number, zoom: number }  // zoom clamped 0.4–2.0
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
| `note.resize` | `{ id, w, h, ts }` | Set size (server clamps like the client) |
| `note.pin` | `{ ids, pinned, ts }` | Set pin flag on all `ids` |
| `note.categorize` | `{ ids, colorKey?, iconKey?, ts }` | Stamp only provided keys onto all `ids` (null clears) |
| `note.delete` | `{ ids }` | Hard delete; arrows touching these notes are deleted too |
| `arrow.create` | `{ id, fromId, toId, ts }` | Connect two notes; no-op if either id is unknown or `fromId === toId`; duplicate pairs (same direction) are no-ops |
| `arrow.delete` | `{ ids }` | Remove arrows |
| `collection.create` | `{ id, name, ts }` | New collection, status `board` |
| `collection.rename` | `{ id, name, ts }` | Rename |
| `collection.assign` | `{ ids, collectionId, ts }` | Set/clear (`null`) membership |
| `collection.delete` | `{ id, deleteNotes: bool }` | If false, member notes get `collectionId: null` |
| `file` | `{ ids?, collectionId?, ts }` | Status → `memory`, stamp `filedAt`; with `collectionId`, files the collection row too |
| `restore` | `{ ids?, collectionId?, ts }` | Status → `board`, clear `filedAt`; restores the collection row too |
| `wipe` | `{ ts }` | `file` for every board note **except pinned ones** and every board collection whose notes all filed. Arrows are untouched (they render only when both endpoints are on the board) |
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
  `c3`, `green` → `c4`, `purple` → `c5`; keep `width`/`height` as `w`/`h`,
  keep `pinned`, drop `rotation`) to `note.upsert` ops, then delete the old
  key.

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
  w REAL NOT NULL DEFAULT 220, h REAL NOT NULL DEFAULT 64,
  pinned BOOLEAN NOT NULL DEFAULT false,
  source_url TEXT, source_title TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  filed_at   TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS sn_notes_user_status ON sn_notes (user_id, status, filed_at DESC);
CREATE TABLE IF NOT EXISTS sn_arrows (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  from_note  TEXT NOT NULL REFERENCES sn_notes(id) ON DELETE CASCADE,
  to_note    TEXT NOT NULL REFERENCES sn_notes(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sn_arrows_user ON sn_arrows (user_id);
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
| `/api/sn-state` | `?route=state` | GET → `{ state: { notes, collections, arrows, legend } }` — the user's **complete** state, both statuses. The client is fully local-first and filters memory client-side, so one payload is the whole sync surface (hundreds of notes is nothing; revisit with a paginated memory route only if real data says so) |
| `/api/sn-ops` | `?route=ops` | POST `{ ops }` → `{ ok: true, applied: n }`. Applied in order; every statement scoped `WHERE user_id = $user`. Upserts use `ON CONFLICT (id) DO UPDATE … WHERE sn_notes.updated_at <= EXCLUDED.updated_at` for LWW. Unknown op kinds are skipped (an older server must not reject a newer client's queue). Cap 200 ops/request |
| `/api/sn-legend` | `?route=legend` | PUT `{ kind, key, label }` → `{ ok: true }`. Reject unknown keys (validate against `LEGEND_DEFAULTS` — import from `sticky-notes/notes.js`, which is browser-safe and legal for the server to import) |
| `/api/sn-unfurl` | `?route=unfurl` | GET `?url=` → `{ title }`. Server-side fetch, 5 s timeout, `<title>` regex, http(s) only; on any failure `{ title: null }`. Client follows up with a `note.upsert` setting `sourceTitle` |

Errors follow house style: `{ error: string }` with 401/400/405/502/503.

### 4.6 Visual spec

- Page: cream background and nav identical in structure to the current
  `sticky-notes/index.html`; keep the hero but shrink it — the board is the
  point. Tabs **Board | Memory** in the toolbar; active tab persisted in
  `localStorage['sticky-notes-view']`.
- Board: a **viewport** div filling the space below the toolbar
  (`height: calc(100vh - nav - toolbar)`, min 520 px), `overflow: hidden`, flat
  panel background (`--panel`, 1.5 px `--line` border, 18 px radius), containing
  a **world** layer positioned with
  `transform: translate(panX, panY) scale(zoom)` and
  `transform-origin: 0 0`. Cards and the arrow layer are children of the world
  layer, so pan/zoom is one transform write. A subtle dot grid on the viewport
  background (CSS radial-gradient) sells the canvas feel. **No cork texture.**
- Arrow layer: one absolutely-positioned SVG under the cards inside the world
  layer. Arrows are 1.5 px ink lines at 55 % opacity with a small triangular
  head, drawn from the edge midpoint of the source card toward the target card
  (line clipped to card rectangle edges, not centers). A hovered arrow thickens
  and shows an `×` midpoint button to delete it.
- Card: default `width: 220px`, height auto (`min-height: 64px`); stored `w`/`h`
  applied as `width` and `min-height`, user-resizable via a bottom-right handle
  (12 px hit area). Background `--panel`, `border: 1.5px solid var(--line)`,
  `border-radius: 10px`, `box-shadow: 0 1px 4px rgba(28,28,28,.08)`,
  `contain: layout style`. Color = 6 px left edge bar in the legend hex (no bar
  when `colorKey` null). Icon = 16 px, top-right, ink at 60 % opacity. Pinned =
  a small pin glyph at top-left and a slightly stronger shadow. Body: site sans
  `.92rem`, line-height 1.4, padding `10px 12px`. Source line: `DM Mono
  .62rem`, domain only, ellipsized. Selected: `outline: 2px solid var(--ink)`,
  offset 2 px. Hover shows four 8 px connector dots at edge midpoints. No
  rotation anywhere.
- Collection chip on board: pill at the cluster bbox top-left minus 14 px,
  `DM Mono .62rem` uppercase, ink on cream, recomputed on drag end only.
- Action bar: floats 12 px above the selection bbox in screen space (clamped to
  viewport), `--ink` background, cream content, radius 999, one row: count ·
  6 swatches · icon button (opens a 6×2 grid popover) · pin toggle · name input
  (`<datalist>` of collections) · "File" button.
- Board toolbar extras: zoom percentage readout, − / + buttons, and **Fit**
  (frames the bounding box of all board notes with 48 px padding, zoom clamped
  0.4–2.0).
- Memory table: full-width rows, 1 px `--line` separators, collection header
  rows in `Fraunces`, cells in site sans, metadata in `DM Mono`. Color shown as
  a 10 px dot, icon at 16 px. Filters as chip buttons above the table.
- Toast: reuse v0's `.sn-toast`, plus an inline Undo button variant.

### 4.7 Interaction spec

- Coordinates: pointer deltas divide by `zoom` to become world deltas. A shared
  helper pair `screenToWorld` / `worldToScreen` lives in `notes.js` (pure, unit
  tested) and is the only place that math exists.
- Pan: wheel/trackpad scroll pans (`panX -= deltaX; panY -= deltaY`);
  Ctrl/Cmd+wheel zooms toward the cursor (multiplicative steps, clamped
  0.4–2.0); Space held or middle mouse button turns left-drag into pan.
  Viewport writes are one transform string per `requestAnimationFrame`.
  Viewport persists in `localStorage['sticky-notes-viewport']`.
- Drag: pointer events with `setPointerCapture`; 4 px screen-space threshold;
  during drag position via `transform: translate(x, y)` with one write per
  `requestAnimationFrame`; `will-change: transform` only while dragging;
  on drop, commit `note.move` (or one per selected note). Dragged note moves to
  the end of the render order (top of z-stack) and stays there. Arrows touching
  the dragged card re-path on the same rAF tick; all other arrows are left
  alone. No position clamping — the canvas is unbounded; Fit recovers anything
  dragged out of sight.
- Resize: bottom-right handle; drag sets `w` (clamped 160–480) and `h` (min
  48) in world units; one style write per frame; on release, commit
  `note.resize`.
- Arrows: hovering a card shows connector dots at the four edge midpoints;
  pointerdown on a dot starts a ghost line following the cursor; releasing over
  another card emits `arrow.create`; releasing over empty board cancels.
  Clicking an arrow's midpoint `×` emits `arrow.delete`.
- Rubber band: starts on pointerdown on empty board (when Space is not held);
  dashed 1.5 px ink rect, 6 % ink fill; converted to world coordinates, then
  hit-test = rect intersection against in-memory note rects.
- Keyboard: `N` new note (ignored while any input/contentEditable is focused),
  `Escape` clears selection / cancels edit / cancels a ghost arrow,
  `Cmd/Ctrl+Enter` commits edit, `P` toggles pin on the selection,
  `Delete/Backspace` with a selection prompts nothing — it *files* (safe
  default; destruction only in the table).
- Editing: a click or tap that does not become a drag opens the body as
  `contentEditable`, with the caret at the pressed point
  (`caretRangeFromPoint`); double-click still works. Blur commits; an empty
  body stays on the board (`note.upsert`). While a note is open its own
  small bar (trash / pin / colour / done) floats above it in screen space and
  the board pans to keep the note clear of a phone keyboard.
- Deleting: the tier-1 trash emits `note.delete` immediately — a real delete,
  not a file — behind a ten-second Undo toast that re-upserts the note and its
  arrows. The memory table keeps its `confirm()`.
- Touch: tap edits, one finger drags the canvas on empty board, two fingers
  pinch-zoom about their midpoint, a 400 ms long-press opens a selection
  session (taps toggle membership, a tap on the board ends it), and a
  double-tap on empty board makes a note. Drag slop is 8 px rather than 4 px.
- Paste: `paste` on the board pane when not editing → new note; if the text
  parses as a lone http(s) URL → `sourceUrl = url`, `text = url`, queue unfurl.
- New-note placement: scan a 24 px grid left-to-right / top-to-bottom **within
  the current viewport's world rect** for the first free 236×140 slot; if none,
  cascade from the viewport's top-left with a 16 px step.
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

1. `normalizeNote` fills defaults, keeps empty text as a blank note, coerces bad keys to
   null, clamps `w`/`h`
2. v0-store migration maps the five legacy colors, keeps width/height/pinned,
   drops rotation
3. LWW merge: newer `updatedAt` wins in both directions; unknown ids append
4. `applyOps`: categorize stamps only provided axes; `file` sets
   status+`filedAt` and keeps x/y; `restore` reverses it; `wipe` files loose
   notes without inventing a collection **and skips pinned notes**;
   `collection.delete` with `deleteNotes: false` orphans members to loose;
   `note.pin` toggles; `note.resize` clamps
5. Arrows: `arrow.create` rejects self-loops, unknown endpoints, and duplicate
   pairs; `note.delete` cascades to touching arrows; a filed-and-restored pair
   still has its arrow
6. Undo-of-wipe round-trip: state before wipe === state after wipe+restore
   (modulo `filedAt`/`updatedAt`)
7. Rubber-band hit-test: overlap, containment, edge-touch (counts as hit),
   miss
8. Free-slot placement never overlaps existing rects and cascades when full
9. Legend: override lookup falls back to defaults; unknown key rejected
10. `screenToWorld` / `worldToScreen` round-trip at zoom 0.4, 1, 2 and nonzero
    pan

Also run `node scripts/test-public-imports.mjs` — it must stay green.

### 4.10 Build slices (each ends green + pushed)

1. **Model + tests**: `notes.js` complete with reducer, migration, hit-test,
   placement; `scripts/test-sticky-notes.mjs` passing
2. **Board, local-only**: index.html/app.css rewrite, pan/zoom canvas, capture
   (N / double-click / paste), drag, resize, edit, pin, localStorage mirror.
   No auth, no server. Testable via `python3 -m http.server 8080`
3. **Select + categorize + arrows**: rubber band, action bar, legend rename,
   collection naming with typeahead, connector dots and the arrow layer
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
