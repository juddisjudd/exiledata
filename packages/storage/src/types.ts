import type { DatasetMetadata, Game } from "@exiledata/schema";

/**
 * Storage backend for generated dataset artifacts (never committed to git — see root README's
 * "Dataset architecture" section). Two drivers are provided: local filesystem for development
 * (`LocalDatasetStorage`) and Cloudflare R2 for production (`R2DatasetStorage`), selected via
 * `createDatasetStorage`.
 *
 * Datasets are stored as a single JSON payload per `{game}/{datasetVersion}`. This package does
 * not decide *what* goes in that payload — that's the ingestion pipeline's job (see stage.ts).
 */
export interface DatasetStorage {
  put(metadata: DatasetMetadata, data: string): Promise<void>;
  get(game: Game, datasetVersion: string): Promise<string | undefined>;
  /** Lists known dataset versions for a game. Order is not guaranteed. */
  listVersions(game: Game): Promise<string[]>;
}
