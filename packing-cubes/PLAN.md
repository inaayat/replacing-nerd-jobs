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

### Expand-first cube cards (superseded by inline accordion — see Round 3)
- Clicking a cube card no longer instantly toggles it in/out of the suitcase — it opens the expanded
  preview first (the old separate "peek" eye icon is gone; the card *is* the preview trigger now).
  Cards show a small non-interactive checkmark badge when already in the suitcase. (Round 3 replaced
  the centered popup with an inline accordion and brought back a quick-add control — see below.)

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

### Submit a suitcase via PR
- Since suitcases only ever live in `localStorage` (no accounts yet), added a way to back one up
  through the repo the same way an anonymous visitor submits a cube: a new `api/save-suitcase.js`
  endpoint takes the full suitcase object, opens a `suitcase-submissions/<slug>-<timestamp>` branch,
  writes it to `packing-cubes/suitcases/<slug>-<timestamp>.json`, and opens a PR — no owner
  direct-publish shortcut, since a suitcase isn't part of a curated catalog the way cubes are, so
  every submission goes through review regardless of login state.
- A "Submit via PR" button sits next to the "saved automatically" footer note. Clicking it prompts
  for an optional attribution name (mirroring the cube builder's "Your name" field) and POSTs the
  active suitcase as-is (trip name, cube list, custom items, packed state, hidden items) — a literal
  snapshot, not a re-usable template with personal progress stripped out.
- No read-back/import UI was built (browsing or restoring a submitted suitcase) — out of scope for
  what was asked; this is a one-way backup/save mechanism for now.

## Round 3 — inline accordion instead of a popup, quick-add, "mark as Basic"

The centered preview modal read as a heavier interruption than intended, and the user picked an
inline accordion over a slide-out side panel when shown both as mockups.

### Inline accordion (replaces the preview modal)
- Clicking a cube card's header now expands it in place — the card grows taller within the
  "Available Cubes" list, pushing other cards down, instead of opening a centered popup. Only one
  cube is expanded at a time; clicking its header again (or a different card's header, or Escape)
  collapses it. The `#preview-overlay`/`#preview-modal` markup is gone entirely; the builder's
  create/edit popup (`#builder-overlay`) is untouched, since that one wasn't part of this ask.
- Since only one cube can be expanded at once, the expanded body's internal controls
  (`#stage-input`, `#preview-commit`, etc.) keep the same static ids they had in the modal — there's
  never a second copy in the DOM to collide with.
- The expanded body carries over everything the modal had: item list, stage-an-item input with the
  "also publish/suggest permanently" checkbox, and the dynamic primary button (Add to
  suitcase / Add item(s) to suitcase / Remove from suitcase).
- Owner-only "Edit this cube" and "Delete this cube" links now live inside the expanded body too
  (previously delete was modal-only and edit was header-pencil-only), so both actions are reachable
  once you've expanded a cube, not just from the collapsed row.

### Quick-add without expanding
- Each collapsed card header has its own small "+" / checkmark button (separate from the pencil
  edit icon and from clicking the header to expand) that adds or removes the cube from the suitcase
  immediately, no expansion needed — the fast path for someone who already knows what's in a cube.
  You can still add/remove after expanding via the button described above; both paths write through
  the same `addCubeToSuitcase`/`removeCubeFromSuitcase` functions.

### Mark a cube as "Basic" from the builder
- The builder form's "Cube details" step has a "Mark as a Basic" checkbox now, instead of requiring
  someone to type the literal word `basics` into the freeform tags field. It's just a friendly view
  onto the same `tags` array — checking it adds `"basics"` to `cube.tags` (and updates the visible
  tags text field to match); typing `basics` into the tags field manually still checks the box too,
  since the array is the single source of truth either way.

### Mobile overflow fix
- On phones the page rendered zoomed out to fit content wider than the screen, and the nav header
  wrapped text mid-word instead of reflowing cleanly. Root cause: `.pc-app-inner`'s CSS Grid columns
  used bare `1fr`, which has an implicit content-based minimum width — any non-wrapping descendant
  (cube titles truncated with `white-space: nowrap`, etc.) silently forced the whole grid track (and
  therefore the page) wider than the viewport. Changed every bare `1fr` grid track (`.pc-app-inner`,
  `#pack-list-groups` at all three breakpoints) to `minmax(0, 1fr)`, which is the standard fix — it
  caps the track's minimum size at 0 instead of "however wide my content wants to be," so overflowing
  children scroll/clip/ellipsis within their track instead of blowing out the layout. Verified with
  `document.documentElement.scrollWidth` at a 375px viewport: 535px (overflowing) before, 375px
  (exact match, no overflow) after.
- Separately, `.pc-nav` didn't wrap as a unit, so on narrow screens the browser broke individual nav
  labels mid-phrase ("Packing" / "Cubes" on two lines) trying to fit everything on one row. Added
  `flex-wrap: wrap` to `.pc-nav` and `.pc-nav-links`, plus `white-space: nowrap` on the nav labels
  themselves, so instead the brand row and links row now drop onto their own line as whole groups
  when they don't fit.

## Explicitly out of scope (for now)

- Rate-limiting public cube publishes — GitHub write quotas + Neon Auth sign-in are the controls today.
- Collapsible per-source-cube grouping in the checklist (see Decisions above).

## Round 5 — Neon Auth + per-user cubes/suitcases

- Packing Cubes requires the shared Neon Auth login (`/account.html`). Suitcases sync to
  `pc_suitcase_state` instead of browser-only storage (localStorage still used as a cache / migration source).
- Cubes are private per user in `pc_cubes` by default. "Make public" opens a GitHub PR that is
  auto-merged into `packing-cubes/cubes/` so the static site catalog picks it up on deploy.
- Legacy static catalog cubes remain available to everyone; owned DB cubes overlay them by id.

## Round 6 — list-first rebuild: flat list → Organize, standard cubes + add-ons, guest mode, PWA, functional restyle

The product flipped from cube-first to **list-first**, and this round rebuilt the app around it.

### The list is the source of truth (suitcase v2)
- A suitcase now owns a flat item list — `items: [{ id, label, cubeId|null, addOnId|null, packed }]` —
  instead of deriving its checklist from `cubeIds + customItems + label-keyed packed/excluded state.
  Items are typed straight into a quick-add box with no cube decision required; each row can be
  checked, renamed, or removed. Deleting is real deletion now, so the old "hidden items" reveal UI
  (which existed because virtual cube items couldn't be deleted) is gone.
- **Organize** is an explicit mode on the list: every row grows a cube dropdown (plus rename +
  remove), and the toolbar button shows how many items are still unsorted. The By-cube view keeps
  attached-but-empty cubes visible as filing targets, with an Unsorted group pinned last.
- Attaching a cube imports its item labels into the list (case-insensitively deduped); detaching
  removes the rows it brought. Deleting a cube from the account keeps the rows and just unassigns
  them — the list outlives its organization layer.
- v1 suitcases migrate client-side on load (`migrateSuitcase`): cube items materialize from the
  fetched cubes, label-keyed packed state carries over, excluded items migrate as deleted, and
  unfetchable cubes stay attached so their items can be re-imported later. The server never needed
  to know — `pc_suitcase_state.suitcases` is opaque JSONB.
- All of this lives in the dependency-free `engine/model.js`, tested by
  `scripts/test-packing-cubes-model.mjs` (the repo's pure-node-test pattern); `app.js` is fetch +
  DOM only.

### Standard cubes + add-ons (one mechanism, no third cube type)
- "Always take these" = the existing basics-tag mechanism, promoted: tag `standard` (legacy
  `basics` still honored) attaches the cube to every new list and imports its base items. The
  builder checkbox writes `standard`; the rail badge says "Standard".
- "Add this to that cube" = **add-ons**: `addOns: [{ id, title, items }]` nested in the cube, not
  standalone cubes. They render as toggle chips in the expanded library card *and* under the
  cube's group header in the By-cube view; enabling imports the bundle's items tagged with the
  parent cube (auto-attaching it if needed), disabling removes exactly those rows. Off by default
  on new lists. Server: `pc_cubes.add_ons` JSONB (additive ALTER), validation caps in
  `lib/packing-cubes.js`, included in published cube JSON by `lib/github-cubes.js`, editable in a
  builder step, and shown read-only on `cube.html`. Seeded example: `cubes/toiletries.json`
  (standard, with travel-meds / hair-tools / skincare add-ons); the two "Basics:" cubes were
  retagged `standard`.

### Account behavior: guest mode instead of a hard gate
- Signed-out (or auth-unconfigured, e.g. a plain static dev server) no longer dead-ends at a
  sign-in wall: the catalog browses, the list works device-locally, and a footer banner offers
  sign-in for sync + cube creation. Owner-only actions (create/edit/publish/delete cubes) still
  require the account; the existing local→cloud migration on first sign-in is unchanged. A 401
  mid-session drops to guest mode with a "session expired" banner instead of an endless toast loop.

### Navigation / mobile / PWA
- Below 900px the two stacked panels became **Packing list | Cube library** tabs (list first) —
  no more scrolling past the whole catalog to reach your checklist.
- Every focusable field is ≥16px on coarse pointers (the iOS focus-zoom rule the rest of the site
  follows); rows, chips, and icon buttons got 34–44px touch targets; whole checklist rows toggle.
- Installable: `manifest.webmanifest` + `icons/` (regenerate with
  `npm install --no-save sharp && node scripts/generate-packing-cubes-icons.mjs`), SVG favicon,
  `pc-standalone` class hides the site pill when launched from a home screen. No service worker,
  same as A-Lister / Sticky Notes.

### Functional restyle
- Dropped Google-Fonts Nunito for the locally-shipped Atkinson Hyperlegible (`/fonts/`), dropped
  the ugly-dog favicons for the suitcase icon, dropped the 🧳 emoji toast, and replaced the
  cocoa/topaz "cutesy" palette with neutral grays + one green accent (legacy token names are
  aliased in `cube.css` so builder styles didn't need a rewrite). The all-packed toast also only
  fires on the transition to fully packed now, instead of on every re-render.

### Fixed along the way
- Quick-add (+) no longer force-expands the card; suitcase cubes no longer all auto-expand on boot.
- Unchecking an item no longer stores `packed: false` forever (v2 stores a bool per item row).
- Catalog search covers item labels and add-ons, and the rail sorts mine → standard → A-Z.

## Round 7 — no auto-attached cubes: common templates instead of standard cubes

Direct user correction to Round 6: **don't have standard cubes** — each user builds their own
cube set; the site's job is to offer good starting material, not to preload anyone's list.

- **No auto-attach.** `newSuitcase()` creates an empty list with no cubes. The `standard` tag's
  auto-attach behavior is gone entirely (the builder checkbox too); `isStandardCube` became
  `isCommonCube`.
- **Common cubes** are curated catalog templates tagged `common` (legacy `standard`/`basics`
  still read as common for old data): badged "Common", sorted after the user's own cubes, and
  attached only when the user chooses. Seeded set (each one JSON file in `cubes/`, confirmed
  with the user): Toiletries (add-ons: travel meds / hair tools / skincare), Clothing Essentials,
  Electronics & Chargers (add-ons: work setup / camera kit), Travel Documents, Beach & Swim,
  Cold Weather (add-on: snow gear), Workout. The two personal "Basics:" cubes went back to
  plain personal tags.
- **"Copy into a cube of my own."** Every non-owned cube's expanded card offers a template
  fork: `initBuilder({ templateId })` (also `builder.html?template=<id>`) prefills the builder
  from that cube, drops curation tags, starts private, and saves under the user's own id.
- **Removable everywhere.** Any cube — common or not — detaches from a list via the library
  toggle, the expanded card button, or a new × on its group header in the By-cube view
  (detaching removes the rows it brought; the toast reports the count).

## Round 8 — no catalog at all: private, user-built cubes; publishing retired

Second correction: don't show common cubes either, and drop "make public". Cubes are now
purely personal, and the app's job is to make *building your own* easy.

### The shared catalog is gone
- `packing-cubes/cubes/` (all cube JSON + index), `scripts/build-cube-index.mjs`, the
  `build-cube-index.yml` Action, and `engine/paths.js` are deleted. The app never fetches static
  cube JSON; `loadCatalog()` returns your rows and nothing else, and `listVisibleCubes`
  (`user_id = … OR is_public = true`) became `listOwnCubes` (`user_id = …`), so no other user's
  cube can appear even in principle.
- The rail is now **My cubes** with a real empty state that explains what a cube is and offers
  "Build my first cube" — rather than a list of other people's cubes.

### Publishing retired
- Removed the "Make public" checkbox and link, the `publish` route, the `/api/pc-publish`
  rewrite, `cubesApi.publish`, and `lib/github-cubes.js` (auto-merged publish PRs, catalog file
  writes, unpublish-on-delete). Edit and delete no longer touch GitHub, so cube writes are pure
  Neon and can't fail on a GitHub quota. `is_public` / `github_pr_url` / `published_at` stay as
  vestigial columns (dropping columns is a Neon-console change), documented as such in `db.js`;
  the now-pointless partial index is dropped. `GITHUB_TOKEN` is only used by Sporcle now.
- `cube.html` is a signed-in view of **your** cube (API only, no static fallback) with Add /
  Edit actions, since there are no public cube pages to link to.

### Building your own, made easy
- **Unsorted → "Save as cube"** is the primary path: type a real list, then keep the useful part.
  It creates the cube from the unsorted items and files those existing rows into it (no
  re-import, no duplicates).
- **Builder rewritten** for humans instead of catalog maintainers: no cube-ID field (ids are
  title slugs resolved server-side by `nextFreeId`, since `pc_cubes.id` is a global primary
  key and two people may both make a "Toiletries"), no visibility choice, no numbered
  step scaffolding, no tags field. Enter moves to the next item; "Paste a list instead" accepts
  a newline list and strips `-`/`*`/`1.` bullets; validation stays quiet until there's something
  to fix, and saving from the modal closes it.
- Removed the Round 7 "Copy into a cube of my own" template flow — with only your own cubes in
  the rail, Edit already covers it.

## Round 9 — sign-in is the front door

Guest mode was the wrong default once cubes went private: with no catalog to browse, a
signed-out visitor had nothing to look at and a list that silently lived on one device.

- `renderSignInGate()` is the default view when signed out (or when Neon Auth isn't configured):
  a centered card with a small packed-suitcase illustration (`SUITCASE_ART`, inline SVG —
  decorative, `role="img"` + label) and one sentence of what the app does. Sign in / Sign up
  are on the card itself (see Round 10). `/account.html` is only for manage-account / delete.
- Guest mode is gone entirely: no device-only list, no guest footer banner, no signed-out branch
  in the cube rail's empty state, `canEditCube`, `loadCatalog`, or `fetchCube`. `localStorage`
  stays as the instant-read cache and the local→cloud migration source on first sign-in.
- A 401 (at boot **or** mid-edit during a sync) now returns to the gate with "Your session
  expired", instead of quietly demoting the session to device-local. The pending change is still
  in `localStorage`, so signing back in picks it up.
- Nav's "+ New cube" from the gate focuses the inline form rather than no-opping against a modal
  that isn't in the DOM.

## Round 10 — sign-in form on the gate

The bounce to `/account.html?next=` was a second page for a two-field form. The gate now
mounts the shared `engine/sign-in-form.js` helper (email / password, plus name on sign-up)
and stays on `/packing-cubes/` after `loginViaApi` + `storeAuthToken`. Nav "Log in" focuses
the form; a small "Manage account" link still goes to `/account.html` for deletion. The same
card is used on the standalone builder and cube pages when signed out.

## Round 11 — empty cubes as filing targets

A cube is a named group, not a pre-filled checklist. Creating one no longer
requires two items: the builder saves on a name alone, `validateCube` accepts
`items: []`, and a newly created cube attaches to the current list (empty ones
open Organize + By cube) so existing rows can be filed into it. Unsorted →
"Save as cube" works from a single leftover item. Add-ons still need at least
one item if you add one.

## Round 12 — add-on cubes in Organize, and include-by-default on new trips

Two product gaps after add-ons shipped as chips-only:

- **Organize picker lists add-ons as cubes.** Filing a row is no longer limited
  to the parent cube: the dropdown shows every add-on as `Toiletries - Beauty
  Basics` (attached cubes first, then the rest of My cubes). Picking one tags
  the item with that cube + add-on, attaches the parent if needed without
  re-importing its bundle, and records the add-on as enabled for the trip.
  The By-cube view splits those rows into their own group with the same title;
  Organize also keeps empty add-on groups visible as filing targets.
- **Include by default for any new trips.** A pin on the cube card (and on each
  add-on in the expanded card) plus a builder checkbox persist
  `includeByDefault` — a boolean column on `pc_cubes`, and a flag on each
  add-on object. `newSuitcase(name, cubes)` attaches those cubes and enables
  those add-ons. Opt-in per cube, not a shared catalog of "standard" cubes.
- **My Cubes shows what you filed.** The expanded card was reading the cube's
  saved template (`cube.items`), so an empty cube you then filled from Organize
  still said "Empty". It now lists the items on this packing list that live in
  that cube (and its add-ons). Filing also copies new labels onto the cube so
  Edit / the next trip keep them.

## Round 13 — plan only: beta views (Plan by day + Outfits) · 27 Aug 2026

Product + engineering spec: [`BETA-VIEWS.md`](./BETA-VIEWS.md). **Not built.**
Karan asked for two extra packing views as beta. Locked defaults (implement
these if he does not answer the open questions):

- **List stays the source of truth.** Days and outfits are groupings. Login
  required; no guest mode; no catalog cubes; outfits are **not** My Cubes.
- **Beta:** per-user `prefs.betaViews` (off). A **Beta** badge on the existing
  List / By cube switcher reveals **By day** and **Outfits**. Extra tabs, not
  a rewrite. Data is kept if beta is turned off.
- **Plan by day:** numbered Day 1…N with stable ids. Optional `startDate` /
  `endDate` are labels only. Items have `dayIds[]` (rewear = several days).
  Unassigned items stay on the main list. Stay on suitcase `v: 2`;
  `normalizeSuitcase` fills the new fields.
- **Outfits:** `{ id, name, event?, dayId?, itemIds[] }` on the trip record.
  Search past outfits across `state.suitcases`; copy grouping + optionally
  add missing labels to this list; never create a cube. Names only (no
  photo). An item may sit on two outfits the same day.

Open questions (numbered vs calendar-first days, outfit exclusivity, photos,
beta control placement) are recorded in that file and do not block v1.
