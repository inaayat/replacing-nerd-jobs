# Loom — product sketch (working title)

Status: **planning only** — no code yet  
Site target: `/loom/` on [inaayat.xyz](https://inaayat.xyz) (Replacing Nerd Jobs repo)

> **Name:** *Loom* is the leading candidate. Alternatives considered at the bottom
> of this file. Rename the folder and URLs when the name sticks.

---

## One sentence

A spreadsheet you already know how to use, plus a relationship map you can
actually navigate — same data, two views, click either way.

---

## Problem

| Tool | Good at | Bad at |
|------|---------|--------|
| Spreadsheet | entering data, sorting, quick edits | seeing how rows connect across tables |
| ER diagram / whiteboard | explaining structure | staying tied to live data |
| Airtable / Notion linked records | relations in theory | graph views that feel bolted on; not “just a table” |

Most people start with a grid. They add a `project_id` column, a lookup, a
VLOOKUP — and the *relationships* are there, but invisible until you hold the
whole model in your head.

**Goal:** keep the grid as the editor. Generate a map from declared links.
Use the map to explore; use the grid to change truth.

---

## How this differs from Databaser

[Databaser](https://databaser.inaayat.xyz/) (`inaayat/dynamic-database-builder`)
is **schema-first**: design entities and relationships, then fill records.

**Loom is spreadsheet-first:** paste or type into a familiar table, mark which
columns point at which other columns, and *derive* the map. No separate “design
mode” before you have data.

Both can coexist. Databaser is “configure instead of recode.” Loom is “I already
have a sheet — show me the wiring.”

---

## Core jobs (v0)

1. **Edit** — add rows and cells in a normal-looking table (one or more sheets
   in a workbook).
2. **Declare links** — pick a column and say “values in here refer to
   `[Other sheet].[id column]`” (foreign-key semantics, not full SQL).
3. **See the map** — auto-draw nodes (rows or tables — TBD) and edges (links);
   pan/zoom; click a node → scroll/highlight the row in the table.
4. **Navigate** — from a row, “show neighbors” (one hop out) without losing
   place in the grid.

---

## v0 scope (bare bones)

**In:**

- Single-user, browser-only persistence (`localStorage` or IndexedDB — pick at
  build time; match other static-first projects on the site).
- Workbook with named sheets; each sheet = one table (header row + data rows).
- Minimal grid: edit cell, add/delete row, rename sheet.
- Link editor: column → `(target sheet, target column)`; optional display
  column on the target (e.g. show `name` instead of raw `id`).
- Map panel (split view or tab): force-directed or layered layout — pretty
  doesn’t matter for v0; *clickable* matters.
- Table ↔ map selection sync.

**Out (explicitly later):**

- Formulas, pivot tables, formatting, merge cells.
- XLSX / CSV import-export (nice early follow-up, not day one).
- Neon Auth, sharing, multi-user.
- Reverse-engineering links from formulas or guessing types.
- Replacing Excel for calculation-heavy work.

---

## Information architecture (draft)

```
/loom/
├── PLAN.md              ← move or copy from docs/loom-plan.md when building
├── index.html           ← workbook shell: grid + map
├── icon.svg
└── engine/
    ├── store.js         ← workbook JSON in local storage
    ├── grid.js          ← table editor
    ├── links.js         ← link declarations + validation
    └── map.js           ← graph layout + hit testing
```

No `api/*` route in v0 (stays within the 12-function Hobby cap; no server
needed).

---

## Data model (sketch)

```json
{
  "sheets": [
    {
      "id": "projects",
      "name": "Projects",
      "columns": ["id", "name", "owner_id"],
      "rows": [
        ["p1", "Website redesign", "u2"]
      ]
    }
  ],
  "links": [
    {
      "from": { "sheet": "projects", "column": "owner_id" },
      "to": { "sheet": "people", "column": "id" },
      "display": { "sheet": "people", "column": "name" }
    }
  ]
}
```

Open question: map nodes = **rows** (detailed, noisy) vs **sheets** (clean,
less useful) vs **both zoom levels**. v0 bias: **row nodes within the active
sheet**, with optional “sheet overview” mode.

---

## UX sketch

```
┌─────────────────────────────┬─────────────────────────────┐
│  Projects (sheet)           │  Map                        │
│  id │ name      │ owner_id │       [u2 Alice]            │
│  p1 │ Redesign  │ u2       │          │                    │
│  p2 │ API       │ u1       │    [p1]──┘  [p2]──[u1 Bob]  │
│                             │                             │
│  [+ row]  [Links…]          │  click node → row selected  │
└─────────────────────────────┴─────────────────────────────┘
```

First viewport: one headline (“Table in. Map out.” or similar), one CTA
(New workbook / Open demo), then the split view. No account gate.

---

## Success criteria for v0

- [ ] Create two linked sheets (e.g. people + projects) entirely in the UI.
- [ ] Map updates when a link column value changes.
- [ ] Click `p1` on the map → `Projects` row 1 selected in the grid.
- [ ] Refresh the page → same workbook loads from local storage.
- [ ] `node scripts/test-public-imports.mjs` still passes (no `/lib/` imports
  from browser code).

---

## Open questions (need a product call)

1. **Final name** — see candidates below.
2. **Repo placement** — live in this repo under `/loom/`, or separate repo +
   subdomain like Databaser / One More Column?
3. **Row vs sheet nodes** on the map for v0.
4. **Demo workbook** shipped in git (e.g. CRM-ish: people, companies, deals)
   vs empty start only.

---

## Name candidates

| Name | Vibe | Pros | Cons |
|------|------|------|------|
| **Loom** | craft / weave | Short; grid → woven map; easy URL `/loom/` | Common word; check trademark/app stores |
| **Joinery** | craft / SQL JOIN | Fits “replacing nerd jobs”; implies connected structure | Less obvious to non-devs |
| **Crosswalk** | navigation | Table ↔ map crossing; NYC-ish | Sounds municipal |
| **Throughline** | editorial | “The relationships are the throughline” | Long; abstract |
| **Threadline** | narrative | Follow a row’s threads | Near miss on Thread (Meta) |

**Recommendation:** **Loom** for the product; subtitle on the landing card:
*“Spreadsheet in, relationship map out.”*

---

## Next step when building

1. Copy this file to `loom/PLAN.md`.
2. Add a stub `loom/index.html` (landing + “not built yet” or straight to v0).
3. Add a **planned** row to the homepage Projects panel (`index.html`).
4. Implement `engine/store.js` + read-only map from a committed demo JSON before
   editable grid (proves the loop cheaply).
