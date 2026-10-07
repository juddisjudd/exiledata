# @exiledata/api

ExileData HTTP API, built on [Fastify](https://fastify.dev/). Live at `https://api.exiledata.dev`.

## Routes

Open:

- `GET /health`: liveness.
- `GET /status`: uptime, database reachability, whether the admin API is on, and which dataset
  storage the process resolved.
- `GET /admin`: the admin dashboard page. It holds no data until the admin token is entered.
- `GET /openapi.json`: the OpenAPI 3.1 document for the public routes, readable from any origin.
  Generated from the route schemas; the committed copy is `openapi.json` (`pnpm openapi`).

API key required (`x-api-key: exd_...` or `Authorization: Bearer exd_...`):

- `GET /v1/games`: supported games.
- `GET /v1/versions`: metadata of every published dataset, in patch order.
- `GET /v1/{game}/bases`: base items. `?version=0.5.5.4` picks a patch (default: newest),
  plus `?itemClass=`, `?limit=` (1 to 1000) and `?offset=`. `meta.gameVersion` says which patch
  answered.
- `GET /v1/{game}/items|mods|gems|skills`: `501 Not Implemented` until ingestion produces them.

`ADMIN_TOKEN` as a bearer token (503 while it is unset):

- `GET /admin/api/keys`: every key with 24-hour and 7-day request counts.
- `POST /admin/api/keys` `{ client, rateLimitPerMinute? }`: issues a key, creating the client if
  the name is new. The response carries the full key once.
- `PATCH /admin/api/keys/{id}` `{ rateLimitPerMinute }`: changes a limit.
- `POST /admin/api/keys/{id}/revoke`: revokes a key. Idempotent.
- `GET /admin/api/usage?hours=168`: hourly request and error counts per key.

Admin changes take effect at once. Wire types are in `@exiledata/types` (`admin.ts`).

## Errors

Every error body is `{ "error": "<code>", "message": "<text>" }`, including unknown routes
(`not_found`), failed query validation (`invalid_request`, 400) and server errors
(`internal_error`). Route schemas validate query parameters, so out-of-range `limit` or
`offset` values get 400. Codes on keyed routes:
`missing_api_key` and `invalid_api_key` (401), `rate_limited` (429, with `retry-after`).
Keyed responses carry `x-ratelimit-limit`, `x-ratelimit-remaining` and `x-ratelimit-reset`.

## Design notes

- Datasets are read from storage, never from upstream sources at request time. A parsed dataset
  stays cached until the storage listing reports a new ETag for it, so re-ingesting a patch
  shows up within the listing TTL (60 seconds) without a restart.
- Rate limits and the key lookup cache live in memory. That is correct for one process only.
- Usage counts are buffered and written every 10 seconds and on SIGTERM.

## Configuration

Required: `DATABASE_URL`, `API_KEY_SECRET`. Optional: `ADMIN_TOKEN` (32+ characters),
`DEFAULT_RATE_LIMIT_PER_MINUTE` (default 120), `API_PORT`, and the `DATASET_STORAGE_*` / `R2_*`
variables. See the root `.env.example`.

## Run locally

```
pnpm exiledata db migrate
pnpm dev:api
```
