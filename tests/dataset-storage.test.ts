import { describe, it, expect, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { LocalDatasetStorage } from "../ingestion/common/src/storage/local.js";

describe("LocalDatasetStorage", () => {
  let dir: string | undefined;

  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
    dir = undefined;
  });

  it("round-trips a dataset payload", async () => {
    dir = await mkdtemp(path.join(tmpdir(), "exiledata-dataset-"));
    const storage = new LocalDatasetStorage(dir);
    const metadata = {
      game: "poe1" as const,
      gameVersion: "3.25.0",
      datasetVersion: "2026.09.03.1",
      generatedAt: new Date().toISOString(),
      schemaVersion: "0.0.0",
      sources: []
    };

    expect(await storage.get(metadata.game, metadata.datasetVersion)).toBeUndefined();

    await storage.put(metadata, JSON.stringify({ hello: "world" }));

    expect(await storage.get(metadata.game, metadata.datasetVersion)).toBe(
      JSON.stringify({ hello: "world" })
    );
    expect(await storage.listVersions(metadata.game)).toEqual([metadata.datasetVersion]);
  });

  it("returns an empty list for a game with no datasets", async () => {
    dir = await mkdtemp(path.join(tmpdir(), "exiledata-dataset-"));
    const storage = new LocalDatasetStorage(dir);
    expect(await storage.listVersions("poe2")).toEqual([]);
  });
});
