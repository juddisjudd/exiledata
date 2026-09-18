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

## Themes

System (the default), Light and Dark, chosen from the switch in the shared header.

- Every color token in `public/base.css` is `light-dark(light, dark)`. With no `data-theme` on
  `<html>` the page follows the OS; `data-theme="light"` or `"dark"` forces one.
- The light theme is designed on its own terms, not the dark one flipped: white surfaces raised
  above a tinted page with a soft shadow, white table bodies, an ink primary button. The admin
  usage grid is blue in light and white in dark (`--heat`).
- The choice is stored in the `exiledata_theme` cookie on `.exiledata.dev`, so it carries between
  the landing page, the docs and the admin panel. System means no cookie. An inline script in each
  page's `<head>` applies it before first paint; `public/theme.js` handles the switch and is
  copied into the docs. The admin page (`apps/api/public/admin.html`) keeps its own copy of the
  tokens and script because it is served by the API under its own CSP.
- `tests/theme.test.ts` fails if the dark palette changes, if light surfaces stop sitting above
  the page, or if light text contrast drops below its floors.

## Link preview

The card at https://docs.exiledata.dev/og/landing.png is rendered by the docs build from the
hero heading and lede in `public/index.html`, so it changes when they do. The deploy workflow
redeploys the docs whenever this app changes.

Run locally: `pnpm --filter @exiledata/web dev` (http://localhost:4000).
