# @exiledata/docs

The documentation site at https://docs.exiledata.dev. A small build step renders it to static
HTML in `dist/site`, which Cloudflare serves as static assets. There is no Worker script.

## Sources

- `content/*.md`: the written pages. The first `# heading` is the page title, and `##`
  headings appear under the page in the sidebar. Link between pages as `./page.md`.
- `src/nav.ts`: page order and sidebar groups. A page missing from it fails the build.
- `apps/api/openapi.json`: the API reference page (`/api`) is generated from it, and it is
  published at `/openapi.json`. Regenerate it with `pnpm openapi` after changing API routes.
- `apps/web/public/index.html`: the header and footer are copied from it, so they match the
  landing page exactly. The docs mark the current section in the header.
- `apps/web/public/base.css` and `apps/web/public/assets/fonts/`: shared with the landing page,
  so both sites keep the same tokens and fonts. `public/docs.css` adds the docs layout, which uses
  the same 960px column as the landing page.
- `src/downloads.ts`: the file browser on `/downloads`, which replaces the
  `<!-- downloads-browser -->` marker in `content/downloads.md`. It runs in the browser and reads
  `https://data.exiledata.dev/index.json` and each patch's manifest, so a newly published patch
  shows up without a docs deploy.
- `src/og.ts`: link preview cards. The build renders a 1200x630 PNG per page into `og/` with
  [Takumi](https://takumi.kane.tw), from the page title and its first paragraph, and points the
  page's Open Graph and Twitter tags at it. It also renders `og/landing.png` for exiledata.dev from
  the landing hero, because the landing page has no build step.

## Commands

```
pnpm --filter @exiledata/docs dev     # build, serve on http://localhost:4100, rebuild on change
pnpm --filter @exiledata/docs build   # write dist/site
```

`tests/docs-site.test.ts` builds the site and fails on broken internal links or anchors, on an
API path missing from the reference, and on error codes that differ from what the API sends.

Deploys run from `.github/workflows/deploy.yml` on pushes to `main` that touch `apps/docs/`,
`apps/web/` or `apps/api/openapi.json`.
