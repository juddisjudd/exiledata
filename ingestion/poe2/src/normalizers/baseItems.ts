import type { Normalizer } from "@exiledata/ingestion-common";
import { SCHEMA_VERSION, type BaseItem } from "@exiledata/schema";
import type { ParsedBaseItems } from "../parsers/baseItems.js";

export interface BaseItemsNormalizerOptions {
  /** ISO timestamp recorded as `SourceProvenance.retrievedAt`. */
  retrievedAt: string;
}

/**
 * Maps extract-shaped base items into canonical `BaseItem` records.
 *
 * `name` and `itemClass` are the only fields promoted to the stable contract today; everything
 * else stays in `ext` under the extract's own key names, so it remains traceable back to the
 * source and can be promoted deliberately rather than by accident.
 */
export function createBaseItemsNormalizer(
  options: BaseItemsNormalizerOptions
): Normalizer<ParsedBaseItems, BaseItem> {
  return {
    normalize(parsed) {
      return parsed.items.map(({ metadataPath, raw, gameVersion }) => ({
        id: metadataPath,
        name: raw.name,
        itemClass: raw.item_class,
        version: {
          schemaVersion: SCHEMA_VERSION,
          game: "poe2" as const,
          gameVersion
        },
        source: [
          {
            name: "poe2-ggpk-extract",
            version: gameVersion,
            retrievedAt: options.retrievedAt,
            locator: `base_items.json#${metadataPath}`
          }
        ],
        ext: {
          domain: raw.domain,
          drop_level: raw.drop_level,
          implicits: raw.implicits,
          implicit_text: raw.implicit_text,
          inherits_from: raw.inherits_from,
          inventory_height: raw.inventory_height,
          inventory_width: raw.inventory_width,
          properties: raw.properties,
          release_state: raw.release_state,
          requirements: raw.requirements,
          skills_granted: raw.skills_granted,
          tags: raw.tags,
          visual_identity: raw.visual_identity
        }
      }));
    }
  };
}
