# Air Table — product plan

Status: **planning locked for slice 1** — no app UI or API yet  
Site: `/air-table/` on [inaayat.xyz](https://inaayat.xyz) (this repo)  
Auth: Neon Auth + Postgres (same pattern as A-Lister / Packing Cubes)

This is a **fresh start**, not a Databaser feature. Databaser stays where it is
until Air Table is good enough to take the homepage slot. Do not port
Databaser’s Design-tab model.

---

## One sentence

A grid you already think in, plus prettier views of the same sheet so structured
data is easier to see and grab in chunks.

---

## Locked decisions

| Decision | Call |
|----------|------|
| Name | **Air Table** (`/air-table/`) |
| Who it’s for | People who think in grids (finance / corporate), who still need good UX |
| Start screen | Spreadsheet |
| Daily motion | Flip **spreadsheet ↔ pretty view** in the same sitting, often |
| First data shape | **One sheet** (no workbook tabs) |
| Pretty views | Multiple named views, all sourced from the mapping the sheet creates |
| Job | Structure data, then make it easy to **visualize** or **obtain in chunks** |
| vs Databaser | **Replacement.** New codebase in this repo. Schema grows in the grid, not a Design tab. |
| vs Airtable (the company) | Spiritual cousin (grid + views). Different product, this site. See naming note. |
| Auth | Signed-in persistence from day one |
| Multi-sheet / tabs | Later |
| Maps between tables | Later (parked) |
| Sharing / collab | Later |

**Naming note:** [Airtable](https://airtable.com) is an existing product. The
name here is intentional (grid people, pretty views). Keep the space in the
display name (**Air Table**) and the hyphen in the URL (`/air-table/`) so it
isn’t pretending to be that company. Revisit if it ever leaves this personal
site.

---

## What “mapping” means (v0)

With **one sheet**, mapping is **not** a second table or an ER diagram.

The sheet has columns and rows. A **mapping** is how those fields (and
eventually link fields) are arranged into a view: which columns show up, in
what order, grouped into chunks a human can scan.

```
  Spreadsheet                         Views
  ───────────                         ─────
  one grid of columns × rows    →     default pretty view
                                      + user-made views
                                      (same data, different chunks)
```

Later, when there are multiple sheets, a mapping can also mean “this column
points at that sheet.” That is **not** slice 1.

---

## Audience & UX

The grid is the native language — same as Excel in a finance seat. The product
fails if the pretty view is a toy that fights the grid, or if the grid is a
ugly afterthought.

- Spreadsheet stays a **real editor** (add rows, edit cells, add columns).
- Pretty view stays a **real editor** too (same records, friendlier chunks).
- Switching must not feel like export / import. Same backend document.

Visual tone: closer to Packing Cubes (cozy utility) than Dumpster, but not
cutesy-for-its-own-sake. Corporate people have to trust it.

---

## Build in slices

### Slice 1 — signed-in one sheet (smallest real product)
- Public landing: name + one sentence + sign-in CTA
  (`/account.html?next=/air-table/`).
- Signed-in: **one sheet**, spreadsheet first.
- Persist the sheet (columns + rows) in Neon as JSONB on `users.id`.
- Refresh / new browser still has the data.
- No second sheet, no custom views, no link columns yet.
- One new API router (`api/air-table.js` + rewrites). Do not burn extra
  Hobby function slots.

### Slice 2 — one pretty view + toggle
- Flip spreadsheet ↔ pretty view without losing place.
- Pretty view shows the **same rows in chunks** (record cards or grouped
  field sections — pick at implementation; default: one card per row, fields
  in sheet order).
- Edits in either face write the same store.

### Slice 3 — multiple views from the mapping
- User can save additional views: which fields, order, maybe grouping.
- All views read the same sheet. Deleting a column in the grid updates every
  view (drop missing fields; don’t ghost them).

### Slice 4 — more than one sheet
- Workbook tabs. Link columns (“this points at that sheet”).
- Pretty views can follow a link and show related records.

### Slice 5 — maps between tables
- Schema graph. Parked until slice 4 exists.

**Out until much later:** formulas, Excel import as the product, real-time
collab, sharing a sheet with another account.

---

## Persistence (site conventions)

| Concern | Approach |
|---------|----------|
| Sign up / in | `/account.html?next=/air-table/` |
| API | `getAuth(req)` + `Authorization: Bearer` |
| Schema | `ensureSchema()` tables keyed on `users.id` |
| Account delete | `/api/me` DELETE wipes `air_table_*` rows |
| Hobby functions | One `api/air-table.js` router + `vercel.json` rewrites |

**Storage:** one JSONB document per user sheet for slice 1 (columns, rows,
later view defs). User-defined columns should not `ALTER` Postgres. Normalize
only if the blob hurts.

Sketch:

```json
{
  "title": "Untitled",
  "columns": [{ "id": "c1", "name": "Name", "type": "text" }],
  "rows": [{ "id": "r1", "c1": "Acme" }],
  "views": []
}
```

`views` stays empty until slice 3.

---

## Information architecture (when building)

```
/air-table/
├── PLAN.md              ← this file
├── index.html           ← landing + app shell
├── icon.svg
└── engine/
    ├── store.js         ← load/save via API
    ├── grid.js          ← spreadsheet
    └── views.js         ← pretty view(s); stub until slice 2
```

Browser modules stay under `/air-table/`. Do not import `/lib/` from the
browser (`middleware.js` 404s it; `node scripts/test-public-imports.mjs`
guards this).

---

## Success criteria — slice 1

- [ ] Signed-in user gets a persisted **one-sheet** grid after refresh.
- [ ] Signed-out user cannot read or write that sheet.
- [ ] `/api/me` DELETE removes Air Table rows.
- [ ] Still within the 12-function Hobby cap (one new router).
- [ ] `node scripts/test-public-imports.mjs` still passes.

Slice 2+: toggle pretty view; then named views; then extra sheets.

---

## Still open (do not block slice 1)

- First **demo contents** (empty sheet vs a small finance-ish example).
- Pretty-view layout in slice 2: card-per-row vs grouped field chunks.
- Many workbooks per account vs one sheet per account (slice 1 can be **one
  document per user**; list-of-sheets can wait).
- Whether Databaser’s homepage card is retired when slice 2 ships, or later.

---

## Next implementation step

Landing stub (`index.html`) and a **planned** Projects-panel row are in.
Homepage tessellation tile can wait until slice 1 is usable.

Then:

1. `ensureSchema()` + `api/air-table.js` + grid editor.
2. Stop. Do not build views or a second sheet in the same pass.
