import { createDatasetStorage, type DatasetStorage } from "@exiledata/storage";
import type { Dataset, Game } from "@exiledata/schema";
import type { AppConfig } from "./config.js";

/**
 * Reads datasets from storage and keeps parsed ones in memory.
 *
 * Datasets are immutable once published — a given `{game}/{datasetVersion}` never changes — so
 * caching a parsed copy is safe and avoids re-parsing several MB of JSON on every request. The
 * version list is deliberately not cached: new versions appear without the API restarting.
 */
export class DatasetReader {
  private readonly cache = new Map<string, Dataset>();

  constructor(private readonly storage: DatasetStorage) {}

  async listVersions(game: Game): Promise<string[]> {
    const versions = await this.storage.listVersions(game);
    return [...versions].sort();
  }

  /** Most recent version for a game, or undefined if none have been published. */
  async latestVersion(game: Game): Promise<string | undefined> {
    return (await this.listVersions(game)).at(-1);
  }

  async get(game: Game, datasetVersion: string): Promise<Dataset | undefined> {
    const key = `${game}/${datasetVersion}`;
    const cached = this.cache.get(key);
    if (cached) return cached;

    const raw = await this.storage.get(game, datasetVersion);
    if (!raw) return undefined;

    const dataset = JSON.parse(raw) as Dataset;
    this.cache.set(key, dataset);
    return dataset;
  }
}

/** Builds a reader from app config, using the same driver selection as ingestion. */
export function createDatasetReader(config: AppConfig): DatasetReader {
  return new DatasetReader(createDatasetStorage(config.datasetStorage));
}
