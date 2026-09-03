# @exiledata/api

Initial ExileData HTTP API application, built on [Fastify](https://fastify.dev/).

## Status

Architecture-only for most routes. Implemented:

- `GET /health`, `GET /status` — liveness/status.
- `GET /v1/games` — static list of supported games.
- `GET /v1/versions` — dataset metadata list (currently empty; no dataset generated yet).
- `GET /v1/{game}/items|bases|mods|gems|skills` — stubs returning `501 Not Implemented`.

## Design notes

- The API is versioned by URL prefix (`/v1/...`) and, within that, by dataset version (see
  `GET /v1/versions` and `DatasetMetadata` in `@exiledata/schema`). The latest dataset is never
  assumed to be immutable — clients should be able to pin a dataset version once that's wired up.
- `src/plugins/auth.ts` establishes where API-key authentication will be enforced. It currently
  reads the `x-api-key` header but does not yet reject requests — real key storage/validation
  depends on the PostgreSQL schema in `/migrations`.
- Route handlers never call upstream sources (RePoE/PoEDB) directly or at request time; they will
  read from generated datasets/storage once ingestion exists.

## Run locally

```
pnpm --filter @exiledata/api dev
```
