import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import {
  PatchFiles,
  fileLinks,
  fileNodes,
  renderStats,
  stripMarkup,
  type FileMapData
} from "../apps/docs/src/file-map-data.js";
import { fileMapPage, fileMapSection } from "../apps/docs/src/file-map.js";

function patch(files: Record<string, unknown>): PatchFiles {
  const encoder = new TextEncoder();
  return new PatchFiles(
    "poe2",
    "0.0.0",
    new Map(
      Object.entries(files).map(([name, json]) => [
        `${name}.min.json`,
        encoder.encode(JSON.stringify(json))
      ])
    )
  );
}

const HANDLERS = {
  negate: { type: "int", multiplier: -1 },
  per_minute_to_per_second_2dp_if_required: { type: "int", divisor: 60, precision: 2 }
};

const ENTRIES = [
  {
    ids: ["life_regeneration_rate_per_minute_%"],
    English: [
      {
        condition: [{ min: 1 }],
        format: ["#"],
        index_handlers: [["per_minute_to_per_second_2dp_if_required"]],
        string: "Regenerate {0}% of [Life|Life] per second"
      },
      {
        condition: [{ max: -1 }],
        format: ["#"],
        index_handlers: [["negate"]],
        string: "{0}% less Life Regeneration"
      }
    ]
  },
  {
    ids: ["additional_strength"],
    English: [
      { condition: [{}], format: ["+#"], index_handlers: [[]], string: "{0} to [Strength]" }
    ]
  }
];

describe("file map data", () => {
  it("counts how many of a field's values resolve and keeps examples of the misses", () => {
    const p = patch({
      base_items: {
        A: { item_class: "Ring" },
        B: { item_class: "Rings" },
        C: { item_class: "Ring" }
      },
      item_classes: { Ring: { name: "Rings" } }
    });
    const links = fileLinks(p, fileNodes(p, {}));
    expect(links).toEqual([
      expect.objectContaining({
        from: "base_items",
        to: "item_classes",
        field: "item_class",
        hit: 2,
        total: 3,
        miss: ["Rings"]
      })
    ]);
  });

  it("leaves out links whose files are not in the patch", () => {
    const p = patch({ base_items: { A: { item_class: "Ring", implicits: ["X"] } } });
    expect(fileLinks(p, fileNodes(p, {}))).toEqual([]);
  });

  it("renders stats through the variant whose condition fits, then its value handlers", () => {
    const lines = renderStats(ENTRIES, HANDLERS, {
      "life_regeneration_rate_per_minute_%": 96,
      additional_strength: 14
    });
    expect(lines.map((l) => l.text)).toEqual([
      "Regenerate 1.6% of Life per second",
      "+14 to Strength"
    ]);
    expect(
      renderStats(ENTRIES, HANDLERS, { "life_regeneration_rate_per_minute_%": -30 })[0]?.text
    ).toBe("30% less Life Regeneration");
  });

  it("leaves out stats that have no text, as the game does", () => {
    expect(renderStats(ENTRIES, HANDLERS, { hidden_stat: 1 })).toEqual([]);
  });

  it("shows the text after the bar in markup", () => {
    expect(stripMarkup("+8% to [CriticalDamageBonus|Critical Damage Bonus] with [Strength]")).toBe(
      "+8% to Critical Damage Bonus with Strength"
    );
  });
});

describe("file map page", () => {
  const data = readFile(new URL("../apps/docs/data/file-map.json", import.meta.url), "utf8").then(
    (text) => JSON.parse(text) as FileMapData
  );

  it("has a map position for every file of both games", async () => {
    const { games } = await data;
    expect(Object.keys(games).sort()).toEqual(["poe1", "poe2"]);
    for (const map of Object.values(games)) expect(() => fileMapSection(map!)).not.toThrow();
  });

  it("highlights only links and files that exist", async () => {
    for (const map of Object.values((await data).games)) {
      const links = new Set(map!.links.map((l) => `${l.from}>${l.to}`));
      for (const example of map!.examples) {
        for (const link of example.path.links)
          expect(links.has(link), `${map!.game} ${link}`).toBe(true);
        for (const file of Object.keys(example.path.badges))
          expect(map!.nodes[file], `${map!.game} ${file}`).toBeDefined();
      }
    }
  });

  it("explains every tooltip line it pins", async () => {
    for (const map of Object.values((await data).games)) {
      for (const example of map!.examples) {
        const rows = example.tooltip.blocks.flat().flatMap((line) => (line.row ? [line.row] : []));
        expect(new Set([example.tooltip.nameRow, ...rows]).size).toBe(example.rows.length);
        expect(Math.max(...rows)).toBe(example.rows.length);
      }
    }
  });

  it("adds the scripts once, only to a page with a marker", async () => {
    const page = fileMapPage("<!-- file-map poe2 -->\n<!-- file-map poe1 -->", await data);
    expect(page.match(/file-map\.js/g)).toHaveLength(1);
    expect(page).toContain('data-game="poe2"');
    expect(page).toContain('data-game="poe1"');
    expect(fileMapPage("<p>No map here.</p>", await data)).toBe("<p>No map here.</p>");
  });
});
