import type { AdminKey, AdminUsageBucket } from "@exiledata/types";
import type { Db } from "../db.js";

/** What request handling needs to know about a valid, unrevoked key. */
export interface ActiveKey {
  id: string;
  clientId: string;
  rateLimitPerMinute: number;
}

export interface UsageEntry {
  keyId: string;
  /** Start of the hour, ISO. */
  hour: string;
  requests: number;
  errors: number;
  lastUsedAt: string;
}

interface KeyRow {
  id: string;
  client_id: string;
  client_name: string;
  key_prefix: string;
  rate_limit_per_minute: number;
  created_at: Date | string;
  revoked_at: Date | string | null;
  last_used_at: Date | string | null;
  requests_24h: number;
  requests_7d: number;
}

const HOUR_MS = 3_600_000;

/** All SQL for API keys and their usage. Callers never see a row shape. */
export class KeyStore {
  constructor(
    private readonly db: Db,
    private readonly now: () => Date = () => new Date()
  ) {}

  async findActiveByHash(hash: string): Promise<ActiveKey | undefined> {
    const { rows } = await this.db.query<{
      id: string;
      client_id: string;
      rate_limit_per_minute: number;
    }>(
      `SELECT id, client_id, rate_limit_per_minute
         FROM api_keys
        WHERE key_hash = $1 AND revoked_at IS NULL`,
      [hash]
    );
    const row = rows[0];
    return row
      ? { id: row.id, clientId: row.client_id, rateLimitPerMinute: row.rate_limit_per_minute }
      : undefined;
  }

  /** Issues a key for the named client, creating the client on first use. */
  async createKey(input: {
    client: string;
    hash: string;
    prefix: string;
    rateLimitPerMinute: number;
  }): Promise<AdminKey> {
    const { rows } = await this.db.query<{ id: string }>(
      `WITH client AS (
         INSERT INTO api_clients (name) VALUES ($1)
         ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
         RETURNING id
       )
       INSERT INTO api_keys (client_id, key_hash, key_prefix, rate_limit_per_minute)
       SELECT id, $2, $3, $4 FROM client
       RETURNING id`,
      [input.client, input.hash, input.prefix, input.rateLimitPerMinute]
    );
    return (await this.getKey(rows[0]!.id))!;
  }

  async listKeys(): Promise<AdminKey[]> {
    return this.selectKeys(null);
  }

  async getKey(id: string): Promise<AdminKey | undefined> {
    return (await this.selectKeys(id))[0];
  }

  async updateRateLimit(id: string, rateLimitPerMinute: number): Promise<AdminKey | undefined> {
    const { rows } = await this.db.query(
      "UPDATE api_keys SET rate_limit_per_minute = $2 WHERE id = $1 RETURNING id",
      [id, rateLimitPerMinute]
    );
    return rows.length ? this.getKey(id) : undefined;
  }

  /** Idempotent: revoking a revoked key keeps its original revocation time. */
  async revoke(id: string): Promise<AdminKey | undefined> {
    const { rows } = await this.db.query(
      "UPDATE api_keys SET revoked_at = COALESCE(revoked_at, now()) WHERE id = $1 RETURNING id",
      [id]
    );
    return rows.length ? this.getKey(id) : undefined;
  }

  /** Adds counts to the hourly rollups and advances each key's `last_used_at`. */
  async recordUsage(entries: UsageEntry[]): Promise<void> {
    if (entries.length === 0) return;

    await this.db.query(
      `INSERT INTO api_key_usage_hourly (api_key_id, hour, requests, errors)
       SELECT * FROM unnest($1::uuid[], $2::timestamptz[], $3::int[], $4::int[])
       ON CONFLICT (api_key_id, hour) DO UPDATE
          SET requests = api_key_usage_hourly.requests + EXCLUDED.requests,
              errors = api_key_usage_hourly.errors + EXCLUDED.errors`,
      [
        entries.map((e) => e.keyId),
        entries.map((e) => e.hour),
        entries.map((e) => e.requests),
        entries.map((e) => e.errors)
      ]
    );

    // Grouped because UPDATE ... FROM applies an arbitrary row when several match one key.
    await this.db.query(
      `UPDATE api_keys AS k
          SET last_used_at = v.last_used
         FROM (SELECT id, max(last_used) AS last_used
                 FROM unnest($1::uuid[], $2::timestamptz[]) AS t (id, last_used)
                GROUP BY id) AS v
        WHERE k.id = v.id AND (k.last_used_at IS NULL OR k.last_used_at < v.last_used)`,
      [entries.map((e) => e.keyId), entries.map((e) => e.lastUsedAt)]
    );
  }

  async usage(from: Date, to: Date): Promise<AdminUsageBucket[]> {
    const { rows } = await this.db.query<{
      api_key_id: string;
      hour: Date | string;
      requests: number;
      errors: number;
    }>(
      `SELECT api_key_id, hour, requests, errors
         FROM api_key_usage_hourly
        WHERE hour >= $1 AND hour < $2
        ORDER BY hour, api_key_id`,
      [from.toISOString(), to.toISOString()]
    );
    return rows.map((row) => ({
      hour: iso(row.hour),
      keyId: row.api_key_id,
      requests: row.requests,
      errors: row.errors
    }));
  }

  async ping(): Promise<void> {
    await this.db.query("SELECT 1");
  }

  private async selectKeys(id: string | null): Promise<AdminKey[]> {
    const currentHour = floorToHour(this.now()).getTime();
    const since24h = new Date(currentHour - 23 * HOUR_MS).toISOString();
    const since7d = new Date(currentHour - 167 * HOUR_MS).toISOString();

    const { rows } = await this.db.query<KeyRow>(
      `SELECT k.id, k.client_id, c.name AS client_name, k.key_prefix, k.rate_limit_per_minute,
              k.created_at, k.revoked_at, k.last_used_at,
              COALESCE(SUM(u.requests) FILTER (WHERE u.hour >= $1::timestamptz), 0)::int
                AS requests_24h,
              COALESCE(SUM(u.requests), 0)::int AS requests_7d
         FROM api_keys k
         JOIN api_clients c ON c.id = k.client_id
         LEFT JOIN api_key_usage_hourly u ON u.api_key_id = k.id AND u.hour >= $2::timestamptz
        WHERE $3::uuid IS NULL OR k.id = $3::uuid
        GROUP BY k.id, c.name
        ORDER BY c.name, k.created_at`,
      [since24h, since7d, id]
    );

    return rows.map((row) => ({
      id: row.id,
      clientId: row.client_id,
      clientName: row.client_name,
      prefix: row.key_prefix,
      rateLimitPerMinute: row.rate_limit_per_minute,
      createdAt: iso(row.created_at),
      revokedAt: row.revoked_at === null ? null : iso(row.revoked_at),
      lastUsedAt: row.last_used_at === null ? null : iso(row.last_used_at),
      requests24h: row.requests_24h,
      requests7d: row.requests_7d
    }));
  }
}

export function floorToHour(date: Date): Date {
  return new Date(Math.floor(date.getTime() / HOUR_MS) * HOUR_MS);
}

function iso(value: Date | string): string {
  return new Date(value).toISOString();
}
