# @exiledata/web

The landing page at https://exiledata.dev. Static files in `public/`, served by a Workers static
assets binding in production and by `src/server.ts` locally. No framework and no build step for
the page itself.

The design follows https://pobredux.com: its color tokens (with a light theme through
`prefers-color-scheme`), Geist and Geist Mono self-hosted from `public/assets/fonts/`, uppercase
labels and hairline sections. The admin dashboard in `apps/api/public/admin.html` uses the same
tokens.

## Shared with the docs

The landing page and docs.exiledata.dev look like one site, and three things keep it that way:

- **Header and footer.** `public/index.html` is their only source. The docs build copies both
  blocks from it, and `public/404.html` repeats them; `tests/docs-site.test.ts` fails if either
  copy drifts. Links in them are absolute (`https://docs.exiledata.dev/...`) so they work from
  both sites.
- **`public/base.css`.** Tokens, title bar, buttons and footer. The docs build copies it;
  `public/style.css` holds landing-only layout.
- **Fonts.** Both sites load them from `https://exiledata.dev/assets/fonts/`, so the docs reuse
  the copy the browser cached on the landing page and text does not re-flow on the way over.
  `public/_headers` adds the CORS header that cross-origin font loading needs, and a year of
  caching; give a changed font file a new name. Each site's own copy is the fallback.

Run locally: `pnpm --filter @exiledata/web dev` (http://localhost:4000).
