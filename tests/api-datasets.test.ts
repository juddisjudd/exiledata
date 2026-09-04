import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../apps/api/src/app.js";
import { DatasetReader } from "../apps/api/src/datasets.js";
import { LocalDatasetStorage } from "../packages/storage/src/local.js";
import { SCHEMA_VERSION } from "../packages/schema/src/common/version.js";

const METADATA = {
  game: "poe2" as const,
  gameVersion: "4.5.4.11",
  datasetVersion: "2026.09.04.1",
  generatedAt: "2026-09-04T18:00:00.000Z",
  schemaVersion: SCHEMA_VERSION,
  sources: [{ name: "poe2-ggpk-extract", retrievedAt: "2026-09-04T18:00:00.000Z" }]
};

function baseItem(id: string, name: string, itemClass: string) {
  return {
    id,
    name,
    itemClass,
    version: { schemaVersion: SCHEMA_VERSION, game: "poe2" as const, gameVersion: "4.5.4.11" },
    source: METADATA.sources
  };
}

describe("dataset-backed endpoints", () => {
  let dir: string;
  let app: FastifyInstance;

  beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "exiledata-api-"));
    const storage = new LocalDatasetStorage(dir);
    await storage.put(
      METADATA,
      JSON.stringify({
        metadata: METADATA,
        entities: [
          baseItem("Metadata/Items/Amulets/FourAmulet1", "Crimson Amulet", "Amulet"),
          baseItem("Metadata/Items/Amulets/FourAmulet2", "Azure Amulet", "Amulet"),
          baseItem("Metadata/Items/Rings/FourRing1", "Iron Ring", "Ring")
        ]
      })
    );
    app = buildApp({ reader: new DatasetReader(storage) });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  });

  it("serves base items from the latest dataset", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/poe2/bases" });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data).toHaveLength(3);
    expect(body.meta).toEqual({ game: "poe2", datasetVersion: "2026.09.04.1", total: 3 });
  });

  it("filters by itemClass", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/poe2/bases?itemClass=Amulet" });

    expect(res.json().data.map((e: { name: string }) => e.name)).toEqual([
      "Crimson Amulet",
      "Azure Amulet"
    ]);
    expect(res.json().meta.total).toBe(2);
  });

  it("paginates with limit and offset", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/poe2/bases?limit=1&offset=2" });

    expect(res.json().data).toHaveLength(1);
    expect(res.json().data[0].name).toBe("Iron Ring");
    expect(res.json().meta.total).toBe(3);
  });

  it("serves an explicitly requested version", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/v1/poe2/bases?version=2026.09.04.1&limit=1"
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().meta.datasetVersion).toBe("2026.09.04.1");
  });

  it("404s an unknown dataset version", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/poe2/bases?version=1999.01.01.1" });

    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe("unknown_dataset_version");
  });

  it("404s an unknown game", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/poe3/bases" });

    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe("unknown_game");
  });

  it("404s a game with no published dataset", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/poe1/bases" });

    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe("no_dataset");
  });

  it("still returns 501 for resources the pipeline does not produce", async () => {
    for (const resource of ["items", "mods", "gems", "skills"]) {
      const res = await app.inject({ method: "GET", url: `/v1/poe2/${resource}` });
      expect(res.statusCode).toBe(501);
    }
  });

  it("lists published dataset metadata", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/versions" });

    expect(res.json().datasets).toEqual([METADATA]);
  });
});
