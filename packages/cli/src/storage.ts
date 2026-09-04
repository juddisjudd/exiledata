import { createDatasetStorage, type DatasetStorageConfig } from "@exiledata/ingestion-common";

/**
 * Builds storage config from `DATASET_STORAGE_*` / `R2_*` environment variables (see
 * `.env.example`). Defaults to the local driver so a run never accidentally targets R2.
 */
export function storageFromEnv(env: NodeJS.ProcessEnv = process.env) {
  const driver = env.DATASET_STORAGE_DRIVER ?? "local";

  if (driver === "r2") {
    const missing = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET_NAME"]
      .filter((key) => !env[key])
      .join(", ");
    if (missing) throw new Error(`DATASET_STORAGE_DRIVER=r2 but missing: ${missing}`);

    const config: DatasetStorageConfig = {
      driver: "r2",
      accountId: env.R2_ACCOUNT_ID as string,
      accessKeyId: env.R2_ACCESS_KEY_ID as string,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY as string,
      bucketName: env.R2_BUCKET_NAME as string
    };
    return { storage: createDatasetStorage(config), description: `r2:${config.bucketName}` };
  }

  const path = env.DATASET_STORAGE_PATH ?? "./data/datasets";
  return {
    storage: createDatasetStorage({ driver: "local", path }),
    description: `local:${path}`
  };
}

/** Dataset version scheme from the root README: `YYYY.MM.DD.N`. */
export function defaultDatasetVersion(now = new Date()): string {
  const date = now.toISOString().slice(0, 10).replace(/-/g, ".");
  return `${date}.1`;
}
