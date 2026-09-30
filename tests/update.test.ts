import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer, type AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { PATCH_SERVERS, parsePatchReply, patchVersion } from "../packages/cli/src/patch.js";
import { update, type Spawn } from "../packages/cli/src/update.js";
import type { DownloadIndex, Manifest } from "../packages/cli/src/release.js";
import { LocalDatasetStorage } from "../packages/storage/src/local.js";
import { LocalObjectStorage } from "../packages/storage/src/objects.js";
import { SCHEMA_VERSION } from "../packages/schema/src/common/version.js";

const CDN = "https://patch-poe2.poecdn.com/4.5.5.3/";

/** A patch server reply: protocol byte, 32 bytes, then two length-prefixed UTF-16LE strings. */
function reply(second = CDN, protocol = 2): Buffer {
  const head = Buffer.alloc(33);
  head[0] = protocol;
  const parts = [head];
  for (const text of ["https://patch-poe2.poecdn.com/", second]) {
    const length = Buffer.alloc(2);
    length.writeUInt16BE(text.length);
    parts.push(length, Buffer.from(text, "utf16le"));
  }
  return Buffer.concat(parts);
}

describe("parsePatchReply", () => {
  it("reads the patch from the CDN address", () => {
    expect(parsePatchReply(reply())).toBe("4.5.5.3");
    expect(parsePatchReply(reply("https://patch.poecdn.com/3.29.3.3"))).toBe("3.29.3.3");
  });

  it("reads a reply that does not start at the beginning of its buffer", () => {
    const padded = Buffer.concat([Buffer.from([9, 9, 9]), reply()]);
    expect(parsePatchReply(padded.subarray(3))).toBe("4.5.5.3");
  });

  it("rejects another protocol, a cut-off reply and an address without a patch", () => {
    expect(() => parsePatchReply(reply(CDN, 3))).toThrow(/protocol version 3/);
    expect(() => parsePatchReply(reply().subarray(0, 80))).toThrow();
    expect(() => parsePatchReply(reply("https://example.com/"))).toThrow(/no version/);
  });
});

describe("patchVersion", () => {
  let server: ReturnType<typeof createServer>;
  let received: number[];

  /** Answers the hello with `data`, split in two writes like a slow connection. */
  async function serve(data: Buffer): Promise<number> {
    server = createServer((socket) => {
      socket.once("data", (hello) => {
        received = [...hello];
        socket.write(data.subarray(0, 40));
        setTimeout(() => socket.end(data.subarray(40)), 20);
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    return (server.address() as AddressInfo).port;
  }

  afterEach(() => new Promise<void>((resolve) => server.close(() => resolve())));

  it("sends the game's hello and reads a reply that arrives in pieces", async () => {
    const port = await serve(reply());

    await expect(
      patchVersion("poe2", { ...PATCH_SERVERS.poe2, host: "127.0.0.1", port })
    ).resolves.toBe("4.5.5.3");
    expect(received).toEqual([1, 7]);
  });

  it("rejects a patch that does not belong to the game", async () => {
    const port = await serve(reply());

    await expect(
      patchVersion("poe1", { ...PATCH_SERVERS.poe1, host: "127.0.0.1", port })
    ).rejects.toThrow(/unexpected poe1 version 4\.5\.5\.3/);
  });

  it("fails when the server hangs up before the reply is complete", async () => {
    const port = await serve(reply().subarray(0, 60));

    await expect(
      patchVersion("poe2", { ...PATCH_SERVERS.poe2, host: "127.0.0.1", port })
    ).rejects.toThrow(/incomplete/);
  });
});

const BASE_ITEMS = {
  "Metadata/Items/Amulets/FourAmulet1": { name: "Crimson Amulet", item_class: "Amulet" }
};

async function write(file: string, text: string) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, text);
}

/** Stands in for ggpk-explorer: writes a tiny extract where the real one would. */
function fakeExplorer(calls: string[][], failOn?: string): Spawn {
  return async (command, args) => {
    calls.push([command, ...args]);
    if (args[0] === failOn) {
      const stdout = Array.from({ length: 40 }, (_, i) => `progress ${i + 1}`).join("\n");
      return { code: 3, stdout, stderr: "schema does not fit PassiveSkills" };
    }
    const out = args[args.indexOf("-o") + 1]!;
    const patch = args[args.indexOf("--cdn") + 1]!;
    if (args[0] === "export-data") {
      const dir = path.join(out, `${patch}-stripped`);
      await write(path.join(dir, "version.txt"), `${patch}\n`);
      await write(path.join(dir, "base_items.json"), JSON.stringify(BASE_ITEMS, null, 2));
      await write(path.join(dir, "base_items.min.json"), JSON.stringify(BASE_ITEMS));
    } else {
      await write(path.join(out, "version.txt"), `${patch}\n`);
      await write(path.join(out, "0_5", "tree.lua"), "return {}\n");
    }
    return { code: 0, stdout: `${args[0]} done\n`, stderr: "" };
  };
}

describe("update", () => {
  let root: string;
  let work: string;
  let store: LocalObjectStorage;
  let lines: string[];
  let calls: string[][];

  const env = (extra: Record<string, string> = {}) => ({
    DATASET_STORAGE_DRIVER: "local",
    DATASET_STORAGE_PATH: path.join(root, "datasets"),
    GGPK_EXPLORER: "/opt/ggpk-explorer",
    DAT_SCHEMA: "/tmp/schema.min.json",
    ...extra
  });
  const PATCHES = { poe1: "3.29.3.3", poe2: "4.5.6.0" };
  const run = (options: Parameters<typeof update>[0] = {}) =>
    update({
      store,
      env: env(),
      workDir: work,
      log: (line) => lines.push(line),
      currentPatch: async (game) => PATCHES[game],
      spawn: fakeExplorer(calls),
      ...options
    });
  const json = async <T>(key: string) => {
    const data = await store.get(key);
    return data ? (JSON.parse(Buffer.from(data).toString()) as T) : undefined;
  };

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), "exiledata-update-"));
    work = path.join(root, "work");
    store = new LocalObjectStorage(path.join(root, "datasets"));
    lines = [];
    calls = [];
    const index: DownloadIndex = {
      updatedAt: "2026-09-18T12:00:00.000Z",
      games: {
        poe1: { latest: "3.29.3.3", versions: [] },
        poe2: { latest: "4.5.5.3", versions: [] }
      }
    };
    await store.put("downloads/index.json", JSON.stringify(index), {
      contentType: "application/json"
    });
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("reports the games whose current patch is not published, for GitHub Actions too", async () => {
    const output = path.join(root, "github-output");
    const stale = await run({
      check: true,
      env: env({ GITHUB_OUTPUT: output }),
      spawn: fakeExplorer(calls, "export-data")
    });

    expect(stale).toEqual(["poe2"]);
    expect(lines).toEqual([
      "poe1: patch 3.29.3.3, published 3.29.3.3",
      "poe2: patch 4.5.6.0, published 4.5.5.3"
    ]);
    expect(await readFile(output, "utf8")).toBe("stale=poe2\n");
    expect(calls).toEqual([]);
  });

  it("counts every game as stale with --force, and with nothing published", async () => {
    expect(await run({ check: true, force: true })).toEqual(["poe1", "poe2"]);

    await rm(path.join(root, "datasets", "downloads"), { recursive: true });
    lines = [];
    expect(await run({ check: true, games: ["poe2"] })).toEqual(["poe2"]);
    expect(lines).toEqual(["poe2: patch 4.5.6.0, published none"]);
  });

  it("exports the new patch and its trees, ingests it and publishes it", async () => {
    await run();

    const out = path.join(work, "poe2");
    const extract = path.join(out, "4.5.6.0-stripped");
    const schema = ["--schema", "/tmp/schema.min.json"];
    expect(calls).toEqual([
      [
        "/opt/ggpk-explorer",
        "export-data",
        "--cdn",
        "4.5.6.0",
        "--poe2",
        "--trade-stats",
        "--strip-null",
        "-o",
        out,
        ...schema
      ],
      [
        "/opt/ggpk-explorer",
        "export-tree",
        "--cdn",
        "4.5.6.0",
        "--poe2",
        "--flat",
        "-o",
        path.join(extract, "pob_tree"),
        ...schema
      ]
    ]);

    const index = (await json<DownloadIndex>("downloads/index.json"))!;
    expect(index.games.poe2!.latest).toBe("4.5.6.0");
    expect(index.games.poe1!.latest).toBe("3.29.3.3");
    const manifest = (await json<Manifest>("downloads/poe2/4.5.6.0/manifest.json"))!;
    expect(manifest.trees!.map((t) => t.archive.path)).toEqual(["poe2-4.5.6.0-pob-tree-0_5.zip"]);
    expect(
      Buffer.from((await store.get("downloads/poe2/4.5.6.0/pob_tree/0_5/tree.lua"))!).toString()
    ).toBe("return {}\n");
    expect(await store.get("downloads/poe2/4.5.6.0/pob_tree/version.txt")).toBeUndefined();
    const dataset = await new LocalDatasetStorage(path.join(root, "datasets")).get(
      "poe2",
      "4.5.6.0"
    );
    expect(JSON.parse(dataset!).entities.map((e: { name: string }) => e.name)).toEqual([
      "Crimson Amulet"
    ]);
    expect(await readFile(path.join(out, "4.5.6.0.log"), "utf8")).toContain(
      "$ ggpk-explorer export-tree --cdn 4.5.6.0 --poe2 --flat"
    );
  });

  it("keeps a dataset that is already ingested, unless forced", async () => {
    const metadata = {
      game: "poe2" as const,
      gameVersion: "4.5.6.0",
      generatedAt: "2026-09-20T12:00:00.000Z",
      schemaVersion: SCHEMA_VERSION,
      sources: []
    };
    const records = [{ id: "Earlier", name: "Earlier build", itemClass: "Amulet" }];
    await new LocalDatasetStorage(path.join(root, "datasets")).put(
      metadata,
      JSON.stringify({ metadata, entities: records })
    );

    await run();

    expect(lines).toContain(
      "poe2: 4.5.6.0 is already in local:" + path.join(root, "datasets") + "; keeping it."
    );
    const normalized = await json("downloads/poe2/4.5.6.0/normalized/base_items.min.json");
    expect(normalized).toEqual(records);
  });

  it("writes nothing to storage on a dry run", async () => {
    await run({ dryRun: true });

    expect(calls).toHaveLength(2);
    expect((await json<DownloadIndex>("downloads/index.json"))!.games.poe2!.latest).toBe("4.5.5.3");
    expect(await store.get("downloads/poe2/4.5.6.0/manifest.json")).toBeUndefined();
    expect(
      await new LocalDatasetStorage(path.join(root, "datasets")).get("poe2", "4.5.6.0")
    ).toBeUndefined();
  });

  it("fails with the end of ggpk-explorer's output and publishes nothing", async () => {
    await expect(run({ spawn: fakeExplorer(calls, "export-tree") })).rejects.toThrow(
      /Update failed for poe2/
    );

    const failure = lines.find((line) => line.startsWith("poe2: update failed"))!;
    expect(failure).toContain("ggpk-explorer export-tree exited with 3");
    expect(failure).toContain("schema does not fit PassiveSkills");
    expect(failure).toContain("progress 40");
    expect(failure).not.toContain("progress 20\n");
    const log = await readFile(path.join(work, "poe2", "4.5.6.0.log"), "utf8");
    expect(log).toContain("progress 1\n");
    expect(await store.get("downloads/poe2/4.5.6.0/manifest.json")).toBeUndefined();
  });
});
