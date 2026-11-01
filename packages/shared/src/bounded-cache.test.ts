import { afterEach, expect, it, vi } from "vitest";
import { BoundedTtlCache } from "./bounded-cache.js";
afterEach(() => vi.useRealTimers());
it("evicts the least recently used entries at the hard entry and byte caps", () => {
  const cache = new BoundedTtlCache<string>(2, 5, (value) => value.length);
  cache.set("a", "aa", 1000);
  cache.set("b", "bb", 1000);
  expect(cache.get("a")).toBe("aa");
  cache.set("c", "cc", 1000);
  expect(cache.size).toBe(2);
  expect(cache.get("b")).toBeUndefined();
  cache.set("d", "dddd", 1000);
  expect(cache.size).toBe(1);
  expect(cache.get("a")).toBeUndefined();
  cache.set("too-big", "123456", 1000);
  expect(cache.size).toBe(1);
});
it("expires unique keys without their ever being queried again", () => {
  vi.useFakeTimers();
  const cache = new BoundedTtlCache<string>(10);
  cache.set("never-revisited", "value", 1000);
  vi.advanceTimersByTime(30_000);
  expect(cache.size).toBe(0);
});
