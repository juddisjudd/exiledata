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
    }
  };
}
