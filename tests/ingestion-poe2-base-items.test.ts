import { describe, it, expect, afterEach } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { runStage } from "../ingestion/common/src/run.js";
import { createBaseItemsStage } from "../ingestion/poe2/src/stages/baseItems.js";
import { baseItemsValidator } from "../ingestion/poe2/src/validators/baseItems.js";
import { SCHEMA_VERSION } from "../packages/schema/src/common/version.js";

const RAW_ITEM = {
  domain: "item",
  drop_level: 1,
  implicits: ["AmuletImplicitLifeRegeneration1"],
  implicit_text: ["(2-4) Life Regeneration per second"],
  inherits_from: "Metadata/Items/Amulets/AbstractAmulet",
  inventory_height: 1,
  inventory_width: 1,
  item_class: "Amulet",
  name: "Crimson Amulet",
  properties: {},
  release_state: "released",
  tags: ["amulet", "default"],
  visual_identity: { id: "FourAmulet1_", dds_file: "Art/2DItems/CrimsonAmulet.dds" }
};

async function writeExtract(contents: Record<string, unknown>): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "exiledata-extract-"));
  await writeFile(path.join(dir, "version.txt"), "4.5.4.11\n", "utf8");
  await writeFile(path.join(dir, "base_items.json"), JSON.stringify(contents), "utf8");
  return dir;
}

describe("poe2 base items stage", () => {
  let dir: string | undefined;

  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
    dir = undefined;
  });

  it("normalizes an extract entry into a canonical BaseItem", async () => {
    dir = await writeExtract({ "Metadata/Items/Amulets/FourAmulet1": RAW_ITEM });

    const result = await runStage(createBaseItemsStage(dir));

    expect(result.errors).toEqual([]);
    expect(result.entities).toHaveLength(1);

    const entity = result.entities[0]!;
    expect(entity.id).toBe("Metadata/Items/Amulets/FourAmulet1");
    expect(entity.name).toBe("Crimson Amulet");
    expect(entity.itemClass).toBe("Amulet");
    expect(entity.version).toEqual({
      schemaVersion: SCHEMA_VERSION,
      game: "poe2",
      gameVersion: "4.5.4.11"
    });
    expect(entity.source[0]?.name).toBe("poe2-ggpk-extract");
    expect(entity.source[0]?.locator).toContain("base_items.json#");
  });

  it("keeps source-shaped fields in ext rather than promoting them", async () => {
    dir = await writeExtract({ "Metadata/Items/Amulets/FourAmulet1": RAW_ITEM });

    const result = await runStage(createBaseItemsStage(dir));

    expect(result.entities[0]?.ext).toMatchObject({
      tags: ["amulet", "default"],
      release_state: "released",
      drop_level: 1
    });
    expect(result.entities[0]).not.toHaveProperty("tags");
  });

  it("reports the source version from version.txt", async () => {
    dir = await writeExtract({ "Metadata/Items/Amulets/FourAmulet1": RAW_ITEM });

    const result = await runStage(createBaseItemsStage(dir));

    expect(result.metadata.sources[0]?.version).toBe("4.5.4.11");
  });

  it("excludes unnamed entries and warns instead of failing", async () => {
    dir = await writeExtract({
      "Metadata/Items/Amulets/FourAmulet1": RAW_ITEM,
      "Metadata/Items/Currency/RandomFossilOutcome412": { ...RAW_ITEM, name: "" }
    });

    const result = await runStage(createBaseItemsStage(dir));

    expect(result.errors).toEqual([]);
    expect(result.entities).toHaveLength(1);
    expect(result.warnings).toEqual(["skipped 1 base item(s) from the extract: empty name"]);
  });

  it("reports a fetch error when the extract directory is missing", async () => {
    const result = await runStage(createBaseItemsStage(path.join(tmpdir(), "does-not-exist")));

    expect(result.entities).toEqual([]);
    expect(result.errors[0]?.stage).toBe("fetch");
  });
});

describe("baseItemsValidator", () => {
  const entity = {
    id: "Metadata/Items/Amulets/FourAmulet1",
    name: "Crimson Amulet",
    version: { schemaVersion: SCHEMA_VERSION, game: "poe2" as const, gameVersion: "4.5.4.11" },
    source: [{ name: "poe2-ggpk-extract", retrievedAt: "2026-09-04T00:00:00.000Z" }]
  };

  it("accepts a well-formed entity", () => {
    expect(baseItemsValidator.validate([entity])).toEqual({ valid: true, errors: [] });
  });

  it("rejects duplicate ids", () => {
    const result = baseItemsValidator.validate([entity, entity]);

    expect(result.valid).toBe(false);
    expect(result.errors[0]?.message).toContain("duplicate id");
  });

  it("rejects an entity with no provenance", () => {
    const result = baseItemsValidator.validate([{ ...entity, source: [] }]);

    expect(result.valid).toBe(false);
    expect(result.errors[0]?.message).toBe("no provenance recorded");
  });
});
