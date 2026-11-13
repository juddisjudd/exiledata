import { floorToHour, type KeyStore, type UsageEntry } from "./key-store.js";

/** Unflushed counts are lost on a hard kill; SIGTERM flushes them. */
export class UsageRecorder {
  private pending = new Map<string, UsageEntry>();
  private timer: NodeJS.Timeout | undefined;

  constructor(
    private readonly store: KeyStore,
    private readonly onError: (error: unknown) => void = () => {}
  ) {}

  record(keyId: string, statusCode: number, now = new Date()): void {
    const hour = floorToHour(now).toISOString();
    this.add({
      keyId,
      hour,
      requests: 1,
      errors: statusCode >= 400 ? 1 : 0,
      lastUsedAt: now.toISOString()
    });
  }

  async flush(): Promise<void> {
    if (this.pending.size === 0) return;

    const entries = [...this.pending.values()];
    this.pending = new Map();
    try {
      await this.store.recordUsage(entries);
    } catch (error) {
      for (const entry of entries) this.add(entry);
      throw error;
    }
  }

  start(intervalMs = 10_000): void {
    this.timer = setInterval(() => this.flush().catch(this.onError), intervalMs);
    this.timer.unref();
  }

  async stop(): Promise<void> {
    clearInterval(this.timer);
    await this.flush();
  }

  private add(entry: UsageEntry): void {
    const id = `${entry.keyId}|${entry.hour}`;
    const existing = this.pending.get(id);
    if (!existing) {
      this.pending.set(id, { ...entry });
      return;
    }
    existing.requests += entry.requests;
    existing.errors += entry.errors;
    if (entry.lastUsedAt > existing.lastUsedAt) existing.lastUsedAt = entry.lastUsedAt;
  }
}
