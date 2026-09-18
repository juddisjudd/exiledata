import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { unzipSync } from "fflate";
import { buildRelease, mergeIndex, type DownloadIndex } from "../packages/cli/src/release.js";
import { publishDownloads } from "../packages/cli/src/downloads.js";
import { LocalDatasetStorage } from "../packages/storage/src/local.js";
import { LocalObjectStorage } from "../packages/storage/src/objects.js";
import { SCHEMA_VERSION } from "../packages/schema/src/common/version.js";

const sha = (data: Uint8Array | string) => createHash("sha256").update(data).digest("hex");

async function write(file: string, value: unknown, pretty = true) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(
    file,
    typeof value === "string" ? value : JSON.stringify(value, null, pretty ? 2 : 0)
  );
}

/** A tiny extract with every kind of entry the publisher has to handle or skip. */
async function fakeExtract(dir: string, version: string) {
  const mods = { Strength1: { domain: "item" }, Dexterity1: { domain: "item" } };
  await write(path.join(dir, "version.txt"), `${version}\n`);
  await write(path.join(dir, "mods.json"), mods);
  await write(path.join(dir, "mods.min.json"), mods, false);
  await write(path.join(dir, "tags.json"), ["a", "b", "c"]);
  await write(path.join(dir, "tags.min.json"), ["a", "b", "c"], false);
  await write(path.join(dir, "export_report.json"), { ok: true });
  await write(path.join(dir, "export_report.min.json"), { ok: true }, false);
  await write(path.join(dir, "lonely.json"), { no: "min variant" });
  await write(path.join(dir, "Art", "icon.png"), "PNG");
  await write(path.join(dir, "stat_translations", "skill.json"), [{ id: 1 }]);
  await write(path.join(dir, "stat_translations", "skill.min.json"), [{ id: 1 }], false);
  await write(path.join(dir, "stat_translations", "specific", "bolt", "bolt.json"), { a: 1 });
  await write(
    path.join(dir, "stat_translations", "specific", "bolt", "bolt.min.json"),
    { a: 1 },
    false
  );
  await write(path.join(dir, "unknown_folder", "x.json"), {});
  await write(path.join(dir, "unknown_folder", "x.min.json"), {}, false);
}

const RECORDS = [
  { id: "Metadata/Items/Amulets/FourAmulet1", name: "Crimson Amulet", itemClass: "Amulet" }
];

describe("buildRelease", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "exiledata-extract-"));
    await fakeExtract(dir, "4.5.5.3");
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const build = () =>
    buildRelease({
      game: "poe2",
      extractDir: dir,
      gameVersion: "4.5.5.3",
      schemaVersion: SCHEMA_VERSION,
      normalized: { base_items: RECORDS },
      now: new Date("2026-09-18T12:00:00Z")
    });

  it("publishes JSON pairs, skips the extractor report, images and unknown folders", async () => {
    const { manifest } = await build();

    expect(manifest.files.map((f) => `${f.path} + ${f.min.path}`)).toEqual([
      "normalized/base_items.json + normalized/base_items.min.json",
      "mods.json + mods.min.json",
      "tags.json + tags.min.json",
      "stat_translations/skill.json + stat_translations/skill.min.json",
      "stat_translations/specific/bolt/bolt.json + stat_translations/specific/bolt/bolt.min.json"
    ]);
    expect(manifest.files.at(-1)!.folder).toBe("stat_translations");
  });

  it("records sizes, checksums, record counts and descriptions", async () => {
    const { manifest, objects } = await build();
    const mods = manifest.files.find((f) => f.path === "mods.json")!;

    expect(mods.records).toBe(2);
    expect(mods.bytes).toBe(objects.get("mods.json")!.byteLength);
    expect(mods.sha256).toBe(sha(objects.get("mods.json")!));
    expect(mods.min.sha256).toBe(sha(objects.get("mods.min.json")!));
    expect(mods.description).toMatch(/modifier/i);
    expect(manifest.files.find((f) => f.path === "tags.json")!.records).toBe(3);
    expect(manifest.files[0]).toMatchObject({ kind: "normalized", records: 1 });
    expect(Object.keys(manifest.folders).sort()).toEqual(["normalized", "stat_translations"]);
  });

  it("zips every minified file under a folder named for the patch", async () => {
    const { manifest, objects } = await build();
    const zip = unzipSync(objects.get(manifest.archive.path)!);

    expect(manifest.archive.path).toBe("poe2-4.5.5.3.zip");
    expect(Object.keys(zip).sort()).toEqual([
      "poe2-4.5.5.3/mods.min.json",
      "poe2-4.5.5.3/normalized/base_items.min.json",
      "poe2-4.5.5.3/stat_translations/skill.min.json",
      "poe2-4.5.5.3/stat_translations/specific/bolt/bolt.min.json",
      "poe2-4.5.5.3/tags.min.json"
    ]);
    expect(Buffer.from(zip["poe2-4.5.5.3/tags.min.json"]!).toString()).toBe('["a","b","c"]');
  });
});

describe("mergeIndex", () => {
  const manifestFor = (game: "poe1" | "poe2", gameVersion: string) => ({
    game,
    gameVersion,
    generatedAt: "2026-09-18T12:00:00.000Z",
    schemaVersion: SCHEMA_VERSION,
    archive: { path: `${game}-${gameVersion}.zip`, bytes: 10, sha256: "x" },
    folders: {},
    files: [
      {
        kind: "raw" as const,
        folder: null,
        path: "a.json",
        bytes: 5,
        sha256: "y",
        records: 1,
        min: { path: "a.min.json", bytes: 3, sha256: "z" }
      }
    ]
  });

  it("keeps patches newest first and points latest at the highest patch number", () => {
    let index: DownloadIndex | undefined;
    for (const v of ["4.5.9.3", "4.5.10.0", "4.5.5.3"])
      index = mergeIndex(index, manifestFor("poe2", v));

    expect(index!.games.poe2!.latest).toBe("4.5.10.0");
    expect(index!.games.poe2!.versions.map((v) => v.gameVersion)).toEqual([
      "4.5.10.0",
      "4.5.9.3",
      "4.5.5.3"
    ]);
    expect(index!.games.poe2!.versions[0]).toMatchObject({ files: 1, bytes: 8 });
  });

  it("replaces a republished patch instead of listing it twice, and keeps other games", () => {
    let index = mergeIndex(undefined, manifestFor("poe1", "3.29.3.3"));
    index = mergeIndex(index, manifestFor("poe2", "4.5.5.3"));
    index = mergeIndex(index, manifestFor("poe2", "4.5.5.3"));

    expect(index.games.poe2!.versions).toHaveLength(1);
    expect(index.games.poe1!.latest).toBe("3.29.3.3");
  });
});

describe("publishDownloads", () => {
  let root: string;
  let extract: string;
  let store: LocalObjectStorage;
  const env = () => ({
    DATASET_STORAGE_DRIVER: "local",
    DATASET_STORAGE_PATH: path.join(root, "datasets")
  });
  const quiet = () => {};

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), "exiledata-downloads-"));
    extract = path.join(root, "extract");
    await fakeExtract(extract, "4.5.5.3");
    store = new LocalObjectStorage(path.join(root, "objects"));
    const metadata = {
      game: "poe2" as const,
      gameVersion: "4.5.5.3",
      generatedAt: "2026-09-18T12:00:00.000Z",
      schemaVersion: SCHEMA_VERSION,
      sources: []
    };
    await new LocalDatasetStorage(path.join(root, "datasets")).put(
      metadata,
      JSON.stringify({ metadata, entities: RECORDS })
    );
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("uploads every file, the manifest and the index, matching the manifest's checksums", async () => {
    const manifest = await publishDownloads({
      game: "poe2",
      extractDir: extract,
      store,
      env: env(),
      log: quiet
    });

    for (const f of manifest.files) {
      expect(sha((await store.get(`downloads/poe2/4.5.5.3/${f.path}`))!), f.path).toBe(f.sha256);
      expect(sha((await store.get(`downloads/poe2/4.5.5.3/${f.min.path}`))!), f.min.path).toBe(
        f.min.sha256
      );
    }
    const published = JSON.parse(
      Buffer.from((await store.get("downloads/poe2/4.5.5.3/manifest.json"))!).toString()
    );
    expect(published).toEqual(manifest);
    const index = JSON.parse(Buffer.from((await store.get("downloads/index.json"))!).toString());
    expect(index.games.poe2.latest).toBe("4.5.5.3");
  });

  it("serves the same normalized records the API serves", async () => {
    await publishDownloads({ game: "poe2", extractDir: extract, store, env: env(), log: quiet });

    const normalized = await store.get("downloads/poe2/4.5.5.3/normalized/base_items.min.json");
    expect(JSON.parse(Buffer.from(normalized!).toString())).toEqual(RECORDS);
  });

  it("refuses to replace a published patch without --overwrite", async () => {
    await publishDownloads({ game: "poe2", extractDir: extract, store, env: env(), log: quiet });

    await expect(
      publishDownloads({ game: "poe2", extractDir: extract, store, env: env(), log: quiet })
    ).rejects.toThrow(/already published/);
    await expect(
      publishDownloads({
        game: "poe2",
        extractDir: extract,
        store,
        env: env(),
        log: quiet,
        overwrite: true
      })
    ).resolves.toBeDefined();
  });

  it("requires the patch to be ingested first", async () => {
    await writeFile(path.join(extract, "version.txt"), "4.5.6.0\n");

    await expect(
      publishDownloads({ game: "poe2", extractDir: extract, store, env: env(), log: quiet })
    ).rejects.toThrow(/Run `exiledata ingest`/);
  });

  it("uploads nothing on a dry run", async () => {
    await publishDownloads({
      game: "poe2",
      extractDir: extract,
      store,
      env: env(),
      log: quiet,
      dryRun: true
    });

    expect(await store.get("downloads/index.json")).toBeUndefined();
  });
});
