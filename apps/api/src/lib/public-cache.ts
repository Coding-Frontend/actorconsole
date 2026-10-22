/** Bounded, process-local cache for public catalog queries. Failed requests are never cached. */
export function publicCache<A extends unknown[], T>(
  load: (...args: A) => Promise<T>, _key: string[], options: { revalidate: number },
): (...args: A) => Promise<T> {
  const entries = new Map<string, { expires: number; value: Promise<T> }>();
  return (...args) => {
    const key = JSON.stringify(args);
    const existing = entries.get(key);
    if (existing && existing.expires > Date.now()) return existing.value;
    if (entries.size >= 256) entries.delete(entries.keys().next().value!);
    const value = load(...args).catch((error) => { entries.delete(key); throw error; });
    entries.set(key, { expires: Date.now() + options.revalidate * 1000, value });
    return value;
  };
}
