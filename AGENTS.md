# AGENTS.md

## Cursor Cloud specific instructions

### Service: Vercel static site + serverless API

This repo is a no-build Vercel site (see `README.md` for structure/deploy). Non-obvious notes for running and testing locally:

- Dependencies install with `npm install` (there are no `npm` scripts). `node_modules/` is the only install output.
- The fully standard dev command is `vercel dev`, but it requires an interactive Vercel login and Neon secrets (`DATABASE_URL`, `NEON_AUTH_BASE_URL`) for the `api/*` serverless functions. Those secrets are not present by default.
- For local UI work without Vercel or secrets, serve the repo root as static files, e.g. `python3 -m http.server 8080`. All client-side pages work this way — notably the JSON-driven `sporcle-spinoff/` trivia platform (catalog + player) at `http://127.0.0.1:8080/sporcle-spinoff/`, and the Plot Points shell at `http://127.0.0.1:8080/plot-points/`. The `api/*` routes do NOT run under a plain static server; Plot Points live queries need `TMDB_API_KEY` (and optionally `DATABASE_URL` for result caching) via `vercel dev` or deployed env.
- TMDB access is shared: `lib/tmdb.js` is used by both A-Lister (`api/alist.js`) and Plot Points (`api/plot-points.js`). Same `TMDB_API_KEY`, same `alist_movie_cache` table (Plot Points reads/writes `raw.cast_members` for cast-with-ids; A-Lister keeps using `raw.cast` name arrays). Cache rows carry `raw.pp_v`; bump `PP_SCHEMA` in `lib/tmdb.js` when adding fields Plot Points needs so stale rows are refetched instead of silently returning zeros.
- `plot-points/query-engine.js` is imported by BOTH `api/plot-points.js` and the browser (`plot-points/app.js`), so the builder controls and the server engine share one field catalog. Keep it dependency-free ESM — no `node:` imports, no npm packages — or the browser build breaks. It deliberately lives under `plot-points/` rather than `lib/`: `middleware.js` 404s everything under `/lib/`, so a browser-imported module there is unreachable in production (this once took the whole page down). `node scripts/test-public-imports.mjs` guards against reintroducing that.
- `fortune-500/statement.js` is the one source of statement orientation (years as columns, line items as rows) for the filed pane, the practice model, and the compare scale block. Keep it import-free: `fortune-500/catalog.js` imports `STATEMENT_KEYS` from it, so an import back into `catalog.js` would be a cycle. It deliberately has no projected cells for cash or long-term debt — the sliders model an income statement, not a balance sheet.
- Fortune 500 headline payloads carry the prior filed year as a slim value map (`priorMetrics`) so a statement has a FY-1 column. Two version numbers guard stale data: `SNAPSHOT_SCHEMA` in `scripts/pull-fortune500-headlines.mjs` (refetches every filer when bumped) and `PAYLOAD_SCHEMA` in `api/fortune-500.js` (invalidates the Neon `f500_headline_cache` rows). Bump both when the payload gains a field the UI reads, or old rows quietly render as dashes.
- Vercel's Hobby plan allows at most 12 serverless functions per deployment; this repo currently uses 8. Prefer adding a `?route=` branch to an existing handler plus a rewrite in `vercel.json` before creating a new `api/*.js` file. (This is why all Plot Points endpoints live in `api/plot-points.js`.)
- Auth is Neon Auth only (`account.html` → JWT → `/api/*`). The old `SITE_PASSWORD` / `/private/` cookie gate was retired.
- Tests (all pure functions, no deps/secrets; there is no `npm test` wrapper):
  - `node scripts/test-billing.mjs` — A-List billing (`lib/a-list-billing.js`)
  - `node scripts/test-tmdb.mjs` — shared TMDB helpers (`lib/tmdb.js`)
  - `node scripts/test-plot-points.mjs` — legacy Plot Points presets (`lib/plot-points.js`)
  - `node scripts/test-plot-points-query.mjs` — Plot Points query engine (`plot-points/query-engine.js`)
 - `node scripts/test-fortune500-extract.mjs` — Fortune 500 headline extract (`fortune-500/extract.js`)
 - `node scripts/test-fortune500-insights.mjs` — Fortune 500 compare insights (`fortune-500/insights.js`)
 - `node scripts/test-fortune500-model.mjs` — Fortune 500 practice model + playbooks (`fortune-500/model.js`)
 - `node scripts/test-fortune500-statement.mjs` — Fortune 500 statement view model (`fortune-500/statement.js`)
 - `node scripts/test-fortune500-prices.mjs` — Fortune 500 Yahoo price proxy (`api/fortune-500.js` `?route=prices`)
 - `node scripts/test-financial-modeler-engine.mjs` — Financial Modeler engine (`financial-modeler/engine.js`)
 - `node scripts/test-financial-modeler-workbook.mjs` — Financial Modeler Excel download (`financial-modeler/workbook.js`)
 - `node scripts/test-financial-modeler-exercise-workbooks.mjs` — unit/capital/strategic/market workbook Assumptions must match dials
 - `node scripts/test-financial-modeler-unit-econ.mjs` — Financial Modeler unit-econ exercise (`financial-modeler/unit-econ.js`)
 - `node scripts/test-financial-modeler-extras.mjs` — Financial Modeler extra filers (`financial-modeler/extras.json`, CIKs from `company_tickers.json`)
 - `node scripts/test-financial-modeler-mobile.mjs` — Financial Modeler phone walkthrough (`financial-modeler/mobile.js`)
  - `node scripts/test-public-imports.mjs` — no browser-loaded file imports server-only `/lib/` code
  - `node scripts/test-alist-watchlist-sort.mjs` — Coming Soon watchlist ordering
  - `node scripts/test-alist-showing.mjs` — watched-together / showing-invite match rules
  - `node scripts/test-ai-buildout.mjs` — AI buildout extractor, iceberg math, 424B/8-K watch list
  - `node scripts/test-world-in-nyc.mjs` — World in NYC enclave catalog + election-district join
- `sporcle-spinoff/quizzes/index.json` and `packing-cubes` indexes are generated by the `scripts/build-*-index.mjs` scripts via GitHub Actions; the generated indexes are committed, so the catalog works without running those scripts.
- `world-in-nyc/data/ed.geojson` and overlay GeoJSON are generated by `node scripts/build-world-in-nyc.mjs` (DCP ArcGIS election districts + political overlays) and committed. Keep `world-in-nyc/app.js` dependency-free ESM. Do not put it under `/lib/`.
- `ai-buildout/` is a static page plus a committed EDGAR snapshot for seven issuers. Keep `ai-buildout/extract.js` dependency-free ESM (it is imported by the browser). Do not fold its lease/debt-proceeds tags into the Fortune 500 473-company snapshot. Refresh with `node scripts/pull-ai-buildout.mjs`; bump `SNAPSHOT_SCHEMA` in `ai-buildout/catalog.js` when the slim payload gains a field.
