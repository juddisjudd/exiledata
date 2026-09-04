import type { Parser } from "@exiledata/ingestion-common";
import type { Poe2ExtractRaw, RawBaseItem } from "../sources/extract.js";

/**
 * A base item paired with the metadata path it was keyed by. The extract stores that path only
 * as an object key, so it is lifted here — it is the one field stable enough to build a
 * canonical id from.
 */
export interface ParsedBaseItem {
  metadataPath: string;
  raw: RawBaseItem;
  gameVersion: string;
}

export interface ParsedBaseItems {
  items: ParsedBaseItem[];
  /** Entries excluded before normalization, keyed by metadata path, with the reason. */
  skipped: Array<{ metadataPath: string; reason: string }>;
}

/**
 * Flattens `base_items.json` into a list.
 *
 * The extract contains entries with an empty `name` — internal placeholders such as the
 * `RandomFossilOutcome*` currency series. They are marked `released` but have no name and no
 * properties, so they are excluded rather than published as unnamed records. They are reported
 * through the stage's `warn` hook so the exclusion is visible in an ingestion run.
 */
export const baseItemsParser: Parser<Poe2ExtractRaw, ParsedBaseItems> = {
  parse(raw) {
    const items: ParsedBaseItem[] = [];
    const skipped: ParsedBaseItems["skipped"] = [];

    for (const [metadataPath, item] of Object.entries(raw.baseItems)) {
      if (!metadataPath.trim()) continue;

      if (!item.name?.trim()) {
        skipped.push({ metadataPath, reason: "empty name" });
        continue;
      }

      items.push({ metadataPath, raw: item, gameVersion: raw.gameVersion });
    }

    return { items, skipped };
  }
};
