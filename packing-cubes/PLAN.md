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
  "hide packed" toggle. (Round 2 below replaced the two-column-by-count approach with grouping by
  cube, which turned out to resolve the shared-item ambiguity cleanly — see below.)

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

## Round 2 — palette, layout, and interaction model changes

Follow-up requests after the first pass shipped. Decisions confirmed with the user before
implementing (color direction, click-to-expand vs. instant toggle, add-item scope) are captured here.

### Auth link
- Added a `Log in` / `Log out` link (`#nav-auth-link`) to the nav on all three pages, wired to
  each page's existing owner-check fetch. Previously the only way to log in was to know to visit
  `/private/`, and `builder.html` even showed a static "Log out" link to signed-out visitors.

### Calmer palette + readability
- Replaced the bright playful palette with the "cocoa / topaz / noonday" palette (deep cocoa ink,
  warm cream, topaz-orange primary accent, noonday-blue secondary, taupe muted accent) — values-only
  change to the existing CSS custom properties in `cube.css`, so no selectors needed to change.
- Dropped the thick 3px ink borders and hard offset "sticker" shadows for thin neutral borders and
  soft blurred shadows; softened button hover states from a translate+shadow-grow effect to a plain
  background change.
- Removed Fredoka entirely (was on headings/buttons/badges) in favor of Nunito everywhere, for
  readability at small sizes; dropped the now-unused Fredoka font weights from the Google Fonts
  request.
- Removed the purely decorative `.pc-blob` background shapes and the suitcase "handle"/"stripe"
  illustration — icons and status color now carry the meaning instead of ornamental sticker touches.

### Full width
- Raised `.pc-app-inner`'s max-width from 1280px to 1680px (a wider cap, not unlimited, per the
  user's choice) and widened the left panel's column range. The checklist grid also now goes to
  three columns above 1500px viewport width, since there's room to use.

### Expand-first cube cards
- Clicking a cube card no longer instantly toggles it in/out of the suitcase — it always opens the
  expanded preview first (the old separate "peek" eye icon is gone; the card *is* the preview
  trigger now). Adding/removing only happens via the explicit button inside that view. Cards show a
  small non-interactive checkmark badge when already in the suitcase, instead of a clickable +/✓ toggle.

### Add an item while previewing (both scopes)
- Inside the expanded cube view you can stage one or more extra items before committing. A checkbox
  ("Also publish this to the cube for everyone" / "...suggest this as a permanent addition") lets you
  choose **both** at once: the item always gets added to your suitcase for this trip; if checked, it's
  *also* sent through `/api/save-cube` (owner: publishes directly; visitor: opens a PR) to become a
  real part of the cube for everyone.
- The primary button adapts: "Add to suitcase" (cube not yet added), "Add item(s) to suitcase" (cube
  already added, items staged), or "Remove from suitcase" (cube already added, nothing staged).

### Grouped checklist
- The merged packing list is now grouped by the cube it came from (collapsible headers, item count),
  instead of repeating a source pill on every row. Custom items tag along with the cube they were
  staged from (via the add-item flow above) and land in that cube's group; untagged custom items
  (added through the bottom "+ Add custom item" row) get their own trailing "Custom items" group.
  Items shared across more than one selected cube are placed under the first cube (in suitcase order)
  that has them, with a small "also in ..." note — same resolution as the shared-item ambiguity noted
  in Round 1, just actually built out this time since the user asked for it directly.

### Inline cube creation & editing
- `builder.js` was refactored from a page-level script into an exported `initBuilder({ root, editId,
  onClose, onPublished })`, so the same form logic can run standalone on `builder.html` (unchanged,
  still a valid deep link) *or* inline in a modal on the main page. "+ Create a cube" and each cube
  card's edit pencil now open that modal in place — no navigation away from the split view. A
  successful owner publish refreshes the catalog in place so the new/edited cube shows up immediately.
- The "+ Create a cube" button itself moved from the page header into the "Available Cubes" panel
  head, next to the search box, since that's the panel it actually acts on.

### Delete a cube
- Owner-only. `/api/save-cube` now handles `DELETE` (body `{ id }`) — checks the same auth cookie,
  fetches the file's current SHA, and deletes it via the GitHub contents API (no PR path for
  visitors; deletion is destructive enough that it stays owner-only, unlike edits). The button lives
  inside the cube preview modal as a small muted text link below "Add to suitcase", with a
  `confirm()` guard. The catalog refreshes in place afterward.
- Deleting a cube doesn't drop its items from suitcases that had it added — each affected suitcase
  gets those items converted into plain custom items first (same label, so packed/hidden state
  carries over via the label-based `itemKey`), skipping any label already covered by another cube
  still in that suitcase or already present as a custom item, so nothing shows up twice.
- `index.html` needed to load `builder.css` too, since the inline modal renders builder-specific
  markup (`.b-step`, `.b-mode-toggle`, etc.) that previously only `builder.html` loaded.

## Explicitly out of scope (for now)

- Cloud-synced suitcases / accounts (spec already marks this as a later phase; auth infra exists in
  `lib/neon-auth.js` but suitcases still live in `localStorage`).
- Rate-limiting visitor cube submissions — the human-reviewed PR step is the actual control today;
  adding a rate limiter would need a persistent store disproportionate to current traffic.
- Collapsible per-source-cube grouping in the checklist (see Decisions above).
