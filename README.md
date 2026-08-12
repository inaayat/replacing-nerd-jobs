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
├── plot-points/                ← TMDB cinema query explorer (questions + provenance)
│   ├── index.html                  ← question composer, question gallery, query builder
│   ├── query-engine.js              ← shared field catalog + pivot engine (browser AND api/)
│   └── questions.json                ← question templates + Surprise me seeds (data-only edits)
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

user accounts run on [Neon Auth](https://neon.com/docs/auth/overview)
(email/password sign-in, built on Better Auth) and structured user data lives
in the same [Neon](https://neon.tech) Postgres database. this is separate
from the `SITE_PASSWORD` gate on `/private/` — that stays as the owner-only
lock, while Neon Auth is real multi-user login for visitor-facing features.

both come from one Vercel integration: Vercel → project → Storage → the Neon
integration provisions the database *and* a Neon Auth instance together, and
sets all the env vars below automatically.

pieces:

```
account.html           ← sign-in / sign-up / account page (linked from the main nav)
api/auth-config.js      ← hands the Neon Auth base URL to the browser at request time
lib/neon-auth.js          ← verifies `Authorization: Bearer <token>` (a JWT) in api routes
lib/db.js                   ← Neon client + schema (CREATE TABLE IF NOT EXISTS)
api/me.js                    ← example authed route: upserts + returns the user's row
```

the browser talks to Neon Auth directly (`@neondatabase/auth`, loaded from
esm.sh since this site has no build step) for sign-in/sign-up/sign-out and to
fetch a session JWT; that JWT is sent to our own `/api/*` routes as a Bearer
token and verified statelessly against Neon Auth's public JWKS — no server
round-trip to Neon Auth per request, and no extra API call needed for
email/name since the JWT payload already carries the full user record.

there is no setup step. Vercel's Neon integration already provisions the
database and a Neon Auth instance together and sets `NEON_AUTH_BASE_URL` /
`DATABASE_URL` — `api/auth-config.js` reads that env var and hands it to
`account.html` at request time, so nothing needs to be pasted into a
committed file. `/account.html` works as soon as those env vars exist.

adding logged-in features later: put new tables in `ensureSchema()`, key them
on `users.id` (the Neon Auth user id, the JWT's `sub` claim), and copy the
`getAuth(req)` check from `api/me.js` into any new api route.

## deploy

connected to Vercel. push to `main`. done. beep boop.
