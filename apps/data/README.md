# @exiledata/data

The download server at https://data.exiledata.dev. A Cloudflare Worker that serves published
patches from the `exiledata-datasets` R2 bucket, with no API key and no rate limit. The page
people browse is https://docs.exiledata.dev/downloads.

## What it serves

It reads only objects under `downloads/` in the bucket. The private datasets the API reads from
the same bucket stay unreachable, and a test checks that path tricks cannot reach them.

| Address                        | Response                                              |
| ------------------------------ | ----------------------------------------------------- |
| `/`                            | Redirect to the Downloads page in the docs            |
| `/index.json`                  | Every published patch, per game                       |
| `/{game}/{patch}/{file}`       | The file, cached for a year as immutable              |
| `/{game}/latest/{file}`        | 302 to the same file in the newest patch              |
| `/{game}/`, `/{game}/{patch}/` | Redirect to the Downloads page at that game and patch |

Every response allows any origin. File responses support `Range`, `If-None-Match` and `HEAD`,
and carry the patch in `x-exiledata-patch`. Whole-file GETs are kept in the Cloudflare edge
cache, so repeated downloads do not read R2.

## Publishing

The Worker never writes. `pnpm exiledata downloads publish` uploads a patch's files, its
`manifest.json` and zips, and then updates `downloads/index.json`. See `packages/cli/README.md`.

A published file is served as immutable, so browsers and the edge may keep it for a year.
Republishing a patch with `--overwrite` does not reach those copies; publish a fix as a new
patch instead where you can.

## Commands

```
pnpm --filter @exiledata/data cf:dev   # wrangler dev, against a local R2 bucket
pnpm --filter @exiledata/data deploy   # wrangler deploy
```

Deploys run from `.github/workflows/deploy.yml` on pushes to `main` that touch `apps/data/`.
The custom domain was attached once with `wrangler deploy --domain data.exiledata.dev`;
`wrangler.jsonc` declares no routes, so deploys leave it alone. Tests are in
`tests/data-worker.test.ts`.
