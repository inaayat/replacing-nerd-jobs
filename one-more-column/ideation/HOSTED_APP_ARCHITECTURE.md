# Flexible Planning Platform — Hosted Application Architecture

> **Mostly implemented.** Path proxy, Neon Auth, and Postgres SoR are live. Some sections
> below still describe aspirational integrations (Jira publish, job workers, roles). Prefer
> [`../README.md`](../README.md) for the accurate current surface area.

**Status:** Largely shipped (H0–H3); aspirational sections remain  
**Belongs to:** [Part B](./CAPACITY_PLANNER_SPECIFICATION.md#part-b--flexible-planning-platform-aspirational) of [`CAPACITY_PLANNER_SPECIFICATION.md`](./CAPACITY_PLANNER_SPECIFICATION.md) (archived)  
**Sequencing detail:** [`../BUILD_PLAN.md`](../BUILD_PLAN.md) Track H  
**Styling reference:** [`../templates/blank-styling-template.html`](../templates/blank-styling-template.html)  
**Production URL:** `https://inaayat.xyz/one-more-column/`  
**Auth twin:** `https://inaayat.xyz/amc-a-lister/` in repo `inaayat/replacing-nerd-jobs`

Technical deep dive for hosting on **inaayat.xyz** via a **separate Vercel project + main-site path rewrites**, reusing **Neon Auth** like AMC A-Lister.

Use [`../README.md`](../README.md) for current setup/API, [`../BUILD_PLAN.md`](../BUILD_PLAN.md) for delivery history, and **this document** for the original runtime architecture write-up.

---

## 1. Why re-host (Part B / Track H)

The current GitHub Pages pipeline is excellent for a read-only SOX capacity dashboard (Part A). It breaks down when you need a flexible, multi-user planning platform:

| Need | Pages + static HTML | Hosted app on inaayat.xyz |
|---|---|---|
| Shared team assignments (not localStorage) | No | Yes (Neon Postgres) |
| Editable Plan Builder / assumptions | Awkward (PRs or Excel) | First-class |
| Auth / role-based edit vs view | No (public to repo readers) | Neon Auth + app roles |
| Write scenarios, baselines, Non-Jira tasks | Files / SharePoint iframe | DB |
| Publish plan → Jira with audit trail | Manual | API job + ACL |
| Multi-user concurrent planning | Conflicts via Excel | Optimistic locking / scenarios |
| Webhooks / on-demand sync | Hourly cron only | Event + scheduled |

**Recommendation:** Keep the Pages build as a **read-only mirror** during transition if useful, but treat the hosted app as the planning system of record.

---

## 2. Target architecture (inaayat.xyz path proxy)

```
Browser  https://inaayat.xyz/one-more-column/
   │
   │  static + engine/*.js   ──rewrite──►  one-more-column.vercel.app/one-more-column/
   │  /api/auth-config       ──stays on──►  main inaayat.xyz project (shared Neon Auth URL)
   │  /api/omc-*             ──rewrite──►  one-more-column.vercel.app/api/omc-*
   │  /account.html?next=…   ──stays on──►  main site (same login as AMC A-Lister)
   ▼
Application API (Vercel serverless in this repo)
   AuthZ (Neon JWT) · Plan CRUD · Capacity compute · Sync orchestration
   │
   ├── Neon Postgres (SoR)
   ├── Job workers / cron (sync, publish, alerts, export)
   └── External adapters (Jira, RCM, PTO, calendar, …)
```

### 2.1 Why this does **not** complicate creation

Same-origin with `/amc-a-lister/` means the existing account page and `/api/auth-config` work without inventing Okta/OIDC. Work is mostly **copy/adapt** of proven files from `replacing-nerd-jobs`, plus a **small rewrite PR** on the main site.

| Piece | Source of truth / copy from |
|---|---|
| Client auth | `amc-a-lister/engine/auth.js` + `engine/neon-browser-auth.js` |
| Server JWT verify | `lib/neon-auth.js` + pattern from `api/me.js` |
| Path base | `<base href="/one-more-column/" />` (same idea as `/amc-a-lister/`) |
| API prefix | `/api/omc-*` (parallel to `alist-*`, `pc-*`) |
| Main rewrites | `replacing-nerd-jobs/vercel.json` |

**Alternative (simpler ops, still separate git repo):** add this repo as a **git submodule** at `one-more-column/` inside `replacing-nerd-jobs` — one Vercel project, shared env automatically; releases bump the submodule pointer. Prefer **rewrites** for independent deploys unless ops overhead dominates.

### 2.2 Recommended stack (opinionated — inaayat.xyz)

| Layer | Choice | Why |
|---|---|---|
| Hosting | Vercel project for this repo + path rewrites from main site | Matches packing-cubes / A-Lister ops model |
| API | Vercel serverless (`api/one-more-column.js`) | Same as `api/alist.js` / `api/packing-cubes.js` |
| DB | **Neon Postgres** (`DATABASE_URL`) | Already used by inaayat.xyz apps |
| Auth | **Neon Auth** (`NEON_AUTH_BASE_URL` + `jose` JWKS) | Same users as AMC A-Lister (`auth.sub`) |
| Frontend | Static HTML + ES modules under `/one-more-column/` | Lowest friction with `<base href>`; blank template tokens |
| Jobs | Vercel cron or queue later | Replace GHA hourly sync when ready |
| Files | Object storage or ephemeral download for Excel exports | Replace `dist/` commit |

**Do not** keep SQLite as the production SoR. SQLite is fine for local dev mirrors of Jira snapshots only.

Corporate Okta / ECS / Cloud Run from earlier drafts are **out of scope** for this personal-site deploy unless a separate enterprise mirror is required later.

### 2.3 What replaces the Pages pipeline

| Today (Pages) | Hosted (inaayat.xyz) |
|---|---|
| `sync.py` in GHA → `capacity.db` | Worker/API job → `jira_issues` tables |
| `generate.py` embeds all data in HTML/JS | `/api/omc-*` returns capacity matrices; UI renders |
| `patch_html.py` + `gh-pages` | Vercel deploy of this repo |
| `localStorage` team prefs | `user_preferences` + shared `resource.team` |
| `config.deactive_users.json` in git | Admin UI → `resources.active` |
| SharePoint Non-Jira iframe | `plan_items` with `source=manual` |
| “Refresh on GitHub” button | Authenticated **Sync now** → enqueues job |
| Public Pages URL | `inaayat.xyz/one-more-column/` + Neon Auth |

---

## 3. Authentication & authorization

### 3.1 Authn (Neon Auth — same as AMC A-Lister)

- Browser loads Neon Auth client URL from **`GET /api/auth-config`** on the **main** inaayat.xyz project (not the child).
- Login: `/account.html?next=/one-more-column/`
- Logout redirect: `/one-more-column/`
- API routes expect `Authorization: Bearer <JWT>`; verify with `lib/neon-auth.js` (`getAuth(req)` → payload or null).
- User id for joins: **`auth.sub`** — identical to AMC A-Lister / packing-cubes user ids when using the same Neon Auth project.

```
const auth = await getAuth(req);
if (!auth) return res.status(401).json({ error: 'Not signed in.' });
const userId = auth.sub;
```

### 3.2 Env vars

| Variable | Where | Notes |
|---|---|---|
| `NEON_AUTH_BASE_URL` | Main site (already) + **child** project | Child needs it for JWT verify on `/api/omc-*` and for preview deploys |
| `DATABASE_URL` | Main site (already) + **child** project | Child API needs DB when proxied or hit directly |

Neon Console: `inaayat.xyz` trusted domain already covers the path setup. Add `one-more-column.vercel.app` only if preview/direct child URLs matter.

### 3.3 Roles (start simple — app-layer on Neon identity)

| Role | Capabilities |
|---|---|
| **Viewer** | Read capacity, plan, alerts, navigator; export |
| **Planner** | Edit PlanItems, assumptions, Non-Jira tasks, scenarios; run what-if; request publish |
| **Publisher** | Approve & publish scenario → Jira; manage baselines |
| **Admin** | Policies, resources, deactive flags, provider credentials, field registry |

Map via allowlist / `user_roles` table keyed on Neon `sub` (default Viewer). IdP group claims are optional later.

### 3.4 Authz rules of thumb

- Reads: any authenticated role with app access.
- Writes to PlanItems / Policies: Planner+.
- Jira publish: Publisher+ (and always audited).
- Credential management (Jira token): Admin only; tokens in Vercel env / secrets manager, never in git.
- Row-level (optional later): filter by Control Group / team — not required for MVP.

### 3.5 Child + main vercel wiring

**Child (`one-more-column`) `vercel.json`:**

```json
{
  "framework": null,
  "outputDirectory": ".",
  "rewrites": [
    { "source": "/api/omc-:route", "destination": "/api/one-more-column?route=:route" }
  ]
}
```

**Main (`replacing-nerd-jobs`) additions:**

```json
{
  "source": "/one-more-column",
  "destination": "https://one-more-column.vercel.app/one-more-column"
},
{
  "source": "/one-more-column/:path*",
  "destination": "https://one-more-column.vercel.app/one-more-column/:path*"
},
{
  "source": "/api/omc-:route",
  "destination": "https://one-more-column.vercel.app/api/omc-:route"
}
```

Every HTML page in this app:

```html
<base href="/one-more-column/" />
```

---

## 4. Data model (database)

Align with the domain model in the main spec. Concrete tables:

### 4.1 Core

```
users                -- from Neon Auth (id = auth.sub, email, display_name)
roles / user_roles

planning_cycles      -- FY26 BP SOX, etc.
planning_policies    -- versioned JSON + typed columns for common knobs
assumptions          -- cycle_id, text, status, owner_user_id

resources            -- people: name, jira_account_id, team, active
resource_profiles    -- effective_from, weekly_hours OR daily_hours
resource_time_off    -- date range, hours, reason (PTO, holiday, wellness)

field_definitions    -- registry for extensible attributes
work_objects         -- controls / generic work masters (from RCM)
plan_items           -- spine rows (unique_key, phase, attributes JSONB, …)
plan_item_assignments
plan_item_dates
dependencies         -- from_id, to_id, type, status, meta JSONB
forecast_factors

scenarios            -- cycle_id, name, status (draft|active|published|archived)
scenario_overrides   -- sparse overrides on plan_items
baselines            -- frozen snapshot blob or normalized copy

hour_allocations     -- derived cache: person_id, week, hours, role, plan_item_id
```

### 4.2 Integration

```
providers            -- jira, rcm, manual, …
provider_credentials -- secret refs, not raw tokens
sync_runs            -- started_at, status, counts, error
jira_issues          -- key PK, raw JSONB, normalized columns, synced_at
jira_issue_links
jira_comments        -- optional normalized
jira_changelog       -- optional
publish_runs         -- scenario_id, actor, diff summary, status
audit_events         -- who/what/when for edits & publishes
```

### 4.3 Extensibility

- Put SOX-specific columns that change yearly into `plan_items.attributes` JSONB.
- Register each key in `field_definitions` (type, static|dynamic, source, validation).
- Capacity engine reads known keys + registered compute rules — **no migration for every new Excel column**.

---

## 5. API surface (illustrative — `omc-` prefix)

Exposed on inaayat.xyz as `/api/omc-:route` → child `/api/one-more-column?route=:route`.

```
GET    /api/auth-config          -- MAIN site only (do not reimplement on child for prod)

GET    /api/omc-me
GET    /api/omc-cycles
POST   /api/omc-cycles
GET    /api/omc-policy
PUT    /api/omc-policy

GET    /api/omc-plan-items?scenario=
PATCH  /api/omc-plan-items
POST   /api/omc-plan-items
POST   /api/omc-dependencies

GET    /api/omc-capacity?cycle=&scenario=&mode=due|spread&team=
GET    /api/omc-resources
PATCH  /api/omc-resources

GET    /api/omc-alerts
GET    /api/omc-jira-issues
POST   /api/omc-jira-jql-preview

POST   /api/omc-sync-jira
GET    /api/omc-sync-runs
POST   /api/omc-publish
GET    /api/omc-export-capacity

PATCH  /api/omc-preferences
```

All mutating routes require Bearer JWT (`getAuth`) and CSRF-equivalent discipline for cookie flows if any; AMC pattern uses Bearer from Neon client.

---

## 6. Application modules (replace monolith `generate.py`)

| Module | Responsibility |
|---|---|
| `engine/auth.js` | Neon session, login/logout links (AMC pattern) |
| `lib/neon-auth.js` | JWT verify for API |
| `providers.jira` | Discover fields, fetch issues, normalize |
| `engine.ready_to_test` | Excel ready-gate rules |
| `engine.dates` | Review +7/+21, phase thresholds |
| `engine.effort` | Review % / floor policies |
| `engine.availability` | Profiles − time off |
| `engine.capacity` | Due-week + spread allocation |
| `engine.alerts` | Configurable rules |
| `services.publish` | Diff scenario vs Jira; writeback |
| `services.export` | Excel workbook generation |
| `api/one-more-column.js` | HTTP router for `omc-*` |

**Opinion:** Port calculation functions first as pure modules (unit-tested). UI is a consumer, not the owner of math — unlike today where math is baked into HTML generation.

---

## 7. Frontend structure

Reuse the blank styling template tokens. Suggested routes under `/one-more-column/`:

| Route | Maps to today’s UI / future |
|---|---|
| `/` or `/capacity` | Overall / BP / IT / By Person |
| `/plan` | Plan Builder (All Up spine) |
| `/dependencies` | Readiness & dependency board |
| `/alerts` | Alerts |
| `/navigator` | Jira Navigator |
| `/cycle/settings` | Policies, assumptions, resources, calendars |
| `/admin` | Providers, field registry, users/roles |

**Preferences:** Store in DB (`user_preferences`), not only `localStorage`. Optional local cache for UI chrome is fine.

**Realtime (optional later):** SSE/WebSocket for sync job progress; not required for MVP.

---

## 8. Sync & publish flows

### 8.1 Jira → DB (inbound)

```
Scheduler / "Sync now"
  → acquire lease
  → discover field map
  → fetch configured parent initiative hierarchy
  → upsert jira_issues + links
  → optionally refresh comments
  → recompute hour_allocations for execution scenario
  → record sync_run
```

Cadence: hourly weekdays still fine; add webhook later for faster freshness.

### 8.2 Plan → Jira (outbound publish)

```
Publisher selects scenario
  → compute diff vs current Jira fields
  → show WP Changes–style review UI
  → confirm
  → write allowed fields
  → write audit_events + publish_run
  → refresh inbound sync
```

Conflict policy (recommend): **Jira wins on status/comments**; **scenario wins on planning fields** only when publishing. Mid-cycle edits in Jira after publish should surface as drift alerts.

---

## 9. Security & compliance notes

- Jira API tokens in Vercel env / secrets manager; rotate still every ~30 days unless switched to OAuth.
- Audit every publish and policy change (SOX planning evidence hygiene).
- Encrypt data in transit; Neon private networking as available.
- Export downloads authenticated.
- Do not embed secrets in frontend bundles.
- Least-privilege Jira bot user for writeback.
- Production auth-config always from main origin; child verifies JWTs with same `NEON_AUTH_BASE_URL`.

---

## 10. Migration path from Pages → hosted

### Phase H0 — Skeleton + Neon Auth

- Scaffold `/one-more-column/` static shell with blank template tokens + `<base href>`.
- Copy/adapt AMC auth client + `lib/neon-auth.js`; stub `/api/omc-me`.
- Wire main-site rewrites; verify login identity matches AMC A-Lister.
- Keep Pages live.

### Phase H1 — Shared config in DB

- Move deactive users, team membership, weekly/daily capacity into DB admin UI.
- Non-Jira tasks as manual `plan_items` included in capacity.
- Assumptions + policy knobs editable by Planners.
- Ingest Jira into Postgres (port `sync.py`).

### Phase H2 — Plan Builder

- Import All Up Plan into `plan_items`.
- Ready-to-test / review-due engines.
- Scenario draft vs Jira execution capacity toggle.

### Phase H3 — Publish & retire Pages authority

- Jira publish with diff UI.
- Pages becomes optional read-only mirror **or** is decommissioned.
- Excel All Up becomes export/import compatibility, not SoR.

### Cutover criteria

- Signed-in `auth.sub` matches AMC A-Lister for the same human.
- Capacity totals match Pages within rounding tolerance for 2 sync cycles (once L2 ported).
- At least one planning cycle phase planned primarily in Plan Builder.
- Publish dry-run reviewed by BP lead.
- App roles assigned for Viewer/Planner/Publisher/Admin.

---

## 11. What stays the same vs what changes

### Keep

- Domain layers L0 / L1 / L2 from the main spec  
- Design tokens / Mulish / split-grid UX for planning surfaces  
- Jira as execution system of record  
- Calculation semantics (35% review, spread rules) until policies override them  
- Excel export as a download, not the database  
- Neon Auth + account.html pattern from inaayat.xyz  

### Change

| Pages world | Hosted world |
|---|---|
| Static HTML generation | API + client render under `/one-more-column/` |
| Git as config SoR | Neon DB + admin UI |
| localStorage teams | Shared resources |
| GHA = runtime | GHA = CI; Vercel = runtime |
| Open Pages URL | Authenticated inaayat.xyz path |
| “Add alert” → GitHub issue | Alert rules stored & evaluated in-app |
| Hourly full HTML regen | Incremental data sync + on-demand compute/cache |

---

## 12. Local development (hosted)

```bash
# illustrative
cp .env.example .env   # NEON_AUTH_BASE_URL, DATABASE_URL
npm i
vercel dev             # or static server + `vercel dev` for api/
# open http://localhost:3000/one-more-column/
```

For local auth against production Neon Auth, follow the same approach as AMC A-Lister previews. Never commit `.env`.

---

## 13. Decision log (recommended defaults)

1. **Neon Postgres** over SQLite for production.  
2. **Neon Auth** (same as AMC A-Lister) before Plan Builder ships with real data.  
3. **Scenarios** before free-edit-on-live-plan (safer for SOX).  
4. **Publish is explicit** — no silent Jira writeback on every blur.  
5. **Pages can remain a mirror** for one cycle after H0, then sunset.  
6. **Same CSS tokens** as blank template / current dashboard — one visual product for planning UI.  
7. **Production path** `inaayat.xyz/one-more-column/` via main-site rewrites (preferred) or submodule.  
8. **API prefix** `omc-` to avoid clashing with `alist-` / `pc-`.  

---

## 14. Open questions specific to hosting

1. Shared Neon database with other inaayat.xyz apps vs dedicated DB/branch for OMC tables?  
2. App-role allowlist seed (who is Admin/Publisher on day one)?  
3. Is a GitHub Pages mirror still desired after the SSO/Neon app exists?  
4. Data retention for `jira_issues` raw JSON and audit logs?  
5. Add child preview URL (`one-more-column.vercel.app`) to Neon Auth trusted origins?  
6. Who owns on-call for sync failures (Enablement vs BP) when Jira sync lands?  

---

*When implementation starts, treat this document as the deployment/runtime architecture, [`../BUILD_PLAN.md`](../BUILD_PLAN.md) as sequencing, and the main specification as the product/domain bible. Keep all three in sync when decisions land.*
