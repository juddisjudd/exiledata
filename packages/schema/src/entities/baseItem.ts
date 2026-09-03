import type { CanonicalEntity } from "../common/entity.js";

/**
 * A base item defines the un-modified template for an item type (e.g. "Vaal Regalia"),
 * independent of any specific rolled instance. Placeholder — does not yet model item classes,
 * base stats, requirements, or implicit modifiers.
 */
export interface BaseItem extends CanonicalEntity {
  name: string;
  /** Stable item class key (e.g. "body_armour", "claw"). Value set not yet defined. */
  itemClass?: string;
}
