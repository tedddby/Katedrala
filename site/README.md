# Katedrala website

The Katedrala landing page: a single static page built with Next.js and exported as plain HTML, CSS and
JavaScript. It is its own pnpm workspace and does not depend on the engine packages.

## Develop

```bash
cd site
pnpm install
pnpm dev          # http://localhost:3000
pnpm typecheck
```

## Build and preview

```bash
pnpm build        # writes the static site to out/
pnpm serve        # serves out/ at http://localhost:3000 (pass a port to change it)
```

## Deploy

`out/` is self-contained and works on any static host (GitHub Pages, Netlify, Cloudflare Pages, Vercel, an
S3 bucket). Pages are exported as directories with an `index.html` (`trailingSlash: true`), and `404.html` is
the not-found page.

## Content rules

- **No invented numbers.** Every value on the page is either computed from the demonstration system in
  `lib/demo/` or is real Katedrala output, kept in `lib/site.ts` (`CODEVERSE_ANALYSIS`, `REAL_EDGE`). After
  re-running the analysis on CodeVerse, update those two constants.
- **Honest status.** Every capability carries a status mark: available today, in development for v1, or
  planned after v1. `MILESTONES` in `lib/site.ts` mirrors `docs/ROADMAP.md`; update both together.
- **Links** to the repository live in `lib/site.ts`.
- **Design system.** The visual language (Load Path) is recorded in `DESIGN.md`, and the direction it came
  from is in `.impeccable/`.
