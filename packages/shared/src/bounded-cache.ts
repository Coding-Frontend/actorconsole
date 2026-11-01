/** A process cache with hard cardinality/weight limits and active TTL expiry. */
export class BoundedTtlCache<T> {
  private entries = new Map<string, { value: T; expiresAt: number; weight: number }>();
  private weight = 0;
  constructor(
    private maxEntries: number,
    private maxWeight = Infinity,
    private weigh: (value: T) => number = () => 1,
  ) {
    const timer = setInterval(() => this.sweep(), 30_000);
    timer.unref();
  }
  private remove(key: string) {
    const entry = this.entries.get(key);
    if (entry) this.weight -= entry.weight;
    this.entries.delete(key);
  }
  sweep() {
    const now = Date.now();
    for (const [key, entry] of this.entries) if (entry.expiresAt <= now) this.remove(key);
  }
  get(key: string): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
      this.remove(key);
      return undefined;
    }
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }
  set(key: string, value: T, ttlMs: number) {
    this.remove(key);
    this.sweep();
    const weight = this.weigh(value);
    if (!Number.isFinite(weight) || weight > this.maxWeight || ttlMs <= 0) return;
    while (this.entries.size >= this.maxEntries || this.weight + weight > this.maxWeight) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) return;
      this.remove(oldest);
    }
    this.entries.set(key, { value, weight, expiresAt: Date.now() + ttlMs });
    this.weight += weight;
  }
  clear() {
    this.entries.clear();
    this.weight = 0;
  }
  get size() {
    return this.entries.size;
  }
}
