import type { CanonicalEntity } from "../common/entity.js";

/**
 * A tag is a lightweight label attached to other entities (items, skills, mods) used for
 * filtering and grouping. Placeholder — value set is not yet modeled.
 */
export interface Tag extends CanonicalEntity {
  key: string;
  label?: string;
}
