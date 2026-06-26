# replacing nerd jobs

beep boop.

a collection of static dashboards and data tools — built by a human, for now — served at [inaayat.xyz](https://inaayat.xyz).

## the animals

six ugly dogs in `/ugly-dog-images/` and six ugly cats in `/ugly-cat-images/`. they are used as icons, decorations, favicons, and general emotional support throughout the site. do not remove them. they are load-bearing.

```
ugly-dog-images/
├── dog-1.png  ← icon
├── dog-2.png  ← icon
├── dog-3.png  ← favicon (the chosen one)
├── dog-4.png  ← icon
├── dog-5.png  ← icon
└── dog-6.png  ← icon

ugly-cat-images/
└── cat-1.png … cat-6.png
```

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
│   └── football.js
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

## auth / private routes

`middleware.js` intercepts requests to `/private/*` and `/api/gddy-statements/*`. Login/logout are handled by the serverless functions in `/api/`.

## website inspo & resources

- [zachjordan.io](https://www.zachjordan.io/#extras)
- [sumanthsamala.com](https://sumanthsamala.com/)
- [Free Icons Reddit Listing] https://www.reddit.com/r/web_design/comments/16pa3v6/websites_for_free_icon_sets/

## deploy

connected to Vercel. push to `main`. done. beep boop.
