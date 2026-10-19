/**
 * Límite por "cubeta de fichas": cada clave tiene una capacidad y se
 * recarga a ritmo constante. Permite ráfagas cortas y frena el abuso sostenido.
 */
export class RateLimiter {
  private readonly buckets = new Map<string, { tokens: number; updatedAt: number }>();

  constructor(
    private readonly capacity: number,
    private readonly refillPerMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  static perSecond(rate: number, burst: number, now?: () => number): RateLimiter {
    return new RateLimiter(burst, rate / 1000, now);
  }

  static perMinute(rate: number, burst: number, now?: () => number): RateLimiter {
    return new RateLimiter(burst, rate / 60_000, now);
  }

  /** true si se permite la acción (y consume una ficha). */
  take(key: string): boolean {
    const now = this.now();
    const bucket = this.buckets.get(key) ?? { tokens: this.capacity, updatedAt: now };
    bucket.tokens = Math.min(this.capacity, bucket.tokens + (now - bucket.updatedAt) * this.refillPerMs);
    bucket.updatedAt = now;
    const allowed = bucket.tokens >= 1;
    if (allowed) bucket.tokens -= 1;
    this.buckets.set(key, bucket);
    return allowed;
  }

  forget(key: string): void {
    this.buckets.delete(key);
  }

  /** Borra cubetas llenas para que el mapa no crezca sin límite. */
  prune(): void {
    const now = this.now();
    for (const [key, bucket] of this.buckets) {
      if (bucket.tokens + (now - bucket.updatedAt) * this.refillPerMs >= this.capacity) this.buckets.delete(key);
    }
  }
}
