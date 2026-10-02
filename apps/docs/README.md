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
  the same 960px column as the landing page. A page marked `wide` in `src/nav.ts` widens the
  column, header and footer to 1320px so its diagram stays legible.
- `src/downloads.ts`: the file browser on `/downloads`, which replaces the
  `<!-- downloads-browser -->` marker in `content/downloads.md`. It runs in the browser and reads
  `https://data.exiledata.dev/index.json` and each patch's manifest, so a newly published patch
  shows up without a docs deploy.
- `src/file-map.ts`: the diagrams and worked examples on `/file-map`, which replace the
  `<!-- file-map poe2 -->` and `<!-- file-map poe1 -->` markers in `content/file-map.md`. The
  diagrams are drawn as SVG at build time; `public/file-map.js` adds selection and the detail
  panel. Their data is `data/file-map.json`, written by `pnpm --filter @exiledata/docs file-map`
  from the newest published patch of each game. `src/file-map-data.ts` lists every link it checks
  and the records the worked examples use; a patch that drops one of those records fails the
  command with a message naming it. A file the layout in `src/file-map.ts` has no place for fails
  the build. Run the command after a patch adds or removes files.
- `public/tooltip/`: draws the worked examples' tooltips on a canvas. `renderer.js` is based on
  [poe2-item-canvas-renderer](https://github.com/marconett/poe2-item-canvas-renderer) (MIT). The
  header and separator images are the game's 4K `ItemsHeader*` and `ItemsSeparator*` sprites,
  cropped by their `Art/UIImages1.txt` entries, and `fontin-smallcaps.ttf` is the game's
  `Art/2DArt/Fonts/fontin-smallcaps.ttf`; all of them belong to Grinding Gear Games. To refresh
  them, export `Art/Textures/Interface/2D/2DArt/UIImages/InGame/4K` for each game with
  `ggpk-explorer export … --textures png` and crop the same sprites.
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
