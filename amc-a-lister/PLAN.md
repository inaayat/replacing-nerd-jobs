# AMC A-Lister — Product & Implementation Plan

Replace the personal **A-List Tracking.xlsx** workbook with a site at
`/amc-a-lister/` on inaayat.xyz. Same job as the spreadsheet (log every A-List
screening, bill vs. ticket savings), plus richer movie metadata and a proper
**logged-in** watch log — using the same Neon Auth pattern the site already
documents for visitor features (`account.html` → JWT → `/api/*` → Neon).

This file is the build record. Decisions already made from the spreadsheet audit
are marked; open questions that need a product call before coding are listed at
the bottom.

**Out for now:** Oscars tracking / bingo (present in the sheet as `Oscars 2025`
/ `Oscars 2026`) is deferred — do not build pages, data files, or insights for
it in this plan’s scope.

---

## What the spreadsheet already does

Source: `A-List Tracking.xlsx` (relevant sheets below; Oscars sheets ignored).

### `Movies` (canonical log — ~99 rows)
Per screening:

| Field | Notes |
|---|---|
| Date | When it was seen |
| Charge Month | Derived in the sheet: billing period rolled on the **28th**. **A-Lister decision: calendar month — billing starts on the 1st.** |
| Monthly Bill | Derived: first period `$0.99` promo, then `$24.95`, later `$27.99` |
| Movie | Title (free text today) |
| Location | Theater name (`AMC Lincoln Square 13`, `N/A - India`, …) |
| Format | blank / IMAX / Dolby / IMAX 3D / 70MM / Q&A |
| Saw Alone? | `X` or blank |
| Auditorium | Number |
| Seat | e.g. `J38` |
| Charge | What the ticket *would* have cost without A-List |
| Personal Rating | `1–5` or `DNF` |

Summary panels already computed in-sheet:

- **Total Billed / Total Charged / Total Savings**
- **Total Seen**, **Cost/Movie**, **Avg. Ticket Price**
- **Per charge-month** rollup: movies watched, amount charged, monthly bill

### `ARCHIVEDMovies`
Earlier bill-labeled layout of the same idea (Bill 1…N with per-period savings).
Treat as historical import source only — not a live UI mode.

### `Karan Movies`
Second person's log (same schema, fewer detail columns). Confirms the app needs
**multi-profile / multi-user** support, not a single hard-coded diary.

---

## Product goal

**One composition:** a personal A-List command center — not a generic Letterboxd
clone. Brand signal is **AMC A-Lister**. First viewport: brand + one headline +
one short line + CTA (Log a movie / Sign in) + one dominant atmosphere visual
(theater / marquee energy). Stats and tables live below the fold.

Core jobs:

1. Log a screening in under 30 seconds.
2. See whether A-List is paying for itself this billing period.
3. Enjoy richer data the spreadsheet never had (posters, genres, runtime,
   rewatch count, theater habits, value forecasts).

---

## Auth model (match packing-cubes / site Neon Auth)

Packing Cubes today still keeps suitcases in `localStorage` and uses the
`SITE_PASSWORD` `/private/` cookie mainly for **owner publish**. Cloud-synced
user data is the documented next step (`lib/neon-auth.js`, `account.html`,
`api/me.js`, README "adding logged-in features").

**A-Lister uses that visitor Neon Auth path from day one**, because a watch log
is personal data that must survive devices:

| Concern | Approach |
|---|---|
| Sign up / sign in | Reuse `/account.html` (Neon Auth email/password via esm.sh client) |
| Session in the app | Same pattern as account page: `createInternalNeonAuth` → `getJWTToken()` → `Authorization: Bearer <jwt>` on `/api/a-list/*` |
| Nav chrome | Mirror packing-cubes: `#nav-auth-link` → **Log in** (`/account.html?next=/amc-a-lister/`) / **Log out** (client `signOut`) when session present |
| Server check | `getAuth(req)` from `lib/neon-auth.js`; upsert `users` via existing `ensureSchema()` |
| Anonymous visitors | Can browse **demo / marketing** landing + public "how A-List billing works" explainers; **cannot** add or edit watches |
| Owner `/private/` cookie | **Not** used for watch CRUD (that's site-owner gate, not multi-user identity) |

Optional later: packing-cubes can adopt the same JWT suitcase sync; A-Lister
proves the pattern first.

---

## Information architecture

```
/amc-a-lister/
├── PLAN.md                 ← this file
├── index.html              ← dashboard (HUD + recent + add CTA)
├── log.html                ← full watch history (filter/sort)
├── add.html                ← add/edit screening (also modal from index)
├── insights.html           ← cool new data / charts
├── settings.html           ← membership price tiers, import
├── icon.svg
└── engine/
    ├── app.css             ← tokens + layout (own visual system)
    ├── auth.js             ← shared Neon session helper
    ├── api.js              ← fetch wrappers with Bearer token
    ├── billing.js          ← charge-month + bill amount math (calendar month)
    ├── format.js           ← money/date/rating helpers
    └── views/*.js          ← page renderers
```

API (Vercel serverless, next to existing routes):

```
api/a-list/
├── watches.js              ← GET list / POST create / PATCH update / DELETE
├── summary.js              ← GET aggregates (totals, by month, by theater)
├── membership.js           ← GET/PUT plan settings (price tiers)
├── import.js               ← POST spreadsheet JSON dump (one-shot migration)
└── movie-lookup.js         ← GET title search + metadata enrich (TMDB proxy)
```

Schema additions in `lib/db.js` → `ensureSchema()`:

```sql
-- One row per Neon Auth user (already exists): users(id, email, name, ...)

CREATE TABLE IF NOT EXISTS alist_membership (
  user_id          TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  -- Billing period = calendar month (starts on the 1st). No roll-day.
  promo_cents      INT  NOT NULL DEFAULT 99,           -- first period
  standard_cents   INT  NOT NULL DEFAULT 2495,        -- early A-List
  current_cents    INT  NOT NULL DEFAULT 2799,        -- after price bump
  price_bump_on    DATE,                              -- when current_cents started
  display_name     TEXT,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS alist_watches (
  id               TEXT PRIMARY KEY,                  -- ulid/uuid
  user_id          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  watched_on       DATE NOT NULL,
  title            TEXT NOT NULL,
  tmdb_id          INT,                               -- nullable until enriched
  location         TEXT,
  format           TEXT,                              -- '', IMAX, Dolby, ...
  saw_alone        BOOLEAN NOT NULL DEFAULT false,
  auditorium       TEXT,
  seat             TEXT,
  ticket_cents     INT,                               -- "Charge" column
  rating           NUMERIC(2,1),                      -- 1.0–5.0
  dnf              BOOLEAN NOT NULL DEFAULT false,
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS alist_watches_user_date
  ON alist_watches (user_id, watched_on DESC);

-- Optional cache so lookups don't hammer TMDB
CREATE TABLE IF NOT EXISTS alist_movie_cache (
  tmdb_id          INT PRIMARY KEY,
  title            TEXT NOT NULL,
  year             INT,
  poster_path      TEXT,
  runtime_min      INT,
  genres           TEXT[],                            -- or JSONB
  raw              JSONB,
  fetched_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

## Feature map

### 1. Spreadsheet parity (MVP)

- **Add / edit / delete watch** (logged-in only).
- Fields match `Movies` columns; rating supports half-stars + DNF.
- **Charge month** and **monthly bill** computed in `billing.js` from membership
  settings + `watched_on` — **calendar month (1st–end)**, not the sheet’s 28th-roll.
- Dashboard HUD: Total Billed, Total Charged, Total Savings, Total Seen,
  Cost/Movie, Avg. Ticket Price.
- Monthly rollup table (Month · Movies · Charged · Bill · Net savings).
- History table with search, theater filter, format filter, alone-only, DNF-only.
- **Import**: paste/upload a JSON export of the sheet (script converts xlsx → JSON
  once; import endpoint upserts by `(user_id, watched_on, title, location)`).

### 2. Cool new data (post-MVP, ship in the same app shell)

These are the upgrades the spreadsheet can't do well:

| Idea | Why it's cool | Data source |
|---|---|---|
| **Poster strip + title autocomplete** | Fast logging, visual diary | TMDB search via `movie-lookup.js` (API key in Vercel env, never in browser) |
| **A-List value meter** | "Break-even in N more standard tickets this period" | Derived from current charge-month |
| **Format premium tracker** | How much IMAX/Dolby uplift A-List ate | `format` × `ticket_cents` vs standard |
| **Theater heat map / ranking** | Lincoln Square vs Empire habits | Aggregate by `location` |
| **Seat / auditorium quirks** | Favorites & repeats | Existing seat/auditorium fields |
| **Rewatch detector** | Same `tmdb_id` seen twice (Wicked, Sinners, …) | Group by tmdb_id |
| **Rating distribution & DNF rate** | Taste profile | ratings + dnf |
| **Genre / runtime mix** | "Am I only watching 2.5h event movies?" | TMDB cache |
| **Companion compare** (Bill ↔ Karan) | Side-by-side if both accounts opt in to a shared "household" link | Later: `alist_household` join table — **out of MVP** |

Ship cool-data features behind the **Insights** page so the log stays snappy.

### 3. Explicitly out of scope (v1)

- Oscars tracking / nominee bingo (deferred; may return later).
- Scraping AMC.com reservations / auto-import from A-List account.
- Payments or real AMC account OAuth.
- Public social feed / followers.
- Native mobile app (responsive web only).
- Letterboxd two-way sync.
- Editing other users' logs (even household — read-only compare later).

---

## UX / visual direction

Follow site frontend rules; do **not** copy packing-cubes cocoa/topaz or the
default purple/cream AI looks.

Proposed direction (tokens in `engine/app.css`):

- **Mood:** late-night auditorium — deep charcoal stage, warm tungsten / AMC-red
  accent, soft light spill (not neon glow spam).
- **Type:** expressive display for brand ("A-Lister"), clean readable body
  (avoid Inter/Roboto/system defaults; pick a distinct pairing).
- **Hero:** full-bleed theater atmosphere; brand is hero-level; one CTA group.
- **Motion (2–3 intentional):** HUD number count-up on load; add-form slide;
  savings meter ease-in.
- **No card-soup dashboard** in the first viewport; tables/lists below.

Nav pattern (like packing-cubes): brand · Log · Insights · Account link.

---

## Billing logic

**Decision:** billing periods start on the **1st of the month** (calendar month).
The spreadsheet rolled on the 28th; A-Lister does not.

```
chargeMonth(d) = first calendar day of month(d)
                 // e.g. 2025-07-28 → 2025-07-01

monthlyBill(chargeMonth) =
  if first-ever charge month for user → promo_cents
  else if chargeMonth < price_bump_on → standard_cents
  else → current_cents

totalBilled   = sum of bills for EVERY calendar month from the first watch
                to the current month — including months with no screenings
totalCharged  = sum(ticket_cents)
totalSavings  = totalCharged - totalBilled
costPerMovie  = totalBilled / count(watches)
```

**Confirmed:** billing is continuous, not per-active-month. A-List charges you
every month whether or not you go, so a month with no screenings is still a real
$27.99 against your savings. An earlier draft of this file described
`totalBilled` as the sum of *distinct* charge months (i.e. only months you
watched something), which would have overstated savings; the implementation in
`billingChargeMonths()` was always the continuous version and stays that way.

Consequence: there is currently no way to record a cancelled or paused
membership, so a genuine gap is billed at full price. If that ever comes up, the
fix is membership start/end dates in Settings, not a change to this rule.

Edge cases:

- Non-AMC / free / India trips with `ticket_cents = 0` still count as Seen.
- DNF still counts as a screening (and a charge) unless user opts out later.
- Price bump date is user-configurable (sheet hard-coded around mid-2025).
- Imported sheet rows keep their watch dates; charge months are **recomputed**
  under the 1st-of-month rule (HUD totals may differ slightly from Excel).

Unit-test `billing.js` with calendar-month fixtures (promo month, first
$24.95 month, first $27.99 month).

---

## Implementation phases

### Phase 0 — Skeleton
- Branch + `/amc-a-lister/` shell pages, CSS tokens, link from `index.html`
  projects grid (replace one TBD card).
- `engine/auth.js` session helper; nav Log in/out wired to `/account.html`.
- Schema in `ensureSchema()`; empty authenticated dashboard.

### Phase 1 — Watch CRUD + HUD (spreadsheet parity core)
- `api/a-list/watches.js` + `summary.js` + `membership.js`.
- Add/edit form; history table; billing HUD + monthly rollup.
- Seed default membership settings on first login.

### Phase 2 — Import
- One-time xlsx→JSON converter script in `scripts/`; import API.
- Import owner's `Movies` (and optionally `Karan Movies` into Karan's account).

### Phase 3 — Cool data
- TMDB proxy lookup + poster UI on add form.
- Insights page: value meter, theater ranking, format premiums, rating chart,
  rewatch list.

### Phase 4 — Polish
- Mobile pass, empty states, a11y labels, README blurb, favicon.
- Soft rate limits on write APIs if needed.

---

## Technical constraints (match the monorepo)

- **No build step** — static HTML + ES modules, same as packing-cubes / sporcle.
- Neon Auth JWT verification only via `lib/neon-auth.js`.
- New tables only through `ensureSchema()`; document any ALTER in Neon SQL editor.
- Secrets: `DATABASE_URL`, `NEON_AUTH_BASE_URL` (already), plus `TMDB_API_KEY`
  for Phase 3.
- Do not put TMDB key in client JS; always proxy.

---

## Open decisions (confirm before / during Phase 1)

1. **Household vs separate accounts** for Bill + Karan — MVP = separate Neon
   accounts; compare view later?
2. **Public share links** for a read-only year recap — yes/no for v1?
3. **TMDB vs OMDb** for metadata — default TMDB (posters + now_playing).
4. **Default landing when signed out** — marketing explainer, or hard redirect
   to `/account.html`?
5. **Should DNF exclude from "Total Seen"** — sheet currently counts them; keep?

---

## Success criteria

- Logged-in user can replace day-to-day use of the Excel file (watch log + billing).
- HUD numbers for an imported `Movies` sheet match under **1st-of-month** billing
  and the configured price tiers (may diverge from Excel’s 28th-roll totals).
- Adding a watch is gated on Neon Auth; signed-out users cannot mutate.
- At least three "cool data" insights live on Insights that the sheet did not
  surface visually.
