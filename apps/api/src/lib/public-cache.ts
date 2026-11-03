/** Bounded public cache with optional stale reads while one refresh runs. */
export function publicCache<A extends unknown[], T>(
  load: (...args: A) => Promise<T>,
  _key: string[],
  options: { revalidate: number; staleWhileRevalidate?: number },
): (...args: A) => Promise<T> {
  type Entry = {
    expires: number;
    staleUntil: number;
    value: Promise<T>;
    refreshing?: Promise<T>;
  };
  const entries = new Map<string, Entry>();
  const ttlMs = options.revalidate * 1_000;
  const staleMs = Math.max(0, options.staleWhileRevalidate ?? 0) * 1_000;
  return (...args) => {
    const key = JSON.stringify(args);
    const existing = entries.get(key);
    if (existing && existing.expires > Date.now()) return existing.value;
    if (existing && existing.staleUntil > Date.now()) {
      if (!existing.refreshing) {
        const refresh = load(...args).then(
          (result) => {
            if (entries.get(key) === existing) {
              const expires = Date.now() + ttlMs;
              entries.set(key, {
                expires,
                staleUntil: expires + staleMs,
                value: Promise.resolve(result),
              });
            }
            return result;
          },
          (error) => {
            existing.refreshing = undefined;
            throw error;
          },
        );
        existing.refreshing = refresh;
        // A background failure must not become an unhandled rejection or
        // discard the last successful value before its stale budget expires.
        void refresh.catch(() => undefined);
      }
      return existing.value;
    }
    if (existing?.refreshing) return existing.refreshing;
    if (entries.size >= 256) entries.delete(entries.keys().next().value!);
    const value = load(...args).then(
      (result) => {
        entry.expires = Date.now() + ttlMs;
        entry.staleUntil = entry.expires + staleMs;
        return result;
      },
      (error) => {
        if (entries.get(key) === entry) entries.delete(key);
        throw error;
      },
    );
    const entry: Entry = {
      expires: Date.now() + ttlMs,
      // A pending cold load is never treated as a successful stale value.
      staleUntil: 0,
      value,
    };
    entries.set(key, entry);
    return value;
  };
}
