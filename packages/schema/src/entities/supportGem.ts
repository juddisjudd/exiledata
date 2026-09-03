import type { CanonicalEntity } from "../common/entity.js";

/**
 * A support gem modifies the behavior of linked active skills. Placeholder — does not yet
 * model supported gem tags or per-level effect scaling.
 */
export interface SupportGem extends CanonicalEntity {
  name: string;
}
