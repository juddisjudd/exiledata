import { SCHEMA_VERSION, type BaseItem, type Game } from "@exiledata/schema";
import type { Normalizer, Parser, Validator, ValidationError } from "../pipeline.js";
import type { IngestionStage } from "../stage.js";
import { createExtractSource, type ExtractRaw, type RawBaseItem } from "./source.js";

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
 * Both games' extracts contain entries with an empty `name` — internal placeholders such as the
 * `RandomFossilOutcome*` currency series. They have no name and no properties, so they are
 * excluded rather than published as unnamed records, and reported through the stage's `warn`
 * hook so the exclusion is visible in an ingestion run.
 */
export const baseItemsParser: Parser<ExtractRaw, ParsedBaseItems> = {
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

/**
 * Maps extract-shaped base items into canonical `BaseItem` records.
 *
 * `name` and `itemClass` are the only fields promoted to the stable contract today; every other
 * field stays in `ext` under the extract's own key name, so it remains traceable back to the
 * source and can be promoted deliberately rather than by accident.
 */
export function createBaseItemsNormalizer(
  game: Game,
  retrievedAt: string
): Normalizer<ParsedBaseItems, BaseItem> {
  return {
    normalize(parsed) {
      return parsed.items.map(({ metadataPath, raw, gameVersion }) => {
        const { name, item_class, ...ext } = raw;
        return {
          id: metadataPath,
          name,
          itemClass: item_class,
          version: { schemaVersion: SCHEMA_VERSION, game, gameVersion },
          source: [
            {
              name: `${game}-ggpk-extract`,
              version: gameVersion,
              retrievedAt,
              locator: `base_items.json#${metadataPath}`
            }
          ],
          ext
        };
      });
    }
  };
}

/**
 * Checks the invariants a dataset consumer relies on: every record is addressable by a unique
 * id, carries a name, and declares the game and schema version it was built against.
 */
export function createBaseItemsValidator(game: Game): Validator<BaseItem> {
  return {
    validate(entities) {
      const errors: ValidationError[] = [];
      const seen = new Set<string>();

      for (const [index, entity] of entities.entries()) {
        const at = `entities[${index}]`;

        if (!entity.id?.trim()) {
          errors.push({ path: at, message: "missing id" });
        } else if (seen.has(entity.id)) {
          errors.push({ path: at, message: `duplicate id "${entity.id}"` });
        } else {
          seen.add(entity.id);
        }

        if (!entity.name?.trim()) {
          errors.push({ path: at, message: `"${entity.id}" has no name` });
        }

        if (entity.version.game !== game) {
          errors.push({ path: `${at}.version.game`, message: `expected "${game}"` });
        }

        if (entity.version.schemaVersion !== SCHEMA_VERSION) {
          errors.push({
            path: `${at}.version.schemaVersion`,
            message: `expected "${SCHEMA_VERSION}"`
          });
        }

        if (entity.source.length === 0) {
          errors.push({ path: `${at}.source`, message: "no provenance recorded" });
        }
      }

      return { valid: errors.length === 0, errors };
    }
  };
}

/** Assembles the base-item stage for one game against a local GGPK extract directory. */
export function createExtractBaseItemsStage(
  game: Game,
  extractDir: string,
  retrievedAt = new Date().toISOString()
): IngestionStage<ExtractRaw, ParsedBaseItems, BaseItem> {
  return {
    source: createExtractSource(game, extractDir),
    parser: baseItemsParser,
    normalizer: createBaseItemsNormalizer(game, retrievedAt),
    validator: createBaseItemsValidator(game),
    warn(parsed) {
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
