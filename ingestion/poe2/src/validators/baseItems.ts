import type { Validator, ValidationError } from "@exiledata/ingestion-common";
import { SCHEMA_VERSION, type BaseItem } from "@exiledata/schema";

/**
 * Checks the invariants a dataset consumer relies on: every record is addressable by a unique
 * id, carries a name, and declares the game and schema version it was built against.
 */
export const baseItemsValidator: Validator<BaseItem> = {
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

      if (entity.version.game !== "poe2") {
        errors.push({ path: `${at}.version.game`, message: `expected "poe2"` });
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
