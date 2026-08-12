# Fortune 500 — EDGAR ingest plan

The explainer page at `/fortune-500/` is live. Headline numbers are a committed
snapshot (`data/headlines-snapshot.json`, pulled 2026-08-12: 470/473 CIKs have
an annual 10-K year). Compare uses the snapshot first; `/api/f500-headlines`
is a live fallback. Refresh with `node scripts/pull-fortune500-headlines.mjs`.

**Goal:** pull structured SEC EDGAR data for the **473 public** Fortune 500
companies, store a queryable snapshot, and (later) show it at
`/fortune-500/`. The **27 private / mutual** companies stay in the catalog as
non-filers; we do not hit EDGAR for them.

This plan adapts the mapping and pull schedule in the uploaded
`fortune500-edgar` packet to this repo: a no-build Vercel static site, Neon
Postgres, GitHub Actions, and a 12-function Hobby cap (currently 7/12).

---

## What's in this folder

| Path | Role |
|------|------|
| `index.html` / `app.js` / `app.css` / `catalog.js` | Static explainer: search 500, open a company, read what EDGAR publishes |
| `PLAN.md` | Ingest + product plan (numbers, daily pull, compare UI still future) |
| `data/fortune500_edgar_mapping.json` | **Primary mapping.** 500 rows: rank, names, tickers, CIK, pre-built EDGAR URLs, match status |
| `data/fortune500_edgar_mapping.csv` | Same mapping as CSV (handy for spreadsheets / one-off scripts) |
| `data/company_tickers.json` | Cached [SEC ticker → CIK](https://www.sec.gov/files/company_tickers.json) snapshot used to build the mapping (10,398 issuers) |
| `data/headlines-snapshot.json` | Slim latest-10-K headlines for 473 public CIKs (generated; do not hand-edit) |

Do **not** commit raw Company Facts payloads or filing documents. Those are
multi-MB per issuer. Extract a slim metric set (below) and persist that.

The ticker dumps go stale. Refresh them from SEC when rematching a new
Fortune list; the committed copies are a snapshot from 2026-08-12.

---

## Scope

| Category | Count | EDGAR pulls? |
|----------|------:|:-------------|
| Public SEC filers (`status: matched`) | **473** | **Yes** |
| Private / mutual (`status: no_ticker`) | **27** | **No** |
| Fortune 500 total | 500 | — |

Unique public CIKs: 473. Mapping ranks 1–500 with no gaps.

### How the mapping was built

1. **458** companies matched Fortune ticker → SEC ticker in `company_tickers.json`.
2. **7 ticker aliases** (Fortune ticker ≠ SEC ticker in that file):

   | Fortune ticker | SEC ticker | Company |
   |----------------|------------|---------|
   | BRK-A | BRK-B | Berkshire Hathaway |
   | BK | BNY | Bank of New York Mellon |
   | MMC | MRSH | Marsh & McLennan |
   | FI | FISV | Fiserv |
   | SATS | ECHO | EchoStar |
   | XYZ | SQ | Block |
   | PSKY | PARA | Paramount |

3. **15 manual CIK lookups** (absent from `company_tickers.json`, verified via
   `data.sec.gov/submissions`):

   | Rank | Company | Fortune ticker | SEC ticker | CIK |
   |------|---------|----------------|------------|-----|
   | 25 | Walgreens | WBA | WBA | 1618921 |
   | 210 | American Electric Power | AEP | AEP | 4904 |
   | 259 | Discover Financial | DFS | DFS | 1393612 |
   | 292 | United States Steel | X | X | 1163302 |
   | 311 | Nordstrom | JWN | JWN | 72333 |
   | 351 | Hess | HES | HES | 4447 |
   | 354 | Kellanova | K | K | 55067 |
   | 366 | Berry Global | BERY | BERY | 1378992 |
   | 403 | A-Mark Precious Metals | AMRK | GOLD | 1591588 |
   | 411 | Owens & Minor | OMI | ACH | 75252 |
   | 413 | Interpublic | IPG | IPG | 51644 |
   | 436 | SpartanNash | SPTN | SPTN | 877422 |
   | 456 | Skechers | SKX | SKX | 1065837 |
   | 472 | Altice USA | ATUS | OPTU | 1702780 |
   | 495 | Taylor Morrison | TMHC | TMHC | 1562476 |

**Renames to keep in the UI, not as separate issuers:**

- Owens & Minor → Accendra Health (`ACH`)
- A-Mark Precious Metals → Gold.com (`GOLD`)
- Altice USA → Optimum Communications (`OPTU`)

### Mapping columns

| Field | Meaning |
|-------|---------|
| `rank` | Fortune 500 rank |
| `company` | Fortune display name |
| `fortune_ticker` | Ticker as published by Fortune (`Non-public` for private) |
| `sec_ticker` | Ticker in the SEC index (may differ) |
| `cik` / `cik_padded` | Integer CIK and 10-digit zero-padded form used in URLs |
| `sec_name` | Legal name in SEC filings |
| `edgar_submissions_api` | Company profile + filing history JSON |
| `edgar_companyfacts_api` | All XBRL facts JSON |
| `edgar_companyconcept_revenues_api` | Revenues time series (optional; skip if using Facts) |
| `edgar_filings_browse` | Human HTML browse page — not for automation |
| `status` | `matched` or `no_ticker` |
| `match_source` | `company_tickers_json` or `manual_cik_lookup` |

---

## EDGAR URLs we will actually hit

Replace `{CIK10}` with `cik_padded`. Full per-company URLs are already in the
mapping files.

### Automated (per public company)

| Priority | URL | Why |
|----------|-----|-----|
| **P1 — daily** | `https://data.sec.gov/submissions/CIK{CIK10}.json` | Profile + filing index. Cheap. Tells us whether Facts changed. |
| **P2 — conditional** | `https://data.sec.gov/api/xbrl/companyfacts/CIK{CIK10}.json` | All XBRL facts. Pull only when P1 shows a new `10-K` / `10-Q` / amendment / XBRL `8-K`. |

**Minimum automated set:** P1 for all 473, P2 only on delta.

Skip Company Concept URLs (`…/companyconcept/…/us-gaap/{Tag}.json`) once we
store Facts — they are a one-tag slice of the same data. Skip the HTML browse
URL in automation.

Example (Amazon `0001018724`):

```
https://data.sec.gov/submissions/CIK0001018724.json
https://data.sec.gov/api/xbrl/companyfacts/CIK0001018724.json
```

### Derived (on demand, from Submissions)

| URL | Notes |
|-----|-------|
| `https://www.sec.gov/Archives/edgar/data/{cik}/{accession_nodashes}/index.json` | File list for one accession |
| `https://www.sec.gov/Archives/edgar/data/{cik}/{accession_nodashes}/{filename}` | Raw 10-K / 10-Q / 8-K. **Immutable — fetch once.** |

Out of scope for v1. Add later if we want MD&A / risk-factor text.

### Cross-company (optional, weekly)

`https://data.sec.gov/api/xbrl/frames/{taxonomy}/{tag}/{unit}/{period}.json`

Examples: `us-gaap/Revenues/USD/CY2024.json`, `us-gaap/Assets/USD/CY2024Q4I.json`.
Period forms: `CY2024` (annual), `CY2024Q1` (quarterly), `CY2024Q4I` (balance-sheet instant).

Useful for a “who reported revenue for FY2024” benchmark. Not required to
stand up the per-company explorer.

### Bulk ZIPs (local safety net only — not on GitHub Actions)

| File | URL | When SEC publishes |
|------|-----|--------------------|
| All company facts | `https://www.sec.gov/Archives/edgar/daily-index/xbrl/companyfacts.zip` | ~3:00 a.m. ET |
| All submissions | `https://www.sec.gov/Archives/edgar/daily-index/bulkdata/submissions.zip` | ~3:00 a.m. ET |

`companyfacts.zip` is ~1.3 GB compressed and ~13 GB uncompressed. That does
**not** fit comfortably on a GitHub-hosted runner (14 GB free disk guaranteed).
If we use the ZIP at all, run it locally and stream-filter to our 473 CIKs.
The daily live API is enough for production.

---

## What each API gives us

### Submissions

Rarely changing metadata: legal name, former names, tickers, exchanges, SIC,
state of incorporation, fiscal year end, EIN, addresses, phone, website.

Event-driven filing index: form type (`10-K`, `10-Q`, `8-K`, `DEF 14A`, `4`,
`13F-HR`, …), filing date, period, acceptance datetime, accession, XBRL flag.

### Company Facts

```
facts.{taxonomy}.{tag}.units.{unit}[]  →  { val, start, end, fy, fp, form, filed, accn, frame }
```

Taxonomies: `us-gaap` (primary), `dei`, `ifrs-full`, `ecd`, `ffd`. Large
filers expose 400–900+ `us-gaap` concepts. Banks / insurers / REITs use
industry tags — the canonical list below will be empty for some issuers;
the extractor must fall back (e.g. `Revenues` **or**
`RevenueFromContractWithCustomerExcludingAssessedTax`).

### v1 metric set (extract and store; do not keep the raw blob)

| Canonical key | Candidate `us-gaap` tags (first hit wins) |
|---------------|-------------------------------------------|
| `revenue` | `Revenues`, `RevenueFromContractWithCustomerExcludingAssessedTax`, `SalesRevenueNet` |
| `net_income` | `NetIncomeLoss` |
| `gross_profit` | `GrossProfit` |
| `operating_income` | `OperatingIncomeLoss` |
| `assets` | `Assets` |
| `liabilities` | `Liabilities` |
| `equity` | `StockholdersEquity` |
| `cash` | `CashAndCashEquivalentsAtCarryingValue` |
| `cfo` | `NetCashProvidedByUsedInOperatingActivities` |
| `cfi` | `NetCashProvidedByUsedInInvestingActivities` |
| `cff` | `NetCashProvidedByUsedInFinancingActivities` |
| `eps_diluted` | `EarningsPerShareDiluted` |
| `eps_basic` | `EarningsPerShareBasic` |
| `shares_out` | `CommonStockSharesOutstanding` (else `dei/EntityCommonStockSharesOutstanding`) |
| `long_term_debt` | `LongTermDebt` |
| `inventory` | `InventoryNet` |
| `receivables` | `AccountsReceivableNetCurrent` |
| `rd` | `ResearchAndDevelopmentExpense` |
| `capex` | `PaymentsToAcquirePropertyPlantAndEquipment` |

Keep **annual (`fp = FY`)** and **quarterly** points for the last ~5 fiscal
years. Prefer 10-K / 10-Q over 8-K when both exist for the same period.

Rough size: 473 companies × 19 metrics × ~20 periods ≈ 180k rows. Fine for
Neon; also small enough as a committed JSON snapshot for a static v1 page.

---

## What users see (product)

Three surfaces, all client-side on the extracted snapshot (no login). Private
companies appear in the catalog only — no fake zeros.

### 1. Company page — identity + latest year + history

**Header (from Submissions / mapping):** Fortune rank and name, tickers
(Fortune vs SEC if they differ), legal name, exchange, SIC / industry, fiscal
year end, last 10-K / 10-Q date, link out to the SEC filing browser.

**Headline cards (latest completed FY, USD unless noted):**

| Card | Source |
|------|--------|
| Revenue | `revenue` |
| Net income | `net_income` |
| Diluted EPS | `eps_diluted` |
| Total assets | `assets` |
| Operating cash flow | `cfo` |
| Employees / shares | skip employees (not in v1 tags); show `shares_out` |

**Derived ratios** (computed in the page from the same FY; hide the card if a
input is missing — never show `0%` for “tag not reported”):

| Ratio | Formula |
|-------|---------|
| Gross margin | `gross_profit / revenue` |
| Operating margin | `operating_income / revenue` |
| Net margin | `net_income / revenue` |
| ROA | `net_income / assets` |
| ROE | `net_income / equity` |
| Debt / equity | `long_term_debt / equity` |
| FCF (approx.) | `cfo + capex` if capex is stored as a cash *outflow* (negative); document the sign in `extract.js` |
| Revenue YoY | this FY `revenue` / prior FY `revenue` − 1 |

**History:** one chart (toggle metric) for the last ~5 FY, plus a table that
can switch Annual / Quarterly. Full v1 metric list is in the table, not all
as cards: gross profit, operating income, equity, cash, CFI, CFF, basic EPS,
long-term debt, inventory, receivables, R&D, capex.

**Provenance on hover / expand:** period, form (`10-K` vs `10-Q`), filed date,
the `us-gaap` tag that actually won. Users should be able to tell “this is
Amazon’s FY2024 10-K revenue tag X”, not a mystery number.

### 2. Catalog screener — compare the whole list

Default view at `/fortune-500/`. Sortable, filterable table of all 500.

**Default columns:** rank, company, ticker, status (public / private), latest
FY revenue, net income, net margin, assets, revenue YoY.

**Controls:**

- Search by name or ticker
- Public-only toggle (private rows stay visible but grayed, with no metrics)
- Sort any numeric column (private sort to the bottom)
- Optional later: filter by SIC / industry once Submissions metadata is stored

Click a row → company page. Checkboxes (max **4**) add companies to a compare
set; a sticky bar opens compare.

This is the main “contrast 473 companies” tool — a screener, not a query
builder. Plot Points already owns the builder pattern; this page should feel
like a ranked table you can sort.

### 3. Side-by-side compare — 2–4 companies

URL like `?compare=4,11,15` (ranks). Same FY (or “latest reported FY per
company” with a footnote when fiscal year-ends differ — Apple’s FY is not
calendar, Walmart’s isn’t either).

- KPI grid: one row per metric, one column per company, **highlight high/low**
  in each row (for “higher is better” metrics; invert for debt/equity).
- One overlay chart: pick a metric, plot 5 FY for each company.
- Missing cells are **em-dash + “not reported”**, never zero.
- “Add / remove” from the compare set without leaving the page.

Fiscal year-end mismatch is the main compare footgun. Show each company’s
`fy_end` under its name so “FY2024” is not silently incomparable.

### What we will not show in v1

| Tempting metric | Why not |
|-----------------|--------|
| Market cap / stock price | Not in EDGAR Company Facts (need a price feed) |
| Fortune revenue / profit as published | We are not licensed to republish Fortune’s table; we show **SEC** figures next to Fortune **rank/name** |
| Headcount | Not in the v1 tag list |
| 10-K narrative (MD&A, risk factors) | Unstructured; phase 4 |
| Peer percentile / “vs all filers” | Needs Frames API; phase 4 |
| Banks vs retailers as if identical | Industry tags differ; screener still allows the sort, but company pages should note empty retail-style tags (gross profit, inventory) on financials |

### Compare honesty rules

- **Do not compare private companies** on financials. Catalog only.
- **Do not impute missing XBRL as zero.** A bank with no `GrossProfit` is not
  a 0% margin retailer.
- **Do not mix units.** EPS stays per-share; shares stay counts; everything
  else USD.
- **Prefer the same `fp` (FY vs Q2)** when overlaying charts. Default compare
  to annual.

---

## How this repo should pull (not Vercel cron)

### Constraints that rule out a naive `api/*.js` crawler

- Vercel Hobby functions default to **10s**, max **60s**. 473 Submissions
  calls at 8 req/sec is ~60s of pacing alone — too tight, and Facts payloads
  are large.
- Hobby allows **12 serverless files**; we use **7**. A crawl does not need
  its own function. A later **read** API can be one new file (`8/12`) with
  `?route=` branches, matching A-Lister / Plot Points.
- `middleware.js` 404s `/lib/*` for browsers. Shared extractors used by both
  Node ingest and a future page must live under `fortune-500/` (same lesson
  as `plot-points/query-engine.js`).
- SEC requires a `User-Agent` with app name + contact email, and **≤10
  req/sec**. Recommended pace: **8 req/sec** (~125 ms between calls).

### Recommended split

```
GitHub Action (daily, ~06:00 ET)
  → data.sec.gov (Submissions all 473, Facts on delta)
  → extract canonical metrics
  → Neon (source of truth)  and/or  committed slim snapshot JSON

Browser
  → /fortune-500/          static HTML + mapping JSON (catalog always works)
  → /api/fortune-500?route=…   live facts / filings (optional; needs Neon)
```

| Data | Where it lives | Who writes it |
|------|----------------|---------------|
| Fortune ↔ CIK mapping | `fortune-500/data/*.json` in git | Humans, when the list changes |
| Last-seen accession / pull cursor | Neon `f500_pull_state` | GitHub Action |
| Company profile (from Submissions) | Neon `f500_companies` | GitHub Action |
| Extracted facts | Neon `f500_facts` | GitHub Action |
| Slim public snapshot (v1) | `fortune-500/data/facts-snapshot.json` | Same Action, weekly or on change |
| Raw Company Facts / filings | **Not stored** (or object storage later) | — |

**Do not** put the 473-company crawl on Vercel. GitHub Actions has hours of
runtime; Vercel does not.

### GitHub Actions quota (Free plan is 2,000 minutes/month — for private repos)

GitHub Free includes **2,000 Actions minutes per month**. That pool is what
private-repo jobs draw from. It resets each billing cycle and does not roll
over. ([GitHub Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions))

This repo (`inaayat/replacing-nerd-jobs`) is **public**. Standard
`ubuntu-latest` runners on public repos **do not consume** that 2,000-minute
pool — GitHub bills them as free. The 2,000 would only start counting if the
repo were made private, or if we used larger (paid) runners.

Even if we budget as if the 2,000 cap applied:

| Job | Wall clock | vs 2,000 min/month |
|-----|-----------:|-------------------:|
| Daily Submissions (473) + 0–30 Facts | **~3–8 min/day** | **~90–240 min/month** (~5–12% of the private-repo pool) |
| First-time Facts for all 473 (one-off) | **~15–25 min** | one-time |
| Weekly `companyfacts.zip` on the runner | **Don't** | ~1.3 GB zip / ~13 GB uncompressed; runners only guarantee **14 GB** disk |

So the daily Action fits either reading: public (doesn't touch the 2,000) or
private (still ~90–240 of 2,000). Skip the bulk ZIP on GitHub-hosted runners.
If we ever want a full refresh from the ZIP, run it locally (or stream-filter
without extracting all 13 GB).

Do not upload raw Facts as Actions artifacts (Free accounts share **500 MB**
of artifact + Packages storage). Write extracted rows to Neon or a slim
committed snapshot instead.

### Daily job (automated)

| Step | Action | Calls |
|------|--------|------:|
| 1 | Submissions for all 473 CIKs | 473 |
| 2 | Compare latest `filingDate` / `accessionNumber` to `f500_pull_state` | 0 |
| 3 | Company Facts only for CIKs with new `10-K`, `10-Q`, `10-K/A`, `10-Q/A`, or XBRL `8-K` | 0–30 typical |
| 4 | Extract v1 metrics; upsert Neon; optionally refresh snapshot JSON | — |

Daily volume: ~**500–800** calls vs 946 if Facts were refreshed for everyone.

Suggested clock:

```
06:00 ET   Submissions for 473 (~1 min at 8 req/sec)
06:05 ET   Facts for CIKs with new relevant filings
```

Weekly bulk ZIP is a **local** safety net only (stream-filter 473 CIKs; do not
extract the full archive on a GitHub runner).

Seasonal: Jan–Apr (10-K) and ~6 weeks after quarter-end, keep the daily
Submissions + conditional Facts cadence. Mid-quarter quiet periods can drop
Submissions to 2–3×/week.

### SEC compliance

- Header: `User-Agent: inaayat-fortune500 contact@inaayat.xyz` (exact email
  via env `SEC_USER_AGENT` — do not hardcode a personal address in git).
- Cap at 8–10 req/sec; retry 429/503 with backoff.
- Store CIK + last-seen accession so we never blindly re-pull Facts.
- Never re-fetch an archive URL we already stored (documents are immutable).
- Docs: [SEC EDGAR APIs](https://www.sec.gov/edgar/sec-api-documentation).

### Anti-patterns

| Don't | Why |
|-------|-----|
| Company Facts hourly for all 473 | ~22k calls/day; data changes ~4–5×/year |
| 10+ Concept URLs per company while storing Facts | Duplicate traffic |
| Re-fetch raw filing URLs | Immutable |
| Commit raw Facts JSON | Multi-MB × 473 |
| Exceed 10 req/sec | Risk of SEC blocking |
| New `api/*.js` per endpoint | Burns Hobby slots; use one router |
| Import `/lib/` from browser JS | `middleware.js` 404s it |

---

## Proposed Neon schema

Add to `lib/db.js` `ensureSchema()` when implementation starts (same
CREATE-IF-NOT-EXISTS pattern as `alist_*` / `pc_*`). Public financials — no
user FK, no Neon Auth required to read.

```sql
CREATE TABLE IF NOT EXISTS f500_companies (
  cik              INT PRIMARY KEY,
  cik_padded       TEXT NOT NULL,
  rank             INT NOT NULL,
  fortune_name     TEXT NOT NULL,
  fortune_ticker   TEXT,
  sec_ticker       TEXT,
  sec_name         TEXT,
  sic              TEXT,
  sic_description  TEXT,
  fy_end           TEXT,
  exchanges        JSONB,
  website          TEXT,
  status           TEXT NOT NULL,          -- matched | no_ticker
  match_source     TEXT,
  submissions_raw  JSONB,                  -- trim if too large; else drop
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS f500_pull_state (
  cik                 INT PRIMARY KEY REFERENCES f500_companies(cik),
  last_accession      TEXT,
  last_filing_date    DATE,
  last_facts_pulled   TIMESTAMPTZ,
  last_error          TEXT
);

CREATE TABLE IF NOT EXISTS f500_facts (
  cik          INT NOT NULL REFERENCES f500_companies(cik),
  metric       TEXT NOT NULL,              -- canonical key, e.g. revenue
  fy           INT NOT NULL,
  fp           TEXT NOT NULL,              -- FY | Q1 | Q2 | Q3 | Q4
  form         TEXT,
  unit         TEXT NOT NULL,              -- USD | shares | USD/shares
  val          NUMERIC NOT NULL,
  start_date   DATE,
  end_date     DATE,
  filed        DATE,
  accn         TEXT,
  frame        TEXT,
  tag_used     TEXT NOT NULL,              -- actual us-gaap tag that won
  PRIMARY KEY (cik, metric, fy, fp, form, unit)
);
```

Private companies can live in `f500_companies` with `status = 'no_ticker'`
and `cik` replaced by a synthetic key **or** a separate `f500_private`
table keyed by rank. Prefer **one catalog table keyed by rank** plus
nullable `cik`, so the UI can list all 500 without a join:

```sql
-- Alternative: rank as the catalog key (covers private rows)
CREATE TABLE IF NOT EXISTS f500_catalog (
  rank             INT PRIMARY KEY,        -- 1..500
  fortune_name     TEXT NOT NULL,
  fortune_ticker   TEXT,
  status           TEXT NOT NULL,
  cik              INT UNIQUE,             -- null if private
  ...
);
```

**Decision for implementation:** use `f500_catalog` keyed by `rank` (nullable
`cik`) so private firms are first-class rows. Point `f500_facts` /
`f500_pull_state` at `cik` where not null.

---

## Proposed code layout (when we implement)

```
fortune-500/
  PLAN.md
  index.html                 # screener + company page + compare (phase 2)
  app.js / app.css
  extract.js                 # dependency-free ESM: facts JSON → canonical rows
                             # importable by the Action and (if needed) the page
  data/
    fortune500_edgar_mapping.json
    fortune500_edgar_mapping.csv
    company_tickers.json
    company_tickers_exchange.json
    facts-snapshot.json      # generated; do not hand-edit

scripts/
  pull-fortune500-edgar.mjs  # Node ingest: rate limit, User-Agent, upsert
  test-fortune500-extract.mjs

api/fortune-500.js           # ONE new serverless file (8/12). Read-only routes.
.github/workflows/pull-fortune500-edgar.yml
```

`api/fortune-500.js` routes (rewrites in `vercel.json`, same pattern as Plot
Points):

| Rewrite | `?route=` | Returns |
|---------|-----------|---------|
| `/api/f500-catalog` | `catalog` | 500 rows from mapping / Neon (rank, name, ticker, status) |
| `/api/f500-company` | `company` | One issuer: profile + latest facts |
| `/api/f500-facts` | `facts` | Time series for `?cik=` / `?rank=` + optional `?metric=` |

No write routes. Ingest is CI-only. Catalog can also be served as static
JSON so `python3 -m http.server` still shows the list with no secrets.

Env for the Action (not needed for a static snapshot v1):

| Variable | Where | Purpose |
|----------|-------|---------|
| `SEC_USER_AGENT` | GitHub Actions secret | Required EDGAR header |
| `DATABASE_URL` | GitHub Actions secret (Neon) | Upsert facts. Do not reuse the Vercel preview branch URL. |

---

## Phased rollout

### Phase 0 — this PR

Folder, mapping files, this plan, and the static explainer at `/fortune-500/`
(catalog + per-company EDGAR feeds, no dollar figures yet). No API or Action.

### Phase 1 — extractor + one-company dry run

- `fortune-500/extract.js`: Company Facts JSON → canonical rows, including
  tag fallbacks.
- `scripts/test-fortune500-extract.mjs`: fixtures (a non-financial like
  Apple, a bank, an insurer) so missing tags don't silently become zeros.
- `scripts/pull-fortune500-edgar.mjs`: fetch Submissions + Facts for **one**
  CIK (Amazon) with User-Agent + 125 ms pacing. Print extracted rows. No
  Neon yet.
- Confirm payload size and which tags actually exist.

### Phase 2 — full 473 pull → slim snapshot (static v1)

- Run the script locally (or a manual workflow_dispatch) for all 473.
- Write `fortune-500/data/facts-snapshot.json` (latest FY + last 4 quarters
  per metric). Keep it well under a few MB.
- Catalog **screener** + **company page** + **2–4 company compare** against
  mapping JSON + snapshot. Works with `python3 -m http.server` — no Vercel,
  no Neon, no daily job.

### Phase 3 — Neon + daily Action

- Schema in `lib/db.js`.
- Scheduled workflow: daily Submissions, conditional Facts, upsert, fail the
  job (don't silently skip) on SEC 403 (bad User-Agent) or mass 429s.
- Optional local bulk-ZIP refresh as a safety net (not on the GitHub runner).
- `api/fortune-500.js` read routes for live data. Homepage card (replace a
  TBD tile) only once the page is actually usable.

### Phase 4 — later, optional

- Frames API for “this metric vs all F500” percentiles / bar ranking.
- Industry-aware metric packs (bank vs retailer vs insurer).
- On-demand filing documents (10-K HTML) behind a click, cached by accession.
- Rematch script: new Fortune CSV + refreshed `company_tickers.json` →
  updated mapping (keep the alias table and manual CIK list).

---

## Private companies (no EDGAR pull)

| Rank | Company | Notes |
|------|---------|-------|
| 34 | State Farm | Mutual insurer |
| 74 | New York Life Insurance | Mutual insurer |
| 80 | Publix Super Markets | Employee-owned, private |
| 83 | Nationwide | Mutual insurer |
| 96 | Liberty Mutual Insurance | Private/mutual |
| 98 | USAA | Private membership org |
| 101 | TIAA | Private nonprofit financial services |
| 112 | Mass Mutual | Mutual insurer |
| 117 | Northwestern Mutual | Mutual insurer |
| 142 | GuideWell Mutual | Mutual holding company |
| 157 | Medline | Private |
| 215 | American Family Insurance | Mutual insurer |
| 273 | Peter Kiewit Sons' | Private (construction) |
| 276 | Guardian Life | Mutual insurer |
| 280 | Edward Jones | Private (Jones Financial) |
| 282 | Land O'Lakes | Cooperative |
| 289 | Auto-Owners Insurance | Mutual insurer |
| 290 | Pacific Life | Private |
| 301 | Farmers Insurance Exchange | Mutual insurer |
| 318 | Mutual of Omaha Insurance | Mutual insurer |
| 335 | Western & Southern Financial | Mutual insurer |
| 389 | Graybar Electric | Employee-owned, private |
| 405 | Thrivent Financial for Lutherans | Fraternal benefit society |
| 417 | FM | Private insurer (Factory Mutual) |
| 440 | Ace Hardware | Retail cooperative |
| 480 | QVC | Private (Liberty Media subsidiary) |
| 485 | Securian Financial | Private |

Show them in the catalog with a “private / no SEC filings” badge.

---

## Open decisions (resolve in phase 1)

1. **Snapshot in git vs Neon-only.** Recommendation: snapshot for v1 so the
   page works statically; Neon once we want daily freshness without git
   churn.
2. **Contact email in `SEC_USER_AGENT`.** Needs a real mailbox the SEC can
   reach. Blocked on that before any live crawl.
3. **Which Fortune year** this mapping is. Treat ranks as a dated list;
   when Fortune publishes the next 500, rematch rather than overwrite
   history in place.
4. **Exxon CIK `0002115436`** (mapping: “ExxonMobil Holdings Corp”) looks
   like a successor entity vs the long-running Exxon Mobil CIK. Verify
   Submissions/Facts actually have the 10-K series we want before treating
   it as rank 9’s time series.
5. **Homepage card.** Do not add until there is a page to open. Use a
   rainbow `item-card` (not `card-gray`) when it goes live.

---

## Summary

| Item | Value |
|------|------:|
| Public companies to pull | 473 |
| Private companies (catalog only) | 27 |
| Automated URLs per public company | 2 (Submissions always; Facts on change) |
| Daily Submissions | ~473 calls, ~1 min |
| Daily Facts | Conditional, typically 0–30 |
| Crawl runs on | GitHub Actions, not Vercel |
| Read API (later) | One new `api/fortune-500.js` (8/12) |
| v1 UI can be | Static mapping + extracted snapshot JSON |

**Primary mapping:** `fortune-500/data/fortune500_edgar_mapping.json`  
**Ticker index source:** `https://www.sec.gov/files/company_tickers.json`
