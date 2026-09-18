import type { DatasetMetadata, Game } from "@exiledata/schema";

/**
 * A dataset object as seen in a storage listing. `etag` changes whenever the object is
 * rewritten, which is how a reader notices that a patch was re-ingested in place.
 */
export interface StoredDataset {
  game: Game;
  gameVersion: string;
  etag: string;
  size: number;
  lastModified: string;
}

/**
 * Storage backend for generated dataset artifacts (never committed to git — see root README's
 * "Dataset architecture" section). Two drivers are provided: local filesystem for development
 * (`LocalDatasetStorage`) and Cloudflare R2 for production (`R2DatasetStorage`), selected via
 * `createDatasetStorage`.
 *
 * One dataset per game patch, stored at `{game}/{gameVersion}/dataset.json`. Re-ingesting the
 * same patch overwrites it. This package does not decide *what* goes in that payload — that's
 * the ingestion pipeline's job.
 */
export interface DatasetStorage {
  put(metadata: DatasetMetadata, data: string): Promise<void>;
  get(game: Game, gameVersion: string): Promise<string | undefined>;
  /** Lists the datasets published for a game. Order is not guaranteed. */
  list(game: Game): Promise<StoredDataset[]>;
  /** Removes one dataset. Resolves without error if it does not exist. */
  delete(game: Game, gameVersion: string): Promise<void>;
}
