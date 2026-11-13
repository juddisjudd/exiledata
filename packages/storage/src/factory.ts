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

export function createDatasetStorage(config: DatasetStorageConfig): DatasetStorage {
  if (config.driver === "r2") {
    return new R2DatasetStorage(config);
  }
  return new LocalDatasetStorage(config.path);
}

/** An unknown driver throws: quietly serving an empty local folder is worse than not starting. */
export function datasetStorageConfigFromEnv(env: NodeJS.ProcessEnv): DatasetStorageConfig {
  const driver = (env.DATASET_STORAGE_DRIVER ?? "local").trim().toLowerCase();

  if (driver !== "local" && driver !== "r2") {
    throw new Error(
      `DATASET_STORAGE_DRIVER must be "local" or "r2" (got "${env.DATASET_STORAGE_DRIVER}")`
    );
  }

  if (driver === "r2") {
    const missing = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET_NAME"]
      .filter((key) => !env[key])
      .join(", ");
    if (missing) throw new Error(`DATASET_STORAGE_DRIVER=r2 but missing: ${missing}`);

    return {
      driver: "r2",
      accountId: env.R2_ACCOUNT_ID as string,
      accessKeyId: env.R2_ACCESS_KEY_ID as string,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY as string,
      bucketName: env.R2_BUCKET_NAME as string
    };
  }

  return { driver: "local", path: env.DATASET_STORAGE_PATH ?? "./data/datasets" };
}

/** Human-readable name of where a config points, e.g. `r2:exiledata-datasets`. */
export function describeDatasetStorage(config: DatasetStorageConfig): string {
  return config.driver === "r2" ? `r2:${config.bucketName}` : `local:${config.path}`;
}
