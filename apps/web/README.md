# @exiledata/web

The landing page at https://exiledata.dev. Static files in `public/`, served by a Workers static
assets binding in production and by `src/server.ts` locally. No framework and no build step for
the page itself.

The design follows https://pobredux.com: its color tokens (with a light theme through
`prefers-color-scheme`), Geist and Geist Mono self-hosted from `public/assets/fonts/`, uppercase
labels and hairline sections. `public/style.css` is shared by `index.html` and `404.html`. The
admin dashboard in `apps/api/public/admin.html` uses the same tokens.

Run locally: `pnpm --filter @exiledata/web dev` (http://localhost:4000).
