import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { CURRENT_KEY, publishCurrentPatch } from "../packages/cli/src/current.js";
import { LocalObjectStorage } from "../packages/storage/src/objects.js";

describe("publishCurrentPatch", () => {
  let root: string;
  let store: LocalObjectStorage;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), "exiledata-current-"));
    store = new LocalObjectStorage(root);
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("publishes both games' current patch", async () => {
    const patches: Record<string, string> = { poe1: "3.29.3.3", poe2: "0.5.5.4" };
    const current = await publishCurrentPatch({
      store,
      currentPatch: async (game) => patches[game]!,
      now: () => new Date("2026-10-23T12:00:00.000Z")
    });

    expect(current).toEqual({
      checkedAt: "2026-10-23T12:00:00.000Z",
      games: { poe1: "3.29.3.3", poe2: "0.5.5.4" }
    });
    const stored = await store.get(CURRENT_KEY);
    expect(JSON.parse(Buffer.from(stored!).toString("utf8"))).toEqual(current);
  });

  it("keeps a game's last published patch when its patch server does not answer", async () => {
    await publishCurrentPatch({
      store,
      currentPatch: async () => "3.29.3.3",
      now: () => new Date("2026-10-23T12:00:00.000Z")
    });

    const current = await publishCurrentPatch({
      store,
      games: ["poe1", "poe2"],
      currentPatch: async (game) => {
        if (game === "poe2") throw new Error("patch.pathofexile2.com did not answer");
        return "3.29.4.1";
      },
      now: () => new Date("2026-10-23T12:05:00.000Z")
    });

    expect(current.games).toEqual({ poe1: "3.29.4.1", poe2: "3.29.3.3" });
  });

  it("only checks the requested games", async () => {
    const current = await publishCurrentPatch({
      store,
      games: ["poe1"],
      currentPatch: async () => "3.29.3.3",
      now: () => new Date("2026-10-23T12:00:00.000Z")
    });

    expect(current.games).toEqual({ poe1: "3.29.3.3" });
  });
});
