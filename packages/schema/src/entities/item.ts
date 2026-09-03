import type { CanonicalEntity } from "../common/entity.js";
import type { BaseItem } from "./baseItem.js";
import type { Modifier } from "./modifier.js";

/**
 * A unique item is a named, fixed (or semi-fixed) variant of a base item with predefined
 * modifiers. Placeholder — does not yet model fixed value ranges, flavor text, or league
 * association.
 */
export interface UniqueItem extends CanonicalEntity {
  name: string;
  baseItemId: BaseItem["id"];
  modifierIds: Array<Modifier["id"]>;
}

/**
 * Generic "Item" concept placeholder, representing the umbrella entity that base items,
 * unique items, and (eventually) rare/magic instances share. Kept intentionally minimal until
 * the relationship between base/unique/instance items is decided.
 */
export interface Item extends CanonicalEntity {
  name: string;
  baseItemId: BaseItem["id"];
}
