import type { CanonicalEntity } from "../common/entity.js";
import type { Stat } from "./stat.js";

/**
 * A modifier group clusters related modifiers (e.g. all prefixes that grant life on an item),
 * used for spawn weighting and categorization. Placeholder.
 */
export interface ModifierGroup extends CanonicalEntity {
  key: string;
  name?: string;
}

/**
 * A modifier represents a specific affix/roll that can appear on an item, referencing one or
 * more underlying stats. Placeholder — does not yet model roll ranges, tiers, weighting, or
 * generation type (prefix/suffix/implicit/etc).
 */
export interface Modifier extends CanonicalEntity {
  key: string;
  groupId?: ModifierGroup["id"];
  statIds: Array<Stat["id"]>;
}
