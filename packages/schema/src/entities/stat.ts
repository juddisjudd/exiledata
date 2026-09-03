import type { CanonicalEntity } from "../common/entity.js";

/**
 * A stat is an atomic, named numeric concept (e.g. "increased physical damage") that
 * modifiers, gems, and passives reference. Distinct from a `Modifier`, which is a specific
 * roll/application of one or more stats to an item.
 *
 * Placeholder — value ranges, semantics, and stat grouping are not yet modeled.
 */
export interface Stat extends CanonicalEntity {
  /** Stable stat key, independent of upstream naming (e.g. RePoE's internal stat ids). */
  key: string;
  /** Human-readable description template, if known. */
  description?: string;
}
