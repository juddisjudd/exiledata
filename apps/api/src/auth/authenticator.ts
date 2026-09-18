import type { ActiveKey, KeyStore } from "./key-store.js";
import { hashApiKey, looksLikeApiKey } from "./keys.js";

const MAX_CACHED = 10_000;

/**
 * Resolves a presented API key to an active key record, caching the answer briefly so a busy
 * client costs one database lookup per TTL rather than one per request. Misses are cached too,
 * so repeated bad keys do not reach the database either.
 *
 * Admin changes made through this process call `invalidate()` and apply at once. A change made
 * some other way (e.g. SQL by hand) applies within the TTL.
 */
export class Authenticator {
  private readonly cache = new Map<string, { key: ActiveKey | null; expires: number }>();

  constructor(
    private readonly store: KeyStore,
    private readonly secret: string,
    private readonly ttlMs = 30_000,
    private readonly now: () => number = Date.now
  ) {}

  async authenticate(presented: string): Promise<ActiveKey | null> {
    if (!looksLikeApiKey(presented)) return null;

    const hash = hashApiKey(this.secret, presented);
    const hit = this.cache.get(hash);
    if (hit && hit.expires > this.now()) return hit.key;

    const key = (await this.store.findActiveByHash(hash)) ?? null;
    if (this.cache.size >= MAX_CACHED) this.cache.clear();
    this.cache.set(hash, { key, expires: this.now() + this.ttlMs });
    return key;
  }

  invalidate(): void {
    this.cache.clear();
  }
}
