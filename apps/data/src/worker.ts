/** Serves only `downloads/`, so the API's private datasets in the same bucket stay unreachable. */
export interface Env {
  DATA: R2Bucket;
}

const DOCS_PAGE = "https://docs.exiledata.dev/downloads";
const PREFIX = "downloads";
const GAMES = new Set(["poe1", "poe2"]);
const PATCH = /^[0-9][0-9A-Za-z._-]*$/;
const INDEX_TTL_MS = 60_000;

const CORS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-expose-headers": "etag, content-length, content-range, x-exiledata-patch"
};

interface DownloadIndex {
  games: Record<string, { latest: string } | undefined>;
}

let indexCache: { expires: number; index: DownloadIndex } | undefined;

/** Clears the in-memory index cache. Tests use it; the runtime starts fresh per isolate. */
export function resetIndexCache(): void {
  indexCache = undefined;
}

function json(status: number, error: string, message: string): Response {
  return new Response(JSON.stringify({ error, message }), {
    status,
    headers: { ...CORS, "content-type": "application/json; charset=utf-8" }
  });
}

const notFound = () =>
  json(404, "not_found", "No such file. See https://data.exiledata.dev/index.json.");

function redirect(location: string, cacheControl = "public, max-age=300"): Response {
  return new Response(null, {
    status: 302,
    headers: { ...CORS, location, "cache-control": cacheControl }
  });
}

async function readIndex(env: Env, now: number): Promise<DownloadIndex | undefined> {
  if (indexCache && indexCache.expires > now) return indexCache.index;
  const object = await env.DATA.get(`${PREFIX}/index.json`);
  if (!object) return undefined;
  const index = (await object.json()) as DownloadIndex;
  indexCache = { expires: now + INDEX_TTL_MS, index };
  return index;
}

async function serve(request: Request, env: Env, key: string, patch?: string): Promise<Response> {
  const object = await env.DATA.get(key, { onlyIf: request.headers, range: request.headers });
  if (!object) return notFound();

  const headers = new Headers(CORS);
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("accept-ranges", "bytes");
  headers.set("x-content-type-options", "nosniff");
  if (!headers.has("cache-control")) headers.set("cache-control", "public, max-age=300");
  if (patch) headers.set("x-exiledata-patch", patch);

  // A conditional request whose precondition held comes back without a body.
  if (!("body" in object) || !object.body) return new Response(null, { status: 304, headers });

  let status = 200;
  const range = object.range as { offset?: number; length?: number; suffix?: number } | undefined;
  if (range && request.headers.has("range")) {
    const offset = range.offset ?? (range.suffix !== undefined ? object.size - range.suffix : 0);
    const length = range.length ?? range.suffix ?? object.size - offset;
    headers.set("content-range", `bytes ${offset}-${offset + length - 1}/${object.size}`);
    status = 206;
  }
  return new Response(request.method === "HEAD" ? null : object.body, { status, headers });
}

export async function handle(request: Request, env: Env, now = Date.now()): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        ...CORS,
        "access-control-allow-methods": "GET, HEAD, OPTIONS",
        "access-control-allow-headers": "range, if-none-match, if-modified-since",
        "access-control-max-age": "86400"
      }
    });
  }
  if (request.method !== "GET" && request.method !== "HEAD") {
    return json(405, "method_not_allowed", "Only GET and HEAD are supported.");
  }

  const url = new URL(request.url);
  let segments: string[];
  try {
    segments = decodeURIComponent(url.pathname).split("/").filter(Boolean);
  } catch {
    return notFound();
  }
  if (segments.some((s) => s === "." || s === ".." || s.includes("\\"))) return notFound();

  if (segments.length === 0) return redirect(DOCS_PAGE);
  if (
    segments.length === 1 &&
    (segments[0] === "index.json" ||
      segments[0] === "status.json" ||
      segments[0] === "current.json")
  ) {
    return serve(request, env, `${PREFIX}/${segments[0]}`);
  }

  const [game, patch, ...rest] = segments;
  if (!game || !GAMES.has(game)) return notFound();

  if (!patch || rest.length === 0) {
    const page = new URL(DOCS_PAGE);
    page.searchParams.set("game", game);
    if (patch && patch !== "latest") page.searchParams.set("version", patch);
    return redirect(page.toString());
  }

  if (patch === "latest") {
    const latest = (await readIndex(env, now))?.games[game]?.latest;
    if (!latest) return notFound();
    const file = rest.map(encodeURIComponent).join("/");
    return redirect(`/${game}/${latest}/${file}${url.search}`, "public, max-age=60");
  }

  if (!PATCH.test(patch)) return notFound();
  return serve(request, env, `${PREFIX}/${game}/${patch}/${rest.join("/")}`, patch);
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // Whole-file GETs are immutable per address, so keep them at the edge. Ranges, conditionals
    // and HEAD go straight to R2.
    const cacheable =
      request.method === "GET" &&
      !request.headers.has("range") &&
      !request.headers.has("if-none-match") &&
      !request.headers.has("if-modified-since");
    const cache = caches.default;

    if (cacheable) {
      const hit = await cache.match(request);
      if (hit) return hit;
    }
    const response = await handle(request, env);
    if (cacheable && response.status === 200) ctx.waitUntil(cache.put(request, response.clone()));
    return response;
  }
};
