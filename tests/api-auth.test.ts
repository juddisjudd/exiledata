import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import type { PGlite } from "@electric-sql/pglite";
import { buildApp } from "../apps/api/src/app.js";
import { RateLimiter } from "../apps/api/src/auth/rate-limiter.js";
import { createTestDb, issueKey, testConfig } from "./helpers/app.js";

describe("api key enforcement", () => {
  let db: PGlite;
  let app: FastifyInstance;

  beforeEach(async () => {
    db = await createTestDb();
    app = buildApp({ config: testConfig(), db, logger: false });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    await db.close();
  });

  it("leaves /health and /status open", async () => {
    expect((await app.inject({ url: "/health" })).statusCode).toBe(200);

    const status = await app.inject({ url: "/status" });
    expect(status.statusCode).toBe(200);
    expect(status.json()).toMatchObject({ database: "ok", adminApi: "enabled" });
  });

  it("rejects a /v1 request without a key", async () => {
    const res = await app.inject({ url: "/v1/games" });

    expect(res.statusCode).toBe(401);
    expect(res.json().error).toBe("missing_api_key");
  });

  it("rejects an unknown key", async () => {
    const res = await app.inject({
      url: "/v1/games",
      headers: { "x-api-key": "exd_not-a-real-key" }
    });

    expect(res.statusCode).toBe(401);
    expect(res.json().error).toBe("invalid_api_key");
  });

  it("accepts a valid key in x-api-key or as a bearer token", async () => {
    const { secret } = await issueKey(db);

    const viaHeader = await app.inject({ url: "/v1/games", headers: { "x-api-key": secret } });
    const viaBearer = await app.inject({
      url: "/v1/games",
      headers: { authorization: `Bearer ${secret}` }
    });

    expect(viaHeader.statusCode).toBe(200);
    expect(viaHeader.json()).toEqual({ games: ["poe1", "poe2"] });
    expect(viaBearer.statusCode).toBe(200);
  });

  it("stores only a hash of the key", async () => {
    const { secret } = await issueKey(db);

    const { rows } = await db.query<{ key_hash: string; key_prefix: string }>(
      "SELECT key_hash, key_prefix FROM api_keys"
    );
    expect(rows[0]?.key_hash).not.toContain(secret);
    expect(secret.startsWith(rows[0]!.key_prefix)).toBe(true);
  });

  it("rejects a revoked key", async () => {
    const { secret, id } = await issueKey(db);
    await db.query("UPDATE api_keys SET revoked_at = now() WHERE id = $1", [id]);

    const res = await app.inject({ url: "/v1/games", headers: { "x-api-key": secret } });

    expect(res.statusCode).toBe(401);
  });

  it("enforces the key's per-minute limit and reports it in headers", async () => {
    const { secret } = await issueKey(db, { rateLimitPerMinute: 2 });
    const call = () => app.inject({ url: "/v1/games", headers: { "x-api-key": secret } });

    const first = await call();
    await call();
    const third = await call();

    expect(first.headers["x-ratelimit-limit"]).toBe("2");
    expect(first.headers["x-ratelimit-remaining"]).toBe("1");
    expect(third.statusCode).toBe(429);
    expect(third.json().error).toBe("rate_limited");
    expect(Number(third.headers["retry-after"])).toBeGreaterThan(0);
  });

  it("does not require a key for unknown routes", async () => {
    expect((await app.inject({ url: "/nope" })).statusCode).toBe(404);
  });

  it("writes hourly usage and last use when the app closes", async () => {
    const { secret, id } = await issueKey(db, { rateLimitPerMinute: 2 });
    for (let i = 0; i < 3; i++) {
      await app.inject({ url: "/v1/games", headers: { "x-api-key": secret } });
    }
    await app.inject({ url: "/v1/poe2/items", headers: { "x-api-key": secret } });

    await app.close();

    const { rows } = await db.query<{ requests: number; errors: number }>(
      "SELECT requests, errors FROM api_key_usage_hourly WHERE api_key_id = $1",
      [id]
    );
    expect(rows).toEqual([{ requests: 4, errors: 2 }]);
    const key = await db.query<{ last_used_at: Date | null }>(
      "SELECT last_used_at FROM api_keys WHERE id = $1",
      [id]
    );
    expect(key.rows[0]?.last_used_at).not.toBeNull();
  });
});

describe("RateLimiter", () => {
  it("resets at the start of the next minute", () => {
    const limiter = new RateLimiter();
    const start = 1_800_000_000_000 - (1_800_000_000_000 % 60_000);

    expect(limiter.take("k", 1, start).allowed).toBe(true);
    expect(limiter.take("k", 1, start + 59_999).allowed).toBe(false);
    expect(limiter.take("k", 1, start + 60_000).allowed).toBe(true);
  });

  it("counts keys separately", () => {
    const limiter = new RateLimiter();

    expect(limiter.take("a", 1, 0).allowed).toBe(true);
    expect(limiter.take("b", 1, 0).allowed).toBe(true);
    expect(limiter.take("a", 1, 0).allowed).toBe(false);
  });
});

describe("api startup", () => {
  it("requires API_KEY_SECRET", () => {
    expect(() => buildApp({ config: testConfig({ apiKeySecret: undefined }) })).toThrow(
      /API_KEY_SECRET/
    );
  });

  it("requires DATABASE_URL when no database is injected", () => {
    expect(() => buildApp({ config: testConfig({ databaseUrl: undefined }) })).toThrow(
      /DATABASE_URL/
    );
  });
});
