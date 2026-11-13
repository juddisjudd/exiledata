import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Game } from "@exiledata/schema";
import type { IngestionSource } from "../source.js";

/** Fields beyond the typed ones vary by game and pass through to `ext` untouched. */
export interface RawBaseItem {
  name: string;
  item_class: string;
  tags: string[];
  /** "undefined" is the extractor's value for a base that cannot take mods. */
  domain: string;
  drop_level: number;
  inherits_from: string;
  inventory_width: number;
  inventory_height: number;
  implicits: string[];
  implicit_text: string[];
  release_state: string;
  properties: Record<string, unknown>;
  visual_identity: { id: string; dds_file?: string };
  requirements?: Record<string, number>;
  [field: string]: unknown;
}

export interface ExtractRaw {
  /** Game version from the extract's `version.txt`, e.g. "0.5.5.4". */
  gameVersion: string;
  baseItems: Record<string, RawBaseItem>;
}

export function createExtractSource(game: Game, extractDir: string): IngestionSource<ExtractRaw> {
  return {
    name: `${game}-ggpk-extract`,
    game,
    async fetch() {
      const [version, baseItems] = await Promise.all([
        readFile(path.join(extractDir, "version.txt"), "utf8"),
        readFile(path.join(extractDir, "base_items.json"), "utf8")
      ]);

      return {
        gameVersion: version.trim(),
        baseItems: JSON.parse(baseItems) as Record<string, RawBaseItem>
      };
    },
    getVersion(raw) {
      return raw.gameVersion;
    }
  };
}
