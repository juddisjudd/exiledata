import type { DatasetStorageConfig } from "@exiledata/storage";

/**
 * Centralized environment configuration. Reads process.env once so the rest of the app doesn't
 * scatter `process.env.X` access (and so missing/invalid config fails fast at startup).
 */
export interface AppConfig {
  nodeEnv: string;
  port: number;
  databaseUrl?: string;
  apiKeySecret?: string;
  rateLimit: {
    windowMs: number;
    maxRequests: number;
  };
  datasetStorage: DatasetStorageConfig;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return {
    nodeEnv: env.NODE_ENV ?? "development",
    port: Number(env.API_PORT ?? 3000),
    databaseUrl: env.DATABASE_URL,
    apiKeySecret: env.API_KEY_SECRET,
    rateLimit: {
      windowMs: Number(env.RATE_LIMIT_WINDOW_MS ?? 60_000),
      maxRequests: Number(env.RATE_LIMIT_MAX_REQUESTS ?? 120)
    },
    datasetStorage: loadDatasetStorageConfig(env)
  };
}

/**
 * Mirrors the CLI's driver selection (see `.env.example`). An unrecognized driver throws at
 * startup rather than silently falling back to local — a deployment that means to read R2 but
 * quietly serves an empty local directory is worse than one that refuses to boot.
 */
function loadDatasetStorageConfig(env: NodeJS.ProcessEnv): DatasetStorageConfig {
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
