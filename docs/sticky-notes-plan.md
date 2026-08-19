# Sticky Notes — product plan

Status: **v0 shipped (localStorage cork board), v1 being designed**
Site: `/sticky-notes/` on [inaayat.xyz](https://inaayat.xyz) (this repo)
Auth: Neon Auth + Postgres (same pattern as A-Lister / Packing Cubes / Table Manners)

v1 is a **rewrite of the board surface**, not a reskin. The v0 cork board with
free-floating draggable notes is being replaced: it made the user do the filing
by hand and fell apart past a dozen notes.

---

## One sentence

A single place to dump anything that does not deserve a task — thoughts, links,
things to remember — that files itself, is tagged and searchable, and can
**collapse from a wall of sticky notes into a structured table** when you need to
find one specific thing instead of browse.

---

## The five jobs

Sticky Notes is deliberately multi-purpose. Every design call has to serve all
five, which is why one view is not enough.

| Job | What it looks like | What it demands |
|-----|--------------------|-----------------|
| **Dump** | "call the dentist", "idea for the site" | Capture in under two seconds, zero required fields |
| **Read it later** | pasted URLs | Recognizable link cards, and a way to see what is unread |
| **Brainstorm** | many fragments on one topic | Grouping, and the ability to see them all at once |
| **Tag** | cutting across all of the above | Tags are first-class, not a color code |
| **Memory** | the restaurant name, the book rec | Search, and a dense view that fits hundreds of rows |

The through-line: notes accumulate and are rarely deleted. Assume **hundreds of
notes**, not dozens, and design the default view for that.

---

## Locked decisions

| Decision | Call |
|----------|------|
| Surface | **Web app** at `/sticky-notes/` |
| Persistence | **Signed-in from day one.** Neon Auth + Postgres, notes follow the user across devices |
| Browser extension | **Deferred.** Revisit after the web app is good. v0 extension stays in the repo, untouched |
| Views | **Two views over one note store**, toggled: the **sticky wall** (visual) and the **collapsed table** (structured) |
| Sticky wall | The signature view. Notes as cards, no overlap, arranged by the app rather than dragged into place |
| Collapsed table | Dense rows with columns for text, tags, source, dates. The view that makes "memory" and "find it" work |
| View is a preference | The toggle persists per user, so whoever prefers the table opens into the table |
| Categorizing | **Two axes, both user-defined: color and icon.** A note carries one of each, independently. Two axes cover "what kind of thing is this" and "what part of my life is this" without a tag-management chore |
| Meaning of the axes | The user names them. The app ships defaults but the labels are the user's, stored per account as a **legend** |
| Search | Full-text across note bodies, available in both views |
| Typography | **No handwriting font.** The v0 `Segoe Print` / `Comic Sans` body was cheugy and informal. Notes use the site's existing type system |
| Free positioning | **Dropped as the default.** The wall arranges notes itself |
| Sharing / collaboration | Later |
| Mobile capture / PWA | Later |

---

## Open questions

Being worked through one at a time with the owner. Nothing below is decided, and
code should not assume an answer.

1. ~~Core job~~ — settled: all five above
2. ~~Main view~~ — settled: sticky wall + collapsed table toggle. Handwriting
   font is out. **Still open:** the wall's own arrangement (dense masonry vs.
   capture-first stream vs. columns), how much of the paper look survives
   (colored cards yes, but rotation and torn edges?), and whether cards are
   uniform size or size themselves to their content
3. **Note anatomy** — partly settled: body text, color, icon, dates. **Still
   open:** separate title or first-line-as-title, link previews for pasted URLs,
   checkbox, pasted images
4. ~~Organizing~~ — settled: two user-defined axes, color and icon. **Still
   open:** whether free-text tags exist *in addition*, and how many slots each
   axis gets
5. **Lifecycle** — do notes ever get done, archived, or expire, or is the pile
   permanent
6. **Capture path** — how a note gets born in the web app, and how fast that has
   to be
7. **Sync conflicts** — what happens when two tabs or two devices edit at once
8. **Ambient presence** — should the app put itself in front of you (new tab,
   digest) or wait to be opened
9. **Mobile** — usable on a phone from day one, or desktop-first
10. **Aesthetic direction** — how closely it should match the rest of the site

---

## Categorizing: two axes, not a tag pile

A note carries **one color** and **one icon**, and the two are independent. That
gives a grid of meanings from two cheap picks at capture time, and both are
glanceable on the wall and sortable as columns in the table.

```
              icon  →   link      idea      remember   errand
  color ↓
  work                  ·         ·         ·          ·
  personal              ·         ·         ·          ·
  house                 ·         ·         ·          ·
```

The app does not decide what the axes mean. It ships defaults, and the user
renames them; the mapping from color/icon to label is a per-account **legend**.
Renaming a color relabels every note already using it, because notes store the
color key, never its label.

Why two axes instead of free-text tags: free tags require the user to remember
what they called something last time, and they rot into near-duplicates. Picking
from a small fixed palette at capture time costs one click and stays consistent.

## Typography

No handwriting. v0 set note bodies in `Segoe Print` / `Bradley Hand` /
`Comic Sans MS`, which read as cheugy and informal against the rest of the site.
Notes use the existing system instead: the site sans for note bodies, `DM Mono`
for the small metadata (dates, source domains), `Fraunces` reserved for page
headings. Colored cards stay — the sticky feeling should come from color, shape,
and density, not from a font pretending to be a pen.

---

## Shape of the build (once the above is settled)

Nothing here is written yet. Recorded so the eventual slices are obvious.

| Piece | Responsibility |
|-------|----------------|
| `api/sticky-notes.js` | One authed handler, `?route=` branches for notes CRUD and search |
| `lib/sticky-notes.js` | Server-only Neon queries. Never imported by the browser |
| `sticky-notes/notes.js` | Shared note model and normalizers, dependency-free ESM, browser-safe |
| `sticky-notes/views.js` | The one source of truth for view state (wall vs. table, active tag, search) shared by both renderers |
| `sticky-notes/engine/auth.js` | Neon Auth wiring over `engine/neon-browser-auth.js` |
| `scripts/test-sticky-notes.mjs` | Pure-function tests for the note model and view state |

Constraints that already apply:

- Vercel Hobby caps a deployment at **12 serverless functions**; the repo uses
  **9** today, so one new `api/sticky-notes.js` fits. Do not add a second.
- `middleware.js` 404s everything under `/lib/`, so any module the browser
  imports must live under `sticky-notes/`, not `lib/`. `node
  scripts/test-public-imports.mjs` enforces this.
- Keep browser-imported modules dependency-free ESM — no `node:` imports, no npm
  packages.

---

## Non-goals for v1

- No extension work (the v0 extension keeps working against its own storage)
- No real-time collaboration
- No second serverless function
- No build step; this stays a no-build site
