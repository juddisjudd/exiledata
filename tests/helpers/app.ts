import path from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../../packages/cli/src/migrate.js";
import { loadConfig, type AppConfig } from "../../apps/api/src/config.js";
import { KeyStore } from "../../apps/api/src/auth/key-store.js";
import { displayPrefix, generateApiKey, hashApiKey } from "../../apps/api/src/auth/keys.js";

export const MIGRATIONS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../migrations"
);
export const TEST_SECRET = "test-api-key-secret";
export const TEST_ADMIN_TOKEN = "test-admin-token-0123456789abcdefghij";

export function migrationDb(db: PGlite) {
  return {
    exec: async (sql: string) => {
      await db.exec(sql);
    },
    query: <T>(text: string, params?: unknown[]) => db.query<T>(text, params)
  };
}

/** A fresh in-process Postgres with every migration applied. */
export async function createTestDb(): Promise<PGlite> {
  const db = new PGlite();
  await migrate(migrationDb(db), MIGRATIONS_DIR);
  return db;
}

export function testConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    ...loadConfig({}),
    apiKeySecret: TEST_SECRET,
    adminToken: TEST_ADMIN_TOKEN,
    ...overrides
  };
}

/** Inserts a key straight through the store and returns its plaintext. */
export async function issueKey(
  db: PGlite,
  options: { client?: string; rateLimitPerMinute?: number } = {}
): Promise<{ secret: string; id: string }> {
  const secret = generateApiKey();
  const key = await new KeyStore(db).createKey({
    client: options.client ?? "test-client",
    hash: hashApiKey(TEST_SECRET, secret),
    prefix: displayPrefix(secret),
    rateLimitPerMinute: options.rateLimitPerMinute ?? 1000
  });
  return { secret, id: key.id };
}
