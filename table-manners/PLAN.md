# Table Manners — product plan

Status: **planning locked for slice 1** — no grid editor or API yet  
Site: `/table-manners/` on [inaayat.xyz](https://inaayat.xyz) (this repo)  
Auth: Neon Auth + Postgres (same pattern as A-Lister / Packing Cubes)

This is a **fresh start**, not a Databaser feature. Databaser stays where it is
until Table Manners is good enough to take the homepage slot. Do not port
Databaser’s Design-tab model.

---

## One sentence

A grid you already think in, plus prettier views of the same sheet so structured
data is easier to see, grab in chunks, and **export as a fresh Excel file** —
without people fingering copies and breaking the relationships.

---

## Locked decisions

| Decision | Call |
|----------|------|
| Name | **Table Manners** (`/table-manners/`) |
| Who it’s for | People who think in grids (finance / corporate), who still need good UX |
| Start screen | Spreadsheet |
| Daily motion | Flip **spreadsheet ↔ pretty view** in the same sitting, often |
| First data shape | **One sheet** (no workbook tabs) |
| Pretty views | Multiple named views, all sourced from the mapping the sheet creates |
| Job | Structure data, then make it easy to **visualize** or **obtain in chunks** |
| Excel | A **generated artifact**, not a second source of truth. Website views decide which tabs/columns appear. Each download is a **fresh file**. |
| External data | **Future:** connectors that pull into the sheet (demo APIs that stand in for Jira / SharePoint). |
| vs Databaser | **Replacement.** New codebase in this repo. Schema grows in the grid, not a Design tab. |
| Auth | Signed-in persistence from day one |
| Multi-sheet / tabs (in the web app) | Later |
| Maps between tables | Later (parked) |
| Sharing / collab | Later |

---

## What “mapping” means (v0)

With **one sheet**, mapping is **not** a second table or an ER diagram.

The sheet has columns and rows. A **mapping** is how those fields (and
eventually link fields) are arranged into a view: which columns show up, in
what order, grouped into chunks a human can scan.

```
  Spreadsheet                         Views (web + Excel tabs)
  ───────────                         ────────────────────────
  one grid of columns × rows    →     default pretty view
                                      + user-made views
                                      (same data, different chunks)
                                      + later: one xlsx sheet per view
```

Later, when there are multiple sheets, a mapping can also mean “this column
points at that sheet.” That is **not** slice 1.

---

## The Excel problem this is solving

In Excel, “another tab that’s the same data with fewer columns” is usually a
copy, a `FILTER`, or a pivot that someone then **fingers**. Updates in one
place don’t reliably show up in the other; relationships rot.

Table Manners keeps **one living sheet** on the site. Views are projections
(column subsets, maybe row filters). Export runs a generator (same idea as
`financial-modeler/workbook.js`: browser OOXML, no extra serverless function)
and writes a **new** `.xlsx` every time.

| Lives on the website | Lives in the download |
|----------------------|------------------------|
| Source of truth      | Disposable snapshot    |
| Edits, views, pulls  | Tabs that match views  |
| Relationships        | Values (and later, formulas we emit — not ones users invent in the file) |

People can still mangle the downloaded file. That does not matter. The next
export is clean. **Do not round-trip edits from Excel back into the app** in
early slices.

**Export settings (future, once views exist):** which views become tabs, tab
names, which columns on each tab. Changing that on the website changes the
next file, not a stale workbook sitting on disk.

---

## External pulls (future — mimic corporate intake)

Corporate work is rarely “type into one grid.” It is “pull from Jira, dump
from SharePoint, paste from three CSVs, hope VLOOKUPs survive.”

Table Manners should grow **connectors**: a source → rows/columns merged or
linked into the living sheet. Real Jira / SharePoint are **not** slice 1
(auth hell, not free). For a site that already talks to public APIs, **stand-in
sources** are enough to practice the UX:

| Stand-in (this ecosystem) | Stands in for |
|---------------------------|---------------|
| A-Lister (signed-in watches / watchlist) | “My team’s system of record” |
| Plot Points / TMDB | A public inquiry API |
| Fortune 500 headlines / EDGAR | A regulated filing dump |
| Packing Cubes catalog or suitcase | A small internal list |
| A tiny “loopy” demo table (fixture JSON or a toy endpoint) | A fake second database you can pull without credentials |

Each connector should be: pick source → map fields onto this sheet’s columns →
refresh writes rows. Manual edits on those rows need a rule later (lock
pulled cells vs allow override). **Do not invent that rule in slice 1.**

Hobby-plan reminder: prefer a `?route=` on `api/table-manners.js` over new
function files if a pull needs a server. Browser-callable public APIs can stay
client-side where the key already exists (TMDB is server-side today).

---

## Audience & UX

The grid is the native language — same as Excel in a finance seat. The product
fails if the pretty view is a toy that fights the grid, or if the grid is an
ugly afterthought.

- Spreadsheet stays a **real editor** (add rows, edit cells, add columns).
- Pretty view stays a **real editor** too (same records, friendlier chunks).
- Switching must not feel like export / import. Same backend document.
- Excel download is **output**, not a third editor.

Visual tone: closer to Packing Cubes (cozy utility) than Dumpster, but not
cutesy-for-its-own-sake. Corporate people have to trust it. The name is the
cute part.

---

## Build in slices

### Slice 1 — signed-in one sheet (smallest real product)
- Public landing: name + one sentence + sign-in CTA
  (`/account.html?next=/table-manners/`).
- Signed-in: **one sheet**, spreadsheet first.
- Persist the sheet (columns + rows) in Neon as JSONB on `users.id`.
- Refresh / new browser still has the data.
- No second sheet, no custom views, no Excel, no connectors yet.
- One new API router (`api/table-manners.js` + rewrites). Do not burn extra
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
- These views are the contract for Excel tabs in the next slice.

### Slice 4 — Excel export (fresh file, tabs = views)
- Download `.xlsx` generated from the living sheet + view list.
- Default: one workbook tab per view (or a chosen subset), columns as the
  view specifies. Full sheet can be tab one.
- Reuse the no-build OOXML approach in `financial-modeler/workbook.js`
  (browser-side zip, no new serverless function unless a test needs Node).
- No import-from-Excel in this slice.

### Slice 5 — more than one sheet (in the web app)
- Workbook tabs in the product. Link columns (“this points at that sheet”).
- Pretty views can follow a link and show related records.

### Slice 6 — maps between tables
- Schema graph. Parked until slice 5 exists.

### Slice 7 — connectors (pull from elsewhere)
- Adapter: source → field map → write/refresh rows.
- Ship 1–2 stand-ins first (A-Lister + a public inquiry source, plus a
  fixture “loopy” table if we want a credential-free second DB).
- Document them as **practice for Jira / SharePoint**, not as those products.

**Out until much later:** Excel as an editor that syncs back, formulas as the
product, real-time collab, sharing a sheet with another account, actual Jira /
Microsoft Graph.

---

## Persistence (site conventions)

| Concern | Approach |
|---------|----------|
| Sign up / in | `/account.html?next=/table-manners/` |
| API | `getAuth(req)` + `Authorization: Bearer` |
| Schema | `ensureSchema()` tables keyed on `users.id` |
| Account delete | `/api/me` DELETE wipes `table_manners_*` rows |
| Hobby functions | One `api/table-manners.js` router + `vercel.json` rewrites |

**Storage:** one JSONB document per user sheet for slice 1 (columns, rows,
later view defs, later connector bindings). User-defined columns should not
`ALTER` Postgres. Normalize only if the blob hurts.

Sketch:

```json
{
  "title": "Untitled",
  "columns": [{ "id": "c1", "name": "Name", "type": "text" }],
  "rows": [{ "id": "r1", "c1": "Acme" }],
  "views": [],
  "export": { "tabs": [] },
  "connectors": []
}
```

`views` / `export` / `connectors` stay empty until their slices.

---

## Information architecture (when building)

```
/table-manners/
├── PLAN.md              ← this file
├── index.html           ← landing + app shell
├── icon.svg
└── engine/
    ├── store.js         ← load/save via API
    ├── grid.js          ← spreadsheet
    ├── views.js         ← pretty view(s); stub until slice 2
    ├── workbook.js      ← xlsx generator; slice 4
    └── connectors.js    ← pulls; slice 7
```

Browser modules stay under `/table-manners/`. Do not import `/lib/` from the
browser (`middleware.js` 404s it; `node scripts/test-public-imports.mjs`
guards this).

---

## Success criteria — slice 1

- [ ] Signed-in user gets a persisted **one-sheet** grid after refresh.
- [ ] Signed-out user cannot read or write that sheet.
- [ ] `/api/me` DELETE removes Table Manners rows.
- [ ] Still within the 12-function Hobby cap (one new router).
- [ ] `node scripts/test-public-imports.mjs` still passes.

Later slices have their own bars: toggle pretty view; named views; **xlsx
tabs match views and regenerate cleanly**; extra sheets; connectors refresh
without becoming a second source of truth.

---

## Still open (do not block slice 1)

- First **demo contents** (empty sheet vs a small finance-ish example).
- Pretty-view layout in slice 2: card-per-row vs grouped field chunks.
- Many workbooks per account vs one sheet per account (slice 1 can be **one
  document per user**; list-of-sheets can wait).
- Whether Databaser’s homepage card is retired when slice 2 ships, or later.
- Connector lock vs override when a refresh would clobber a typed cell.
- Exact stand-in list for slice 7 (A-Lister is in; “loopy” fixture TBD).

---

## Next implementation step

Landing stub (`index.html`) and a **planned** Projects-panel row are in.
Homepage tessellation tile can wait until slice 1 is usable.

Then:

1. `ensureSchema()` + `api/table-manners.js` + grid editor.
2. Stop. Do not build views, Excel, connectors, or a second sheet in the same pass.
