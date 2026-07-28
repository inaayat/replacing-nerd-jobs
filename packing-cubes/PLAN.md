# Packing Cubes — UX & Backend Improvement Plan

Audited the deployed app (`app.js`, `builder.js`, `cube.html`, `api/save-cube.js`) against the
product spec. Findings and the plan to address them are below. Decisions already made are marked;
this file is the record of what shipped and why.

## Problems found in the existing code

1. **Every checkbox tick re-fetched every cube over the network** — `mergeItems()` called
   `fetchCube()` per cube with no caching, and a full list re-render on each toggle lost focus/scroll.
2. **Packed state could silently reset.** `itemKey` was `${cubeId}:${label}`, keyed to whichever cube
   first supplied a shared label — removing that cube changed the key and dropped the checkmark.
3. **"Save suitcase" was a no-op UI lie** — every change already auto-persisted via `saveState()`;
   the button just fired a toast.
4. **Basics were hard-locked** — couldn't be removed even though nothing in the product spec required that.
5. **No preview before adding a cube, no per-item removal once added, no edit path for existing cubes.**
6. **Layout was too spacious** — large radii/padding/icon sizes meant few cubes/items visible per screen.
7. Minor: Google Fonts loaded via render-blocking `@import`; search input had no accessible label.

## Decisions

- **Basics:** seed on new-suitcase creation only; freely removable; never auto-re-added. (No "locked"
  concept, no separate removed-tracking — just don't re-add them.)
- **Item-level removal:** hide, not delete — a per-suitcase `excludedItems` set with a
  "Show N hidden items" control, so every exclusion is reversible.
- **Cube editing:** owner edits publish in place (upsert, already supported by `/api/save-cube`);
  visitors editing an existing cube go through the same PR-submission flow, just against the
  existing file instead of a new one.
- **Density:** kept the aesthetic (Fredoka/Nunito, ink outlines, hard shadows, cream/sage) but tightened
  radii/shadows/padding, made cube cards single-line, and added a two-column checklist + filter +
  "hide packed" toggle. Did **not** build collapsible per-cube grouping in the checklist — items can
  have multiple source cubes, so "group by cube" is ambiguous for shared items; the two-column dense
  list + filter achieves the "more in one view" goal without that ambiguity.

## What changed

### Foundation (perf/correctness, no visible feature)
- Cube JSON responses are cached in memory; checking an item off updates just that row + the HUD
  numbers, instead of re-rendering the whole checklist.
- `itemKey` is now the normalized item label itself, so packed/excluded state survives adding or
  removing cubes that share an item.
- Removed the fake "Save suitcase" button; footer note now says storage is automatic.

### Removable basics
- Toggling a basic cube works exactly like any other cube. New suitcases still start with the three
  basics pre-added as a convenience.

### Cube preview
- Each cube card has a "peek" (eye icon) button, separate from the add toggle, that opens a modal
  with the full item list and an "Add to suitcase" action — no need to leave the page or visit
  `cube.html` just to see what's inside a cube.

### Item-level removal
- Each checklist row has a small "×" that hides that item from the merged list. A
  "Show N hidden items" link reveals hidden rows with an undo control.

### Cube editing
- Owner sees an "Edit" pencil on each catalog card and on `cube.html`; opens `builder.html?edit=<id>`
  with the form pre-filled and the ID locked (editing shouldn't change the ID — that's what
  "Create new" is for). Publishing overwrites the existing file (owner) or opens a PR against it
  (visitor), reusing the upsert logic already in `/api/save-cube`.
- Backend validation hardened with length caps on blurb, tags, and item labels (previously unbounded).

### Density pass
- Cube cards: smaller icon, single-line truncated blurb, tighter padding — roughly doubles the
  number of cubes visible without scrolling.
- Checklist: tighter row padding, two-column layout once a suitcase has more than ~6 items, a
  filter box, and a "hide packed" toggle.
- Tokens: `--radius` 16→12, primary shadow 4px→3px throughout.
- Fonts load via `<link rel="preconnect">` + stylesheet `<link>` instead of a render-blocking
  CSS `@import`.

## Explicitly out of scope (for now)

- Cloud-synced suitcases / accounts (spec already marks this as a later phase; auth infra exists in
  `lib/neon-auth.js` but suitcases still live in `localStorage`).
- Rate-limiting visitor cube submissions — the human-reviewed PR step is the actual control today;
  adding a rate limiter would need a persistent store disproportionate to current traffic.
- Collapsible per-source-cube grouping in the checklist (see Decisions above).
