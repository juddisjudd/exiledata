import { LocalDatasetStorage } from "./local.js";
import { R2DatasetStorage } from "./r2.js";
import type { DatasetStorage } from "./types.js";

export type DatasetStorageConfig =
  | { driver: "local"; path: string }
  | {
      driver: "r2";
      accountId: string;
      accessKeyId: string;
      secretAccessKey: string;
      bucketName: string;
    };

/** Selects a `DatasetStorage` implementation from config (see `.env.example`'s DATASET_STORAGE_* vars). */
export function createDatasetStorage(config: DatasetStorageConfig): DatasetStorage {
  if (config.driver === "r2") {
    return new R2DatasetStorage(config);
  }
  return new LocalDatasetStorage(config.path);
}
