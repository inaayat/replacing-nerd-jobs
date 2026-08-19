# Sticky Notes — product plan

Status: **v0 shipped (localStorage cork board), v1 being designed**
Site: `/sticky-notes/` on [inaayat.xyz](https://inaayat.xyz) (this repo)
Auth: Neon Auth + Postgres (same pattern as A-Lister / Packing Cubes / Table Manners)

v1 is a **rewrite of the board surface**, not a reskin. v0 had one flat pile that
never emptied; v1 splits the app into a small working **board** and a large
searchable **memory**, and the act of moving notes from one to the other is the
whole product.

---

## One sentence

A board you dump onto and think on — drag notes around, cluster the related ones,
then **file that cluster into memory and clear the board** — so the board stays
small enough to be useful while nothing you wrote down is ever lost.

---

## The five jobs

Sticky Notes is deliberately multi-purpose. Every design call has to serve all
five, which is why one view is not enough.

| Job | What it looks like | What it demands |
|-----|--------------------|-----------------|
| **Dump** | "call the dentist", "idea for the site" | Capture in under two seconds, zero required fields |
| **Read it later** | pasted URLs | Recognizable link cards, and a way to see what is unread |
| **Brainstorm** | many fragments on one topic | Move them around, cluster the related ones, see them all at once |
| **Categorize** | cutting across all of the above | Two cheap picks, appliable to a whole selection at once |
| **Memory** | the restaurant name, the book rec | Search, and a dense view that fits hundreds of rows |

The through-line: notes accumulate and are rarely deleted. Assume **hundreds of
notes** in memory. The board, by contrast, should hold a couple dozen at most —
which is what makes free dragging viable there and hopeless as a global filing
system.

---

## Locked decisions

| Decision | Call |
|----------|------|
| Surface | **Web app** at `/sticky-notes/` |
| Persistence | **Signed-in from day one.** Neon Auth + Postgres, notes follow the user across devices |
| Browser extension | **Deferred.** Revisit after the web app is good. v0 extension stays in the repo, untouched |
| Two tiers | **Board** (small, spatial, what you are working on) and **Memory** (everything filed away). Same notes, two states, not two apps |
| Board | Freely draggable notes on a canvas. Position is real and saved. Stays small on purpose — a working surface, not an archive |
| Memory | The **collapsed table**: dense rows with columns for text, color, icon, group, source, dates. Searchable. Where "find that one thing" happens |
| Filing | **Group-select notes on the board, categorize them, send them to memory.** This is the core motion of the app |
| Clear board | Empties the *visualization*, never the data. Cleared notes are in memory and findable. Destroying data needs a separate, explicit delete |
| Free positioning | **Kept, on the board only.** Dragging is how you think and how you group; it is not the filing system for hundreds of notes, because the board never holds hundreds |
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
2. ~~Main view~~ — settled: spatial board + collapsed memory table. Handwriting
   font is out; free dragging is in, on the board. **Still open:** how much of
   the paper look survives (colored cards yes, but rotation?), whether cards are
   uniform or content-sized, and whether the board pans/zooms or is one screen
3. **Note anatomy** — partly settled: body text, color, icon, position, dates.
   **Still open:** separate title or first-line-as-title, link previews for
   pasted URLs, checkbox, pasted images
4. ~~Organizing~~ — settled: two user-defined axes, color and icon, appliable to
   a multi-note selection. **Still open:** fixed-and-renameable vs. fully custom
   sets, and whether a note may have neither
5. **Groups and recall** — the load-bearing open question. Is a group a named
   first-class object? Does filing preserve the cluster's spatial arrangement or
   flatten it to rows? Can notes come back from memory to the board?
6. **Capture path** — how a note gets born, and how fast that has to be
7. **Sync conflicts** — what happens when two tabs or two devices edit at once
8. **Ambient presence** — should the app put itself in front of you (digest,
   resurfacing old notes) or wait to be opened
9. **Mobile** — dragging a canvas on a phone is bad; does mobile get the table
   only?
10. **Aesthetic direction** — how closely it should match the rest of the site

---

## Board and memory

The app has two states for a note, and the interesting design is the transition
between them.

```
   BOARD (spatial, small)                    MEMORY (structured, large)
   ──────────────────────                    ─────────────────────────
   ┌────┐  ┌────┐                            text          color  icon  group
   │    │  │    │   ┌────┐    group-select    ────────────────────────────────
   └────┘  └────┘   │    │    + categorize    thai place    food   ★     dinner
        ┌────┐      └────┘    ──────────►     that podcast  work   link  reading
        │    │  ┌────┐                        dentist       home   !     errands
        └────┘  │    │                        ...
                └────┘
   drag, cluster, think                       search, sort, filter, recall
```

**The motion.** Dump notes onto the board as they occur to you. Shove them around
until related things sit near each other. Rope-select a cluster, apply a color
and icon to the whole selection in one move, and send it to memory. The board is
now emptier and the thought is preserved somewhere you can find it.

**"Clear board" means clear the visualization, not the data.** This is the single
most important behavior to get right, and v0 got it wrong — its clear button
called a destructive delete behind a `confirm()`. In v1, clearing files notes to
memory. Actual destruction is a separate, deliberate action.

**Why the board must stay small.** A board with three hundred notes on it is the
v0 failure mode: overlapping cards, no way to find anything, dragging as a chore.
A board with twenty notes is a desk you can think at. Memory absorbs the rest,
and the table view is built for volume, so neither view has to be good at the
other's job.

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
| `sticky-notes/views.js` | The one source of truth for view state (board vs. memory, active filters, search) and for the board→memory filing rules, shared by both renderers |
| `sticky-notes/legend.js` | Color/icon keys, their default labels, and the per-account overrides |
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
