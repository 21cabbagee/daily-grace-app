// Fixed-window in-memory rate limiter. Adequate for a single server instance;
// swap for Redis/Upstash before running more than one instance.
export class RateLimiter {
  private hits = new Map<string, { count: number; resetAt: number }>();

  constructor(private now: () => number = Date.now) {}

  /** Returns true when the action is allowed and records it. */
  take(key: string, limit: number, windowMs: number): boolean {
    const t = this.now();
    const entry = this.hits.get(key);
    if (!entry || entry.resetAt <= t) {
      this.hits.set(key, { count: 1, resetAt: t + windowMs });
      if (this.hits.size > 10_000) this.sweep(t);
      return true;
    }
    if (entry.count >= limit) return false;
    entry.count += 1;
    return true;
  }

  private sweep(t: number) {
    for (const [k, v] of this.hits) if (v.resetAt <= t) this.hits.delete(k);
  }
}
