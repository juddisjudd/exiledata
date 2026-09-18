import { datasetStorageConfigFromEnv, type DatasetStorageConfig } from "@exiledata/storage";

/**
 * Centralized environment configuration. Reads process.env once so the rest of the app doesn't
 * scatter `process.env.X` access (and so missing/invalid config fails fast at startup).
 */
export interface AppConfig {
  nodeEnv: string;
  port: number;
  databaseUrl?: string;
  /** HMAC key for API key hashes. Changing it invalidates every issued key. */
  apiKeySecret?: string;
  /** Bearer token for `/admin/api/*`. Admin routes answer 503 while it is unset. */
  adminToken?: string;
  /** Limit given to a new key when the admin does not choose one. */
  defaultRateLimitPerMinute: number;
  datasetStorage: DatasetStorageConfig;
}

const MIN_ADMIN_TOKEN_LENGTH = 32;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const adminToken = env.ADMIN_TOKEN?.trim() || undefined;
  if (adminToken && adminToken.length < MIN_ADMIN_TOKEN_LENGTH) {
    throw new Error(`ADMIN_TOKEN must be at least ${MIN_ADMIN_TOKEN_LENGTH} characters`);
  }

  const defaultRateLimitPerMinute = Number(env.DEFAULT_RATE_LIMIT_PER_MINUTE ?? 120);
  if (!Number.isInteger(defaultRateLimitPerMinute) || defaultRateLimitPerMinute <= 0) {
    throw new Error("DEFAULT_RATE_LIMIT_PER_MINUTE must be a positive integer");
  }

  return {
    nodeEnv: env.NODE_ENV ?? "development",
    port: Number(env.API_PORT ?? 3000),
    databaseUrl: env.DATABASE_URL,
    apiKeySecret: env.API_KEY_SECRET,
    adminToken,
    defaultRateLimitPerMinute,
    datasetStorage: datasetStorageConfigFromEnv(env)
  };
}
