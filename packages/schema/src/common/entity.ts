export type Game = "poe1" | "poe2";

export interface SourceProvenance {
  /** e.g. "poe2-ggpk-extract". */
  name: string;
  /** The game patch the source was read from. */
  version?: string;
  retrievedAt: string;
  /** The source file and the entry in it, e.g. "base_items.json#Metadata/Items/...". */
  locator?: string;
}

export interface EntityVersionInfo {
  schemaVersion: string;
  game: Game;
  /** e.g. "0.5.5.4". */
  gameVersion?: string;
}

export interface CanonicalEntity {
  /** Stays the same across patches while the game entity is unchanged. */
  id: string;
  version: EntityVersionInfo;
  source: SourceProvenance[];
  /** Fields not yet promoted to the stable contract; their shape can change. */
  ext?: Record<string, unknown>;
  /** Values ExileData computes rather than reads from the game files. */
  derived?: Record<string, unknown>;
}
