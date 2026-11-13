import type { Game } from "./entity.js";

/** One per game patch. Re-ingesting replaces it, and `generatedAt` tells the builds apart. */
export interface DatasetMetadata {
  game: Game;
  /** Game patch this dataset was generated from, e.g. "0.5.5.4". Also its storage key. */
  gameVersion: string;
  /** ISO timestamp of when this dataset was generated. */
  generatedAt: string;
  schemaVersion: string;
  sources: Array<{ name: string; version?: string; retrievedAt: string }>;
}

export interface Dataset<T = unknown> {
  metadata: DatasetMetadata;
  entities: T[];
}
