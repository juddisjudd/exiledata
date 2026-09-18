import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFile } from "node:fs/promises";
import type { FastifyInstance } from "fastify";
import type { PGlite } from "@electric-sql/pglite";
import { buildApp } from "../apps/api/src/app.js";
import { renderOpenApiDocument } from "../apps/api/src/openapi-document.js";
import { TEST_ADMIN_TOKEN, createTestDb, testConfig } from "./helpers/app.js";

interface OpenApiDocument {
  paths: Record<string, Record<string, { security?: unknown[] }>>;
  components: { schemas: Record<string, unknown> };
}

describe("OpenAPI document", () => {
  let db: PGlite;
  let app: FastifyInstance;

  beforeAll(async () => {
    db = await createTestDb();
    app = buildApp({ config: testConfig(), db, logger: false });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await db.close();
  });

  it("matches the committed apps/api/openapi.json (run `pnpm openapi` to update it)", async () => {
    const committed = await readFile(new URL("../apps/api/openapi.json", import.meta.url), "utf8");

    expect(committed.replace(/\r\n/g, "\n")).toBe(await renderOpenApiDocument());
  });

  it("documents the public routes only", async () => {
    const doc = JSON.parse(await renderOpenApiDocument()) as OpenApiDocument;

    expect(Object.keys(doc.paths).sort()).toEqual([
      "/health",
      "/status",
      "/v1/games",
      "/v1/versions",
      "/v1/{game}/bases"
    ]);
    expect(doc.paths["/health"]?.get?.security).toEqual([]);
    expect(Object.keys(doc.components.schemas)).toContain("BaseItem");
  });

  it("is served at /openapi.json without a key, readable from any origin", async () => {
    const res = await app.inject({ url: "/openapi.json" });

    expect(res.statusCode).toBe(200);
    expect(res.headers["access-control-allow-origin"]).toBe("*");
    expect(JSON.stringify(res.json()) + "\n").toBe(
      JSON.stringify(JSON.parse(await renderOpenApiDocument())) + "\n"
    );
  });
});

describe("error format", () => {
  let db: PGlite;
  let app: FastifyInstance;

  beforeAll(async () => {
    db = await createTestDb();
    app = buildApp({ config: testConfig(), db, logger: false });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await db.close();
  });

  it("answers an unknown route with the standard error body", async () => {
    const res = await app.inject({ url: "/nope?x=1" });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: "not_found", message: "No route for GET /nope" });
  });

  it("answers malformed JSON with invalid_request", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/admin/api/keys",
      headers: { authorization: `Bearer ${TEST_ADMIN_TOKEN}`, "content-type": "application/json" },
      payload: "{not json"
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("invalid_request");
  });
});
