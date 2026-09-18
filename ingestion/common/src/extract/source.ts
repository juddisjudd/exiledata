import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Game } from "@exiledata/schema";
import type { IngestionSource } from "../source.js";

/**
 * A base item as it appears in a GGPK extract's `base_items.json`, keyed by metadata path.
 * Field names are the extract's own — mapping into the canonical schema is the normalizer's job.
 * Fields beyond the ones typed here vary by game and pass through untouched.
 */
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
  /** Game version from the extract's `version.txt`, e.g. "4.5.5.3". */
  gameVersion: string;
  baseItems: Record<string, RawBaseItem>;
}

/**
 * Reads a local GGPK extract directory, as produced by ggpk-explorer for either game. Unlike a
 * scraped source this is offline and deterministic — the extract is produced ahead of time, so
 * an ingestion run never depends on a third-party site being up.
 *
 * Only the files the implemented stages need are read; add to `ExtractRaw` as more land.
 */
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
