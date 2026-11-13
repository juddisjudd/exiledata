import { SCHEMA_VERSION, type BaseItem, type Game } from "@exiledata/schema";
import type { Normalizer, Parser, Validator, ValidationError } from "../pipeline.js";
import type { IngestionStage } from "../stage.js";
import { createExtractSource, type ExtractRaw, type RawBaseItem } from "./source.js";

/** The extract keys items by metadata path, the only field stable enough to build an id from. */
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

/** Drops nameless internal entries such as `RandomFossilOutcome*` and reports them via `warn`. */
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

/** Promotes only `name` and `itemClass`; every other field stays in `ext` under its own key. */
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
