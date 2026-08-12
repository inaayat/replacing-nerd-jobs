# beep boop

Personal toolkit site served at [inaayat.xyz](https://inaayat.xyz).
Repo: [inaayat/replacing-nerd-jobs](https://github.com/inaayat/replacing-nerd-jobs).

Static HTML/CSS/JS pages plus a small set of Vercel serverless functions.
There is **no build step** — push to `main` and Vercel redeploys.

---

## Website setup

### What this is

A no-framework Vercel project (`framework: null` in `vercel.json`). HTML files
and folders at the repo root are served as-is. Server logic lives under `api/`
as Node serverless handlers. Shared server modules live under `lib/` (never
served publicly — `middleware.js` 404s `/lib/*`).

### Local development

```bash
npm install
```

**Static UI only** (no auth, no database, no TMDB/live APIs):

```bash
python3 -m http.server 8080
# then open http://127.0.0.1:8080/
```

Works for catalog/player pages like Sporcle Spinoff and Plot Points shells.
`api/*` and the `/private` gate do **not** run under a plain static server.

**Full stack** (API routes + env secrets):

```bash
vercel dev
```

Requires a Vercel login and the env vars listed below (Neon, TMDB, etc.).

### Deploy

Connected to Vercel. Push to `main` → automatic redeploy. Done. beep boop.

Preview deployments also get a Neon database branch named `preview/<git-branch>`
via the Vercel ↔ Neon integration. When a PR closes, GitHub Actions deletes that
branch (`.github/workflows/cleanup-neon-preview-branch.yml`).

### Adding a new page

1. `cp _template.html my-project/index.html`
2. Link it from the main card grid in `index.html`
3. `git push` — Vercel redeploys automatically

### Hobby plan constraint (important)

Vercel Hobby allows at most **12 serverless functions** per deployment, and this
repo sits at exactly 12 files under `api/`. **Do not add new files under `api/`.**
Instead, add a `?route=` branch to an existing handler and a matching rewrite in
`vercel.json` (this is why A-Lister and Plot Points are multiplexed routers).

### Environment variables

Set these in the Vercel project (Production / Preview as needed). The Neon
integration usually provisions the first two automatically.

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Neon Postgres connection string |
| `NEON_AUTH_BASE_URL` | Hosted Neon Auth endpoint (Better Auth) |
| `SITE_PASSWORD` | Owner-only password for `/private/` |
| `GITHUB_TOKEN` | Opens PRs / commits quiz & cube content via GitHub API |
| `TMDB_API_KEY` | The Movie Database — A-Lister + Plot Points |
| `FOOTBALL_DATA_KEY` | football-data.org — World Cup / football API |
| `NEON_PROJECT_ID` | GitHub Actions var — preview branch cleanup |
| `NEON_API_KEY` | GitHub Actions secret — preview branch cleanup |

---

## Authentication

There are **two separate auth systems**. Do not mix them up.

### 1. Owner password gate (`/private/`)

Simple site-owner lock for private pages (e.g. financial statements).

| Piece | Role |
|---|---|
| `SITE_PASSWORD` | Shared secret in Vercel env |
| `middleware.js` | Intercepts `/private/*`; shows a login form if unauthed |
| `api/login.js` | POST checks password, sets `__auth` cookie (SHA-256 of password); GET clears it (logout) |
| `lib/auth.js` | `isAuthed(cookie)` — Edge-safe cookie check via `crypto.subtle` |

Cookie: `__auth=<sha256(SITE_PASSWORD)>`, HttpOnly, Secure, SameSite=Lax, 7 days.
Also used by some owner-only publish paths (e.g. quiz/cube publish) that call
`isAuthed()` per-request even when the builder page itself is public.

### 2. Neon Auth (multi-user visitor accounts)

Real email/password accounts for visitor-facing features (A-Lister, Packing
Cubes cloud sync, account deletion, etc.). Built on [Neon Auth](https://neon.com/docs/auth/overview)
(Better Auth), hosted at `NEON_AUTH_BASE_URL`.

| Piece | Role |
|---|---|
| `account.html` | Sign-in / sign-up / account / delete UI |
| `engine/neon-browser-auth.js` | Shared browser helper: load Neon client, store JWT in `localStorage`, PWA-friendly API login |
| `api/auth-config.js` | Returns `{ url: NEON_AUTH_BASE_URL }` so the browser never hardcodes it |
| `api/auth-login.js` | Server-side sign-in/sign-up that returns a JWT (needed because mobile PWAs often block third-party auth cookies) |
| `lib/neon-auth.js` | `getAuth(req)` — verifies `Authorization: Bearer <jwt>` against Neon Auth JWKS |
| `api/me.js` | Upserts the user into Postgres; DELETE removes app data + Neon Auth account |

**Flow:**

1. Browser fetches `/api/auth-config` → gets Neon Auth base URL.
2. Sign-in/up goes through `/api/auth-login` (preferred) or the Neon Auth client
   directly; a JWT is stored in `localStorage` under `alist-auth-jwt`.
3. App API calls send `Authorization: Bearer <token>`.
4. `getAuth(req)` verifies the JWT **statelessly** against
   `{NEON_AUTH_BASE_URL}/.well-known/jwks.json` (issuer + audience = auth origin).
5. JWT `sub` is the Neon Auth user id — that becomes `users.id` in Postgres.

There is no committed auth config file. As soon as Vercel has
`NEON_AUTH_BASE_URL` and `DATABASE_URL`, `/account.html` works.

**Adding a new logged-in feature:** put tables in `ensureSchema()` keyed on
`users.id`, and copy the `getAuth(req)` check from `api/me.js` / `api/alist.js`.

---

## Database

[Neon](https://neon.tech) Postgres, accessed from serverless functions via
`@neondatabase/serverless` (`lib/db.js`).

- `db()` — lazy tagged-template client; safe to import before `DATABASE_URL` exists.
- `ensureSchema()` — `CREATE TABLE IF NOT EXISTS` (+ additive `ALTER`s) on first
  request so a fresh database self-provisions. For breaking changes to existing
  columns, run SQL in the Neon console and mirror it here.

### Tables (app-owned)

| Table | Used by | Notes |
|---|---|---|
| `users` | All authed features | `id` = Neon Auth `sub`; email/name synced on `/api/me` |
| `alist_membership` | A-Lister | Billing tiers, username, public profile flags |
| `alist_watches` | A-Lister | Movie screening log |
| `alist_watch_invites` | A-Lister | “Watched together” invites |
| `alist_watch_companions` | A-Lister | Bidirectional companion tags |
| `alist_watchlist` | A-Lister | Movies to see |
| `alist_movie_cache` | A-Lister + Plot Points | TMDB movie payloads (`raw` JSONB); Plot Points also stores cast-with-ids |
| `alist_tv_watches` | A-Lister | TV episode log |
| `alist_tv_watchlist` | A-Lister | TV to watch |
| `alist_tv_cache` | A-Lister | TMDB TV payloads |
| `pc_cubes` | Packing Cubes | Per-user cubes (private + publish metadata) |
| `pc_suitcase_state` | Packing Cubes | Active suitcase + packed state JSON |
| `plot_points_cache` | Plot Points | Query/result cache keyed by `cache_key` |

Neon Auth also keeps its own auth tables in the same Neon project (managed by
Neon Auth, not by `ensureSchema()`).

### Related automation

- Preview DB branches: Vercel Neon integration creates `preview/<branch>`;
  `.github/workflows/cleanup-neon-preview-branch.yml` deletes them on PR close.
- Quiz/cube static catalogs are **not** in Postgres — they are JSON files in git,
  with indexes rebuilt by GitHub Actions (`build-quiz-index.yml`,
  `build-cube-index.yml`).

---

## Connections to other repositories

### Proxied into this site (same domain)

**[inaayat/one-more-column](https://github.com/inaayat/one-more-column)** —
flexible capacity planning app, deployed separately at
`https://one-more-column.vercel.app`. This repo’s `vercel.json` rewrites:

- `/one-more-column` and `/one-more-column/*` → the other Vercel app
- `/api/omc-*` → that app’s API

So visitors hit `inaayat.xyz/one-more-column/` without leaving this domain, while
the code and deploy live in the other repo.

### Linked from the landing page (separate products)

| Repo | What | Link style |
|---|---|---|
| [inaayat/dumpster](https://github.com/inaayat/dumpster) | macOS productivity / personal knowledge dump (`dumpster.inaayat.xyz`) | External card on `index.html` |
| [inaayat/dumpsteriOS](https://github.com/inaayat/dumpsteriOS) | iOS companion (“brain vomit” capture app) | External card on `index.html` |

These are **not** deployed from this repo; the homepage just deep-links to GitHub
(and Dumpster’s own site).

### This repo talking to itself via GitHub

Several API routes use `GITHUB_TOKEN` against **this same repository**
(`inaayat/replacing-nerd-jobs`) to publish content as commits/PRs:

| Route | Action |
|---|---|
| `api/save-quiz.js` | Publish quiz JSON or open a review PR |
| `api/save-cube.js` | Publish packing-cube JSON or open a review PR |
| `api/save-suitcase.js` | Suitcase-related GitHub writes |
| `api/report-issue.js` | Open a GitHub issue from the site |
| `lib/github-cubes.js` | Helpers for packing-cube publish/merge |

After merge to `main`, Actions regenerate `sporcle-spinoff/quizzes/index.json`
and `packing-cubes/cubes/index.json` so catalogs stay consistent without
hand-editing the manifest in PRs.

### External APIs (not repos, but integrations)

| Service | Env | Consumers |
|---|---|---|
| Neon (Postgres + Auth) | `DATABASE_URL`, `NEON_AUTH_BASE_URL` | Almost all authenticated features |
| TMDB | `TMDB_API_KEY` | `lib/tmdb.js` → A-Lister + Plot Points (shared cache table) |
| football-data.org | `FOOTBALL_DATA_KEY` | `api/football.js` / World Cup |
| GitHub API | `GITHUB_TOKEN` | Content publish + issue filing |

---

## Structure

```
/
├── index.html                  ← landing page (inaayat.xyz)
├── account.html                ← Neon Auth sign-in / account
├── _template.html              ← copy this to start a new page
├── middleware.js               ← /private gate + /lib 404s
├── site.css                    ← shared styles for non-landing pages
├── package.json                ← @neondatabase/auth, serverless, jose
├── vercel.json                 ← rewrites, function timeouts, OMC proxy
│
├── fonts/                      ← Atkinson Hyperlegible
├── engine/
│   └── neon-browser-auth.js    ← shared browser Neon Auth helpers
│
├── api/                        ← serverless functions (exactly 12 — Hobby limit)
│   ├── login.js                ← /private password login + logout (GET)
│   ├── auth-config.js          ← exposes NEON_AUTH_BASE_URL
│   ├── auth-login.js           ← server-side Neon Auth → JWT
│   ├── me.js                   ← upsert / delete user
│   ├── alist.js                ← A-Lister router (?route=…)
│   ├── packing-cubes.js        ← Packing Cubes router (?route=…)
│   ├── plot-points.js          ← Plot Points router (?route=…)
│   ├── save-quiz.js            ← Sporcle publish / PR
│   ├── save-cube.js            ← Packing Cubes publish / PR
│   ├── save-suitcase.js
│   ├── report-issue.js
│   └── football.js
│
├── lib/                        ← server-only modules (not publicly fetchable)
│   ├── db.js                   ← Neon client + ensureSchema()
│   ├── auth.js                 ← SITE_PASSWORD cookie helpers
│   ├── neon-auth.js            ← JWT verification
│   ├── tmdb.js                 ← shared TMDB + movie cache
│   ├── a-list*.js              ← A-Lister domain logic
│   ├── packing-cubes.js
│   ├── plot-points.js
│   └── github-cubes.js
│
├── amc-a-lister/               ← AMC A-List watch log & savings tracker
├── packing-cubes/              ← reusable travel checklists
├── sporcle-spinoff/            ← trivia quiz platform
├── plot-points/                ← TMDB cinema query explorer
├── world-cup/                  ← FIFA World Cup 2026
│
├── private/                    ← SITE_PASSWORD-gated section
│   └── gddy-statements/
│
├── scripts/                    ← index builders + pure-function tests
├── .github/workflows/          ← quiz/cube index rebuild + Neon preview cleanup
│
├── ugly-dog-images/ · ugly-cat-images/
└── archive/                    ← retired v1 site (inaayat.xyz/archive)
```

---

## Projects on the site

### Sporcle Spinoff — `/sporcle-spinoff`

Trivia platform: one shared engine, one renderer per interaction type, JSON-driven.
Quiz types: multiple-choice, text-entry, image, matching, ranking, map, map-highlight.

**Add a quiz:** builder at `/sporcle-spinoff/builder.html` (publish as owner or
submit-for-review PR), or hand-add `quizzes/<id>.json` and open a PR. Catalog
index is regenerated by Actions — don’t hand-edit `quizzes/index.json` in a PR.

### Packing Cubes — `/packing-cubes`

Reusable packing checklists (“cubes”) composed into suitcases. Public catalog is
static JSON in git; signed-in users get cloud-synced private cubes / suitcase
state in Neon (`pc_cubes`, `pc_suitcase_state`).

### AMC A-Lister — `/amc-a-lister`

AMC A-List membership value tracker: log screenings, compare billed vs. ticket
prices, watchlist, TV log, leaderboard, showing invites. Fully Neon Auth + Neon
Postgres; movie/TV metadata from TMDB via `lib/tmdb.js`.

### Plot Points — `/plot-points`

Cinema list / query explorer on TMDB. `plot-points/query-engine.js` is imported
by **both** the browser and `api/plot-points.js` — keep it dependency-free ESM
(no `node:` imports). Do **not** move it under `/lib/` (middleware 404s that path
for browsers). Shares `alist_movie_cache` with A-Lister.

### World Cup 2026 — `/world-cup`

Schedule / football helpers; live data via `api/football.js` when
`FOOTBALL_DATA_KEY` is set.

---

## Color scheme

Landing page (`index.html`) palette:

| token | hex |
|---|---|
| cream (bg) | `#faf3e3` |
| orange | `#f2a154` |
| peach | `#f6a98a` |
| teal | `#b5d857` |
| red | `#cf4520` |
| gold | `#e3a72e` |
| gray (coming soon) | `#d8d3c6` |

Use `card-orange` / `card-peach` / `card-teal` / `card-red` / `card-gold` for live
project tiles. Reserve `card-cream` / `card-gray` for “coming soon” placeholders.

---

## Tests

No `npm test` wrapper — run pure Node scripts (no secrets required):

```bash
node scripts/test-billing.mjs
node scripts/test-tmdb.mjs
node scripts/test-plot-points.mjs
node scripts/test-plot-points-query.mjs
node scripts/test-public-imports.mjs   # guards against browser code importing /lib/
node scripts/test-alist-watchlist-sort.mjs
node scripts/test-alist-showing.mjs
```

---

## Resources

### Website inspo

- [zachjordan.io](https://www.zachjordan.io/#extras)
- [sumanthsamala.com](https://sumanthsamala.com/)

### Free icons

- [Free Icons](https://www.reddit.com/r/web_design/comments/16pa3v6/websites_for_free_icon_sets/)
- [Flag Icons](https://flagpedia.net/download/api)
- [Circle Flags](https://kapowaz.github.io/circle-flags/)

### Website color schemes

- [Website Color Schemes](https://visme.co/blog/website-color-schemes/)
