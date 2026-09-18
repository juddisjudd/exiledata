import { describe, it, expect, afterEach } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { runStage } from "../ingestion/common/src/run.js";
import { createBaseItemsValidator } from "../ingestion/common/src/extract/baseItems.js";
import { createBaseItemsStage as createPoe1Stage } from "../ingestion/poe1/src/stages/baseItems.js";
import { createBaseItemsStage as createPoe2Stage } from "../ingestion/poe2/src/stages/baseItems.js";
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

async function writeExtract(version: string, contents: Record<string, unknown>) {
  const dir = await mkdtemp(path.join(tmpdir(), "exiledata-extract-"));
  await writeFile(path.join(dir, "version.txt"), `${version}\n`, "utf8");
  await writeFile(path.join(dir, "base_items.json"), JSON.stringify(contents), "utf8");
  return dir;
}

describe("base items stage", () => {
  let dir: string | undefined;

  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
    dir = undefined;
  });

  it("normalizes a PoE 2 extract entry into a canonical BaseItem", async () => {
    dir = await writeExtract("4.5.5.3", { "Metadata/Items/Amulets/FourAmulet1": RAW_ITEM });

    const result = await runStage(createPoe2Stage(dir));

    expect(result.errors).toEqual([]);
    expect(result.entities).toHaveLength(1);

    const entity = result.entities[0]!;
    expect(entity.id).toBe("Metadata/Items/Amulets/FourAmulet1");
    expect(entity.name).toBe("Crimson Amulet");
    expect(entity.itemClass).toBe("Amulet");
    expect(entity.version).toEqual({
      schemaVersion: SCHEMA_VERSION,
      game: "poe2",
      gameVersion: "4.5.5.3"
    });
    expect(entity.source[0]?.name).toBe("poe2-ggpk-extract");
    expect(entity.source[0]?.locator).toBe("base_items.json#Metadata/Items/Amulets/FourAmulet1");
  });

  it("tags a PoE 1 extract with poe1", async () => {
    dir = await writeExtract("3.29.3.3", { "Metadata/Items/Amulets/Amulet1": RAW_ITEM });

    const result = await runStage(createPoe1Stage(dir));

    expect(result.errors).toEqual([]);
    expect(result.entities[0]?.version.game).toBe("poe1");
    expect(result.entities[0]?.source[0]?.name).toBe("poe1-ggpk-extract");
    expect(result.metadata.sources[0]).toMatchObject({
      name: "poe1-ggpk-extract",
      version: "3.29.3.3"
    });
  });

  it("keeps every other extract field in ext, including game-specific ones", async () => {
    dir = await writeExtract("4.5.5.3", {
      "Metadata/Items/Amulets/FourAmulet1": {
        ...RAW_ITEM,
        grants_buff: { id: "x" },
        skills_granted_no_reservation: ["Y"]
      }
    });

    const result = await runStage(createPoe2Stage(dir));
    const ext = result.entities[0]?.ext;

    expect(ext).toMatchObject({
      tags: ["amulet", "default"],
      release_state: "released",
      drop_level: 1,
      grants_buff: { id: "x" },
      skills_granted_no_reservation: ["Y"]
    });
    expect(ext).not.toHaveProperty("name");
    expect(ext).not.toHaveProperty("item_class");
    expect(result.entities[0]).not.toHaveProperty("tags");
  });

  it("excludes unnamed entries and warns instead of failing", async () => {
    dir = await writeExtract("4.5.5.3", {
      "Metadata/Items/Amulets/FourAmulet1": RAW_ITEM,
      "Metadata/Items/Currency/RandomFossilOutcome412": { ...RAW_ITEM, name: "" }
    });

    const result = await runStage(createPoe2Stage(dir));

    expect(result.errors).toEqual([]);
    expect(result.entities).toHaveLength(1);
    expect(result.warnings).toEqual(["skipped 1 base item(s) from the extract: empty name"]);
  });

  it("reports a fetch error when the extract directory is missing", async () => {
    const result = await runStage(createPoe2Stage(path.join(tmpdir(), "does-not-exist")));

    expect(result.entities).toEqual([]);
    expect(result.errors[0]?.stage).toBe("fetch");
  });
});

describe("base items validator", () => {
  const validator = createBaseItemsValidator("poe2");
  const entity = {
    id: "Metadata/Items/Amulets/FourAmulet1",
    name: "Crimson Amulet",
    version: { schemaVersion: SCHEMA_VERSION, game: "poe2" as const, gameVersion: "4.5.5.3" },
    source: [{ name: "poe2-ggpk-extract", retrievedAt: "2026-09-18T00:00:00.000Z" }]
  };

  it("accepts a well-formed entity", () => {
    expect(validator.validate([entity])).toEqual({ valid: true, errors: [] });
  });

  it("rejects duplicate ids", () => {
    const result = validator.validate([entity, entity]);

    expect(result.valid).toBe(false);
    expect(result.errors[0]?.message).toContain("duplicate id");
  });

  it("rejects an entity tagged with the other game", () => {
    const result = validator.validate([
      { ...entity, version: { ...entity.version, game: "poe1" as const } }
    ]);

    expect(result.valid).toBe(false);
    expect(result.errors[0]?.message).toBe('expected "poe2"');
  });

  it("rejects an entity with no provenance", () => {
    const result = validator.validate([{ ...entity, source: [] }]);

    expect(result.valid).toBe(false);
    expect(result.errors[0]?.message).toBe("no provenance recorded");
  });
});
