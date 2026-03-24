/**
 * Sliding-window rate limiter.
 *
 * Tracks request timestamps in memory. On each call to `consume()`:
 *  - Evicts timestamps older than `windowMs`.
 *  - If the remaining count is below `maxRequests`, records the timestamp and returns true.
 *  - Otherwise returns false and sets `retryAfterMs` to how long the caller must wait.
 *
 * Resets on page reload (intentional — this is a UX safeguard, not a security boundary).
 * For hard server-side enforcement, requests should go through a backend proxy.
 */
export class RateLimiter {
  private readonly timestamps: number[] = [];

  constructor(
    /** Maximum number of requests allowed within the window. */
    private readonly maxRequests: number,
    /** Duration of the sliding window in milliseconds. */
    private readonly windowMs: number,
  ) {}

  /**
   * Attempts to consume one request slot.
   * @returns `{ allowed: true }` or `{ allowed: false, retryAfterMs: number }`.
   */
  consume(): { allowed: true } | { allowed: false; retryAfterMs: number } {
    const now = Date.now();

    // Evict timestamps outside the current window.
    while (this.timestamps.length > 0 && this.timestamps[0] <= now - this.windowMs) {
      this.timestamps.shift();
    }

    if (this.timestamps.length < this.maxRequests) {
      this.timestamps.push(now);
      return { allowed: true };
    }

    // Oldest timestamp tells us when the next slot opens.
    const retryAfterMs = this.timestamps[0] + this.windowMs - now;
    return { allowed: false, retryAfterMs };
  }

  /** Remaining request slots in the current window. */
  get remaining(): number {
    const now = Date.now();
    const active = this.timestamps.filter((t) => t > now - this.windowMs);
    return Math.max(0, this.maxRequests - active.length);
  }
}
