import { describe, it, expect, beforeEach } from "vitest";
import { handle, resetIndexCache, type Env } from "../apps/data/src/worker.js";

interface Stored {
  body: string;
  contentType: string;
  cacheControl?: string;
  etag: string;
}

/** Enough of R2Bucket.get for the worker: bodies, metadata, If-None-Match and byte ranges. */
class FakeBucket {
  readonly objects = new Map<string, Stored>();
  readonly reads: string[] = [];

  set(key: string, body: unknown, contentType = "application/json", cacheControl?: string) {
    const text = typeof body === "string" ? body : JSON.stringify(body);
    this.objects.set(key, { body: text, contentType, cacheControl, etag: `e${this.objects.size}` });
  }

  async get(key: string, options?: { onlyIf?: Headers; range?: Headers }) {
    this.reads.push(key);
    const stored = this.objects.get(key);
    if (!stored) return null;
    const bytes = new TextEncoder().encode(stored.body);
    const meta = {
      size: bytes.byteLength,
      httpEtag: `"${stored.etag}"`,
      writeHttpMetadata(headers: Headers) {
        headers.set("content-type", stored.contentType);
        if (stored.cacheControl) headers.set("cache-control", stored.cacheControl);
      }
    };
    if (options?.onlyIf?.get("if-none-match") === `"${stored.etag}"`) return meta;

    const match = /^bytes=(\d+)-(\d+)$/.exec(options?.range?.get("range") ?? "");
    const range = match
      ? { offset: Number(match[1]), length: Number(match[2]) - Number(match[1]) + 1 }
      : undefined;
    const slice = range ? bytes.slice(range.offset, range.offset + range.length) : bytes;
    return {
      ...meta,
      range,
      body: new Blob([slice]).stream(),
      json: async () => JSON.parse(stored.body)
    };
  }
}

const IMMUTABLE = "public, max-age=31536000, immutable";

describe("data.exiledata.dev worker", () => {
  let bucket: FakeBucket;
  let env: Env;
  const get = (path: string, headers: Record<string, string> = {}, method = "GET") =>
    handle(new Request(`https://data.exiledata.dev${path}`, { method, headers }), env);

  beforeEach(() => {
    resetIndexCache();
    bucket = new FakeBucket();
    env = { DATA: bucket as unknown as R2Bucket };
    bucket.set(
      "downloads/index.json",
      { games: { poe2: { latest: "4.5.5.3" } } },
      "application/json",
      "public, max-age=60"
    );
    bucket.set(
      "downloads/poe2/4.5.5.3/mods.min.json",
      { Strength1: {} },
      "application/json",
      IMMUTABLE
    );
    bucket.set(
      "downloads/poe2/4.5.5.3/base_items/Active Skill Gem.json",
      [1, 2],
      "application/json",
      IMMUTABLE
    );
    bucket.set("poe2/4.5.5.3/dataset.json", { secret: true });
  });

  it("serves a versioned file with CORS, its patch and an immutable cache", async () => {
    const res = await get("/poe2/4.5.5.3/mods.min.json");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ Strength1: {} });
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(res.headers.get("cache-control")).toBe(IMMUTABLE);
    expect(res.headers.get("x-exiledata-patch")).toBe("4.5.5.3");
    expect(res.headers.get("etag")).toBeTruthy();
  });

  it("serves files whose names contain spaces", async () => {
    const res = await get("/poe2/4.5.5.3/base_items/Active%20Skill%20Gem.json");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([1, 2]);
  });

  it("redirects latest to the newest patch, keeping the file path", async () => {
    const res = await get("/poe2/latest/base_items/Active%20Skill%20Gem.json");

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/poe2/4.5.5.3/base_items/Active%20Skill%20Gem.json");
    expect(res.headers.get("cache-control")).toBe("public, max-age=60");
  });

  it("404s latest for a game with nothing published", async () => {
    expect((await get("/poe1/latest/mods.min.json")).status).toBe(404);
  });

  it("serves the index", async () => {
    const res = await get("/index.json");

    expect(res.status).toBe(200);
    expect((await res.json()).games.poe2.latest).toBe("4.5.5.3");
  });

  it("serves the publishing status, and 404s while there is none", async () => {
    expect((await get("/status.json")).status).toBe(404);

    bucket.set(
      "downloads/status.json",
      { games: { poe2: { state: "waiting", patch: "4.5.6.0" } } },
      "application/json",
      "public, max-age=60"
    );
    const res = await get("/status.json");

    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("public, max-age=60");
    expect((await res.json()).games.poe2.state).toBe("waiting");
  });

  it("answers If-None-Match with 304 and a byte range with 206", async () => {
    const first = await get("/poe2/4.5.5.3/mods.min.json");
    const etag = first.headers.get("etag")!;

    const cached = await get("/poe2/4.5.5.3/mods.min.json", { "if-none-match": etag });
    expect(cached.status).toBe(304);
    expect(cached.body).toBeNull();

    const partial = await get("/poe2/4.5.5.3/mods.min.json", { range: "bytes=0-3" });
    expect(partial.status).toBe(206);
    expect(await partial.text()).toBe('{"St');
    expect(partial.headers.get("content-range")).toMatch(/^bytes 0-3\/\d+$/);
  });

  it("never reaches objects outside downloads/", async () => {
    for (const path of [
      "/poe2/4.5.5.3/../../poe2/4.5.5.3/dataset.json",
      "/poe2/4.5.5.3/%2e%2e/%2e%2e/poe2/4.5.5.3/dataset.json",
      "/poe2/4.5.5.3/..%2f..%2fpoe2/4.5.5.3/dataset.json",
      "/poe3/4.5.5.3/mods.min.json",
      "/poe2/not a patch/mods.min.json"
    ]) {
      expect((await get(path)).status, path).toBe(404);
    }
    expect(bucket.reads.every((key) => key.startsWith("downloads/"))).toBe(true);
  });

  it("sends the root and folder addresses to the Downloads page", async () => {
    expect((await get("/")).headers.get("location")).toBe("https://docs.exiledata.dev/downloads");
    expect((await get("/poe2/")).headers.get("location")).toBe(
      "https://docs.exiledata.dev/downloads?game=poe2"
    );
    expect((await get("/poe2/4.5.5.3/")).headers.get("location")).toBe(
      "https://docs.exiledata.dev/downloads?game=poe2&version=4.5.5.3"
    );
  });

  it("answers HEAD without a body, preflight with CORS, and refuses writes", async () => {
    const head = await get("/poe2/4.5.5.3/mods.min.json", {}, "HEAD");
    expect(head.status).toBe(200);
    expect(head.body).toBeNull();

    const preflight = await get("/poe2/4.5.5.3/mods.min.json", {}, "OPTIONS");
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("access-control-allow-headers")).toContain("range");

    expect((await get("/poe2/4.5.5.3/mods.min.json", {}, "PUT")).status).toBe(405);
  });
});
