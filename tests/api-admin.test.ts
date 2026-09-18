import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import type { PGlite } from "@electric-sql/pglite";
import { buildApp } from "../apps/api/src/app.js";
import { TEST_ADMIN_TOKEN, createTestDb, testConfig } from "./helpers/app.js";

const auth = { authorization: `Bearer ${TEST_ADMIN_TOKEN}` };

describe("admin api", () => {
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

  const createKey = (payload: object) =>
    app.inject({ method: "POST", url: "/admin/api/keys", headers: auth, payload });

  it("rejects a missing or wrong admin token", async () => {
    expect((await app.inject({ url: "/admin/api/keys" })).statusCode).toBe(401);

    const wrong = await app.inject({
      url: "/admin/api/keys",
      headers: { authorization: "Bearer not-the-token" }
    });
    expect(wrong.statusCode).toBe(401);
    expect(wrong.json().error).toBe("invalid_admin_token");
  });

  it("does not accept an API key as an admin token", async () => {
    const { secret } = (await createKey({ client: "tool" })).json();

    const res = await app.inject({
      url: "/admin/api/keys",
      headers: { authorization: `Bearer ${secret}` }
    });

    expect(res.statusCode).toBe(401);
  });

  it("issues a working key and returns the secret once", async () => {
    const res = await createKey({ client: "poe-overlay", rateLimitPerMinute: 30 });

    expect(res.statusCode).toBe(201);
    const { key, secret } = res.json();
    expect(secret).toMatch(/^exd_[A-Za-z0-9_-]{32}$/);
    expect(key).toMatchObject({
      clientName: "poe-overlay",
      prefix: secret.slice(0, 12),
      rateLimitPerMinute: 30,
      revokedAt: null,
      requests24h: 0
    });

    const use = await app.inject({ url: "/v1/games", headers: { "x-api-key": secret } });
    expect(use.statusCode).toBe(200);

    const list = await app.inject({ url: "/admin/api/keys", headers: auth });
    expect(list.json().keys).toHaveLength(1);
    expect(JSON.stringify(list.json())).not.toContain(secret);
  });

  it("uses the configured default limit and reuses a client by name", async () => {
    await createKey({ client: "tool" });
    await createKey({ client: "tool" });

    const { keys } = (await app.inject({ url: "/admin/api/keys", headers: auth })).json();
    expect(keys).toHaveLength(2);
    expect(keys[0].clientId).toBe(keys[1].clientId);
    expect(keys[0].rateLimitPerMinute).toBe(120);
  });

  it("validates the create request", async () => {
    for (const payload of [
      {},
      { client: "  " },
      { client: "x".repeat(101) },
      { client: "tool", rateLimitPerMinute: 0 },
      { client: "tool", rateLimitPerMinute: 1.5 }
    ]) {
      const res = await createKey(payload);
      expect(res.statusCode, JSON.stringify(payload)).toBe(400);
      expect(res.json().error).toBe("invalid_request");
    }
  });

  it("changes a rate limit and applies it at once", async () => {
    const { key, secret } = (await createKey({ client: "tool", rateLimitPerMinute: 100 })).json();
    await app.inject({ url: "/v1/games", headers: { "x-api-key": secret } });

    const res = await app.inject({
      method: "PATCH",
      url: `/admin/api/keys/${key.id}`,
      headers: auth,
      payload: { rateLimitPerMinute: 1 }
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().key.rateLimitPerMinute).toBe(1);
    const next = await app.inject({ url: "/v1/games", headers: { "x-api-key": secret } });
    expect(next.statusCode).toBe(429);
  });

  it("revokes a key and applies it at once", async () => {
    const { key, secret } = (await createKey({ client: "tool" })).json();
    await app.inject({ url: "/v1/games", headers: { "x-api-key": secret } });

    const res = await app.inject({
      method: "POST",
      url: `/admin/api/keys/${key.id}/revoke`,
      headers: auth
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().key.revokedAt).not.toBeNull();
    const after = await app.inject({ url: "/v1/games", headers: { "x-api-key": secret } });
    expect(after.statusCode).toBe(401);
  });

  it("keeps the first revocation time when revoked twice", async () => {
    const { key } = (await createKey({ client: "tool" })).json();
    const revoke = () =>
      app.inject({ method: "POST", url: `/admin/api/keys/${key.id}/revoke`, headers: auth });

    const first = (await revoke()).json().key.revokedAt;
    const second = (await revoke()).json().key.revokedAt;

    expect(second).toBe(first);
  });

  it("404s an unknown or malformed key id", async () => {
    for (const id of ["00000000-0000-0000-0000-000000000000", "not-a-uuid"]) {
      const res = await app.inject({
        method: "POST",
        url: `/admin/api/keys/${id}/revoke`,
        headers: auth
      });
      expect(res.statusCode).toBe(404);
    }
  });

  it("reports usage per key and hour, including requests not yet flushed", async () => {
    const { key, secret } = (await createKey({ client: "tool" })).json();
    await app.inject({ url: "/v1/games", headers: { "x-api-key": secret } });
    await app.inject({ url: "/v1/games", headers: { "x-api-key": secret } });
    await app.inject({ url: "/v1/poe2/items", headers: { "x-api-key": secret } });

    const usage = await app.inject({ url: "/admin/api/usage?hours=24", headers: auth });

    expect(usage.statusCode).toBe(200);
    expect(usage.json().buckets).toEqual([
      expect.objectContaining({ keyId: key.id, requests: 3, errors: 1 })
    ]);
    const { keys } = (await app.inject({ url: "/admin/api/keys", headers: auth })).json();
    expect(keys[0]).toMatchObject({ requests24h: 3, requests7d: 3 });
    expect(keys[0].lastUsedAt).not.toBeNull();
  });

  it("rejects an out-of-range usage window", async () => {
    const res = await app.inject({ url: "/admin/api/usage?hours=0", headers: auth });
    expect(res.statusCode).toBe(400);
  });

  it("serves the dashboard page with a restrictive CSP", async () => {
    const res = await app.inject({ url: "/admin" });

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/html");
    expect(res.headers["content-security-policy"]).toContain("connect-src 'self'");
    expect(res.headers["content-security-policy"]).toContain("font-src 'self'");
    expect(res.headers["content-security-policy"]).toContain("frame-ancestors 'none'");
  });

  it("serves the dashboard fonts and nothing else from the font path", async () => {
    const font = await app.inject({ url: "/admin/fonts/geist-latin-wght-normal.woff2" });

    expect(font.statusCode).toBe(200);
    expect(font.headers["content-type"]).toBe("font/woff2");
    expect(font.rawPayload.subarray(0, 4).toString("latin1")).toBe("wOF2");
    for (const name of ["OFL-Geist.txt", "..%2Fadmin.html", "nope.woff2"]) {
      expect((await app.inject({ url: `/admin/fonts/${name}` })).statusCode).toBe(404);
    }
  });
});

describe("admin api without ADMIN_TOKEN", () => {
  it("answers 503 so a missing token is obvious", async () => {
    const db = await createTestDb();
    const app = buildApp({ config: testConfig({ adminToken: undefined }), db, logger: false });

    const res = await app.inject({ url: "/admin/api/keys", headers: auth });

    expect(res.statusCode).toBe(503);
    expect(res.json().error).toBe("admin_disabled");
    await app.close();
    await db.close();
  });
});
