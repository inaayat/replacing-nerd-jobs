## beep boop

served at [inaayat.xyz](https://inaayat.xyz).

## website inspo

- [zachjordan.io](https://www.zachjordan.io/#extras)
- [sumanthsamala.com](https://sumanthsamala.com/)

## free icons
- [Free Icons](https://www.reddit.com/r/web_design/comments/16pa3v6/websites_for_free_icon_sets/)
- [Flag Icons](https://flagpedia.net/download/api)

## website color schemes
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

## deploy

connected to Vercel. push to `main`. done. beep boop.
