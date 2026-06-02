# replacing-nerd-jobs

Personal project portfolio — static HTML projects served via Vercel.

## Structure

```
/
├── index.html          # Portfolio homepage
├── seattle-budget/     # Seattle Open Budget dashboard
│   └── index.html
├── <next-project>/     # Add new projects as subdirectories
│   └── index.html
└── vercel.json
```

Each project lives at its own path (e.g. `/seattle-budget`). The root `index.html` is the portfolio landing page.

## Adding a new project

1. Create a new directory: `mkdir my-project`
2. Add an `index.html` inside it
3. Add a card to the root `index.html` pointing to `/my-project`
4. Commit and push — Vercel redeploys automatically

## Deploy

Connected to Vercel. Push to `main` triggers a new deployment.
No build step required — Vercel serves static files directly.
