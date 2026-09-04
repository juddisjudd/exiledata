import type { IngestionStage } from "@exiledata/ingestion-common";
import type { BaseItem } from "@exiledata/schema";
import { createExtractSource, type Poe2ExtractRaw } from "../sources/extract.js";
import { baseItemsParser, type ParsedBaseItems } from "../parsers/baseItems.js";
import { createBaseItemsNormalizer } from "../normalizers/baseItems.js";
import { baseItemsValidator } from "../validators/baseItems.js";

/** Assembles the PoE 2 base-item stage against a local GGPK extract directory. */
export function createBaseItemsStage(
  extractDir: string,
  retrievedAt = new Date().toISOString()
): IngestionStage<Poe2ExtractRaw, ParsedBaseItems, BaseItem> {
  return {
    source: createExtractSource(extractDir),
    parser: baseItemsParser,
    normalizer: createBaseItemsNormalizer({ retrievedAt }),
    validator: baseItemsValidator,
    warn(parsed) {
      if (parsed.skipped.length === 0) return [];
      const byReason = new Map<string, number>();
      for (const { reason } of parsed.skipped) {
        byReason.set(reason, (byReason.get(reason) ?? 0) + 1);
      }
      return [...byReason].map(
        ([reason, count]) => `skipped ${count} base item(s) from the extract: ${reason}`
      );
    }
  };
}
