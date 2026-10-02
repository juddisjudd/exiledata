import type { Example, FileLink, FileMapData, Game, GameMap, Row } from "./file-map-data.js";
import { escapeHtml, renderCodeBlock } from "./markdown.js";

/**
 * The File map page: for each game, a diagram of how the exported files point at each other, the
 * worked examples that join them back into tooltips, and the joins that do not work. The diagram
 * is drawn here as SVG; `public/file-map.js` adds selection and the detail panel, and
 * `public/tooltip/renderer.js` draws the tooltips. The data comes from `data/file-map.json`,
 * written by `pnpm --filter @exiledata/docs file-map`.
 */
export const FILE_MAP_MARKER = /<!-- file-map (poe1|poe2) -->/g;

const VIEW = { w: 1120, h: 760 };

interface Group {
  id: string;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  note?: string;
}

const GROUPS: Group[] = [
  { id: "items", label: "Items", x: 12, y: 12, w: 380, h: 420 },
  { id: "core", label: "Mods and stats", x: 404, y: 12, w: 330, h: 420 },
  { id: "skills", label: "Skills", x: 746, y: 12, w: 362, h: 420 },
  { id: "tree", label: "Passive tree", x: 12, y: 444, w: 380, h: 304 },
  { id: "world", label: "World", x: 404, y: 444, w: 330, h: 304 },
  {
    id: "lookup",
    label: "Lookup tables",
    x: 746,
    y: 444,
    w: 362,
    h: 304,
    note: "Read by value. No field points into them."
  }
];

type Place = [group: string, x: number, y: number];

const SHARED: Record<string, Place> = {
  "normalized/base_items": ["items", 128, 66],
  "base_items/": ["items", 306, 66],
  base_items: ["items", 205, 142],
  item_classes: ["items", 100, 222],
  mods_by_base: ["items", 296, 222],
  uniques: ["items", 82, 300],
  unique_details: ["items", 104, 380],
  keywords: ["core", 574, 56],
  mods: ["core", 478, 142],
  stats: ["core", 654, 214],
  tags: ["core", 470, 254],
  tag_details: ["core", 480, 324],
  "stat_translations/": ["core", 648, 308],
  stat_value_handlers: ["core", 506, 398],
  stats_by_file: ["core", 668, 398],
  skill_gems: ["skills", 826, 66],
  gem_tags: ["skills", 1030, 66],
  skills: ["skills", 852, 156],
  active_skill_types: ["skills", 1020, 140],
  cost_types: ["skills", 1028, 214],
  buffs: ["skills", 816, 272],
  buff_visuals: ["skills", 1012, 286],
  "passive_skill_trees/": ["tree", 200, 522],
  game_constants: ["lookup", 846, 522],
  character_constants: ["lookup", 1016, 522],
  level_scaling: ["lookup", 846, 592],
  flavour: ["lookup", 846, 662],
  audio: ["lookup", 1016, 662]
};

/** Where each file sits on the diagram. A file missing here fails the build. */
const LAYOUT: Record<Game, Record<string, Place>> = {
  poe2: {
    ...SHARED,
    augments: ["items", 296, 286],
    essences: ["items", 280, 346],
    liquid_emotions: ["items", 288, 404],
    minion_stats: ["skills", 826, 352],
    damage_calculation_types: ["skills", 990, 400],
    ascendancies: ["tree", 110, 612],
    characters: ["tree", 110, 698],
    jewel_slots: ["tree", 300, 612],
    timeless_jewels: ["tree", 296, 698],
    world_areas: ["world", 500, 522],
    endgame_maps: ["world", 488, 624],
    monsters: ["world", 640, 606],
    default_monster_stats: ["world", 604, 698],
    attack_damage_scaling: ["lookup", 1012, 592]
  },
  poe1: {
    ...SHARED,
    essences: ["items", 290, 300],
    crafting_bench_options: ["items", 272, 380],
    enchantments: ["core", 664, 118],
    pantheons: ["skills", 826, 352],
    ascendancies: ["tree", 80, 612],
    characters: ["tree", 80, 698],
    cluster_jewels: ["tree", 200, 612],
    jewel_slots: ["tree", 200, 698],
    tattoos: ["tree", 320, 612],
    timeless_jewels: ["tree", 320, 698],
    world_areas: ["world", 500, 540],
    monsters: ["world", 640, 620],
    default_monster_stats: ["world", 560, 700],
    weapon_passive_skills: ["lookup", 1016, 592]
  }
};

const HUBS = new Set(["base_items", "mods", "stats", "skills", "world_areas"]);

interface Box {
  id: string;
  group: string;
  cx: number;
  cy: number;
  w: number;
  h: number;
  x: number;
  y: number;
  kind: "hub" | "folder" | "lookup" | "file";
}

function boxes(map: GameMap): Map<string, Box> {
  const out = new Map<string, Box>();
  for (const id of Object.keys(map.nodes)) {
    const place = LAYOUT[map.game][id];
    if (!place)
      throw new Error(
        `No map position for ${map.game} file ${id}: add it to LAYOUT in src/file-map.ts`
      );
    const [group, cx, cy] = place;
    const hub = HUBS.has(id);
    const w = Math.round(id.length * (hub ? 7.9 : 7.2) + (hub ? 28 : 20));
    const h = hub ? 30 : 26;
    const kind = hub ? "hub" : group === "lookup" ? "lookup" : id.includes("/") ? "folder" : "file";
    out.set(id, { id, group, cx, cy, w, h, x: cx - w / 2, y: cy - h / 2, kind });
  }
  return out;
}

const r1 = (n: number) => Math.round(n * 10) / 10;

/** Where a line from a box's centre towards (px, py) leaves the box, `pad` outside its edge. */
function exit(b: Box, px: number, py: number, pad: number): [number, number] {
  const dx = px - b.cx;
  const dy = py - b.cy;
  const s = Math.min(
    (b.w / 2 + pad) / Math.max(Math.abs(dx), 1e-6),
    (b.h / 2 + pad) / Math.max(Math.abs(dy), 1e-6)
  );
  return [b.cx + dx * s, b.cy + dy * s];
}

/** A link's curve, bent a little to its left so opposite links do not overlap, and its midpoint. */
function curve(a: Box, b: Box): { d: string; lx: number; ly: number; anchor: string } {
  if (a === b) {
    const sx = a.x + a.w + 1;
    const sy = a.cy - 7;
    const ey = a.cy + 7;
    return {
      d: `M${r1(sx)},${r1(sy)} C${r1(sx + 36)},${r1(sy - 22)} ${r1(sx + 36)},${r1(ey + 22)} ${r1(sx + 3)},${r1(ey)}`,
      lx: sx + 30,
      ly: a.cy,
      anchor: "start"
    };
  }
  const dx = b.cx - a.cx;
  const dy = b.cy - a.cy;
  const len = Math.hypot(dx, dy);
  const k = Math.min(44, len * 0.13);
  const qx = (a.cx + b.cx) / 2 - (dy / len) * k;
  const qy = (a.cy + b.cy) / 2 + (dx / len) * k;
  const [sx, sy] = exit(a, qx, qy, 1);
  const [ex, ey] = exit(b, qx, qy, 3);
  return {
    d: `M${r1(sx)},${r1(sy)} Q${r1(qx)},${r1(qy)} ${r1(ex)},${r1(ey)}`,
    lx: 0.25 * sx + 0.5 * qx + 0.25 * ex,
    ly: 0.25 * sy + 0.5 * qy + 0.25 * ey,
    anchor: "middle"
  };
}

function linkClass(link: FileLink): string {
  const kind = link.kind === "same" ? "same" : link.kind === "key" ? "" : "soft";
  return ["fm-edge", kind, link.hit < link.total && kind !== "soft" ? "warn" : ""]
    .filter(Boolean)
    .join(" ");
}

function diagram(map: GameMap): string {
  const g = map.game;
  const placed = boxes(map);
  const markers = (["ah", "ah-on", "ah-warn"] as const)
    .map(
      (m) =>
        `<marker id="${g}-${m}" viewBox="0 0 8 8" refX="7.2" refY="4" markerWidth="7.5" markerHeight="7.5" markerUnits="userSpaceOnUse" orient="auto">` +
        `<path d="M0,0.6 L8,4 L0,7.4 z" class="fm-${m}"/></marker>`
    )
    .join("");
  const groups = GROUPS.map(
    (gr) =>
      `<rect x="${gr.x}" y="${gr.y}" width="${gr.w}" height="${gr.h}" rx="6" class="fm-group"/>` +
      `<text x="${gr.x + 12}" y="${gr.y + 20}" class="fm-group-label">${escapeHtml(gr.label)}</text>` +
      (gr.note
        ? `<text x="${gr.x + 12}" y="${gr.y + gr.h - 16}" class="fm-group-note">${escapeHtml(gr.note)}</text>`
        : "")
  ).join("");
  const edges = map.links
    .map((l) => {
      const c = curve(placed.get(l.from)!, placed.get(l.to)!);
      return `<path class="${linkClass(l)}" data-key="${escapeHtml(`${l.from}>${l.to}`)}" data-lx="${r1(c.lx)}" data-ly="${r1(c.ly)}" data-anchor="${c.anchor}" d="${c.d}"/>`;
    })
    .join("");
  const nodes = [...placed.values()]
    .map(
      (b) =>
        `<g class="fm-node ${b.kind}" data-id="${escapeHtml(b.id)}" tabindex="0" role="button" aria-label="${escapeHtml(b.id)}">` +
        `<rect x="${r1(b.x)}" y="${r1(b.y)}" width="${b.w}" height="${b.h}" rx="${b.kind === "hub" ? 5 : 3}"/>` +
        `<text x="${b.cx}" y="${b.cy + 0.5}">${escapeHtml(b.id)}</text></g>`
    )
    .join("");
  const badges = map.examples
    .map(
      (ex) =>
        `<g class="fm-badges" data-path="${ex.id}" hidden>` +
        Object.entries(ex.path.badges)
          .filter(([id]) => placed.has(id))
          .map(([id, n]) => {
            const b = placed.get(id)!;
            return `<g class="fm-badge"><circle cx="${r1(b.x + 1)}" cy="${r1(b.y + 1)}" r="8.5"/><text x="${r1(b.x + 1)}" y="${r1(b.y + 1.5)}">${n}</text></g>`;
          })
          .join("") +
        `</g>`
    )
    .join("");
  return (
    `<svg class="fm-graph" viewBox="0 0 ${VIEW.w} ${VIEW.h}" role="img" aria-labelledby="${g}-map-caption" ` +
    `style="--ah: url(#${g}-ah); --ah-on: url(#${g}-ah-on); --ah-warn: url(#${g}-ah-warn)">` +
    `<defs>${markers}</defs><g>${groups}</g><g class="fm-edges">${edges}</g><g class="fm-labels"></g>` +
    `<g class="fm-nodes">${nodes}</g>${badges}</svg>`
  );
}

const LEGEND =
  `<div class="fm-legend" aria-label="Legend">` +
  `<span><svg viewBox="0 0 28 8" aria-hidden="true"><line x1="0" y1="4" x2="22" y2="4"/><path d="M21,0.5 L28,4 L21,7.5 z"/></svg>Field holds the target’s key</span>` +
  `<span><svg viewBox="0 0 28 8" aria-hidden="true"><line x1="0" y1="4" x2="22" y2="4" stroke-dasharray="5 3"/><path d="M21,0.5 L28,4 L21,7.5 z"/></svg>Same key in both files</span>` +
  `<span><svg viewBox="0 0 28 8" aria-hidden="true"><line x1="1" y1="4" x2="22" y2="4" stroke-dasharray="1.5 3" stroke-linecap="round"/><path d="M21,0.5 L28,4 L21,7.5 z"/></svg>Text markup or value match</span>` +
  `<span class="warn"><svg viewBox="0 0 28 8" aria-hidden="true"><line x1="0" y1="4" x2="22" y2="4"/><path d="M21,0.5 L28,4 L21,7.5 z"/></svg>Some values do not resolve</span>` +
  `</div>`;

/** Escapes text and turns `code` spans into <code>. */
function inline(text: string): string {
  return escapeHtml(text).replace(/`([^`]+)`/g, "<code>$1</code>");
}

function rowItem(row: Row, n: number): string {
  return (
    `<li data-row="${n}"><span class="fm-n" aria-hidden="true">${n}</span><div class="fm-row">` +
    `<code class="fm-code">${escapeHtml(row.code)}</code>` +
    (row.value ? `<span class="fm-value">${escapeHtml(row.value)}</span>` : "") +
    (row.note ? `<p>${inline(row.note)}</p>` : "") +
    `<span class="fm-at" aria-label="Steps ${row.steps.join(", ")}">${row.steps.map((s) => `<span>${s}</span>`).join("")}</span>` +
    `</div></li>`
  );
}

function example(map: GameMap, ex: Example): string {
  const id = `${map.game}-${ex.id}`;
  const text = [
    ...ex.tooltip.name.map((n) => `<li>${escapeHtml(n)}</li>`),
    ...ex.tooltip.blocks
      .flat()
      .map((l) => `<li>${escapeHtml(l.parts.map((p) => p.text).join(""))}</li>`)
  ].join("");
  return (
    `<div class="fm-example">` +
    `<div class="fm-example-head"><h3 id="${id}">${escapeHtml(ex.title)}</h3>` +
    `<span class="fm-subject">${escapeHtml(ex.subject)}</span>` +
    `<button type="button" class="btn sm" data-show="${ex.id}">Show on map</button></div>` +
    `<div class="fm-trace">` +
    `<div class="fm-tooltip" data-example="${ex.id}"><div class="fm-canvas"><canvas aria-hidden="true"></canvas><div class="fm-band" hidden></div><div class="fm-pins"></div></div>` +
    `<ol class="fm-text" aria-label="Tooltip lines">${text}</ol></div>` +
    `<ol class="fm-rows">${ex.rows.map((r, i) => rowItem(r, i + 1)).join("")}</ol>` +
    `</div>` +
    `<p class="label fm-steps-label">Join order</p>` +
    `<ol class="fm-steps">${ex.steps.map((s, i) => `<li><span class="fm-step-n">${i + 1}</span><div><code>${escapeHtml(s.code)}</code><p>${inline(s.text)}</p></div></li>`).join("")}</ol>` +
    (ex.code ? renderCodeBlock(ex.code, "js") : "") +
    `</div>`
  );
}

/** One game's section: the diagram with its panel, the worked examples and the gaps. */
export function fileMapSection(map: GameMap): string {
  const g = map.game;
  const partial = map.links.filter((l) => l.hit < l.total).length;
  const client = {
    game: g,
    nodes: map.nodes,
    links: map.links,
    groups: Object.fromEntries(
      Object.entries(LAYOUT[g]).map(([id, [group]]) => [
        id,
        GROUPS.find((x) => x.id === group)!.label
      ])
    ),
    examples: map.examples.map((e) => ({
      id: e.id,
      title: e.title,
      subject: e.subject,
      tooltip: e.tooltip,
      path: e.path,
      steps: e.steps.map((s) => s.code)
    }))
  };
  const json = JSON.stringify(client).replace(/</g, "\\u003c");
  return (
    `<div class="fm" data-game="${g}">` +
    `<p class="fm-facts"><span>Patch <b>${escapeHtml(map.patch)}</b></span><span><b>${Object.keys(map.nodes).length}</b> files and folders</span>` +
    `<span><b>${map.links.length}</b> links</span><span><b>${map.links.length - partial}</b> resolve for every value</span></p>` +
    `<div class="fm-head"><div class="fm-modes" role="group" aria-label="Highlight a path">` +
    `<button type="button" data-mode="all">All links</button>` +
    map.examples
      .map((e) => `<button type="button" data-mode="${e.id}">${escapeHtml(e.title)}</button>`)
      .join("") +
    `</div>${LEGEND}</div>` +
    `<div class="fm-box"><figure class="fm-figure"><div class="fm-scroll">${diagram(map)}</div>` +
    `<figcaption id="${g}-map-caption">Each arrow runs from the file that holds a field to the file whose key that field matches. ` +
    `Select a file to list its links.</figcaption></figure>` +
    `<div class="fm-panel" aria-live="polite"></div></div>` +
    map.examples.map((e) => example(map, e)).join("") +
    `<h3 id="${g}-gaps">What does not join</h3>` +
    `<dl class="fm-gaps">${map.gaps.map((x) => `<div><dt>${inline(x.title)}</dt><dd>${inline(x.text)}</dd></div>`).join("")}</dl>` +
    `<script type="application/json" class="fm-data">${json}</script>` +
    `</div>`
  );
}

/** Replaces the page's markers with each game's section, and adds the scripts once. */
export function fileMapPage(html: string, data: FileMapData): string {
  let used = false;
  const out = html.replace(FILE_MAP_MARKER, (_, game: Game) => {
    const map = data.games[game];
    if (!map)
      throw new Error(
        `data/file-map.json has no ${game} map: run pnpm --filter @exiledata/docs file-map`
      );
    used = true;
    return fileMapSection(map);
  });
  if (!used) return out;
  return (
    out +
    `<script src="/tooltip/renderer.js" defer></script>\n<script src="/file-map.js" defer></script>\n`
  );
}
