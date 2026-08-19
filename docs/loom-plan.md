# Relationship workbook — product sketch (name TBD)

Status: **planning only — waiting on product answers before any UI or API**  
Site target: a signed-in page on [inaayat.xyz](https://inaayat.xyz) (this repo)

> **Loom is retired as the working title.** It was too serious. Cute shortlist
> below. Folder / URL wait until a name sticks.

This file is the living plan. Do not start `index.html` or an `api/` router until
the questions at the bottom are answered.

---

## One sentence (revised)

Set up the shape of your data in a spreadsheet, then live in a prettier
relationship view to actually add and browse records — the real database is
always being built in the background.

---

## What changed from the first sketch

| First sketch | Now |
|--------------|-----|
| Grid is where you enter truth; map is for navigation | Grid is how you **declare schema** (and maybe bulk-edit). The **pretty mapping view** is how you add and browse data. |
| Node-link graph of rows as v0 | **Table-to-table maps** (ER-style / “maps between tops”) are a **later** stage. |
| Anonymous `localStorage` | **Neon Auth + Postgres** from the start. |
| “Spreadsheet plus a graph” | “Spreadsheet plus a friendlier linked-record surface,” then **custom views**. |

---

## Mental model

Three layers, one workbook:

```
  Spreadsheet view          Pretty mapping view         Backend (always on)
  ──────────────            ───────────────────         ──────────────────
  sheets, columns,          friendly cards / forms /    schema + rows in
  types, “this column       linked-record pickers       Neon, keyed to the
  points at that sheet”     for entering data           signed-in user
         │                           │                         ▲
         └──────── same workbook ────┴─────────────────────────┘
```

**Spreadsheet** = the nerd control panel: create tables, name columns, mark
which columns are links, maybe dump rows in bulk.

**Pretty mapping** = the daily driver: pick a record, see what it connects to
by *name* (not raw ids), add a related record without hunting across sheets.

**Backend** = not a separate product. Every column you add, every link you
declare, every row you save is already a real schema + data store. The two
views are just faces of that store.

**Later:** custom views (different layouts of the same mapped fields), then
maps *between tables* (schema graph / “tops”).

This is still **spreadsheet-first**, not Databaser. Databaser is “design
entities in a Design tab.” Here you grow the schema by using a sheet.

---

## How this differs from nearby tools

| | This | Databaser | Airtable / Notion |
|--|------|-----------|-------------------|
| Schema | Grown in a spreadsheet | Visual Design tab | Table settings |
| Daily input | Pretty mapping (goal) | Records in configured views | Grid is still the default |
| Auth | Same Neon Auth as the rest of inaayat.xyz | Separate app | SaaS accounts |
| v0 honesty | One user, their workbooks | Local-first builder | Full product |

---

## Build in slices (do not skip ahead)

### Slice 0 — name + answers
This doc. No code.

### Slice 1 — signed-in empty workbook
- Reuse `/account.html` + existing Neon Auth JWT pattern.
- New multiplexed API file (Hobby cap: 8/12 functions today; do **not** add a
  function per route).
- Persist one JSON workbook document per user (or per workbook — see questions).
- Spreadsheet: sheets, columns, cells. No links yet.
- Sign-in required to use (public landing copy is fine).

### Slice 2 — declare a relationship, see it both ways
- Mark a column as “link to sheet X.”
- Grid still shows the raw value if you want it.
- Pretty mapping view shows the **linked record by display name**, and lets you
  add / pick a related row from there.
- Creating a link in either view writes the same backend row.

### Slice 3 — more than one pretty surface
- User-defined views over the same mapped fields (list vs cards vs a simple
  form — pick in questions).
- Layout flexibility is the point of this slice, not of slice 1.

### Slice 4 — maps between tables
- Schema graph: sheets as nodes, declared links as edges.
- Explicitly **not** slice 1–2. You hadn’t considered this; keep it parked.

**Out until much later:** formulas, Excel parity, guessing links, sharing a
workbook with another account, real-time collab.

---

## Persistence (site conventions)

Match Packing Cubes / A-Lister:

| Concern | Approach |
|---------|----------|
| Sign up / in | `/account.html?next=/<name>/` |
| API | `getAuth(req)` + `Authorization: Bearer` |
| Schema | `ensureSchema()` tables keyed on `users.id` |
| Account delete | `/api/me` DELETE must wipe this app’s rows too |
| Hobby functions | One new `api/<name>.js` router + `vercel.json` rewrites |

**v0 storage recommendation:** one JSONB document per workbook (sheets +
columns + rows + link declarations + view defs), not a generic SQL table per
user sheet. The schema is user-defined; Postgres shouldn’t have to `ALTER` for
each new column. Normalized row tables can wait until the JSON blob hurts.

---

## Cute name shortlist

Loom / Joinery / Crosswalk felt like infrastructure. Aiming for **short,
warm, craft or creature**, easy `/slug/`.

| Name | Why it might stick | Watch-outs |
|------|--------------------|------------|
| **Purl** | Knitting stitch; cute; “purl the rows together”; `/purl/` | Yarn people already know the word |
| **Daisy** | Daisy-chain of related records; very cute | Slightly floral / not “tool” |
| **Cubby** | Cousin energy to Packing Cubes; a cubby per table | Childish? |
| **Nook** | Cozy place you keep connected stuff | Notion-adjacent vibe |
| **Stitch** | Connecting rows; craft | Common product name |
| **Twine** | Ties tables together; still a little cute | Close to “twine” the old IF tool |
| **Charm** | Charm-bracelet of linked records | Fashion-y |
| **Quilt** | Patches (tables) sewn into one object | Softer, longer metaphor |
| **Relish** | Pun on *relations*; food-cute like Dumpster’s irreverence | Joke may age |
| **Beads** | String of related things | Plural; `/bead/` vs `/beads/` |
| **Locket** | Things you keep together | Romantic |
| **Sprout** | Schema grows as you use it | Growth-app cliché |
| **Kin** | Relationships, three letters | Abstract |
| **Clover** | Cute plant; lucky links | Decorative |
| **Pocket** | Pocket database | Collides with “pocket” the read-it-later app |

**Current lean (not a lock):** **Purl** or **Daisy** — both cute, both short,
both about connecting without saying “spreadsheet.”

Subtitle options (pair with whatever name):

- “Sheet the shape. Map the people.”
- “A spreadsheet that grows a friendlier face.”
- “Linked records without the nerd face.”

---

## Brainstorming questions (to think out loud)

These are not gates. Half-answers, rambles, and “I don’t know yet” are useful.
They exist to find the *itch*, not to lock a spec.

### The itch
- What spreadsheet (or Notion / Airtable board) do you currently *hate*
  navigating — the one where you know the data is there but you can’t *see*
  how things connect?
- When that happens, are you usually **adding** something, **looking something
  up**, or **explaining the structure to someone else**?
- If this shipped tomorrow as a personal tool only you used, what would make
  you open it in a week vs abandon it like a clever prototype?

### A scene, not a feature list
- Walk through one fake session in sentences: you sit down, you want X, you
  click Y, you feel Z. What’s X?
- Who is on the other end of a relationship in that scene — a person, a
  company, a recipe, a trip, a film, a dollar amount?
- When you say “pretty,” is that **softer chrome** (rounded cards, names not
  ids) or **spatial** (things laid out so you can wander)?

### Spreadsheet vs pretty view
- Are you someone who *thinks* in grids and wants a prettier face for guests
  (including future-you), or someone who *hates* grids and only uses them
  because that’s how schema gets born?
- Should adding a column in the sheet feel like a power-user move you do
  rarely, or like the normal way the app grows?
- What’s the first moment you’d switch from sheet → pretty view in a sitting?
  What’s the first moment you’d switch back?

### Relationships
- Do you mostly need “this belongs to that” (owner, parent, category) or
  “these two know each other” (friends, co-stars, ingredients that show up
  together)?
- How messy is real life here — one owner, or tags that explode into
  many-to-many immediately?
- Is a relationship a **field on a row** (project.owner) or a **thing you
  might want to name** (“works at,” “starred in,” “packed inside”)?

### Cute, specifically
- Cute name only, or cute *UI* (stickers, dogs, packing-cubes warmth)?
- Any names that are *too* cute / too childish for a tool you’ll put real
  life into?
- If the homepage card sat next to Packing Cubes and Dumpster, should this
  feel closer to Cubes (cozy utility) or Dumpster (irreverent capture)?

### Scope honesty
- Is Databaser the “serious” sibling and this the “I just want to type”? Or
  are they competing in your head?
- What’s the smallest thing that would still feel like *the idea* — not a
  generic CRUD app with a nicer font?
- What should this *refuse* to be (Excel, Airtable, a graph database, a
  whiteboard)?

### Persistence / private
- Is this diary-private (only you), or “I might show a friend the pretty
  view someday”?
- Any data you’d *never* want in this (money, health, other people’s
  emails) that should stay out of the first demo?

---

## Questions before building (please answer)

Grouped so you can reply in a list. Defaults in *italics* if you skip an item.

### Name
1. Which name from the shortlist, or something else entirely?

### What “pretty mapping” means in slice 2
2. When you sit down to *add data*, what should you see?
   - **A.** Record card: open “Alice,” see her projects as chips/cards, add a
     project from Alice.
   - **B.** Friendlier table: still rows, but link columns are pickers that
     show names, not ids.
   - **C.** A small form: one record at a time, dropdowns for links.
   - **D.** Something else (describe a screen).
   - *Default if skipped: A + B as two tabs, C later.*

3. Is the spreadsheet still a valid place to type **data** in slice 1–2, or
   schema-only (headers / types / links) with data entry only in the pretty
   view? *Default: both, grid allowed but not the happy path.*

### First real use (this decides the demo)
4. What would *you* put in the first workbook? Examples: people ↔ events,
   recipes ↔ ingredients, companies ↔ deals, packing-adjacent packing lists.
   A concrete pair of tables is more useful than “flexible.”

### Relationships
5. Slice 2 cardinality: **one-to-many only** (a project has one owner) or
   **many-to-many** too (a project has many people)? *Default: one-to-many,
   many-to-many in slice 3.*
6. Can you **create a new relationship type** from the pretty view, or only by
   adding a link column in the spreadsheet? *Default: spreadsheet declares
   types; pretty view only fills them.*

### Views (slice 3, but pick a direction)
7. After the default pretty mapping, which custom view do you want first:
   gallery/cards, form, board/kanban, or calendar?

### Account + persistence
8. Sign-in wall: **must be signed in to open the app**, or public explainer
   + sign-in to create? *Default: public landing, auth to use.*
9. One workbook per account, or many named workbooks from day one?
   *Default: many, even if the UI is just a list of two.*
10. Sharing with another inaayat.xyz account: later, or never for this
    personal tool? *Default: later / never in v1.*

### Placement
11. Live in **this repo** (`/<name>/` + one API router) so Neon Auth is free,
    vs a separate repo/subdomain like Databaser? *Default: this repo.*

---

## Success criteria for slice 1 (only after answers)

- [ ] Signed-in user gets a persisted workbook after refresh / new browser.
- [ ] Signed-out user cannot read or write that workbook.
- [ ] `/api/me` DELETE removes this app’s rows.
- [ ] Still within the 12-function Hobby cap.
- [ ] `node scripts/test-public-imports.mjs` still passes.

Slice 2+ criteria wait on questions 2–6.

---

## Next step

Reply to the questions. Then: pick the folder name, copy this file to
`<name>/PLAN.md`, stub a landing page, add a **planned** Projects-panel row,
then slice 1 only.
