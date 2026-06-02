# replacing nerd jobs

beep boop.

a collection of static dashboards and data tools — built by a human, for now — served at whatever subdomain makes sense.

## the dogs

six ugly dogs live in `/ugly-dog-images/`. they are used as icons, decorations, favicons, and general emotional support throughout the site. do not remove them. they are load-bearing.

```
ugly-dog-images/
├── dog-1.png  ← also an icon
├── dog-2.png  ← also an icon
├── dog-3.png  ← favicon (the chosen one)
├── dog-4.png  ← also an icon
├── dog-5.png  ← also an icon
└── dog-6.png  ← also an icon
```

## structure

```
/
├── index.html           ← main site (from inaayat.xyz, hydrated here)
├── site.css             ← shared styles for all sub-pages
├── _template.html       ← copy this to start a new page
├── ugly-dog-images/     ← the dogs
├── seattle-budget/      ← seattle open budget dashboard
│   └── index.html
└── vercel.json
```

## adding a new page

1. `cp _template.html my-project/index.html`
2. link it somewhere from the main sidebar
3. `git push` — vercel redeploys automatically, no build step

## deploy

connected to vercel. push to `main`. done. beep boop.
