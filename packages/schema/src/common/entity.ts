/**
 * Games supported by ExileData. PoE 1 and PoE 2 are modeled independently — they do not share
 * game data, only schema conventions.
 */
export type Game = "poe1" | "poe2";

/**
 * Identifies where a piece of normalized data originated. A single canonical record may be
 * derived from one or more sources (e.g. RePoE for base stats, PoEDB for descriptions).
 *
 * This exists so consumers can trace a normalized value back to upstream data without the
 * canonical schema being coupled to any single upstream provider.
 */
export interface SourceProvenance {
  /** Stable identifier for the upstream source, e.g. "repoe", "poedb". */
  name: string;
  /** Version/commit/snapshot identifier of the upstream source, if known. */
  version?: string;
  /** When this data was retrieved from the source. */
  retrievedAt: string;
  /** Optional pointer to the original upstream record (path, URL, key) for debugging. */
  locator?: string;
}

/**
 * Every canonical entity carries version metadata so API/dataset consumers can reason about
 * compatibility without inspecting upstream formats.
 */
export interface EntityVersionInfo {
  /** Version of the ExileData schema this record conforms to (see CHANGELOG in this package). */
  schemaVersion: string;
  /** Game this record belongs to. */
  game: Game;
  /** Upstream game version this record was normalized from, if known (e.g. "3.25.0"). */
  gameVersion?: string;
}

/**
 * Base shape shared by all canonical ExileData entities.
 *
 * Field groups are deliberately kept distinct — see this package's README for the reasoning:
 *  - `id`, `version`      -> stable ExileData identity/versioning, never source-dependent.
 *  - `source`             -> provenance metadata, never mixed into normalized fields.
 *  - `ext`                -> source-specific/raw fields not yet promoted into the canonical model.
 *  - `derived`            -> values computed by ExileData (not present in any upstream source).
 */
export interface CanonicalEntity {
  /** Stable ExileData identifier. Must remain stable across dataset versions when the
   * underlying game entity is unchanged. */
  id: string;
  version: EntityVersionInfo;
  source: SourceProvenance[];
  /**
   * Source-specific or not-yet-normalized fields. Data here has not been promoted to a stable
   * ExileData concept and may change shape as the schema evolves. Consumers should not treat
   * `ext` as a stable contract.
   */
  ext?: Record<string, unknown>;
  /**
   * Values derived/computed by ExileData rather than sourced directly from an upstream provider
   * (e.g. normalized ranges, resolved references, aggregate stats).
   */
  derived?: Record<string, unknown>;
}
