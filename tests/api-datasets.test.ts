import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import type { PGlite } from "@electric-sql/pglite";
import { buildApp } from "../apps/api/src/app.js";
import { loadConfig } from "../apps/api/src/config.js";
import { DatasetReader } from "../apps/api/src/datasets.js";
import { LocalDatasetStorage } from "../packages/storage/src/local.js";
import { SCHEMA_VERSION } from "../packages/schema/src/common/version.js";
import type { DatasetMetadata } from "../packages/schema/src/common/dataset.js";
import { createTestDb, issueKey, testConfig } from "./helpers/app.js";

function metadata(gameVersion: string): DatasetMetadata {
  return {
    game: "poe2",
    gameVersion,
    generatedAt: "2026-09-18T12:00:00.000Z",
    schemaVersion: SCHEMA_VERSION,
    sources: [{ name: "poe2-ggpk-extract", retrievedAt: "2026-09-18T12:00:00.000Z" }]
  };
}

function baseItem(id: string, name: string, itemClass: string) {
  return {
    id,
    name,
    itemClass,
    version: { schemaVersion: SCHEMA_VERSION, game: "poe2" as const, gameVersion: "4.5.5.3" },
    source: metadata("4.5.5.3").sources
  };
}

/** Every field a record can carry, including nested free-form `ext` values. */
const FULL_RECORD = {
  ...baseItem("Metadata/Items/Rings/FourRing1", "Iron Ring", "Ring"),
  source: [
    {
      name: "poe2-ggpk-extract",
      version: "4.5.10.0",
      retrievedAt: "2026-09-18T12:00:00.000Z",
      locator: "base_items.json#Metadata/Items/Rings/FourRing1"
    }
  ],
  ext: {
    domain: "item",
    drop_level: 3,
    implicits: ["RingImplicitPhysicalDamage1"],
    properties: { nested: { deeper: [1, "two", null, { three: true }] } },
    grants_buff: null,
    visual_identity: { id: "FourRing1", dds_file: "Art/2DItems/Rings/IronRing.dds" }
  },
  derived: { note: "kept" }
};

async function publish(storage: LocalDatasetStorage, gameVersion: string, entities: unknown[]) {
  await storage.put(
    metadata(gameVersion),
    JSON.stringify({ metadata: metadata(gameVersion), entities })
  );
}

describe("dataset-backed endpoints", () => {
  let dir: string;
  let db: PGlite;
  let app: FastifyInstance;
  let headers: Record<string, string>;

  beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "exiledata-api-"));
    const storage = new LocalDatasetStorage(dir);
    await publish(storage, "4.5.5.3", [
      baseItem("Metadata/Items/Amulets/FourAmulet1", "Crimson Amulet", "Amulet"),
      baseItem("Metadata/Items/Amulets/FourAmulet2", "Azure Amulet", "Amulet"),
      baseItem("Metadata/Items/Rings/FourRing1", "Iron Ring", "Ring")
    ]);
    await publish(storage, "4.5.10.0", [FULL_RECORD]);

    db = await createTestDb();
    headers = { "x-api-key": (await issueKey(db)).secret };
    app = buildApp({ config: testConfig(), db, reader: new DatasetReader(storage), logger: false });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await db.close();
    await rm(dir, { recursive: true, force: true });
  });

  const get = (url: string) => app.inject({ url, headers });

  it("serves the highest patch by default, comparing versions numerically", async () => {
    const res = await get("/v1/poe2/bases");

    expect(res.statusCode).toBe(200);
    expect(res.json().meta).toEqual({ game: "poe2", gameVersion: "4.5.10.0", total: 1 });
  });

  it("returns records exactly as stored, including free-form ext and derived", async () => {
    const res = await get("/v1/poe2/bases");

    expect(res.json().data).toEqual([FULL_RECORD]);
  });

  it("rejects out-of-range paging with invalid_request", async () => {
    for (const query of ["limit=0", "limit=1001", "limit=abc", "offset=-1"]) {
      const res = await get(`/v1/poe2/bases?${query}`);
      expect(res.statusCode, query).toBe(400);
      expect(res.json().error).toBe("invalid_request");
    }
  });

  it("serves an explicitly requested patch", async () => {
    const res = await get("/v1/poe2/bases?version=4.5.5.3");

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toHaveLength(3);
    expect(res.json().meta).toEqual({ game: "poe2", gameVersion: "4.5.5.3", total: 3 });
  });

  it("filters by itemClass", async () => {
    const res = await get("/v1/poe2/bases?version=4.5.5.3&itemClass=Amulet");

    expect(res.json().data.map((e: { name: string }) => e.name)).toEqual([
      "Crimson Amulet",
      "Azure Amulet"
    ]);
    expect(res.json().meta.total).toBe(2);
  });

  it("paginates with limit and offset", async () => {
    const res = await get("/v1/poe2/bases?version=4.5.5.3&limit=1&offset=2");

    expect(res.json().data).toHaveLength(1);
    expect(res.json().data[0].name).toBe("Iron Ring");
    expect(res.json().meta.total).toBe(3);
  });

  it("404s an unknown patch", async () => {
    const res = await get("/v1/poe2/bases?version=4.0.0.0");

    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe("unknown_game_version");
  });

  it("404s a path-like version instead of reading outside storage", async () => {
    const res = await get("/v1/poe2/bases?version=../../etc");

    expect(res.statusCode).toBe(404);
  });

  it("404s an unknown game", async () => {
    const res = await get("/v1/poe3/bases");

    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe("unknown_game");
  });

  it("404s a game with no published dataset", async () => {
    const res = await get("/v1/poe1/bases");

    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe("no_dataset");
  });

  it("still returns 501 for resources the pipeline does not produce", async () => {
    for (const resource of ["items", "mods", "gems", "skills"]) {
      expect((await get(`/v1/poe2/${resource}`)).statusCode).toBe(501);
    }
  });

  it("lists published dataset metadata in patch order", async () => {
    const res = await get("/v1/versions");

    expect(res.json().datasets).toEqual([metadata("4.5.5.3"), metadata("4.5.10.0")]);
  });
});

describe("DatasetReader", () => {
  let dir: string;

  beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "exiledata-reader-"));
  });

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("picks up a re-ingested patch once the listing expires", async () => {
    const storage = new LocalDatasetStorage(dir);
    let now = 0;
    const reader = new DatasetReader(storage, { listingTtlMs: 1000, now: () => now });

    await publish(storage, "3.29.3.3", [{ id: "a" }]);
    expect((await reader.get("poe2", "3.29.3.3"))?.entities).toHaveLength(1);

    await publish(storage, "3.29.3.3", [{ id: "a" }, { id: "b" }]);
    expect((await reader.get("poe2", "3.29.3.3"))?.entities).toHaveLength(1);

    now = 1001;
    expect((await reader.get("poe2", "3.29.3.3"))?.entities).toHaveLength(2);
  });

  it("forgets a deleted patch once the listing expires", async () => {
    const storage = new LocalDatasetStorage(dir);
    let now = 0;
    const reader = new DatasetReader(storage, { listingTtlMs: 1000, now: () => now });
    await publish(storage, "3.29.4.0", [{ id: "a" }]);
    expect(await reader.get("poe2", "3.29.4.0")).toBeDefined();

    await storage.delete("poe2", "3.29.4.0");
    now = 1001;

    expect(await reader.get("poe2", "3.29.4.0")).toBeUndefined();
  });
});

describe("dataset storage configuration", () => {
  it("reports the active driver on /status", async () => {
    const db = await createTestDb();
    const app = buildApp({
      config: testConfig(),
      db,
      reader: new DatasetReader(new LocalDatasetStorage("/tmp/none")),
      logger: false
    });

    const res = await app.inject({ url: "/status" });
    expect(res.json().datasetStorage).toEqual({ driver: "local", path: "./data/datasets" });

    await app.close();
    await db.close();
  });

  it("rejects an unrecognized driver instead of falling back to local", () => {
    expect(() => loadConfig({ DATASET_STORAGE_DRIVER: "s3" } as NodeJS.ProcessEnv)).toThrow(
      /must be "local" or "r2"/
    );
  });

  it("normalizes case and surrounding whitespace in the driver name", () => {
    // Reaches the credential check, so "R2 " resolved to the r2 driver rather than being rejected.
    expect(() => loadConfig({ DATASET_STORAGE_DRIVER: "R2 " } as NodeJS.ProcessEnv)).toThrow(
      /missing: R2_ACCOUNT_ID/
    );
  });

  it("requires R2 credentials when the driver is r2", () => {
    expect(() => loadConfig({ DATASET_STORAGE_DRIVER: "r2" } as NodeJS.ProcessEnv)).toThrow(
      /missing: R2_ACCOUNT_ID/
    );
  });
});
