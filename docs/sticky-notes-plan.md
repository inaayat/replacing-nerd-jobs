# Sticky Notes — product plan

Status: **v0 shipped (localStorage cork board), v1 planned below**
Site: `/sticky-notes/` on [inaayat.xyz](https://inaayat.xyz) (this repo)
Auth: Neon Auth + Postgres (same pattern as A-Lister / Packing Cubes / Table Manners)

v1 is a **rewrite of the board surface**, not a reskin. v0 had one flat pile that
never emptied; v1 splits the app into a small working **board** and a large
searchable **memory**, and the act of moving notes from one to the other is the
whole product.

---

## One sentence

A board you dump onto and think on — add notes fast, shove them around, cluster
the related ones into named collections — then **file them into memory
and wipe the board**, with everything recoverable, so the board stays a clean
fast thinking surface and memory does the remembering.

---

## The five jobs

| Job | What it looks like | What it demands |
|-----|--------------------|-----------------|
| **Dump** | "call the dentist", "idea for the site" | Capture in under two seconds, zero required fields |
| **Read it later** | pasted URLs | Recognizable link cards, and a way to see what is unread |
| **Brainstorm** | many fragments on one topic | Move them around, cluster, name the cluster — mind mapping |
| **Categorize** | cutting across all of the above | Two cheap picks, appliable to a whole selection at once |
| **Memory** | the restaurant name, the book rec | Search, and a dense table that fits hundreds of rows |

The through-line: notes accumulate and are rarely deleted. Assume **hundreds of
notes in memory** and **a couple dozen on the board**. That size split is what
makes free dragging viable on the board and hopeless as a global filing system.

---

## Locked decisions

| Decision | Call |
|----------|------|
| Surface | **Web app** at `/sticky-notes/` |
| Persistence | **Signed-in.** Neon Auth + Postgres, notes follow the user across devices |
| Browser extension | **Deferred.** v0 extension stays in the repo, untouched |
| Two tiers | **Board** (small, spatial, what you are thinking about) and **Memory** (everything filed away). Same notes, two states |
| Board | Freely draggable notes. Position is real and saved. A working surface, not an archive |
| Memory | The **structured table**: dense rows, sortable columns, search. Where "find that one thing" happens |
| Collections | **Named collections are first-class.** Rope-select notes, type "Japan trip", and that becomes a thing in memory you can open, **add to later**, and see as a unit. Memory is a list of collections plus loose notes |
| Adding later | The board's file action offers **existing collections as well as a new name** — a note captured today can join a collection filed last month |
| Recall | **Two-way.** A collection (or a single note) can be pulled from memory back onto the board, arrangement restored. Memory is a shelf, not a graveyard |
| Wipe board | Files everything to memory and empties the visualization. **Never destroys data.** Delete is a separate, explicit act |
| Categorizing | Two independent, user-defined axes: **color** and **icon**, one of each per note, both optional, appliable to a whole selection at once |
| Legend | The user names what each color and icon means; notes store keys, never labels, so renaming relabels history |
| Typography | **No handwriting font** — v0's `Segoe Print`/`Comic Sans` was cheugy. Site sans for bodies, `DM Mono` for metadata, `Fraunces` for page headings only |
| Card look | Light card, **color shown as a header chip / edge**, like the inspo boards — not a fully saturated paper square. Clean and formal |
| Performance | The board must feel native: transform-based drag, no full re-renders, nothing ever blocks on the network. Budget below |
| Sharing / collaboration | Later |
| Mobile capture / PWA | Later; memory table should degrade fine on phones, the board is desktop-first |

---

## UX walkthrough

The clean path, end to end. Every step is designed so the fast thing is the
default thing and categorizing is deferrable until "when you have time."

### 1. Dump

- Open `/sticky-notes/`. The board is what you see; a **New note** affordance and
  the keyboard shortcut `N` both drop a fresh note where there's room, already
  in edit mode.
- **Double-click empty board** creates a note at that spot — capture where your
  eye already is.
- **Paste onto the board** creates a note from the clipboard. A pasted URL
  becomes a link card (title fetched server-side, lazily — the card shows the
  raw URL instantly and upgrades when the fetch lands).
- No required fields. No color, no icon, no name. Type, click away, done.

### 2. Think (mind-map mode)

- Drag any note anywhere. Drag on empty space **rubber-band selects**;
  shift-click adds to a selection; dragging any selected note moves the whole
  selection rigidly.
- A selection shows a **floating action bar** next to it: color swatches, icon
  picker, a name field, and **File to memory**. One bar, everything on it.
- Naming a selection turns it into a **collection**: the notes get a shared name
  chip (like "Awesome idea" in the inspo), and a soft outline hugs the cluster.
  Collections can keep living on the board — naming and filing are separate acts.
  The name field offers **existing collections** by typeahead, so a new note can
  join "Japan trip" from last month instead of spawning a duplicate.

### 3. Categorize when you have time

- Applying a color or icon to a selection stamps every note in it, one click.
- Nothing forces this at capture time. Uncategorized notes are fine; they land
  in memory as "unsorted" and can be triaged from the table later.

### 4. File / wipe

- **File to memory** on a selection or collection: the notes animate off the
  board, the collection appears at the top of memory. The board is emptier.
- **Wipe board** files *everything* remaining: named collections file as
  themselves, loose notes file loose. The board animates clean. There is no
  confirm dialog because nothing is lost — instead a toast offers **Undo**,
  which pulls it all straight back.
- Delete exists, but only per-note / per-collection from the table, worded as
  destruction, and never adjacent to wipe.

### 5. Remember

- Toggle to **Memory**: a list of **collections plus loose notes**. Collections
  are collapsible header rows showing name and count; expanding shows the notes.
  Loose notes sit below (or interleaved by date — flat sort is one click away).
- Columns: note text, color, icon, collection, source link, filed date. Sort by
  any column, filter by color/icon/collection, full-text search across bodies.
- A collection can be **added to later**: from the table directly, or by filing
  new board notes into it by name.
- Every row and every collection has **Restore to board**. Restoring a
  collection puts the cluster back with its relative arrangement intact, offset
  to free space.

---

## Performance budget — "clean, no lag"

The board dies as a product if dragging stutters. Rules, all cheap to follow in
a no-build vanilla-JS repo:

| Rule | Concretely |
|------|-----------|
| Drag never touches layout | Notes position with `transform: translate(x, y)`, not `left/top`. Pointer moves batched through `requestAnimationFrame`; one style write per frame |
| No full re-renders | v0 re-rendered the whole board on every change. v1 updates only the touched note's element. The board render function runs once per page load and per view switch |
| Isolate paint | `contain: layout style` on every card; `will-change: transform` applied on drag start and removed on drop, never left on |
| Never block on network | All interactions commit to an in-memory store + `localStorage` mirror synchronously. Server sync is a debounced background queue (batched upserts, last-write-wins by `updatedAt` — the merge logic in `notes.js` already does this) |
| Filing is optimistic | File/wipe animates immediately from local state; the API call follows. Failure re-queues silently and retries — the user never sees a spinner for their own notes |
| Memory table stays light | Render rows for the current filter/search only, capped with a "show more"; no virtualization needed until real usage says otherwise |
| Animations are transform/opacity only | The file-away and wipe animations move and fade cards; nothing animates width, height, or box-shadow |

Selection (rubber-band hit-testing) runs against the in-memory note list, not
the DOM.

---

## Categorizing: two axes, not a tag pile

A note carries **one color** and **one icon**, independent and optional.

```
              icon  →   link      idea      remember   errand
  color ↓
  work                  ·         ·         ·          ·
  personal              ·         ·         ·          ·
  house                 ·         ·         ·          ·
```

The app ships a fixed set (working assumption: 6 colors, ~12 icons) with default
labels; the user renames them inline from the filter bar. Notes store the key
(`"c1"`, `"star"`), never the label, so renaming a color relabels every note
retroactively. Free-text tags deliberately do not exist: two one-click axes plus
collection names plus full-text search cover the same ground without tag rot.

---

## Data model (Neon)

```
sn_notes    id, user_id, text, color_key, icon_key,
            status ('board' | 'memory'), collection_id (nullable),
            x, y, w, h,                  -- kept even in memory, so recall
                                          -- restores the arrangement
            source_url, source_title,
            created_at, updated_at, filed_at
sn_collections  id, user_id, name, status ('board' | 'memory'),
                created_at, filed_at
sn_legend   user_id, kind ('color' | 'icon'), key, label
```

Filing = flipping `status` (and stamping `filed_at`); wiping = the same, in
bulk; recall = flipping back. Nothing is copied, nothing is destroyed. Positions
ride along untouched, which is the whole trick behind arrangement-preserving
recall.

## API shape

One new function, `api/sticky-notes.js` (repo is at 9 of Vercel Hobby's 12 —
the `AGENTS.md` "8" is stale), `?route=` branches + `vercel.json` rewrites, all
behind `getAuth` from `lib/neon-auth.js`:

| Route | Does |
|-------|------|
| `state` (GET) | Board notes + collections + legend in one payload; memory fetched by the table with filters |
| `ops` (POST) | Batched operations from the sync queue: upsert notes, move, categorize, file, wipe, restore, delete |
| `legend` (PUT) | Rename colors / icons |
| `unfurl` (GET) | Fetch a pasted URL's title for link cards, cached |

## Files

| Piece | Responsibility |
|-------|----------------|
| `api/sticky-notes.js` | The authed handler above |
| `lib/sticky-notes.js` | Server-only Neon queries. Never imported by the browser |
| `sticky-notes/notes.js` | Note/collection model, normalizers, merge — dependency-free ESM, shared and browser-safe |
| `sticky-notes/legend.js` | Color/icon keys, default labels, override handling |
| `sticky-notes/board.js` | Canvas: drag, rubber-band selection, action bar, wipe animation |
| `sticky-notes/memory.js` | Table: filters, search, collection rows, restore |
| `sticky-notes/sync.js` | In-memory store, `localStorage` mirror, debounced op queue |
| `sticky-notes/engine/auth.js` | Neon Auth wiring over `engine/neon-browser-auth.js` |
| `scripts/test-sticky-notes.mjs` | Pure-function tests: model, merge, selection hit-testing, filing/restore transitions, legend |

Constraints that already apply: `middleware.js` 404s `/lib/`, so anything the
browser imports lives under `sticky-notes/` (`scripts/test-public-imports.mjs`
enforces it); browser modules stay dependency-free ESM, no `node:` imports, no
npm packages, no build step.

## Build slices

1. **Board core** — notes, capture (N / double-click / paste), transform drag,
   local-first store with localStorage mirror. Feels perfect before anything else lands
2. **Select + categorize** — rubber-band, action bar, legend, collection naming with existing-collection typeahead
3. **Memory** — Neon schema, `state`/`ops` routes, filing, wipe with undo, the table
4. **Recall** — restore note/collection to board with arrangement, add-to-collection from the table
5. **Polish** — link unfurl, search, file/wipe animations, empty states
6. **Later** — extension revival, arrows/connectors between notes, images, mobile board

---

## Open questions

1. **Arrows/connectors** — the mind-map inspo has arrows between clusters. Parked
   for "later" as scaffolding the board doesn't need in v1; overrule if arrows are
   core to how you think
2. **Board bounds** — one fixed screen that fills up (forcing wipes, keeping it
   honest) vs. a pannable canvas with more room. Working assumption: one screen,
   no pan/zoom — simpler and faster, and the pressure to wipe is a feature
3. **Recurring board notes** — anything that should *stay* on the board across
   wipes (pinned), or does wipe always mean everything goes
4. **Note sizing** — fixed width with height following content (clean columns,
   like the inspo) vs. freely resizable like v0. Working assumption: fixed width
5. ~~Memory default view~~ — settled: **collections plus loose notes**, newest
   first, with a flat date-sorted view one click away

## Non-goals for v1

- No extension work (v0 extension keeps working against its own storage)
- No real-time collaboration
- No second serverless function
- No build step; this stays a no-build site
- No due dates, no reminders — this is deliberately not a todo app
