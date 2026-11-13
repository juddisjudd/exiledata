import type { ActiveKey, KeyStore } from "./key-store.js";
import { hashApiKey, looksLikeApiKey } from "./keys.js";

const MAX_CACHED = 10_000;

/** Caches hits and misses for a short TTL; changes made outside this process apply within it. */
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
