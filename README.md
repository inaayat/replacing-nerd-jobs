## beep boop

served at [inaayat.xyz](https://inaayat.xyz).

## resources
### website inspo

- [zachjordan.io](https://www.zachjordan.io/#extras)
- [sumanthsamala.com](https://sumanthsamala.com/)

### free icons
- [Free Icons](https://www.reddit.com/r/web_design/comments/16pa3v6/websites_for_free_icon_sets/)
- [Flag Icons](https://flagpedia.net/download/api)
- [Circle Flags](https://kapowaz.github.io/circle-flags/)

### website color schemes
- [Website Color Schemes](https://visme.co/blog/website-color-schemes/)

## color scheme

| element | hex |
|---|---|
| background | `#F0EBF4` |
| cards | `#f9fafb` |
| nav | `#f267a0` |
| footer | `#1b1464` |

## structure

```
/
├── index.html                  ← v2 landing page (inaayat.xyz)
├── _template.html              ← copy this to start a new page
├── middleware.js               ← auth middleware (protects /private)
├── package.json
├── vercel.json
│
├── fonts/                      ← Atkinson Hyperlegible (regular + bold woff)
├── index support files/        ← legacy Astro build artifacts (unused)
│
├── api/                        ← serverless functions (Vercel)
│   ├── login.js
│   ├── logout.js
│   ├── football.js
│   └── save-quiz.js            ← publish/submit-for-review for Sporcle Spinoff
│
├── sporcle-spinoff/            ← trivia quiz platform (see below)
│
├── private/                    ← auth-gated section
│   └── gddy-statements/
│
├── ugly-dog-images/            ← the dogs
├── ugly-cat-images/            ← the cats
│
└── archive/                    ← retired v1 site (inaayat.xyz/archive)
    ├── index.html
    ├── assets/
    │   └── global.css
    ├── seattle-budget/
    ├── corp-ai-investment-roi/
    ├── fpa-crash-course/
    ├── how-to-be-a-finance-nerd/
    │   ├── apple-statements/
    │   └── target-statements/
    ├── tv-data/
    ├── world-cup/
    └── ai-governance-audit/
```

## adding a new page

1. `cp _template.html my-project/index.html`
2. link it from the main sidebar in `index.html`
3. `git push` — Vercel redeploys automatically, no build step

## sporcle spinoff

trivia quiz platform at [inaayat.xyz/sporcle-spinoff](https://inaayat.xyz/sporcle-spinoff). One shared engine, one renderer module per interaction type, everything driven by JSON — adding a quiz never requires new code.

**quiz types:** multiple-choice, text-entry (fill-in-the-blank / "name all N" completionist mode), image, matching, ranking, map (click a region), map-highlight (name the highlighted region).

**adding a quiz:**
- via the builder (`/sporcle-spinoff/builder.html`) — pick a template, fill in questions and optional tags, then publish (site owner) or submit for review, which opens a GitHub PR (`api/save-quiz.js`)
- by hand — add `sporcle-spinoff/quizzes/<id>.json` plus a matching entry in `quizzes/index.json`, then open a PR

**tags:** freeform, comma-separated (e.g. `"tags": ["Geography", "Pop Culture"]`), searchable from the catalog's search bar. Anyone can suggest a tag straight from a quiz's page ("+ suggest a tag") — same publish/PR-review duality as adding a quiz, but as a small surgical patch rather than a full quiz rewrite.

```
sporcle-spinoff/
├── index.html          ← catalog: search bar + quizzes grouped by type
├── play.html            ← generic quiz player shell
├── builder.html           ← quiz creation form
├── engine/
│   ├── engine.js            ← player: start screen, HUD, timer, score, results
│   ├── builder.js             ← builder logic (template picker, publish/submit)
│   ├── normalize.js             ← typed-answer matching (accents/punctuation-insensitive)
│   ├── types/*.js                ← one player-side renderer per quiz type
│   └── editors/*.js               ← one builder-side editor per quiz type
└── quizzes/
    ├── index.json                 ← catalog manifest (id/title/type/blurb/tags)
    └── <id>.json                  ← one full quiz per file
```

## auth & database

user accounts run on [Clerk](https://clerk.com) (sign-in/sign-up/sessions) and
structured user data lives in [Neon](https://neon.tech) Postgres. this is
separate from the `SITE_PASSWORD` gate on `/private/` — that stays as the
owner-only lock, while Clerk is real multi-user login for visitor-facing
features.

pieces:

```
account.html          ← sign-in / account page (linked from the main nav)
auth-config.js        ← holds the Clerk publishable key (public, committed)
lib/clerk.js          ← verifies `Authorization: Bearer <token>` in api routes
lib/db.js             ← Neon client + schema (CREATE TABLE IF NOT EXISTS)
api/me.js             ← example authed route: upserts + returns the user's row
```

one-time setup:

1. **Clerk** — create an app at [dashboard.clerk.com](https://dashboard.clerk.com)
   (enable whichever sign-in methods you like). from **API Keys**:
   - paste the **publishable key** (`pk_...`) into `auth-config.js`
   - add the **secret key** as `CLERK_SECRET_KEY` in Vercel → Settings →
     Environment Variables
2. **Neon** — create a database (easiest: Vercel → Storage → Create → Neon,
   which sets `DATABASE_URL` automatically; or create at neon.tech and add
   `DATABASE_URL` yourself). no migration step — tables create themselves on
   first request (see `ensureSchema()` in `lib/db.js`).
3. redeploy. `/account.html` now signs users in, and each visit upserts the
   user into the `users` table.

adding logged-in features later: put new tables in `ensureSchema()`, key them
on `users.id` (the Clerk user id), and copy the `getAuth(req)` check from
`api/me.js` into any new api route.

## deploy

connected to Vercel. push to `main`. done. beep boop.
