# @exiledata/client

Initial ExileData TypeScript SDK.

```ts
import { ExileDataClient } from "@exiledata/client";

const client = new ExileDataClient({ apiKey: "..." });
const gems = await client.poe2.gems.list();
```

## Status

Architecture and type safety only:

- `ExileDataClient` exposes `poe1`/`poe2` namespaces (`GameNamespace`).
- `GameNamespace` exposes `items`, `bases`, `mods`, `gems`, `skills` — all backed by a generic
  `ListResource<T>` with a single `list()` method.
- No pagination, filtering, retries, or caching yet.
- `HttpClient` is a thin `fetch` wrapper that attaches the `x-api-key` header.
