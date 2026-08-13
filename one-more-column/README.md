# one-more-column

because Final_FINAL_Plan wasn’t enough.

A **flexible capacity planner** for teams that have outgrown multi-sheet workbooks. Define the kinds of work you do, list the work, assign people, track dependency gates, and see who is overloaded — week by week or month by month.

**Live:** [https://inaayat.xyz/one-more-column/](https://inaayat.xyz/one-more-column/)  
**License:** [MIT](./LICENSE)

---

## What it does

| Area | Capability |
|---|---|
| **Plans & workspaces** | Isolated workspaces, each with its own team and planning cycles (annual / quarter / sprint) |
| **Task types** | Custom work catalogs with per-type fields and gate templates |
| **Planner** | Spreadsheet-style plan items with assignees, hours, due dates, autosave, and optimistic concurrency |
| **Dependencies** | Gates that block ready-to-start (input ready, handoff, review lag, phase milestones, …) |
| **Capacity** | Per-person load vs availability with PTO, overload bands, week/month views, due vs spread modes |
| **Team** | People, roles/teams, weekly capacity profiles, and time off |
| **Import / export** | Paste CSV to preview + commit; export plan or capacity CSV; drift compare against last import |
| **Versions** | Draft / live scenarios so you can try a plan without overwriting the live one |

**v1 input model:** the app is the source of record. Enter data in the UI, or upload CSV when you want. There is **no** live pull from Jira, HR, or other systems yet.

---

## Quick start

Lives in the parent [replacing-nerd-jobs](https://github.com/inaayat/replacing-nerd-jobs) repo. From the repo root:

```bash
npm install
# For API routes: vercel dev (needs Neon secrets)
# UI-only: python3 -m http.server 8080  →  http://127.0.0.1:8080/one-more-column/
node scripts/test-omc.mjs
```

Sign in via [inaayat.xyz/account.html](https://inaayat.xyz/account.html?next=/one-more-column/).

---

## Environment

Copy [`.env.example`](./.env.example):

| Variable | Purpose |
|---|---|
| `NEON_AUTH_BASE_URL` | Neon Auth issuer / JWKS base (shared with inaayat.xyz) |
| `DATABASE_URL` | Neon Postgres connection string (pooled URL is fine) |

Never commit `.env`. Production auth-config for the public site is served by the parent `inaayat.xyz` project; locally this repo exposes its own `/api/auth-config` so you can develop without that sibling app running.

---

## How the app is organized

Hash-routed single page. `engine/app.js` owns state and events; views are pure functions of state.

```
one-more-column/
├── index.html              # Shell; <base href="/one-more-column/" />
├── icon.svg
├── engine/                 # Browser SPA
│   ├── app.js              # State, loaders, autosave, event wiring, render()
│   ├── views.js            # Page bodies (planner, capacity, team, …)
│   ├── wizard.js           # Guided plan creation
│   ├── shell.js            # Sidebar, toasts, modals, section patches
│   ├── setup.js            # Routes, onboarding progress, nav
│   ├── patches.js          # Diff payloads for autosave
│   ├── api.js              # Typed fetch wrappers
│   ├── auth.js             # Neon Auth session
│   └── app.css             # Only stylesheet
├── engines/                # Pure calculation (Node-testable)
│   ├── capacity.js         # Load matrix + capacity grid
│   ├── availability.js     # Weekly capacity with PTO
│   ├── effort.js           # Review-hour derivation
│   ├── date_policy.js      # Business/calendar day math, gate chains
│   ├── ready_to_start.js   # Blocked vs ready from open gates
│   ├── period_*.js         # Week labels + month rollups
│   └── alerts.js           # Overload / proximity / gate signals (API only)
├── lib/                    # Server helpers + route handlers
│   ├── db.js               # Neon client + ensureSchema()
│   ├── neon-auth.js        # JWT verification
│   ├── capacity-build.js   # Assembles capacity response
│   ├── csv.js / export-csv.js
│   └── handlers/           # One module per omc-* resource
├── schemas/                # Policy JSON Schema (+ archived field sketch)
├── templates/              # Design-token / component reference HTML
├── ideation/               # Historical Phase 0 specs (see below)
├── BUILD_PLAN.md           # Phased delivery history
└── FOLLOW_UPS.md           # Known gaps worth tackling next
```

### Pages (hash routes)

| Route | Purpose |
|---|---|
| `#/plans` | Create / open / delete plans and workspaces; guided wizard |
| `#/task-types` | Shape the work catalog (fields + gate templates) |
| `#/planner` | Edit work, gates, import/export |
| `#/team` | People, capacity profiles, PTO |
| `#/capacity` | Load grid + planning rules |
| `#/guide` | In-app how-it-works |

Legacy hashes (`home`, `settings`, `preferences`, `rules`, `dependencies`, `alerts`, …) still resolve via `LEGACY_ROUTES` in [`engine/setup.js`](./engine/setup.js).

Onboarding order: **plan → task types → work → team → capacity**.

### Visual language

Shared with inaayat.xyz: cream page, Fraunces display, DM Mono labels, teal sidebar. Token reference: [`templates/blank-styling-template.html`](./templates/blank-styling-template.html).

---

## Data model (Postgres)

Schema is created/migrated lazily by `ensureSchema()` in [`lib/db.js`](./lib/db.js) on first authenticated API call.

| Table | Role |
|---|---|
| `users` | Neon Auth subjects (`sub`) mirrored on first `/api/omc-me` |
| `workspaces` | Top-level isolation (resource pools + cycles) |
| `planning_cycles` | A named plan inside a workspace |
| `planning_policies` | Versioned JSON knobs (capacity defaults, bands, review ratio, …) |
| `scenarios` | Draft / live versions of a plan |
| `resources` + `resource_profiles` + `resource_time_off` | Team, hours, PTO |
| `task_types` + `task_type_fields` + `gate_templates` | Work catalog |
| `plan_items` | Rows of work (`attributes` JSONB for custom fields) |
| `dependencies` | Gates between / on plan items |
| `plan_changelog` | Audit-ish summaries of edits |
| `import_snapshots` | Last-import baseline for drift |
| `assumptions` | **Legacy** — UI removed; open gates replaced free-form notes |
| `field_definitions` | **Legacy** — superseded by `task_type_fields` |

---

## API

All routes are rewritten to `api/one-more-column.js?route=…` via the parent [`vercel.json`](../vercel.json).

Prefix: **`/api/omc-<route>`**. Mutating routes require a Bearer JWT from Neon Auth.

| Route | Methods | Notes |
|---|---|---|
| `me` | GET | Upsert user; smoke-test auth + DB |
| `workspaces` | GET, POST, PATCH, DELETE | PATCH renames |
| `cycles` | GET, POST, PATCH, DELETE | Requires `?workspace=`; PATCH renames |
| `scenarios` | GET, POST, PATCH, DELETE | Draft/live versions |
| `policy` | GET, PUT | Latest policy config for a cycle |
| `resources` | GET, POST, PATCH, DELETE | Workspace-scoped |
| `time-off` | POST, DELETE | |
| `task-types` | GET, POST, PATCH, DELETE | Includes fields + gate templates |
| `plan-items` | GET, POST, PATCH, DELETE | Optimistic concurrency via `updated_at` |
| `dependencies` | GET, POST, PATCH, DELETE | Same concurrency pattern |
| `capacity` | GET | Computed grid (`mode`, `granularity` = day/week/month, optional `team`) |
| `import` | POST | Preview or `confirm: true` commit |
| `export` | GET | Plan / capacity CSV, or JSON drift |
| `changelog` | GET | Recent plan changes |
| `alerts` | GET | Computed signals (no SPA UI yet) |
| `assumptions` | * | Legacy; prefer Planner gates |

Workspace-scoped list endpoints take `?workspace=<id>`. Cycle-scoped ones take `?cycle=<id>`.

---

## Deployment

Ships as part of the parent **inaayat.xyz** Vercel project (`replacing-nerd-jobs`):

- Static files + `engine/*` at `/one-more-column/`
- `/api/omc-*` → `api/one-more-column.js?route=…`
- `/api/auth-config` and `/account.html` → parent site (shared Neon Auth)

This app sets `<base href="/one-more-column/" />` so asset URLs stay correct behind the path prefix. Server modules under `one-more-column/lib/` are 404'd by parent `middleware.js`.

**Auth:** same `NEON_AUTH_BASE_URL` and `DATABASE_URL` as other inaayat.xyz apps. Login:
`https://inaayat.xyz/account.html?next=/one-more-column/`

---

## Testing

```bash
node scripts/test-omc.mjs
```

Coverage today is **unit-level pure functions**:

- Capacity / effort / date / readiness / period rollup (`engines/*.test.js`)
- View rendering, routing gates, escaping (`engine/views.test.js`)
- Autosave patch shapes (`engine/patches.test.js`)
- CSV parse / coerce (`lib/csv.test.js`)
- API helpers (`lib/api-helpers.test.js`)

There is not yet end-to-end coverage of event wiring or autosave — see [`FOLLOW_UPS.md`](./FOLLOW_UPS.md) §11.

---

## Docs map

| Doc | Status | Use for |
|---|---|---|
| **This README** | Current | Overview, setup, architecture, API |
| [`FOLLOW_UPS.md`](./FOLLOW_UPS.md) | Current | Known gaps and next worthwhile changes |
| [`BUILD_PLAN.md`](./BUILD_PLAN.md) | Historical delivery plan | How H0–H3 / C1–C4 landed; still useful context |
| [`ideation/`](./ideation/) | Archived Phase 0 | Early domain + hosting notes; some SOX-era language remains |
| [`templates/blank-styling-template.html`](./templates/blank-styling-template.html) | Current | Design tokens / chrome reference |

When docs disagree, **prefer the running code and this README**.

---

## Product status (short)

| Phase | Status |
|---|---|
| H0 Skeleton + Neon Auth | Done |
| H1 Postgres SoR | Done |
| H1.5 Workspaces | Done |
| H2 Plan Builder, scenarios, CSV import | Done |
| C2 Dependencies + readiness | Done (core) |
| C1 Capacity hardening (bands, PTO, effort) | Done |
| H3 / C4 Export, alerts engine, import drift | Done (Alerts **UI** archived) |
| UX1 Guided setup + sidebar shell | Done |
| P1 Extra planning profiles / P2 external pull | Later |

Details and open UX/tech debt: [`FOLLOW_UPS.md`](./FOLLOW_UPS.md).

---

## Contributing

1. Branch from `main`.
2. Keep UI changes aligned with `templates/blank-styling-template.html` and `engine/app.css`.
3. Prefer pure functions in `engines/` (easy to unit test) over logic buried in handlers or the SPA.
4. New interactive controls inside a `data-section` must use the delegated click handler in `engine/app.js` — section repaints drop per-node listeners.
5. Run `npm test` before opening a PR.

---

## License

[MIT](./LICENSE) © 2026 inaayat
