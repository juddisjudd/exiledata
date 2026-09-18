import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import type { PGlite } from "@electric-sql/pglite";
import { buildApp } from "../apps/api/src/app.js";
import { createTestDb, issueKey, testConfig } from "./helpers/app.js";

describe("api health", () => {
  let db: PGlite;
  let app: FastifyInstance;
  let headers: Record<string, string>;

  beforeAll(async () => {
    db = await createTestDb();
    headers = { "x-api-key": (await issueKey(db)).secret };
    app = buildApp({ config: testConfig(), db, logger: false });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await db.close();
  });

  it("GET /health returns ok", async () => {
    const response = await app.inject({ method: "GET", url: "/health" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
  });

  it("GET /v1/games returns poe1 and poe2", async () => {
    const response = await app.inject({ method: "GET", url: "/v1/games", headers });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ games: ["poe1", "poe2"] });
  });

  it("GET /v1/{game}/items returns 501 not implemented", async () => {
    const response = await app.inject({ method: "GET", url: "/v1/poe2/items", headers });
    expect(response.statusCode).toBe(501);
  });
});
