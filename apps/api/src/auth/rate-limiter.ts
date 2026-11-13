export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  /** Milliseconds until the current window ends. */
  resetMs: number;
}

const WINDOW_MS = 60_000;
const MAX_TRACKED = 10_000;

/** In-memory one-minute windows: correct only while the API runs as a single process. */
export class RateLimiter {
  private readonly windows = new Map<string, { start: number; count: number }>();

  take(keyId: string, limitPerMinute: number, now = Date.now()): RateLimitResult {
    const start = now - (now % WINDOW_MS);
    const resetMs = start + WINDOW_MS - now;

    let window = this.windows.get(keyId);
    if (!window || window.start !== start) {
      if (this.windows.size >= MAX_TRACKED) this.prune(start);
      window = { start, count: 0 };
      this.windows.set(keyId, window);
    }

    if (window.count >= limitPerMinute) return { allowed: false, remaining: 0, resetMs };

    window.count++;
    return { allowed: true, remaining: limitPerMinute - window.count, resetMs };
  }

  private prune(currentStart: number): void {
    for (const [keyId, window] of this.windows) {
      if (window.start !== currentStart) this.windows.delete(keyId);
    }
  }
}
