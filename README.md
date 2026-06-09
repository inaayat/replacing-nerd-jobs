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
├── index.html                  ← main landing page (inaayat.xyz)
├── site.css                    ← shared styles for all sub-pages
├── _template.html              ← copy this to start a new page
├── middleware.js               ← auth middleware (protects /private)
├── package.json
├── vercel.json
│
├── fonts/                      ← Atkinson Hyperlegible (regular + bold woff)
├── index support files/        ← build artifacts for the index page
│
├── api/                        ← serverless functions (Vercel)
│   ├── login.js
│   ├── logout.js
│   ├── gddy-statements/        ← GoDaddy financial statements endpoint
│   └── index.html
│
├── private/                    ← auth-gated section
│   └── index.html
│
├── ugly-dog-images/            ← the dogs
├── ugly-cat-images/            ← the cats
│
├── seattle-budget/             ← Seattle open budget dashboard
│   └── index.html
│
├── corp-ai-investment-roi/     ← corporate AI adoption & ROI explorer
│   ├── index.html
│   └── corporate_ai_adoption_dataset.csv
│
├── fpa-crash-course/           ← FP&A crash course
│   ├── index.html
│   ├── apple-statements/
│   └── target-statements/
│
├── how-to-be-a-finance-nerd/   ← finance nerd guide
│   └── index.html
│
├── tv-data/                    ← TV market data explorer
│   ├── index.html
│   ├── data.json
│   ├── insights.json
│   └── tvs.csv
│
└── world-cup/                  ← FIFA Men's World Cup 2026 schedule
    ├── index.html
    └── FIFA Men's World Cup 2026 Sortable Schedule.csv
```

## adding a new page

1. `cp _template.html my-project/index.html`
2. link it from the main sidebar in `index.html`
3. `git push` — Vercel redeploys automatically, no build step

## auth / private routes

`middleware.js` intercepts requests to `/private/*` and `/api/gddy-statements/*`. Login/logout are handled by the serverless functions in `/api/`.

## deploy

connected to Vercel. push to `main`. done. beep boop.
