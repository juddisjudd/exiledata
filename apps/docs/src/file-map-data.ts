// Builds the File map data from one published patch, offline, via scripts/write-file-map.ts.

export type Game = "poe1" | "poe2";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- export records are untyped JSON whose shape changes between patches
type J = any;

/** One patch's minified JSON files, keyed by path inside the patch folder, such as `mods.min.json`. */
export class PatchFiles {
  private readonly parsed = new Map<string, J>();

  constructor(
    readonly game: Game,
    readonly patch: string,
    private readonly files: Map<string, Uint8Array>
  ) {}

  has(name: string): boolean {
    return this.files.has(`${name}.min.json`);
  }

  size(name: string): number {
    return this.files.get(`${name}.min.json`)?.byteLength ?? 0;
  }

  /** A file by name without the `.min.json` suffix, such as `mods` or `passive_skill_trees/Default`. */
  get(name: string): J {
    const path = `${name}.min.json`;
    if (!this.parsed.has(path)) {
      const bytes = this.files.get(path);
      if (!bytes) throw new Error(`${this.game} ${this.patch}: no ${path}`);
      this.parsed.set(path, JSON.parse(new TextDecoder().decode(bytes)));
    }
    return this.parsed.get(path);
  }

  /** File names directly at the top of the patch. */
  topLevel(): string[] {
    return [...this.files.keys()]
      .filter((p) => !p.includes("/"))
      .map((p) => p.replace(/\.min\.json$/, ""))
      .sort();
  }

  folders(): string[] {
    return [
      ...new Set([...this.files.keys()].filter((p) => p.includes("/")).map((p) => p.split("/")[0]!))
    ].sort();
  }

  /** Every file name under a folder, at any depth. */
  under(folder: string): string[] {
    return [...this.files.keys()]
      .filter((p) => p.startsWith(`${folder}/`))
      .map((p) => p.replace(/\.min\.json$/, ""))
      .sort();
  }
}

export interface FileNode {
  id: string;
  description?: string;
  /** `object`: records by key. `array`: a list of records. `list`: a list of ids. */
  shape: "object" | "array" | "list" | "folder";
  /** The first key, id or file name, as an example. */
  sample?: string;
  /** Records in a file, or files in a folder. */
  count: number;
  bytes?: number;
  folder?: boolean;
  /** Records across a folder's files. */
  records?: number;
  /** For passive_skill_trees/: the tree names. */
  trees?: string[];
}

export type LinkKind = "key" | "same" | "text" | "value";

export interface FileLink {
  from: string;
  to: string;
  field: string;
  kind: LinkKind;
  hit: number;
  total: number;
  /** Up to three values that did not resolve. */
  miss: string[];
  note?: string;
}

export type Color =
  | "grey"
  | "white"
  | "affix"
  | "normal"
  | "magic"
  | "rare"
  | "unique"
  | "gem"
  | "currency"
  | "flavour";

export interface Part {
  text: string;
  color: Color;
}

/** One tooltip line. `row` is the 1-based explanation row it belongs to. */
export interface Line {
  row?: number;
  parts: Part[];
}

export interface Tooltip {
  frame: "normal" | "magic" | "rare" | "unique" | "gem" | "currency" | "plain";
  name: string[];
  nameColor: Color;
  /** The explanation row for the name in the header. */
  nameRow?: number;
  /** Line groups, drawn with a separator between them. */
  blocks: Line[][];
}

/** Text fields may hold `code` spans in backticks. */
export interface Row {
  code: string;
  value?: string;
  note?: string;
  steps: number[];
}

export interface Step {
  code: string;
  text: string;
}

export interface Example {
  id: string;
  title: string;
  subject: string;
  tooltip: Tooltip;
  rows: Row[];
  steps: Step[];
  /** Links to light up on the map, as `from>to`, and the step number shown on each file. */
  path: { links: string[]; badges: Record<string, number> };
  code?: string;
}

export interface Gap {
  title: string;
  text: string;
}

export interface GameMap {
  game: Game;
  patch: string;
  nodes: Record<string, FileNode>;
  links: FileLink[];
  examples: Example[];
  gaps: Gap[];
}

export interface FileMapData {
  generatedAt: string;
  games: Partial<Record<Game, GameMap>>;
}

/** The parts of a patch's manifest.json the map reads. */
export interface Manifest {
  folders?: Record<string, string>;
  files?: Array<{ path: string; description?: string }>;
}

const values = (x: J): J[] =>
  (x == null ? [] : Array.isArray(x) ? x : Object.values(x)).filter((v: J) => v != null);
const keys = (x: J): string[] => (x == null ? [] : Array.isArray(x) ? x : Object.keys(x));
const fmt = (n: number) => n.toLocaleString("en-US");

/** "a", "a and b", "a, b and c". */
const list = (items: string[]) =>
  items.length < 2 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;

/** `{ level: 22, strength: 41 }`, leaving out zero values. */
const record = (o: Record<string, unknown>) =>
  `{ ${Object.entries(o)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}: ${v}`)
    .join(", ")} }`;

/** `[Id|Text]` shows Text, `[Id]` shows Id. */
export function stripMarkup(text: string): string {
  return text.replace(/\[([^\]|]+)\|([^\]]+)\]/g, "$2").replace(/\[([^\]]+)\]/g, "$1");
}

export function markupIds(text: string | undefined): string[] {
  return [...(text ?? "").matchAll(/\[([^\]|]+)(?:\|[^\]]*)?\]/g)].map((m) => m[1]!);
}

/** Every exported file and folder, with record counts and the manifest's descriptions. */
export function fileNodes(p: PatchFiles, manifest: Manifest): Record<string, FileNode> {
  const describe = new Map(
    (manifest.files ?? []).map((f) => [f.path.replace(/\.json$/, ""), f.description])
  );
  const nodes: Record<string, FileNode> = {};
  const file = (name: string): FileNode => {
    const j = p.get(name);
    const first = Array.isArray(j) ? j[0] : Object.keys(j)[0];
    const shape = !Array.isArray(j) ? "object" : typeof first === "string" ? "list" : "array";
    const sample =
      shape === "object" || shape === "list" ? String(first) : (first?.id ?? first?.metadata_id);
    return {
      id: name,
      description: describe.get(name),
      shape,
      ...(sample ? { sample } : {}),
      count: keys(j).length,
      bytes: p.size(name)
    };
  };
  for (const name of p.topLevel()) nodes[name] = file(name);
  for (const folder of p.folders()) {
    const files = p.under(folder);
    if (folder === "normalized") {
      for (const f of files) nodes[f] = file(f);
      continue;
    }
    const id = `${folder}/`;
    const records = files.reduce((n, f) => {
      const j = p.get(f);
      return n + (folder === "passive_skill_trees" ? keys(j.passives).length : keys(j).length);
    }, 0);
    const sample =
      `${files.find((f) => /\/(stat_descriptions|Default)$/.test(f)) ?? files[0]}.json`.replace(
        `${folder}/`,
        ""
      );
    nodes[id] = {
      id,
      description: manifest.folders?.[folder],
      shape: "folder",
      sample,
      count: files.length,
      folder: true,
      records
    };
    if (folder === "passive_skill_trees") nodes[id].trees = files.map((f) => f.split("/").pop()!);
  }
  return nodes;
}

/** Shared lookups over a patch, built once. */
class Ctx {
  private memo = new Map<string, unknown>();
  constructor(readonly p: PatchFiles) {}

  private once<T>(key: string, make: () => T): T {
    if (!this.memo.has(key)) this.memo.set(key, make());
    return this.memo.get(key) as T;
  }

  has = (name: string) => this.p.has(name);
  file = (name: string) => this.p.get(name);
  v = (name: string): J[] => values(this.p.get(name));
  keys = (name: string): Set<string> =>
    this.once(`k:${name}`, () => new Set(keys(this.p.get(name))));

  passives = (): J[] =>
    this.once("passives", () =>
      this.p.under("passive_skill_trees").flatMap((t) => values(this.p.get(t).passives))
    );
  passiveIds = () =>
    this.once("passiveIds", () => new Set(this.passives().map((x) => x.id as string)));
  statEntries = (): J[] =>
    this.once("st", () =>
      this.p
        .under("stat_translations")
        .flatMap((f) => (Array.isArray(this.p.get(f)) ? this.p.get(f) : []))
    );
  statFiles = () =>
    this.once(
      "stf",
      () =>
        new Set(this.p.under("stat_translations").map((f) => f.replace(/^stat_translations\//, "")))
    );
  translated = () =>
    this.once("tr", () => new Set(this.statEntries().flatMap((e) => e.ids as string[])));
  gemItemIds = () =>
    this.once("gems", () => new Set(this.v("skill_gems").map((g) => g.base_item?.id as string)));
  activeSkillIds = () =>
    this.once(
      "asid",
      () =>
        new Set(
          this.v("skills")
            .map((s) => s.active_skill?.id as string)
            .filter(Boolean)
        )
    );
  itemClassNames = () =>
    this.once("icn", () => new Set(this.v("item_classes").map((c) => c.name as string)));
  packIds = () =>
    this.once(
      "packs",
      () =>
        new Set(this.v("world_areas").flatMap((a) => values(a.packs).map((x) => x.id as string)))
    );
}

interface LinkDef {
  from: string;
  to: string;
  kind?: LinkKind;
  note?: string;
  target: (c: Ctx) => Set<string>;
  /** Each field that can hold the link, and how to read its values. Fields with no values are left out of the label. */
  fields: Array<[string, (c: Ctx) => unknown[]]>;
}

const markupLink = (
  from: string,
  label: string,
  read: (c: Ctx) => Array<string | undefined>
): LinkDef => ({
  from,
  to: "keywords",
  kind: "text",
  note: "Unmatched ids are placeholders such as DNT, or terms with no keyword entry.",
  target: (c) => c.keys("keywords"),
  fields: [[label, (c) => read(c).flatMap(markupIds)]]
});

const LINKS: LinkDef[] = [
  // Items
  {
    from: "base_items",
    to: "item_classes",
    target: (c) => c.keys("item_classes"),
    fields: [["item_class", (c) => c.v("base_items").map((b) => b.item_class)]]
  },
  {
    from: "base_items",
    to: "mods",
    target: (c) => c.keys("mods"),
    fields: [["implicits[]", (c) => c.v("base_items").flatMap((b) => b.implicits ?? [])]]
  },
  {
    from: "base_items",
    to: "tags",
    target: (c) => c.keys("tags"),
    fields: [["tags[]", (c) => c.v("base_items").flatMap((b) => b.tags ?? [])]]
  },
  {
    from: "base_items",
    to: "skill_gems",
    target: (c) => c.gemItemIds(),
    fields: [["skills_granted[]", (c) => c.v("base_items").flatMap((b) => b.skills_granted ?? [])]]
  },
  {
    from: "base_items",
    to: "buffs",
    target: (c) => c.keys("buffs"),
    fields: [["grants_buff.id", (c) => c.v("base_items").map((b) => b.grants_buff?.id)]]
  },
  markupLink("base_items", "[Id|text] in properties.description", (c) =>
    c.v("base_items").map((b) => b.properties?.description)
  ),
  markupLink("item_classes", "[Id|text] in category", (c) =>
    c.v("item_classes").map((x) => x.category)
  ),
  {
    from: "skill_gems",
    to: "base_items",
    target: (c) => c.keys("base_items"),
    fields: [["base_item.id", (c) => c.v("skill_gems").map((g) => g.base_item?.id)]]
  },
  {
    from: "skill_gems",
    to: "skills",
    target: (c) => c.keys("skills"),
    fields: [
      ["grants_skills[]", (c) => c.v("skill_gems").flatMap((g) => g.grants_skills ?? [])],
      ["secondary_granted_effect", (c) => c.v("skill_gems").map((g) => g.secondary_granted_effect)]
    ]
  },
  {
    from: "skill_gems",
    to: "skill_gems",
    note: "These hold item paths, so they match skill_gems[].base_item.id.",
    target: (c) => c.gemItemIds(),
    fields: [
      [
        "recommended_supports[]",
        (c) => c.v("skill_gems").flatMap((g) => g.recommended_supports ?? [])
      ],
      ["vaal_variant", (c) => c.v("skill_gems").map((g) => g.vaal_variant)]
    ]
  },
  {
    from: "skill_gems",
    to: "gem_tags",
    note: "Tags without a gem_tags entry, such as intelligence or grants_active_skill, are not shown in game.",
    target: (c) => c.keys("gem_tags"),
    fields: [["tags[]", (c) => c.v("skill_gems").flatMap((g) => g.tags ?? [])]]
  },
  {
    from: "mods_by_base",
    to: "item_classes",
    note: "Keyed by the plural class name, such as “One Hand Maces”, not the class id.",
    target: (c) => c.itemClassNames(),
    fields: [["key = item_classes[].name", (c) => keys(c.file("mods_by_base"))]]
  },
  {
    from: "mods_by_base",
    to: "base_items",
    target: (c) => c.keys("base_items"),
    fields: [
      [
        "[class][tags].bases[]",
        (c) => c.v("mods_by_base").flatMap((x) => values(x).flatMap((t) => t.bases ?? []))
      ]
    ]
  },
  {
    from: "mods_by_base",
    to: "mods",
    note: "Each value is the mod’s required level, not a spawn weight.",
    target: (c) => c.keys("mods"),
    fields: [
      [
        "[class][tags].mods.{generation}.{type}.{id}",
        (c) =>
          c
            .v("mods_by_base")
            .flatMap((x) =>
              values(x).flatMap((t) => values(t.mods).flatMap((g) => values(g).flatMap(keys)))
            )
      ]
    ]
  },
  {
    from: "uniques",
    to: "item_classes",
    note: "The rest use loose names such as Focii, Mace or Flask.",
    target: (c) => c.keys("item_classes"),
    fields: [["item_class", (c) => c.v("uniques").map((u) => u.item_class)]]
  },
  {
    from: "uniques",
    to: "unique_details",
    kind: "same",
    target: (c) => c.keys("unique_details"),
    fields: [
      [
        "same key",
        (c) =>
          Object.entries(c.file("uniques")).map(([k, u]) =>
            c.file("unique_details")[k]?.name === (u as J).name ? k : `${k}?`
          )
      ]
    ]
  },
  {
    from: "augments",
    to: "base_items",
    kind: "same",
    target: (c) => c.keys("base_items"),
    fields: [["key", (c) => keys(c.file("augments"))]]
  },
  {
    from: "augments",
    to: "item_classes",
    target: (c) => c.keys("item_classes"),
    fields: [
      [
        "categories.*.target_item_classes[]",
        (c) =>
          c
            .v("augments")
            .flatMap((a) => values(a.categories).flatMap((x) => x.target_item_classes ?? []))
      ]
    ]
  },
  {
    from: "augments",
    to: "stats",
    target: (c) => c.keys("stats"),
    fields: [
      [
        "categories.*.stats[].id",
        (c) =>
          c
            .v("augments")
            .flatMap((a) => values(a.categories).flatMap((x) => values(x.stats).map((s) => s.id)))
      ]
    ]
  },
  {
    from: "essences",
    to: "base_items",
    kind: "same",
    target: (c) => c.keys("base_items"),
    fields: [["key", (c) => keys(c.file("essences"))]]
  },
  {
    from: "essences",
    to: "essences",
    target: (c) => c.keys("essences"),
    fields: [["upgrade_result", (c) => c.v("essences").map((e) => e.upgrade_result)]]
  },
  {
    from: "essences",
    to: "mods",
    target: (c) => c.keys("mods"),
    fields: [
      ["mods[].mod", (c) => c.v("essences").flatMap((e) => values(e.mods).map((m) => m.mod))],
      ["monster_mod", (c) => c.v("essences").map((e) => e.monster_mod)],
      ["monster_mods[]", (c) => c.v("essences").flatMap((e) => e.monster_mods ?? [])],
      ["monster_tank_mods[]", (c) => c.v("essences").flatMap((e) => e.monster_tank_mods ?? [])],
      ["display_mods", (c) => c.v("essences").flatMap((e) => values(e.display_mods))],
      ["memory_lines[]", (c) => c.v("essences").flatMap((e) => e.memory_lines ?? [])]
    ]
  },
  {
    from: "essences",
    to: "item_classes",
    target: (c) => c.keys("item_classes"),
    fields: [
      [
        "mods[].item_classes[]",
        (c) => c.v("essences").flatMap((e) => values(e.mods).flatMap((m) => m.item_classes ?? []))
      ]
    ]
  },
  {
    from: "essences",
    to: "stats",
    target: (c) => c.keys("stats"),
    fields: [["map_stat", (c) => c.v("essences").map((e) => e.map_stat)]]
  },
  {
    from: "liquid_emotions",
    to: "base_items",
    kind: "same",
    target: (c) => c.keys("base_items"),
    fields: [["key", (c) => keys(c.file("liquid_emotions"))]]
  },
  {
    from: "liquid_emotions",
    to: "mods",
    target: (c) => c.keys("mods"),
    fields: [
      [
        "mods.{jewel}.{prefix|suffix}",
        (c) => c.v("liquid_emotions").flatMap((l) => values(l.mods).flatMap(values))
      ]
    ]
  },
  {
    from: "crafting_bench_options",
    to: "mods",
    target: (c) => c.keys("mods"),
    fields: [
      ["mod", (c) => c.v("crafting_bench_options").map((o) => o.mod)],
      ["enchantment", (c) => c.v("crafting_bench_options").map((o) => o.enchantment)]
    ]
  },
  {
    from: "crafting_bench_options",
    to: "base_items",
    target: (c) => c.keys("base_items"),
    fields: [
      [
        "cost[].item",
        (c) => c.v("crafting_bench_options").flatMap((o) => values(o.cost).map((x) => x.item))
      ]
    ]
  },
  {
    from: "crafting_bench_options",
    to: "item_classes",
    target: (c) => c.keys("item_classes"),
    fields: [
      ["item_classes[]", (c) => c.v("crafting_bench_options").flatMap((o) => o.item_classes ?? [])]
    ]
  },
  {
    from: "base_items/",
    to: "base_items",
    kind: "same",
    target: (c) => c.keys("base_items"),
    fields: [
      [
        "same records, one file per class",
        (c) => c.p.under("base_items").flatMap((f) => keys(c.file(f)))
      ]
    ]
  },
  {
    from: "normalized/base_items",
    to: "base_items",
    kind: "same",
    target: (c) => c.keys("base_items"),
    fields: [["id", (c) => c.v("normalized/base_items").map((n) => n.id)]]
  },

  // Mods and stats
  {
    from: "mods",
    to: "stats",
    target: (c) => c.keys("stats"),
    fields: [["stats[].id", (c) => c.v("mods").flatMap((m) => values(m.stats).map((s) => s.id))]]
  },
  {
    from: "mods",
    to: "tags",
    target: (c) => c.keys("tags"),
    fields: [
      [
        "spawn_weights[].tag",
        (c) => c.v("mods").flatMap((m) => values(m.spawn_weights).map((s) => s.tag))
      ],
      [
        "generation_weights[].tag",
        (c) => c.v("mods").flatMap((m) => values(m.generation_weights).map((s) => s.tag))
      ],
      ["adds_tags[]", (c) => c.v("mods").flatMap((m) => m.adds_tags ?? [])],
      ["implicit_tags[]", (c) => c.v("mods").flatMap((m) => m.implicit_tags ?? [])]
    ]
  },
  {
    from: "mods",
    to: "skills",
    target: (c) => c.keys("skills"),
    fields: [
      [
        "grants_effects[].granted_effect_id",
        (c) => c.v("mods").flatMap((m) => values(m.grants_effects).map((g) => g.granted_effect_id))
      ],
      [
        "granted_skills[].granted_effect",
        (c) => c.v("mods").flatMap((m) => values(m.granted_skills).map((g) => g.granted_effect))
      ]
    ]
  },
  {
    from: "mods",
    to: "skill_gems",
    target: (c) => c.gemItemIds(),
    fields: [
      [
        "granted_skills[].skill_gem",
        (c) => c.v("mods").flatMap((m) => values(m.granted_skills).map((g) => g.skill_gem))
      ]
    ]
  },
  markupLink("mods", "[Id|text] in text", (c) => c.v("mods").map((m) => m.text)),
  {
    from: "tag_details",
    to: "tags",
    kind: "same",
    target: (c) => c.keys("tags"),
    fields: [["same key", (c) => keys(c.file("tag_details"))]]
  },
  {
    from: "stats",
    to: "skills",
    note: "These match skills[].active_skill.id, not the skills key.",
    target: (c) => c.activeSkillIds(),
    fields: [["active_skills[]", (c) => c.v("stats").flatMap((s) => s.active_skills ?? [])]]
  },
  {
    from: "stat_translations/",
    to: "stats",
    target: (c) => c.keys("stats"),
    fields: [["ids[]", (c) => c.statEntries().flatMap((e) => e.ids ?? [])]]
  },
  {
    from: "stat_translations/",
    to: "stat_value_handlers",
    target: (c) => c.keys("stat_value_handlers"),
    fields: [
      [
        "English[].index_handlers",
        (c) =>
          c
            .statEntries()
            .flatMap((e) => values(e.English).flatMap((x) => (x.index_handlers ?? []).flat()))
      ]
    ]
  },
  markupLink("stat_translations/", "[Id|text] in English[].string", (c) =>
    c.statEntries().flatMap((e) => values(e.English).map((x) => x.string))
  ),
  {
    from: "stats_by_file",
    to: "stat_translations/",
    target: (c) => c.statFiles(),
    fields: [
      [
        "files[]",
        (c) =>
          c
            .v("stats_by_file")
            .flatMap((v) =>
              values(v.files).map((f: string) =>
                f.replace(/^(Meta)?data\/StatDescriptions\//i, "").replace(/\.(txt|csd)$/, "")
              )
            )
      ]
    ]
  },
  {
    from: "stats_by_file",
    to: "stats",
    target: (c) => c.keys("stats"),
    fields: [
      [
        "tokens[].stat",
        (c) => c.v("stats_by_file").flatMap((v) => values(v.tokens).map((t) => t.stat))
      ]
    ]
  },
  {
    from: "enchantments",
    to: "mods",
    kind: "same",
    target: (c) => c.keys("mods"),
    fields: [
      ["{group}[].id", (c) => c.v("enchantments").flatMap((g) => values(g).map((e) => e.id))]
    ]
  },
  {
    from: "enchantments",
    to: "stats",
    target: (c) => c.keys("stats"),
    fields: [
      [
        "{group}[].stats[].id",
        (c) =>
          c
            .v("enchantments")
            .flatMap((g) => values(g).flatMap((e) => values(e.stats).map((s) => s.id)))
      ]
    ]
  },
  {
    from: "enchantments",
    to: "tags",
    target: (c) => c.keys("tags"),
    fields: [
      [
        "{group}[].spawn_weights[].tag",
        (c) =>
          c
            .v("enchantments")
            .flatMap((g) => values(g).flatMap((e) => values(e.spawn_weights).map((s) => s.tag)))
      ]
    ]
  },
  {
    from: "enchantments",
    to: "skills",
    note: "These match skills[].active_skill.id, not the skills key.",
    target: (c) => c.activeSkillIds(),
    fields: [
      [
        "{group}[].skills[]",
        (c) => c.v("enchantments").flatMap((g) => values(g).flatMap((e) => e.skills ?? []))
      ]
    ]
  },

  // Skills
  {
    from: "skills",
    to: "active_skill_types",
    target: (c) => c.keys("active_skill_types"),
    fields: [
      ["active_skill.types[]", (c) => c.v("skills").flatMap((s) => s.active_skill?.types ?? [])],
      [
        "support_gem.allowed_types[]",
        (c) =>
          c
            .v("skills")
            .flatMap((s) =>
              (s.support_gem?.allowed_types ?? []).filter(
                (x: string) => !["AND", "OR", "NOT"].includes(x)
              )
            )
      ],
      [
        "support_gem.added_types[]",
        (c) => c.v("skills").flatMap((s) => s.support_gem?.added_types ?? [])
      ]
    ]
  },
  {
    from: "skills",
    to: "stats",
    target: (c) => c.keys("stats"),
    fields: [
      [
        "stat_sets[].static.stats[].id",
        (c) =>
          c
            .v("skills")
            .flatMap((s) =>
              values(s.stat_sets).flatMap((ss) => values(ss.static?.stats).map((x) => x.id))
            )
      ]
    ]
  },
  {
    from: "skills",
    to: "stat_translations/",
    target: (c) => c.statFiles(),
    fields: [
      [
        "stat_sets[].translation_file",
        (c) =>
          c
            .v("skills")
            .flatMap((s) =>
              values(s.stat_sets).map((ss) =>
                String(ss.translation_file ?? "").replace(/\.(txt|csd)$/, "")
              )
            )
      ]
    ]
  },
  {
    from: "skills",
    to: "item_classes",
    target: (c) => c.keys("item_classes"),
    fields: [
      [
        "active_skill.weapon_restrictions[]",
        (c) => c.v("skills").flatMap((s) => s.active_skill?.weapon_restrictions ?? [])
      ]
    ]
  },
  {
    from: "skills",
    to: "cost_types",
    target: (c) => c.keys("cost_types"),
    fields: [
      [
        "per_level.{n}.costs (keys)",
        (c) => c.v("skills").flatMap((s) => values(s.per_level).flatMap((pl) => keys(pl.costs)))
      ]
    ]
  },
  markupLink("skills", "[Id|text] in active_skill.description", (c) =>
    c.v("skills").map((s) => s.active_skill?.description)
  ),
  {
    from: "cost_types",
    to: "stats",
    target: (c) => c.keys("stats"),
    fields: [["stat", (c) => c.v("cost_types").map((x) => x.stat)]]
  },
  {
    from: "buffs",
    to: "stats",
    target: (c) => c.keys("stats"),
    fields: [["stats[]", (c) => c.v("buffs").flatMap((b) => b.stats ?? [])]]
  },
  {
    from: "buffs",
    to: "buff_visuals",
    target: (c) => c.keys("buff_visuals"),
    fields: [["visuals", (c) => c.v("buffs").map((b) => b.visuals)]]
  },
  {
    from: "buffs",
    to: "mods",
    target: (c) => c.keys("mods"),
    fields: [
      [
        "sources.Mods[].id",
        (c) => c.v("buffs").flatMap((b) => values(b.sources?.Mods).map((m) => m.id))
      ]
    ]
  },
  {
    from: "minion_stats",
    to: "stats",
    target: (c) => c.keys("stats"),
    fields: [
      [
        "key, player_stats[]",
        (c) => [
          ...keys(c.file("minion_stats")),
          ...c.v("minion_stats").flatMap((m) => m.player_stats ?? [])
        ]
      ]
    ]
  },
  {
    from: "damage_calculation_types",
    to: "stats",
    target: (c) => c.keys("stats"),
    fields: [
      [
        "damage, crit, accuracy, stun… (stat ids)",
        (c) => {
          const out: string[] = [];
          const walk = (o: J) => {
            for (const [k, v] of Object.entries(o)) {
              if (typeof v === "string") {
                if (!["text", "context", "fake_hit_for_ailments"].includes(k)) out.push(v);
              } else if (v && typeof v === "object") walk(v);
            }
          };
          walk(c.file("damage_calculation_types"));
          return out;
        }
      ]
    ]
  },

  // Passive tree
  {
    from: "passive_skill_trees/",
    to: "stats",
    target: (c) => c.keys("stats"),
    fields: [["passives.{hash}.stats (keys)", (c) => c.passives().flatMap((x) => keys(x.stats))]]
  },
  {
    from: "passive_skill_trees/",
    to: "ascendancies",
    target: (c) => c.keys("ascendancies"),
    fields: [["passives.{hash}.ascendancy", (c) => c.passives().map((x) => x.ascendancy)]]
  },
  {
    from: "passive_skill_trees/",
    to: "skill_gems",
    target: (c) => c.gemItemIds(),
    fields: [["passives.{hash}.granted_skill", (c) => c.passives().map((x) => x.granted_skill)]]
  },
  {
    from: "passive_skill_trees/",
    to: "skills",
    target: (c) => c.keys("skills"),
    fields: [
      ["passives.{hash}.granted_effect.id", (c) => c.passives().map((x) => x.granted_effect?.id)]
    ]
  },
  {
    from: "passive_skill_trees/",
    to: "buffs",
    target: (c) => c.keys("buffs"),
    fields: [
      [
        "passives.{hash}.buff_definitions[]",
        (c) => c.passives().flatMap((x) => x.buff_definitions ?? [])
      ]
    ]
  },
  {
    from: "ascendancies",
    to: "characters",
    target: (c) => new Set(c.v("characters").map((x) => x.metadata_id as string)),
    fields: [
      ["character = characters[].metadata_id", (c) => c.v("ascendancies").map((a) => a.character)]
    ]
  },
  {
    from: "jewel_slots",
    to: "passive_skill_trees/",
    note: "The other slots name passives that are not in any exported tree.",
    target: (c) => c.passiveIds(),
    fields: [["passive = passives.{hash}.id", (c) => c.v("jewel_slots").map((j) => j.passive)]]
  },
  {
    from: "timeless_jewels",
    to: "stats",
    target: (c) => c.keys("stats"),
    fields: [
      [
        "passives/additions .stats[].id",
        (c) =>
          [
            ...values(c.file("timeless_jewels").passives),
            ...values(c.file("timeless_jewels").additions)
          ].flatMap((x) => values(x.stats).map((s) => s.id))
      ]
    ]
  },
  {
    from: "cluster_jewels",
    to: "base_items",
    kind: "same",
    target: (c) => c.keys("base_items"),
    fields: [["jewels key", (c) => keys(c.file("cluster_jewels").jewels)]]
  },
  {
    from: "cluster_jewels",
    to: "stats",
    target: (c) => c.keys("stats"),
    fields: [
      [
        "jewels.*.skills[].passive.stats",
        (c) =>
          values(c.file("cluster_jewels").jewels).flatMap((j) =>
            values(j.skills).flatMap((s) => keys(s.passive?.stats))
          )
      ],
      [
        "special_skills[].stat",
        (c) => values(c.file("cluster_jewels").special_skills).map((s) => s.stat)
      ]
    ]
  },
  {
    from: "cluster_jewels",
    to: "tags",
    target: (c) => c.keys("tags"),
    fields: [
      [
        "jewels.*.skills[].tag",
        (c) =>
          values(c.file("cluster_jewels").jewels).flatMap((j) => values(j.skills).map((s) => s.tag))
      ]
    ]
  },
  {
    from: "tattoos",
    to: "stats",
    target: (c) => c.keys("stats"),
    fields: [["stats (keys)", (c) => c.v("tattoos").flatMap((t) => keys(t.stats))]]
  },
  {
    from: "tattoos",
    to: "base_items",
    target: (c) => c.keys("base_items"),
    fields: [
      ["tattoos[].item", (c) => c.v("tattoos").flatMap((t) => values(t.tattoos).map((x) => x.item))]
    ]
  },
  {
    from: "tattoos",
    to: "passive_skill_trees/",
    target: (c) => c.passiveIds(),
    fields: [
      [
        "tattoo_blocking_passives[]",
        (c) => c.v("tattoos").flatMap((t) => t.tattoo_blocking_passives ?? [])
      ]
    ]
  },
  {
    from: "pantheons",
    to: "stats",
    target: (c) => c.keys("stats"),
    fields: [
      [
        "souls[].stats (keys)",
        (c) => c.v("pantheons").flatMap((x) => values(x.souls).flatMap((s) => keys(s.stats)))
      ]
    ]
  },

  // World
  {
    from: "world_areas",
    to: "world_areas",
    target: (c) => c.keys("world_areas"),
    fields: [
      ["connections[]", (c) => c.v("world_areas").flatMap((a) => a.connections ?? [])],
      ["parent_town", (c) => c.v("world_areas").map((a) => a.parent_town)]
    ]
  },
  {
    from: "world_areas",
    to: "monsters",
    target: (c) => c.keys("monsters"),
    fields: [
      ["bosses[]", (c) => c.v("world_areas").flatMap((a) => a.bosses ?? [])],
      [
        "packs[].monsters.*.monster_variety",
        (c) =>
          c
            .v("world_areas")
            .flatMap((a) =>
              values(a.packs).flatMap((x) => values(x.monsters).map((m) => m.monster_variety))
            )
      ],
      [
        "packs[].boss_monsters[]",
        (c) =>
          c
            .v("world_areas")
            .flatMap((a) =>
              values(a.packs).flatMap((x) =>
                values(x.boss_monsters).map((m) => m.monster_variety ?? m)
              )
            )
      ]
    ]
  },
  {
    from: "world_areas",
    to: "mods",
    target: (c) => c.keys("mods"),
    fields: [["area_mods[]", (c) => c.v("world_areas").flatMap((a) => a.area_mods ?? [])]]
  },
  {
    from: "world_areas",
    to: "tags",
    target: (c) => c.keys("tags"),
    fields: [["tags[]", (c) => c.v("world_areas").flatMap((a) => a.tags ?? [])]]
  },
  {
    from: "world_areas",
    to: "default_monster_stats",
    kind: "value",
    note: "The misses are level-0 placeholder areas.",
    target: (c) => c.keys("default_monster_stats"),
    fields: [["area_level (by value)", (c) => c.v("world_areas").map((a) => String(a.area_level))]]
  },
  {
    from: "endgame_maps",
    to: "world_areas",
    target: (c) => new Set([...c.keys("world_areas"), ...c.packIds()]),
    fields: [
      ["key", (c) => keys(c.file("endgame_maps"))],
      [
        "native_packs[] = packs[].id",
        (c) => c.v("endgame_maps").flatMap((e) => e.native_packs ?? [])
      ]
    ]
  },
  {
    from: "monsters",
    to: "mods",
    target: (c) => c.keys("mods"),
    fields: [
      ["mods[]", (c) => c.v("monsters").flatMap((m) => m.mods ?? [])],
      ["special_mods[]", (c) => c.v("monsters").flatMap((m) => m.special_mods ?? [])],
      ["endgame_mods[]", (c) => c.v("monsters").flatMap((m) => m.endgame_mods ?? [])]
    ]
  },
  {
    from: "monsters",
    to: "skills",
    target: (c) => c.keys("skills"),
    fields: [["granted_effects[]", (c) => c.v("monsters").flatMap((m) => m.granted_effects ?? [])]]
  },
  {
    from: "monsters",
    to: "tags",
    target: (c) => c.keys("tags"),
    fields: [["tags[]", (c) => c.v("monsters").flatMap((m) => m.tags ?? [])]]
  },
  {
    from: "monsters",
    to: "item_classes",
    target: (c) => c.keys("item_classes"),
    fields: [
      ["main_hand_item_class", (c) => c.v("monsters").map((m) => m.main_hand_item_class)],
      ["off_hand_item_class", (c) => c.v("monsters").map((m) => m.off_hand_item_class)]
    ]
  },
  {
    from: "monsters",
    to: "monsters",
    target: (c) => c.keys("monsters"),
    fields: [["spectre_override", (c) => c.v("monsters").map((m) => m.spectre_override)]]
  }
];

/** Every link that both of its files have in this patch, with how many of its values resolve. */
export function fileLinks(p: PatchFiles, nodes: Record<string, FileNode>): FileLink[] {
  const c = new Ctx(p);
  const links: FileLink[] = [];
  for (const def of LINKS) {
    if (!nodes[def.from] || !nodes[def.to]) continue;
    const target = def.target(c);
    const labels: string[] = [];
    let hit = 0;
    let total = 0;
    const miss: string[] = [];
    for (const [label, read] of def.fields) {
      let any = false;
      for (const raw of read(c)) {
        if (raw == null || raw === "") continue;
        const value = String(raw);
        any = true;
        total++;
        if (target.has(value)) hit++;
        else if (miss.length < 3 && !miss.includes(value)) miss.push(value);
      }
      if (any) labels.push(label);
    }
    if (!total) continue;
    links.push({
      from: def.from,
      to: def.to,
      field: labels.join(", "),
      kind: def.kind ?? "key",
      hit,
      total,
      miss: hit < total ? miss : [],
      ...(def.note && (hit < total || !/^The (misses|rest|other)|^Unmatched/.test(def.note))
        ? { note: def.note }
        : {})
    });
  }
  return links;
}

// Stat text

interface StatLine {
  text: string;
  /** The stats this line shows. */
  ids: string[];
  /** The stat_translations entry's string, before values went in. */
  template: string;
  format: string[];
  handlers: string[][];
}

/** Applies one stat_value_handlers entry to a value. */
function handle(handlers: J, id: string, value: number): number {
  const h = handlers[id];
  if (!h) throw new Error(`No stat value handler ${id}`);
  if (h.type === "noop") return value;
  if (h.type !== "int")
    throw new Error(
      `Stat value handler ${id} has type ${h.type}, which the file map does not render`
    );
  let v = (value * (h.multiplier ?? 1)) / (h.divisor ?? 1) + (h.addend ?? 0);
  if (h.precision != null) v = Number(v.toFixed(h.precision));
  return v;
}

function matches(cond: J, value: number): boolean {
  if (!cond) return true;
  if (cond.min != null && value < cond.min) return false;
  if (cond.max != null && value > cond.max) return false;
  return true;
}

const num = (v: number) => (Number.isInteger(v) ? String(v) : String(Number(v.toFixed(2))));

/** Renders stats the way the game does; stats with no translation entry stay hidden. */
export function renderStats(entries: J[], handlers: J, stats: Record<string, number>): StatLine[] {
  const lines: StatLine[] = [];
  const done = new Set<string>();
  for (const entry of entries) {
    const ids: string[] = entry.ids ?? [];
    if (!ids.some((id) => id in stats) || ids.every((id) => done.has(id))) continue;
    const vals = ids.map((id) => stats[id] ?? 0);
    const variant = values(entry.English).find((x) =>
      vals.every((v, i) => matches(x.condition?.[i], v))
    );
    ids.forEach((id) => done.add(id));
    if (!variant) continue;
    let text: string = variant.string;
    vals.forEach((raw, i) => {
      const format: string = variant.format?.[i] ?? "#";
      if (format === "ignore") return;
      const value = (variant.index_handlers?.[i] ?? []).reduce(
        (v: number, h: string) => handle(handlers, h, v),
        raw
      );
      const shown =
        format === "+#" ? (value >= 0 ? "+" : "") + num(value) : format.replace("#", num(value));
      text = text.replace(new RegExp(`\\{${i}(?::[^}]*)?\\}`, "g"), shown);
    });
    lines.push({
      text: stripMarkup(text),
      ids,
      template: variant.string,
      format: variant.format ?? [],
      handlers: variant.index_handlers ?? []
    });
  }
  return lines;
}

// Worked examples

interface ItemSpec {
  base: string;
  prefix: string;
  suffix: string;
  /** Rolled value for each stat id. */
  rolls: Record<string, number>;
}

interface GemSpec {
  gem: string;
}

interface PassiveSpec {
  tree: string;
  hash: string;
  ascendancyHash: string;
}

interface MonsterSpec {
  area: string;
}

interface ExampleSpecs {
  item: ItemSpec;
  gem: GemSpec;
  passive: PassiveSpec;
  monster: MonsterSpec;
}

/** The records each game's worked examples use. A patch that drops one fails the build here. */
export const EXAMPLES: Record<Game, ExampleSpecs> = {
  poe2: {
    item: {
      base: "Metadata/Items/Weapons/OneHandWeapons/OneHandMaces/FourOneHandMace5",
      prefix: "LocalIncreasedPhysicalDamagePercent3",
      suffix: "Strength3",
      rolls: {
        "local_critical_strike_multiplier_+": 8,
        "local_physical_damage_+%": 72,
        additional_strength: 14
      }
    },
    gem: { gem: "Metadata/Items/Gems/SkillGemSpark" },
    passive: { tree: "Default", hash: "27491", ascendancyHash: "30" },
    monster: { area: "G1_1" }
  },
  poe1: {
    item: {
      base: "Metadata/Items/Weapons/OneHandWeapons/OneHandMaces/OneHandMace5",
      prefix: "LocalIncreasedPhysicalDamagePercent3",
      suffix: "Strength3",
      rolls: {
        "base_stun_threshold_reduction_+%": 10,
        "local_physical_damage_+%": 72,
        additional_strength: 20
      }
    },
    gem: { gem: "Metadata/Items/Gems/SkillGemFireball" },
    passive: { tree: "Default", hash: "1325", ascendancyHash: "5443" },
    monster: { area: "1_1_1" }
  }
};

const LABELS: Record<Game, { crit: string; requires: (parts: string[]) => Part[] }> = {
  poe2: {
    crit: "Critical Hit Chance",
    requires: (parts) => [{ text: "Requires: ", color: "grey" }, ...joinParts(parts)]
  },
  poe1: {
    crit: "Critical Strike Chance",
    requires: (parts) => [{ text: "Requires ", color: "grey" }, ...joinParts(parts)]
  }
};

/** "Level 22", "41 Str" → white values with grey labels and commas. */
function joinParts(parts: string[]): Part[] {
  return parts.flatMap((part, i) => {
    const [, a, b] = /^(\D*?)(\d.*)$/.exec(part) ?? [];
    const out: Part[] = [];
    if (i > 0) out.push({ text: ", ", color: "grey" });
    if (/^Level /.test(part))
      out.push({ text: "Level ", color: "grey" }, { text: part.slice(6), color: "white" });
    else if (a !== undefined && b !== undefined) {
      const [n, ...rest] = b.split(" ");
      out.push({ text: n!, color: "white" }, { text: ` ${rest.join(" ")}`, color: "grey" });
    } else out.push({ text: part, color: "white" });
    return out;
  });
}

const prop = (label: string, value: string, augmented = false): Part[] => [
  { text: `${label}: `, color: "grey" },
  { text: value, color: augmented ? "affix" : "white" }
];

const ATTRS: Array<[string, string]> = [
  ["strength", "Str"],
  ["dexterity", "Dex"],
  ["intelligence", "Int"]
];

function requirementParts(req: J): string[] {
  const parts = [`Level ${req.level}`];
  for (const [k, short] of ATTRS) if (req[k]) parts.push(`${req[k]} ${short}`);
  return parts;
}

function linksFor(links: FileLink[], wanted: string[]): string[] {
  const have = new Set(links.map((l) => `${l.from}>${l.to}`));
  return wanted.filter((k) => have.has(k));
}

function itemExample(c: Ctx, links: FileLink[], spec: ItemSpec): Example {
  const game = c.p.game;
  const base = c.file("base_items")[spec.base];
  if (!base) throw new Error(`${game}: base ${spec.base} is gone; pick another in EXAMPLES`);
  const cls = c.file("item_classes")[base.item_class];
  const tagKey = base.tags.join(",");
  const pool = c.file("mods_by_base")[cls.name]?.[tagKey];
  if (!pool) throw new Error(`${game}: no mods_by_base["${cls.name}"]["${tagKey}"]`);
  const mods = c.file("mods");
  const implicit = mods[base.implicits[0]];
  const prefix = mods[spec.prefix];
  const suffix = mods[spec.suffix];
  const inPool = (mod: J, id: string) => pool.mods?.[mod.generation_type]?.[mod.type]?.[id] != null;
  if (
    !implicit ||
    !prefix ||
    !suffix ||
    !inPool(prefix, spec.prefix) ||
    !inPool(suffix, spec.suffix)
  ) {
    throw new Error(
      `${game}: the example mods no longer fit ${spec.base}; pick others in EXAMPLES`
    );
  }
  const entries = c.file("stat_translations/stat_descriptions");
  const handlers = c.file("stat_value_handlers");
  const roll = (mod: J) =>
    Object.fromEntries(values(mod.stats).map((s) => [s.id, spec.rolls[s.id] ?? s.max]));
  const [implicitLine] = renderStats(entries, handlers, roll(implicit));
  const [prefixLine] = renderStats(entries, handlers, roll(prefix));
  const [suffixLine] = renderStats(entries, handlers, roll(suffix));
  if (!implicitLine || !prefixLine || !suffixLine)
    throw new Error(`${game}: an example mod has no stat text`);

  const props = base.properties;
  const physInc = spec.rolls["local_physical_damage_+%"] ?? 0;
  const physMin = Math.round(props.physical_damage_min * (1 + physInc / 100));
  const physMax = Math.round(props.physical_damage_max * (1 + physInc / 100));
  const crit = (props.critical_strike_chance / 100).toFixed(2) + "%";
  const aps = (1000 / props.attack_time).toFixed(2);
  const local = c.file("stats")["local_physical_damage_+%"]?.is_local;
  const classLine = stripMarkup(cls.category ?? base.item_class);
  const name = `${prefix.name} ${base.name} ${suffix.name}`;
  const markup = [implicitLine, prefixLine, suffixLine].some((l) => /\[/.test(l.template));
  const L = LABELS[game];

  const rows: Row[] = [
    {
      steps: [4, 1],
      code: "mods[prefix].name · base_items[id].name · mods[suffix].name",
      value: `"${prefix.name}" · "${base.name}" · "${suffix.name}"`,
      note: "A magic item’s name is prefix name, base name, suffix name."
    }
  ];
  const blocks: Line[][] = [[], [], [], []];
  const row = (block: number, parts: Part[], r: Row) => {
    rows.push(r);
    blocks[block]!.push({ row: rows.length, parts });
  };
  row(0, [{ text: classLine, color: "grey" }], {
    steps: [2],
    code: `item_classes["${base.item_class}"].category`,
    value: JSON.stringify(cls.category),
    note: /\[/.test(cls.category ?? "") ? "Markup: show the text after the bar." : undefined
  });
  row(0, prop("Physical Damage", `${physMin}-${physMax}`, true), {
    steps: [1, 5],
    code: "base_items[id].properties.physical_damage_min / _max",
    value: `${props.physical_damage_min} / ${props.physical_damage_max}`,
    note: `Scaled by the ${physInc}% roll, then rounded: ${props.physical_damage_min} × ${1 + physInc / 100} = ${physMin}, ${props.physical_damage_max} × ${1 + physInc / 100} = ${physMax}. The roll changes this line because \`stats["local_physical_damage_+%"].is_local\` is ${local}.`
  });
  row(0, prop(L.crit, crit), {
    steps: [1],
    code: "base_items[id].properties.critical_strike_chance",
    value: String(props.critical_strike_chance),
    note: "Hundredths of a percent."
  });
  row(0, prop("Attacks per Second", aps), {
    steps: [1],
    code: "base_items[id].properties.attack_time",
    value: String(props.attack_time),
    note: `Milliseconds per attack: 1000 ÷ ${props.attack_time}.`
  });
  if (game === "poe1") {
    row(0, prop("Weapon Range", `${num(props.range / 10)} metres`), {
      steps: [1],
      code: "base_items[id].properties.range",
      value: String(props.range),
      note: "Tenths of a metre."
    });
  }
  row(1, L.requires(requirementParts(base.requirements)), {
    steps: [1],
    code: "base_items[id].requirements",
    value: record(base.requirements)
  });
  const statNote = (line: StatLine, mod: J) => {
    const stat = values(mod.stats)[0];
    const variants = values(entries.find((e: J) => e.ids.includes(stat.id))?.English).length;
    return (
      `Its stat \`${stat.id}\` ${stat.min === stat.max ? `is always ${stat.min}` : `rolls ${stat.min} to ${stat.max}`}. ` +
      (variants > 1
        ? `The text entry has ${variants} variants; the one whose condition fits the roll gives `
        : "The text entry gives ") +
      `\`${JSON.stringify(line.template)}\`` +
      (line.format[0] && line.format[0] !== "#" ? ` with format \`"${line.format[0]}"\`` : "") +
      (line.handlers[0]?.length ? ` and handler \`${line.handlers[0].join(", ")}\`` : "") +
      "."
    );
  };
  row(2, [{ text: implicitLine.text, color: "affix" }], {
    steps: [1, 4, 6, ...(markup ? [7] : [])],
    code: "base_items[id].implicits[0]",
    value: JSON.stringify(base.implicits[0]),
    note: statNote(implicitLine, implicit)
  });
  row(3, [{ text: prefixLine.text, color: "affix" }], {
    steps: [3, 4, 6],
    code: `mods["${spec.prefix}"]`,
    value: `prefix · ${values(prefix.stats)[0].min}–${values(prefix.stats)[0].max} · level ${prefix.required_level}`,
    note: statNote(prefixLine, prefix)
  });
  row(3, [{ text: suffixLine.text, color: "affix" }], {
    steps: [3, 4, 6],
    code: `mods["${spec.suffix}"]`,
    value: `suffix · ${values(suffix.stats)[0].min}–${values(suffix.stats)[0].max} · level ${suffix.required_level}`,
    note: statNote(suffixLine, suffix)
  });
  const steps: Step[] = [
    {
      code: "base_items[id]",
      text: `Look up the base by item path, here \`${spec.base}\`. It holds the name, class, properties, requirements, tags and implicit mod ids.`
    },
    {
      code: "item_classes[base.item_class]",
      text: `Gives the class line and the plural name, “${cls.name}”, which step 3 needs.`
    },
    {
      code: 'mods_by_base[class.name][base.tags.join(",")]',
      text: `The mod pool for this base, grouped by generation type and mod type. Each value is the mod’s required level. All ${fmt(c.v("base_items").length)} bases resolve this way.`
    },
    {
      code: "mods[id]",
      text: "For the implicit and each rolled mod: affix name, generation type, required level and `stats[]` with min and max."
    },
    {
      code: "stats[stat.id]",
      text: "Flags such as `is_local`. A local stat changes the item’s own lines instead of the character."
    },
    {
      code: "stat_translations/stat_descriptions",
      text: "Find the entry whose `ids[]` holds the stat. Pick the `English[]` variant whose `condition` fits the value, then apply `format` and `index_handlers` from `stat_value_handlers`."
    }
  ];
  if (markup)
    steps.push({
      code: "keywords[Id]",
      text: "Text like `[Strength|Strength]` shows the part after the bar. The id before it gives the hover definition."
    });

  return {
    id: "item",
    title: "Item",
    subject: `${name} · magic ${classLine} · example rolls ${Object.values(spec.rolls).join(", ")}`,
    tooltip: {
      frame: "magic",
      name: [name],
      nameColor: "magic",
      nameRow: 1,
      blocks: blocks.filter((b) => b.length)
    },
    rows,
    steps,
    path: {
      links: linksFor(links, [
        "base_items>item_classes",
        "mods_by_base>item_classes",
        "mods_by_base>base_items",
        "base_items>mods",
        "mods_by_base>mods",
        "mods>stats",
        "stat_translations/>stats",
        "stat_translations/>stat_value_handlers",
        ...(markup ? ["mods>keywords", "stat_translations/>keywords"] : [])
      ]),
      badges: {
        base_items: 1,
        item_classes: 2,
        mods_by_base: 3,
        mods: 4,
        stats: 5,
        "stat_translations/": 6,
        stat_value_handlers: 6,
        ...(markup ? { keywords: 7 } : {})
      }
    },
    code: [
      "const base  = base_items[id];",
      "const cls   = item_classes[base.item_class];",
      'const pool  = mods_by_base[cls.name][base.tags.join(",")];',
      `const mod   = mods["${spec.suffix}"];`,
      "const entry = stat_descriptions.find(e => e.ids.includes(mod.stats[0].id));",
      "// then pick entry.English[] by condition and fill {0}"
    ].join("\n")
  };
}

function gemExample(c: Ctx, links: FileLink[], spec: GemSpec): Example {
  const game = c.p.game;
  const [gemKey, gem] =
    Object.entries(c.file("skill_gems")).find(([, g]) => (g as J).base_item?.id === spec.gem) ?? [];
  if (!gem || !gemKey) throw new Error(`${game}: no skill gem ${spec.gem}`);
  const g = gem as J;
  const gemTags = c.file("gem_tags");
  const shown = (g.tags as string[]).filter((t) => gemTags[t]);
  const hidden = (g.tags as string[]).filter((t) => !gemTags[t]);
  const skillId: string = g.grants_skills[0];
  const skill = c.file("skills")[skillId];
  const level1 = skill.per_level?.["1"] ?? {};
  const costTypes = c.file("cost_types");
  const costs = Object.entries(level1.costs ?? {}).map(([k, v]) =>
    stripMarkup(
      costTypes[k].format_text.replace("{0}", num((v as number) / (costTypes[k].divisor || 1)))
    )
  );
  const set = skill.stat_sets?.[0] ?? {};
  const crit = set.static?.crit_chance ?? skill.static?.crit_chance;
  const req = g.requirements["1"];
  const effectiveness = set.per_level?.["1"]?.damage_effectiveness;
  const levelText = values(set.per_level?.["1"]?.stat_text).flatMap((t: string) => t.split("\n"));
  const staticText = values(set.static?.stat_text)
    .flatMap((t: string) => t.split("\n"))
    .filter(Boolean);
  const keyed =
    game === "poe2"
      ? "Keyed by item path"
      : `Keyed by gem id, here \`"${gemKey}"\`; join on \`base_item.id\``;

  const rows: Row[] = [
    {
      steps: [1],
      code: "skill_gems[id].base_item.display_name",
      value: JSON.stringify(g.base_item.display_name)
    }
  ];
  const blocks: Line[][] = [[], [], [], []];
  const row = (block: number, parts: Part[], r: Row) => {
    rows.push(r);
    blocks[block]!.push({ row: rows.length, parts });
  };
  row(0, [{ text: shown.map((t) => stripMarkup(gemTags[t])).join(", "), color: "grey" }], {
    steps: [1, 3],
    code: "skill_gems[id].tags[] → gem_tags[tag]",
    value:
      shown
        .map((t) => JSON.stringify(gemTags[t]))
        .slice(0, 3)
        .join(", ") + (shown.length > 3 ? ", …" : ""),
    note: hidden.length
      ? `${list(hidden.map((t) => `\`${t}\``))} ${hidden.length === 1 ? "has" : "have"} no \`gem_tags\` entry, so ${hidden.length === 1 ? "it stays" : "they stay"} hidden.`
      : undefined
  });
  row(0, prop("Level", "1"), {
    steps: [1],
    code: "skill_gems[id].requirements",
    value: `keys "1" to "${g.max_level}"`,
    note: `One entry per gem level. \`max_level\` is ${g.max_level}.`
  });
  if (costs.length) {
    row(0, prop("Cost", costs.join(", ")), {
      steps: [4, 5],
      code: `skills["${skillId}"].per_level["1"].costs`,
      value: record(level1.costs),
      note: Object.keys(level1.costs)
        .map(
          (k) =>
            `\`cost_types["${k}"].format_text\` is \`${JSON.stringify(costTypes[k].format_text)}\`.`
        )
        .join(" ")
    });
  }
  row(0, prop("Cast Time", `${(skill.cast_time / 1000).toFixed(2)} sec`), {
    steps: [4],
    code: `skills["${skillId}"].cast_time`,
    value: String(skill.cast_time),
    note: "Milliseconds."
  });
  if (crit != null) {
    row(0, prop(LABELS[game].crit, `${(crit / 100).toFixed(2)}%`), {
      steps: [4],
      code: `skills["${skillId}"].stat_sets[0].static.crit_chance`,
      value: String(crit),
      note: "Hundredths of a percent."
    });
  }
  if (effectiveness != null) {
    row(0, prop("Effectiveness of Added Damage", `${effectiveness}%`), {
      steps: [4],
      code: `skills["${skillId}"].stat_sets[0].per_level["1"].damage_effectiveness`,
      value: String(effectiveness)
    });
  }
  row(1, LABELS[game].requires(requirementParts(req)), {
    steps: [1],
    code: 'skill_gems[id].requirements["1"]',
    value: record(req),
    note:
      game === "poe1"
        ? "Only the level is stored. The game works out attribute requirements from `requirement_weights`, and no file holds that formula."
        : undefined
  });
  row(
    2,
    [
      {
        text: stripMarkup(skill.active_skill.description).replace(/\s+/g, " ").trim(),
        color: "gem"
      }
    ],
    {
      steps: markupIds(skill.active_skill.description).length ? [4, 8] : [4],
      code: `skills["${skillId}"].active_skill.description`,
      note: markupIds(skill.active_skill.description).length
        ? `Holds markup such as \`[${markupIds(skill.active_skill.description)[0]}|…]\`.`
        : undefined
    }
  );
  if (levelText.length) {
    row(3, [{ text: levelText.map(stripMarkup).join("\n"), color: "affix" }], {
      steps: [4, 7],
      code: `skills["${skillId}"].stat_sets[0].per_level["1"].stat_text`,
      note: `Already rendered for each level. The raw values are in \`stats[]\`; the text rules are in \`stat_translations/${String(set.translation_file).replace(/\.(txt|csd)$/, "")}.json\`.`
    });
  }
  if (staticText.length) {
    row(3, [{ text: staticText.map(stripMarkup).join("\n"), color: "affix" }], {
      steps: [4],
      code: `skills["${skillId}"].stat_sets[0].static.stat_text`,
      note: "Lines that do not change with level."
    });
  }
  return {
    id: "skill",
    title: "Skill gem",
    subject: `${g.base_item.display_name} · level 1`,
    tooltip: {
      frame: "gem",
      name: [g.base_item.display_name],
      nameColor: "gem",
      nameRow: 1,
      blocks: blocks.filter((b) => b.length)
    },
    rows,
    steps: [
      {
        code: "skill_gems[…]",
        text: `${keyed}. Holds tags, requirements per level and \`grants_skills\`.`
      },
      {
        code: "base_items[gem.base_item.id]",
        text: `Gives the item class, “${c.file("base_items")[spec.gem]?.item_class}”, and the socket limit.`
      },
      { code: "gem_tags[tag]", text: "Display text for each tag. A tag with no entry is hidden." },
      {
        code: "skills[gem.grants_skills[0]]",
        text: `\`"${skillId}"\`: name, description, skill types, cast time, costs per level and stat sets.`
      },
      {
        code: "cost_types[key]",
        text: "Format text and the stat behind each cost. Per-minute costs divide by `divisor`."
      },
      {
        code: "active_skill_types",
        text: "The skill’s `types[]`. A support fits when its `support_gem.allowed_types` match them."
      },
      {
        code: "stat_translations/{translation_file}",
        text: `Each stat set names its own text file. ${fmt(new Set(c.v("skills").flatMap((s) => values(s.stat_sets).map((x) => x.translation_file))).size)} different files are used.`
      },
      ...(markupIds(skill.active_skill.description).length
        ? [{ code: "keywords[Id]", text: "Hover text for the markup in the description." }]
        : [])
    ],
    path: {
      links: linksFor(links, [
        "skill_gems>base_items",
        "skill_gems>gem_tags",
        "skill_gems>skills",
        "skills>cost_types",
        "skills>active_skill_types",
        "skills>stat_translations/",
        "skills>stats",
        "stat_translations/>stats",
        "skills>keywords"
      ]),
      badges: {
        skill_gems: 1,
        base_items: 2,
        gem_tags: 3,
        skills: 4,
        cost_types: 5,
        active_skill_types: 6,
        "stat_translations/": 7,
        stats: 7,
        ...(c.has("keywords") ? { keywords: 8 } : {})
      }
    }
  };
}

function passiveExample(c: Ctx, links: FileLink[], spec: PassiveSpec): Example {
  const game = c.p.game;
  const tree = c.file(`passive_skill_trees/${spec.tree}`);
  const node = tree.passives[spec.hash];
  const asc = tree.passives[spec.ascendancyHash];
  if (!node || !asc) throw new Error(`${game}: the example passives are gone from ${spec.tree}`);
  const hash = Number(spec.hash);
  const groupIndex = (tree.groups as J[]).findIndex((g) =>
    values(g.passives).some((x) => x.hash === hash)
  );
  const group = tree.groups[groupIndex];
  const slot = values(group.passives).find((x) => x.hash === hash);
  const neighbours = new Set<number>(slot.connections);
  const reverse: number[] = [];
  for (const g of values(tree.groups))
    for (const x of values(g.passives))
      if ((x.connections ?? []).includes(hash)) {
        neighbours.add(x.hash);
        reverse.push(x.hash);
      }
  const names = [...neighbours].map((h) => tree.passives[h]?.name).filter(Boolean);
  const entries = c.file("stat_translations/stat_descriptions");
  const passiveEntries = c.has("stat_translations/passive_skill_stat_descriptions")
    ? c.file("stat_translations/passive_skill_stat_descriptions")
    : [];
  const lines = renderStats(
    [...passiveEntries, ...entries],
    c.file("stat_value_handlers"),
    node.stats
  );
  const ascendancy = c.file("ascendancies")[asc.ascendancy];
  const character = c.v("characters").find((x) => x.metadata_id === ascendancy.character);
  const countIn = (list: J[]) => {
    const ids = new Set(list.flatMap((e) => e.ids));
    let a = 0;
    for (const p of values(tree.passives)) for (const s of keys(p.stats)) if (ids.has(s)) a++;
    return a;
  };
  const refs = values(tree.passives).reduce((n, p) => n + keys(p.stats).length, 0);
  const inPassive = countIn(passiveEntries);
  const nameCount = (list: string[]) => {
    const counts = new Map<string, number>();
    for (const n of list) counts.set(n, (counts.get(n) ?? 0) + 1);
    return [...counts].map(([n, k]) => (k > 1 ? `${k} ${n} nodes` : n));
  };
  const linkedText = nameCount(names);

  const rows: Row[] = [
    {
      steps: [1],
      code: `passive_skill_trees/${spec.tree}.json → passives["${spec.hash}"].name`,
      value: `is_notable: ${node.is_notable}`
    }
  ];
  const blocks: Line[][] = [[], [], []];
  const row = (block: number, parts: Part[], r: Row) => {
    rows.push(r);
    blocks[block]!.push({ row: rows.length, parts });
  };
  lines.forEach((line, i) => {
    const id = line.ids.find((s) => s in node.stats);
    row(0, [{ text: line.text, color: "affix" }], {
      steps: [1, 3],
      code: `passives["${spec.hash}"].stats`,
      value: id ? `{ "${id}": ${node.stats[id]} }` : undefined,
      note:
        (line.handlers[0]?.length
          ? `Handler \`${line.handlers[0].join(", ")}\` turns ${id ? node.stats[id] : "the value"} into the shown number. `
          : "") + (i === lines.length - 1 ? "`stat_text` holds these lines pre-rendered." : "")
    });
  });
  row(
    1,
    [
      {
        text: `Group ${groupIndex} · orbit ${slot.radius} · slot ${slot.position_clockwise} of ${tree.skills_per_orbit[slot.radius]}`,
        color: "grey"
      }
    ],
    {
      steps: [2],
      code: `groups[${groupIndex}]`,
      value: `x ${Math.round(group.x)}, y ${Math.round(group.y)} · radius ${slot.radius} · position_clockwise ${slot.position_clockwise}`,
      note: `The group whose \`passives[]\` holds hash ${spec.hash}. \`orbit_radii[${slot.radius}]\` is ${tree.orbit_radii[slot.radius]} and \`skills_per_orbit[${slot.radius}]\` is ${tree.skills_per_orbit[slot.radius]}.`
    }
  );
  row(1, [{ text: `Linked to ${linkedText.join(", ")}`, color: "grey" }], {
    steps: [2],
    code: `groups[${groupIndex}].passives[].connections`,
    value: JSON.stringify(slot.connections),
    note: reverse.length
      ? `Each link is stored on one end only. ${reverse.length === 1 ? "One of these nodes lists" : `${reverse.length} of these nodes list`} ${spec.hash} in its own \`connections\`.`
      : undefined
  });
  row(
    2,
    [
      { text: asc.name, color: "white" },
      { text: `\n${ascendancy.name} ascendancy · ${character?.name}`, color: "grey" }
    ],
    {
      steps: [4],
      code: `passives["${spec.ascendancyHash}"].ascendancy`,
      value: JSON.stringify(asc.ascendancy),
      note: `A second node, for the ascendancy chain: \`ascendancies["${asc.ascendancy}"].name\` is ${ascendancy.name}, and its \`character\`, \`${ascendancy.character}\`, is the ${character?.name} in \`characters\`.`
    }
  );

  const granted = c.passives().filter((x) => x.granted_skill || x.granted_effect).length;
  const buffed = c.passives().filter((x) => x.buff_definitions?.length).length;
  return {
    id: "passive",
    title: "Passive",
    subject: `${node.name} · notable in the ${spec.tree} tree`,
    tooltip: {
      frame: "plain",
      name: [node.name],
      nameColor: "white",
      nameRow: 1,
      blocks: blocks.filter((b) => b.length)
    },
    rows,
    steps: [
      {
        code: `passive_skill_trees/${spec.tree}.json → passives[hash]`,
        text: `Name, icon, flags such as \`is_notable\` and \`is_keystone\`, \`stats\` and \`stat_text\`. The folder holds ${c.p.under("passive_skill_trees").length} trees.`
      },
      {
        code: "groups[] in the same file",
        text: "The group that lists the hash gives its x and y, the orbit (`radius`), the slot (`position_clockwise`) and the node’s outgoing connections."
      },
      {
        code: "stats + stat_translations",
        text:
          `In the ${spec.tree} tree, ${fmt(refs - inPassive)} of ${fmt(refs)} stat references find their text in \`stat_descriptions\`` +
          (inPassive ? ` and ${fmt(inPassive)} in \`passive_skill_stat_descriptions\`.` : ".")
      },
      {
        code: "ascendancies[passive.ascendancy] → characters",
        text: `${fmt(c.passives().filter((x) => x.ascendancy).length)} nodes belong to an ascendancy. \`character\` matches \`characters[].metadata_id\`.`
      },
      {
        code: game === "poe2" ? "skill_gems, buffs, jewel_slots" : "skills, buffs, jewel_slots",
        text:
          (game === "poe2"
            ? `${granted} nodes grant a skill through \`granted_skill\`, an item path in \`skill_gems\`.`
            : `${granted} nodes grant a skill through \`granted_effect.id\`, a \`skills\` key.`) +
          ` ${buffed} carry \`buff_definitions\`. \`jewel_slots\` names socket nodes by id.`
      }
    ],
    path: {
      links: linksFor(links, [
        "passive_skill_trees/>stats",
        "stat_translations/>stats",
        "passive_skill_trees/>ascendancies",
        "ascendancies>characters",
        "passive_skill_trees/>skill_gems",
        "passive_skill_trees/>skills",
        "passive_skill_trees/>buffs",
        "jewel_slots>passive_skill_trees/"
      ]),
      badges: {
        "passive_skill_trees/": 1,
        stats: 3,
        "stat_translations/": 3,
        ascendancies: 4,
        characters: 4,
        [game === "poe2" ? "skill_gems" : "skills"]: 5,
        buffs: 5,
        jewel_slots: 5
      }
    }
  };
}

function monsterExample(c: Ctx, links: FileLink[], spec: MonsterSpec): Example {
  const game = c.p.game;
  const areas = c.file("world_areas");
  const area = areas[spec.area];
  if (!area) throw new Error(`${game}: no area ${spec.area}`);
  const bossId: string = area.bosses[0];
  const boss = c.file("monsters")[bossId];
  const base = c.file("default_monster_stats")[String(area.area_level)];
  const skills = c.file("skills");
  const named = [
    ...new Set(
      (boss.granted_effects ?? [])
        .map((id: string) => skills[id]?.active_skill?.display_name)
        .filter(Boolean)
    )
  ] as string[];
  const packs = values(area.packs).slice(0, 3);
  const monsters = c.file("monsters");
  const packText = packs
    .map(
      (p) =>
        `${monsters[values(p.monsters)[0]?.monster_variety]?.name ?? p.id} (${p.min_count}–${p.max_count})`
    )
    .join(", ");
  const first = values(packs[0]?.monsters);

  const rows: Row[] = [
    { steps: [1], code: `world_areas["${spec.area}"]`, value: "name, act, area_level" }
  ];
  const blocks: Line[][] = [[], [], []];
  const row = (block: number, parts: Part[], r: Row) => {
    rows.push(r);
    blocks[block]!.push({ row: rows.length, parts });
  };
  row(0, [{ text: `Act ${area.act} · area level ${area.area_level}`, color: "grey" }], {
    steps: [1, 3],
    code: `world_areas["${spec.area}"].area_level`,
    value: String(area.area_level),
    note: `Also the key into \`default_monster_stats\`, “${area.area_level}”.`
  });
  row(
    0,
    [
      {
        text: `Leads to ${area.connections.map((id: string) => areas[id]?.name ?? id).join(", ")}`,
        color: "grey"
      }
    ],
    {
      steps: [1],
      code: `world_areas["${spec.area}"].connections`,
      value: JSON.stringify(area.connections),
      note: "Each id is another `world_areas` key."
    }
  );
  row(1, [{ text: boss.name, color: "unique" }], {
    steps: [1, 2],
    code: `world_areas["${spec.area}"].bosses[0] → monsters[path].name`,
    value: JSON.stringify(bossId)
  });
  row(
    1,
    [
      { text: "Life ", color: "grey" },
      { text: `${num(base.life)} × ${boss.life_multiplier}%`, color: "white" },
      { text: " · Damage ", color: "grey" },
      { text: `${num(base.physical_damage)} × ${boss.damage_multiplier}%`, color: "white" }
    ],
    {
      steps: [2, 3],
      code: `default_monster_stats["${area.area_level}"] × monsters[path].life_multiplier, damage_multiplier`,
      value: `life ${num(base.life)}, physical_damage ${num(base.physical_damage)} · ${boss.life_multiplier}, ${boss.damage_multiplier}`,
      note: "The level baseline, picked by `area_level`, scaled by the monster’s multipliers. Rarity and boss scaling come on top."
    }
  );
  row(1, [{ text: `Uses ${named.join(", ")}`, color: "grey" }], {
    steps: [4],
    code: "monsters[path].granted_effects[] → skills[id]",
    value: `${boss.granted_effects.length} skills`,
    note:
      named.length < boss.granted_effects.length
        ? `Only ${named.length === 1 ? "one has" : `${named.length} have`} a \`display_name\`. The others are helper skills.`
        : undefined
  });
  row(2, [{ text: `Packs: ${packText}`, color: "grey" }], {
    steps: [1, 2],
    code: `world_areas["${spec.area}"].packs[].monsters.*.monster_variety`,
    value: first.length
      ? `weights ${first.map((m) => m.weight).join(", ")} in the first pack`
      : undefined,
    note: "Each pack has `min_count`, `max_count` and weighted monster paths."
  });

  const withMods = c.v("monsters").filter((m) => m.mods?.length).length;
  return {
    id: "monster",
    title: "Monster",
    subject: `${area.name} and its boss`,
    tooltip: {
      frame: "plain",
      name: [area.name],
      nameColor: "white",
      nameRow: 1,
      blocks: blocks.filter((b) => b.length)
    },
    rows,
    steps: [
      {
        code: "world_areas[id]",
        text: "Name, act, level, waypoint, `connections`, `bosses`, `packs` and `area_mods`."
      },
      {
        code: "monsters[path]",
        text: "Name, tags, multipliers, resistances, weapon class and `granted_effects`."
      },
      {
        code: "default_monster_stats[String(area_level)]",
        text: `A value join: the key is the monster level, “1” to “${keys(c.file("default_monster_stats")).length}”.`
      },
      { code: "skills[id]", text: "The same `skills` file that player gems use." },
      {
        code: "mods[id]",
        text: `\`monsters.mods\` and \`special_mods\`. ${boss.mods?.length ? `This boss has ${boss.mods.length}` : "This boss has none"}; ${fmt(withMods)} monsters do.`
      },
      ...(c.has("endgame_maps")
        ? [
            {
              code: "endgame_maps[id]",
              text: "Map areas share the `world_areas` key. `native_packs` match `packs[].id` in `world_areas`."
            }
          ]
        : [])
    ],
    path: {
      links: linksFor(links, [
        "world_areas>monsters",
        "world_areas>default_monster_stats",
        "monsters>skills",
        "monsters>mods",
        "world_areas>world_areas",
        "endgame_maps>world_areas"
      ]),
      badges: {
        world_areas: 1,
        monsters: 2,
        default_monster_stats: 3,
        skills: 4,
        mods: 5,
        ...(c.has("endgame_maps") ? { endgame_maps: 6 } : {})
      }
    }
  };
}

// Gaps

function gaps(c: Ctx, links: FileLink[]): Gap[] {
  const out: Gap[] = [];
  const game = c.p.game;
  const mods = c.v("mods");
  const uniqueMods = mods.filter((m) => m.generation_type === "unique").length;
  out.push({
    title: "Uniques have no mods or base type",
    text: `\`uniques\` and \`unique_details\` give the name, class, art and flavour text of ${fmt(keys(c.file("uniques")).length)} uniques. No file says which base or which mods a unique has. ${fmt(uniqueMods)} mods have \`generation_type: "unique"\`, and \`mods_by_base\` lists them per class and tag set, not per unique.`
  });
  const bases = c.keys("base_items");
  const abstractBases = c
    .v("base_items")
    .filter((b) => b.inherits_from && !bases.has(b.inherits_from)).length;
  const abstractMonsters = c.v("monsters").filter((m) => m.inherits_from).length;
  out.push({
    title: "inherits_from points at files that are not exported",
    text: `${fmt(abstractBases)} bases${abstractMonsters ? ` and ${fmt(abstractMonsters)} monsters` : ""} name an abstract parent such as \`…/AbstractOneHandMace\`. Use it as a group label.`
  });
  const uniqueClasses = links.find((l) => l.from === "uniques" && l.to === "item_classes");
  out.push({
    title: "Two spellings of item class",
    text:
      "Most files use the class id, such as “One Hand Mace”. `mods_by_base` uses the plural name, such as “One Hand Maces”." +
      (uniqueClasses && uniqueClasses.hit < uniqueClasses.total
        ? ` ${fmt(uniqueClasses.total - uniqueClasses.hit)} of ${fmt(uniqueClasses.total)} uniques use loose names such as ${uniqueClasses.miss.slice(0, 2).join(" or ")}.`
        : "")
  });
  if (game === "poe2") {
    const ids = keys(c.file("skill_gems"));
    const a = ids.filter((k) => k.includes("/Items/Gem/")).length;
    const b = ids.filter((k) => k.includes("/Items/Gems/")).length;
    if (a && b)
      out.push({
        title: "Two gem path spellings",
        text: `Gem ids start with \`Metadata/Items/Gem/\` (${fmt(a)}) or \`Metadata/Items/Gems/\` (${fmt(b)}). Match the exact string. Do not normalise it.`
      });
  } else {
    const pathFields = ["recommended_supports", "vaal_variant"].filter((f) =>
      c.v("skill_gems").some((g) => g[f])
    );
    out.push({
      title: "skill_gems is keyed by gem id",
      text:
        "Its keys are gem ids such as `Fireball`, not item paths. Join it to `base_items` through `base_item.id`." +
        (pathFields.length
          ? ` ${list(pathFields.map((f) => `\`${f}\``))} hold${pathFields.length === 1 ? "s" : ""} item paths too.`
          : "")
    });
    out.push({
      title: "Gem attribute requirements are not stored",
      text: "`requirements` holds only the level for each gem level. The game derives Strength, Dexterity and Intelligence from `requirement_weights`, and no file holds that formula."
    });
  }
  if (links.some((l) => l.from === "stats" && l.to === "skills")) {
    out.push({
      title: "Some skill references use the inner id",
      text: "`stats.active_skills` and `enchantments.skills` hold ids such as `fireball`. They match `skills[].active_skill.id`, not the `skills` key `Fireball`."
    });
  }
  const translated = c.translated();
  const refs = mods.flatMap((m) => values(m.stats).map((s) => s.id as string));
  const hidden = refs.filter((id) => !translated.has(id));
  out.push({
    title: "Hidden stats",
    text: `${fmt(hidden.length)} of ${fmt(refs.length)} stat references in \`mods\` have no text in any \`stat_translations\` file, for example \`${hidden.find((id) => !id.startsWith("dummy")) ?? hidden[0]}\`. The game does not show them.`
  });
  const weights = new Set(
    mods.flatMap((m) => values(m.spawn_weights).map((s) => s.weight as number))
  );
  let agree = 0;
  let total = 0;
  for (const cls of c.v("mods_by_base"))
    for (const ts of values(cls))
      for (const g of values(ts.mods))
        for (const grp of values(g))
          for (const [id, v] of Object.entries(grp)) {
            total++;
            if (c.file("mods")[id]?.required_level === v) agree++;
          }
  out.push({
    title: "mods_by_base values are levels",
    text:
      `Each number is the mod’s \`required_level\` (${fmt(agree)} of ${fmt(total)} agree). ` +
      ([...weights].every((w) => w === 0 || w === 1)
        ? "`spawn_weights` are only 0 or 1 in this game: a tag allows a mod or blocks it."
        : "The real odds are in each mod’s `spawn_weights`, matched against the base’s tags in order.")
  });
  const slots = links.find((l) => l.from === "jewel_slots");
  if (slots && slots.hit < slots.total) {
    out.push({
      title: "Some jewel slots point nowhere",
      text: `${fmt(slots.total - slots.hit)} of ${fmt(slots.total)} \`jewel_slots\` name a passive that is in no exported tree.`
    });
  }
  out.push({
    title: "Text is often already rendered",
    text: "`mods.text`, `base_items.implicit_text`, skill `stat_text` and passive `stat_text` hold finished lines with ranges. You need `stat_translations` only to render a rolled value."
  });
  return out;
}

/** The whole map for one patch. */
export function buildGameMap(p: PatchFiles, manifest: Manifest): GameMap {
  const nodes = fileNodes(p, manifest);
  const links = fileLinks(p, nodes);
  const c = new Ctx(p);
  const spec = EXAMPLES[p.game];
  return {
    game: p.game,
    patch: p.patch,
    nodes,
    links,
    examples: [
      itemExample(c, links, spec.item),
      gemExample(c, links, spec.gem),
      passiveExample(c, links, spec.passive),
      monsterExample(c, links, spec.monster)
    ],
    gaps: gaps(c, links)
  };
}
