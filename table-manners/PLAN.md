# Table Manners — product plan

Status: **slices 1–2 in this repo** — signed-in one sheet, card face, Excel download
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
| Excel | **Always available.** A generated artifact, not a second source of truth. Day one: download the current sheet. Later: views become extra tabs you can include or hide. Each download is a **fresh file**. |
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
                                      + xlsx always (one tab at first;
                                        later one tab per chosen view)
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

**Invariant:** there is always an Export to Excel control — empty sheet,
pretty view, extra views, connectors, doesn’t matter. You never wait for a
later slice to get a file out.

**Export settings (once views exist):** which views become tabs, tab names,
which columns on each tab. Changing that on the website changes the next
file, not a stale workbook sitting on disk. Until then, export is the full
sheet as a single tab.

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
| **Loopy** — TMDB (The Movie Database) as a public catalog you can query | “Pull from the company database” (Jira/SharePoint-shaped intake, without those credentials) |
| A-Lister (signed-in watches / watchlist) | “My team’s system of record” (your rows, not the public catalog) |
| Fortune 500 headlines / EDGAR | A regulated filing dump |
| Packing Cubes catalog or suitcase | A small internal list |

Plot Points already speaks TMDB; Loopy here means **using TMDB as a dummy
external database**, not a new movie product. A-Lister is a different
connector even though it also uses TMDB: it pulls *your* log, not search
hits from the catalog.

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
- Excel download is **always there**, and it is **output**, not a third editor.

Visual tone: a dense planning dashboard people would trust at work — not
Dumpster, not Packing Cubes’ travel-gold, not the generic `site.css` archive
look. The name is the cute part; the working surface is not.

| Token | Call |
|--------|------|
| Canvas | Cool off-white (`#f4f5f7`), white sheet well |
| Header | Dark bar, white type, Beep boop wordmark + Table Manners |
| Type | System sans for chrome; tabular figures in cells |
| Radius | ~8–12px on chrome; grid cells stay square |
| Actions | Solid **Export** (violet). Pills for Spreadsheet / Cards |
| Color | Blue = selected. Green = saved. Red = error. No rainbow on the grid |
| Icon | Place setting. Dog stays in the nav wordmark only |

---

## Build in slices

### Slice 1 — signed-in one sheet (smallest real product)
- Public landing: name + one sentence + sign-in CTA
  (`/account.html?next=/table-manners/`).
- Signed-in: **one sheet**, spreadsheet first.
- Persist the sheet (columns + rows) in Neon as JSONB on `users.id`.
- Refresh / new browser still has the data.
- **Export to Excel** from day one: one tab, current columns and rows, fresh
  `.xlsx` via a browser OOXML generator (same approach as
  `financial-modeler/workbook.js`). No extra serverless function.
- No second sheet, no custom views, no connectors yet.
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
- Export still works; until slice 4, the file can stay a single full-sheet tab.

### Slice 4 — richer Excel (tabs you choose)
- Same always-on download; now views can become extra tabs (or a chosen
  subset). Full sheet remains available as a tab.
- User can change, on the website, which tabs the next file contains.
- Still no import-from-Excel.

### Slice 5 — more than one sheet (in the web app)
- Workbook tabs in the product. Link columns (“this points at that sheet”).
- Pretty views can follow a link and show related records.

### Slice 6 — maps between tables
- Schema graph. Parked until slice 5 exists.

### Slice 7 — connectors (pull from elsewhere)
- Adapter: source → field map → write/refresh rows.
- Ship 1–2 stand-ins first: **Loopy (TMDB catalog)** plus A-Lister (your
  watches). Document them as **practice for Jira / SharePoint**, not as those
  products.

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

`views` / extra export tabs / `connectors` stay empty until their slices.
A download with `views` empty is still a valid workbook (one tab).

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
    ├── views.js         ← card face (slice 2)
    ├── workbook.js      ← xlsx generator; ships in slice 1, grows in slice 4
    └── connectors.js    ← pulls; slice 7
```

Browser modules stay under `/table-manners/`. Do not import `/lib/` from the
browser (`middleware.js` 404s it; `node scripts/test-public-imports.mjs`
guards this).

---

## Success criteria — slice 1

- [x] Signed-in user gets a persisted **one-sheet** grid after refresh.
- [x] Signed-out user cannot read or write that sheet.
- [x] `/api/me` DELETE removes Table Manners rows.
- [x] Still within the 12-function Hobby cap (one new router).
- [x] Signed-in user can **always** download a fresh `.xlsx` of the current sheet.
- [x] `node scripts/test-public-imports.mjs` still passes.

## Success criteria — slice 2

- [x] Spreadsheet ↔ Cards toggle without leaving the document.
- [x] Cards show the same rows, one card per row, fields in sheet order.
- [x] Edits in either face write the same store.

Later slices have their own bars: toggle pretty view; named views; **xlsx
tabs can match views** without ever removing the download button; extra
sheets; connectors refresh without becoming a second source of truth.

---

## Still open (do not block slice 1)

- First **demo contents** (empty sheet vs a small finance-ish example).
- Pretty-view layout in slice 2: card-per-row vs grouped field chunks.
- Many workbooks per account vs one sheet per account (slice 1 can be **one
  document per user**; list-of-sheets can wait).
- Whether Databaser’s homepage card is retired when slice 2 ships, or later.
- Connector lock vs override when a refresh would clobber a typed cell.
- Exact stand-in list for slice 7 (**Loopy = TMDB catalog**; A-Lister = your
  watches). Extra sources (EDGAR, Packing Cubes) can wait.

---

## Next implementation step

Slices 1–2 are in. Homepage tessellation tile can still wait.

Then slice 3: named views (field subsets / order). Do not add extra sheets or
connectors in that pass.
