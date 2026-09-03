import type { CanonicalEntity } from "../common/entity.js";

/**
 * A skill represents a usable player ability, independent of the gem/item that grants it.
 * Placeholder — does not yet model skill types, tags, or damage effectiveness.
 */
export interface Skill extends CanonicalEntity {
  name: string;
}
