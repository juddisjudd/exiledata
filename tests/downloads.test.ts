import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { unzipSync } from "fflate";
import { buildRelease, mergeIndex, type DownloadIndex } from "../packages/cli/src/release.js";
import { contentType, publishDownloads } from "../packages/cli/src/downloads.js";
import { LocalDatasetStorage } from "../packages/storage/src/local.js";
import { LocalObjectStorage, type ObjectStorage } from "../packages/storage/src/objects.js";
import { SCHEMA_VERSION } from "../packages/schema/src/common/version.js";

const sha = (data: Uint8Array | string) => createHash("sha256").update(data).digest("hex");

const TREE_LUA = "return { tree = '0_5', nodes = {} }\n".repeat(20);

/** Each entry's compression method from a zip's local headers: 0 stored, 8 deflated. */
function zipMethods(zip: Uint8Array): Record<string, number> {
  const buf = Buffer.from(zip);
  const methods: Record<string, number> = {};
  for (let pos = 0; buf.readUInt32LE(pos) === 0x04034b50;) {
    const nameLength = buf.readUInt16LE(pos + 26);
    methods[buf.toString("utf8", pos + 30, pos + 30 + nameLength)] = buf.readUInt16LE(pos + 8);
    pos += 30 + nameLength + buf.readUInt16LE(pos + 28) + buf.readUInt32LE(pos + 18);
  }
  return methods;
}

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
  await write(path.join(dir, "pob_tree", "version.txt"), `${version}\n`);
  await write(path.join(dir, "pob_tree", "export_report.json"), { ok: true });
  await write(path.join(dir, "pob_tree", "0_5", "tree.lua"), TREE_LUA);
  await write(path.join(dir, "pob_tree", "0_5", "orbit.png"), "PNG");
  await write(path.join(dir, "pob_tree", "0_5", "skills.dds.zst"), "ZSTD");
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
    const pairs = manifest.files.filter((f) => f.min);

    expect(pairs.map((f) => `${f.path} + ${f.min!.path}`)).toEqual([
      "normalized/base_items.json + normalized/base_items.min.json",
      "mods.json + mods.min.json",
      "tags.json + tags.min.json",
      "stat_translations/skill.json + stat_translations/skill.min.json",
      "stat_translations/specific/bolt/bolt.json + stat_translations/specific/bolt/bolt.min.json"
    ]);
    expect(pairs.at(-1)!.folder).toBe("stat_translations");
    expect(manifest.files.some((f) => f.path.includes("Art/"))).toBe(false);
  });

  it("records sizes, checksums, record counts and descriptions", async () => {
    const { manifest, objects } = await build();
    const mods = manifest.files.find((f) => f.path === "mods.json")!;

    expect(mods.records).toBe(2);
    expect(mods.bytes).toBe(objects.get("mods.json")!.byteLength);
    expect(mods.sha256).toBe(sha(objects.get("mods.json")!));
    expect(mods.min!.sha256).toBe(sha(objects.get("mods.min.json")!));
    expect(mods.description).toMatch(/modifier/i);
    expect(manifest.files.find((f) => f.path === "tags.json")!.records).toBe(3);
    expect(manifest.files[0]).toMatchObject({ kind: "normalized", records: 1 });
    expect(Object.keys(manifest.folders).sort()).toEqual([
      "normalized",
      "pob_tree",
      "stat_translations"
    ]);
  });

  it("publishes PoB tree files as they are, once each, without the exporter's own files", async () => {
    const { manifest, objects } = await build();
    const tree = manifest.files.filter((f) => f.folder === "pob_tree");

    expect(tree.map((f) => f.path)).toEqual([
      "pob_tree/0_5/orbit.png",
      "pob_tree/0_5/skills.dds.zst",
      "pob_tree/0_5/tree.lua"
    ]);
    for (const f of tree) {
      expect(f, f.path).toEqual({
        kind: "raw",
        folder: "pob_tree",
        path: f.path,
        bytes: objects.get(f.path)!.byteLength,
        sha256: sha(objects.get(f.path)!)
      });
    }
    expect(Buffer.from(objects.get("pob_tree/0_5/tree.lua")!).toString()).toBe(TREE_LUA);
    expect([...objects.keys()].filter((k) => k.startsWith("pob_tree/")).length).toBe(3);
    expect(manifest.folders.pob_tree).toMatch(/Path of Building/);
  });

  it("zips each PoB tree on its own, storing compressed formats as they are", async () => {
    const { manifest, objects } = await build();
    const archive = objects.get("poe2-4.5.5.3-pob-tree-0_5.zip")!;

    expect(manifest.trees).toEqual([
      {
        version: "0_5",
        archive: {
          path: "poe2-4.5.5.3-pob-tree-0_5.zip",
          bytes: archive.byteLength,
          sha256: sha(archive)
        }
      }
    ]);
    const zip = unzipSync(archive);
    expect(Object.keys(zip).sort()).toEqual([
      "0_5/orbit.png",
      "0_5/skills.dds.zst",
      "0_5/tree.lua"
    ]);
    expect(Buffer.from(zip["0_5/tree.lua"]!).toString()).toBe(TREE_LUA);
    expect(zipMethods(archive)).toEqual({
      "0_5/orbit.png": 0,
      "0_5/skills.dds.zst": 0,
      "0_5/tree.lua": 8
    });
  });

  it("builds an extract without a pob_tree folder", async () => {
    await rm(path.join(dir, "pob_tree"), { recursive: true });
    const { manifest, objects } = await build();

    expect(manifest.trees).toEqual([]);
    expect(manifest.files.every((f) => f.min && f.records !== undefined)).toBe(true);
    expect(Object.keys(manifest.folders)).not.toContain("pob_tree");
    expect([...objects.keys()].some((k) => k.includes("pob"))).toBe(false);
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

  it("counts a file without a min variant once", () => {
    const manifest = manifestFor("poe2", "4.5.5.3");
    const tree = { kind: "raw" as const, folder: "pob_tree", path: "pob_tree/0_5/tree.lua" };
    const index = mergeIndex(undefined, {
      ...manifest,
      files: [...manifest.files, { ...tree, bytes: 100, sha256: "t" }]
    });

    expect(index.games.poe2!.versions[0]).toMatchObject({ files: 2, bytes: 108 });
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

    const variants = [
      manifest.archive,
      ...manifest.trees!.map((t) => t.archive),
      ...manifest.files.flatMap((f) => (f.min ? [f, f.min] : [f]))
    ];
    for (const v of variants) {
      expect(sha((await store.get(`downloads/poe2/4.5.5.3/${v.path}`))!), v.path).toBe(v.sha256);
    }
    expect(variants.map((v) => v.path)).toContain("pob_tree/0_5/skills.dds.zst");
    const published = JSON.parse(
      Buffer.from((await store.get("downloads/poe2/4.5.5.3/manifest.json"))!).toString()
    );
    expect(published).toEqual(manifest);
    const index = JSON.parse(Buffer.from((await store.get("downloads/index.json"))!).toString());
    expect(index.games.poe2.latest).toBe("4.5.5.3");
  });

  it("sends each file with the content type of its extension, cached as immutable", async () => {
    const headers = new Map<string, string>();
    const recording: ObjectStorage = {
      put: (key, body, options) => {
        headers.set(key, `${options.contentType} | ${options.cacheControl}`);
        return store.put(key, body);
      },
      get: (key) => store.get(key)
    };
    await publishDownloads({
      game: "poe2",
      extractDir: extract,
      store: recording,
      env: env(),
      log: quiet
    });

    const immutable = "public, max-age=31536000, immutable";
    const patch = "downloads/poe2/4.5.5.3";
    expect(headers.get(`${patch}/mods.min.json`)).toBe(
      `application/json; charset=utf-8 | ${immutable}`
    );
    expect(headers.get(`${patch}/pob_tree/0_5/tree.lua`)).toBe(
      `text/plain; charset=utf-8 | ${immutable}`
    );
    expect(headers.get(`${patch}/pob_tree/0_5/orbit.png`)).toBe(`image/png | ${immutable}`);
    expect(headers.get(`${patch}/pob_tree/0_5/skills.dds.zst`)).toBe(
      `application/zstd | ${immutable}`
    );
    expect(headers.get(`${patch}/poe2-4.5.5.3-pob-tree-0_5.zip`)).toBe(
      `application/zip | ${immutable}`
    );
    expect(headers.get(`${patch}/manifest.json`)).toMatch(/^application\/json; charset=utf-8 \| /);
    expect(["a.jpg", "a.JPEG", "a.webp", "a.bin"].map((file) => contentType(file))).toEqual([
      "image/jpeg",
      "image/jpeg",
      "image/webp",
      "application/octet-stream"
    ]);
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
