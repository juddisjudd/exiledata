import {
  compareGameVersions,
  createDatasetStorage,
  type DatasetStorage,
  type StoredDataset
} from "@exiledata/storage";
import type { Dataset, Game } from "@exiledata/schema";
import type { AppConfig } from "./config.js";

export interface DatasetReaderOptions {
  /** How long a storage listing is trusted before it is fetched again. */
  listingTtlMs?: number;
  now?: () => number;
}

/**
 * Reads datasets from storage and keeps parsed ones in memory.
 *
 * A patch can be re-ingested in place, so a parsed dataset is reused only while the listing
 * still reports the same etag for it. Listings are cached for a short TTL, which bounds both
 * the storage calls per request and how long a newly published or replaced dataset takes to
 * appear.
 */
export class DatasetReader {
  private readonly listings = new Map<Game, { expires: number; entries: StoredDataset[] }>();
  private readonly cache = new Map<string, { etag: string; dataset: Dataset }>();
  private readonly loading = new Map<string, Promise<Dataset | undefined>>();
  private readonly listingTtlMs: number;
  private readonly now: () => number;

  constructor(
    private readonly storage: DatasetStorage,
    options: DatasetReaderOptions = {}
  ) {
    this.listingTtlMs = options.listingTtlMs ?? 60_000;
    this.now = options.now ?? Date.now;
  }

  /** Published datasets for a game, oldest patch first. */
  async list(game: Game): Promise<StoredDataset[]> {
    const cached = this.listings.get(game);
    if (cached && cached.expires > this.now()) return cached.entries;

    const entries = (await this.storage.list(game)).sort((a, b) =>
      compareGameVersions(game, a.gameVersion, b.gameVersion)
    );
    this.listings.set(game, { expires: this.now() + this.listingTtlMs, entries });

    const live = new Set(entries.map((entry) => `${game}/${entry.gameVersion}`));
    for (const key of this.cache.keys()) {
      if (key.startsWith(`${game}/`) && !live.has(key)) this.cache.delete(key);
    }
    return entries;
  }

  /** Most recent patch for a game, or undefined if none have been published. */
  async latestVersion(game: Game): Promise<string | undefined> {
    return (await this.list(game)).at(-1)?.gameVersion;
  }

  async get(game: Game, gameVersion: string): Promise<Dataset | undefined> {
    const entry = (await this.list(game)).find((e) => e.gameVersion === gameVersion);
    if (!entry) return undefined;

    const key = `${game}/${gameVersion}`;
    const cached = this.cache.get(key);
    if (cached?.etag === entry.etag) return cached.dataset;

    const loadKey = `${key}@${entry.etag}`;
    let pending = this.loading.get(loadKey);
    if (!pending) {
      pending = this.load(game, gameVersion, entry.etag).finally(() =>
        this.loading.delete(loadKey)
      );
      this.loading.set(loadKey, pending);
    }
    return pending;
  }

  private async load(game: Game, gameVersion: string, etag: string) {
    const raw = await this.storage.get(game, gameVersion);
    if (!raw) return undefined;

    const dataset = JSON.parse(raw) as Dataset;
    this.cache.set(`${game}/${gameVersion}`, { etag, dataset });
    return dataset;
  }
}

/** Builds a reader from app config, using the same driver selection as ingestion. */
export function createDatasetReader(config: AppConfig): DatasetReader {
  return new DatasetReader(createDatasetStorage(config.datasetStorage));
}
