import { describe, it, expect, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { LocalDatasetStorage } from "../packages/storage/src/local.js";
import { compareGameVersions, datasetKey } from "../packages/storage/src/keys.js";

const metadata = {
  game: "poe1" as const,
  gameVersion: "3.29.3.3",
  generatedAt: new Date().toISOString(),
  schemaVersion: "0.0.0",
  sources: []
};

describe("LocalDatasetStorage", () => {
  let dir: string | undefined;

  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
    dir = undefined;
  });

  async function storage() {
    dir = await mkdtemp(path.join(tmpdir(), "exiledata-dataset-"));
    return new LocalDatasetStorage(dir);
  }

  it("round-trips a dataset payload keyed by game patch", async () => {
    const store = await storage();

    expect(await store.get("poe1", "3.29.3.3")).toBeUndefined();

    await store.put(metadata, JSON.stringify({ hello: "world" }));

    expect(await store.get("poe1", "3.29.3.3")).toBe(JSON.stringify({ hello: "world" }));
    const [listed] = await store.list("poe1");
    expect(listed).toMatchObject({ game: "poe1", gameVersion: "3.29.3.3" });
    expect(listed?.etag).toBeTruthy();
  });

  it("changes the etag when a patch is rewritten", async () => {
    const store = await storage();
    await store.put(metadata, "a");
    const before = (await store.list("poe1"))[0]?.etag;

    await store.put(metadata, "bb");

    expect((await store.list("poe1"))[0]?.etag).not.toBe(before);
  });

  it("deletes a dataset, and ignores deleting one that does not exist", async () => {
    const store = await storage();
    await store.put(metadata, "{}");

    await store.delete("poe1", "3.29.3.3");
    await store.delete("poe1", "3.29.3.3");

    expect(await store.list("poe1")).toEqual([]);
  });

  it("returns an empty list for a game with no datasets", async () => {
    expect(await (await storage()).list("poe2")).toEqual([]);
  });
});

describe("datasetKey", () => {
  it("builds {game}/{gameVersion}/dataset.json", () => {
    expect(datasetKey("poe2", "4.5.5.3")).toBe("poe2/4.5.5.3/dataset.json");
  });

  it("refuses a version that could escape the game prefix", () => {
    for (const version of ["../x", "..", "a/b", "", ".hidden"]) {
      expect(() => datasetKey("poe2", version), version).toThrow(/Invalid game version/);
    }
  });
});

describe("compareGameVersions", () => {
  it("orders dotted versions numerically", () => {
    const sorted = ["4.5.10.0", "4.5.5.3", "3.29.3.3", "4.5.9.12"].sort(compareGameVersions);

    expect(sorted).toEqual(["3.29.3.3", "4.5.5.3", "4.5.9.12", "4.5.10.0"]);
  });
});
