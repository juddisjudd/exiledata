import type { DatasetMetadata, Game } from "@exiledata/schema";

/** `etag` changes on every rewrite, which is how a reader spots a re-ingested patch. */
export interface StoredDataset {
  game: Game;
  gameVersion: string;
  etag: string;
  size: number;
  lastModified: string;
}

export interface DatasetStorage {
  put(metadata: DatasetMetadata, data: string): Promise<void>;
  get(game: Game, gameVersion: string): Promise<string | undefined>;
  /** Lists the datasets published for a game. Order is not guaranteed. */
  list(game: Game): Promise<StoredDataset[]>;
  /** Removes one dataset. Resolves without error if it does not exist. */
  delete(game: Game, gameVersion: string): Promise<void>;
}
