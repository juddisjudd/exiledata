import type { CanonicalEntity } from "../common/entity.js";

export interface BaseItem extends CanonicalEntity {
  name: string;
  /** The game's item class, e.g. "Amulet". */
  itemClass?: string;
}
