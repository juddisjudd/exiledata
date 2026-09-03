import type { Game } from "./entity.js";

/**
 * Metadata describing a single generated dataset artifact. This is what ships alongside a
 * dataset (not committed to git — see ingestion/common and the root README for the dataset
 * storage model).
 */
export interface DatasetMetadata {
  game: Game;
  /** Upstream game version this dataset was generated from, e.g. "3.25.0". */
  gameVersion: string;
  /** ExileData dataset version, e.g. "2026.09.03.1". Scheme documented in README, kept flexible. */
  datasetVersion: string;
  /** ISO timestamp of when this dataset was generated. */
  generatedAt: string;
  /** Version of the canonical schema this dataset conforms to. */
  schemaVersion: string;
  /** Upstream sources that contributed to this dataset. */
  sources: Array<{ name: string; version?: string; retrievedAt: string }>;
}

/**
 * Conceptual diff between two datasets of the same game. Implemented lazily — this interface
 * exists so the API/CLI can be designed around dataset comparison from the start.
 */
export interface DatasetDiff<T = unknown> {
  from: Pick<DatasetMetadata, "datasetVersion" | "gameVersion">;
  to: Pick<DatasetMetadata, "datasetVersion" | "gameVersion">;
  added: T[];
  removed: T[];
  changed: Array<{ before: T; after: T }>;
}
