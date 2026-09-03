import type { CanonicalEntity } from "../common/entity.js";

/**
 * A single passive skill tree node. Placeholder — does not yet model node position, connections,
 * or stat grants (see `Stat`).
 */
export interface Passive extends CanonicalEntity {
  name: string;
}

/**
 * The passive tree groups passives for a given game/game-version. Placeholder — does not yet
 * model tree layout, ascendancy sub-trees, or jewel sockets.
 */
export interface PassiveTree extends CanonicalEntity {
  passiveIds: Array<Passive["id"]>;
}
