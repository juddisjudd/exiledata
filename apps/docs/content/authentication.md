# Authentication

Every `/v1` endpoint needs an API key. Keys are issued by hand while ExileData is in preview.

## Sending your key

Send the key in the `x-api-key` header:

```sh
curl -H "x-api-key: exd_..." https://api.exiledata.dev/v1/poe2/bases?limit=5
```

`Authorization: Bearer exd_...` works too. Keep the key out of client-side code and public
repositories. Anyone who has it can use your rate limit.

## Rate limits

Each key has its own limit of requests per minute. Every response to a keyed request tells you
where you stand:

| Header                  | Meaning                                  |
| ----------------------- | ---------------------------------------- |
| `x-ratelimit-limit`     | Requests allowed per minute for this key |
| `x-ratelimit-remaining` | Requests left in the current minute      |
| `x-ratelimit-reset`     | Seconds until the minute resets          |

The limit resets at the start of each clock minute. When it runs out you get `429` with a
`retry-after` header in seconds. Wait that long before you send the next request.

## Errors

Errors come back as JSON with a stable `error` code and a readable `message`:

```json
{ "error": "invalid_api_key", "message": "The API key is invalid or revoked." }
```

| Status | `error`           | What to do                                                    |
| ------ | ----------------- | ------------------------------------------------------------- |
| 401    | `missing_api_key` | Send the key in `x-api-key`                                   |
| 401    | `invalid_api_key` | Check the key. A revoked key stays invalid; ask for a new one |
| 429    | `rate_limited`    | Wait `retry-after` seconds, then retry                        |

`/health` and `/status` need no key.
