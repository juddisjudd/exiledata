# Authentication

Every `/v1` endpoint needs an API key. Each key has its own rate limit, and responses tell you how much of it is left.

## Sending your key

Send the key in the `x-api-key` header:

```sh
$ curl -H "x-api-key: $EXILEDATA_KEY" "https://api.exiledata.dev/v1/games"
```

`Authorization: Bearer exd_...` works too. Use whichever your HTTP client makes easier.

Keys are issued by hand during the preview. Keep yours out of client-side code and public repositories: anyone who has it uses your rate limit. If a key leaks, ask for it to be revoked and replaced.

`/health`, `/status` and `/openapi.json` need no key.

## Rate limits

Each key allows a set number of requests per minute. The default is 120. Every response to a request with a valid key carries three headers:

| Header                  | Meaning                                  |
| ----------------------- | ---------------------------------------- |
| `x-ratelimit-limit`     | Requests allowed per minute for this key |
| `x-ratelimit-remaining` | Requests left in the current minute      |
| `x-ratelimit-reset`     | Seconds until the minute resets          |

The count resets at the start of each clock minute. When it runs out, the API answers `429` with a `retry-after` header in seconds. Wait that long before the next request.

Data changes only when a patch is published or rebuilt, so cache responses on your side. Store what you read per `meta.gameVersion`, and refresh it when that patch's `generatedAt` in `GET /v1/versions` changes.

## Errors

Errors are JSON with a stable `error` code and a `message` for people:

```json
{ "error": "invalid_api_key", "message": "The API key is invalid or revoked." }
```

Branch on `error`, not on `message`. The key-related codes:

| Status | `error`           | What to do                                  |
| ------ | ----------------- | ------------------------------------------- |
| 401    | `missing_api_key` | Send the key in `x-api-key`.                |
| 401    | `invalid_api_key` | Check the key. A revoked key stays invalid. |
| 429    | `rate_limited`    | Wait `retry-after` seconds, then retry.     |

The [API reference](/api#errors) lists every code.
