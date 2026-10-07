import type { Game } from "./entity.js";

/**
 * Metadata describing a single generated dataset artifact. This is what ships alongside a
 * dataset (not committed to git — see ingestion/common and the root README for the dataset
 * storage model).
 *
 * A dataset is identified by `game` + `gameVersion`: there is one per game patch. Re-ingesting
 * a patch replaces it, and `generatedAt` tells the two builds apart.
 */
export interface DatasetMetadata {
  game: Game;
  /** Game patch this dataset was generated from, e.g. "0.5.5.4". Also its storage key. */
  gameVersion: string;
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
  from: Pick<DatasetMetadata, "gameVersion" | "generatedAt">;
  to: Pick<DatasetMetadata, "gameVersion" | "generatedAt">;
  added: T[];
  removed: T[];
  changed: Array<{ before: T; after: T }>;
}

/**
 * The full payload written to dataset storage: metadata plus the entities it describes. This is
 * what `DatasetStorage.put` serializes and what the API reads back for a given dataset version.
 */
export interface Dataset<T = unknown> {
  metadata: DatasetMetadata;
  entities: T[];
}
