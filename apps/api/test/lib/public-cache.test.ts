import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { publicCache } from "../../src/lib/public-cache.js";

describe("publicCache", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-26T00:00:00Z"));
  });

  afterEach(() => vi.useRealTimers());

  it("coalesces in-flight reads and reuses successful values for the same arguments", async () => {
    let resolve!: (value: string) => void;
    const load = vi.fn(() => new Promise<string>((done) => { resolve = done; }));
    const cached = publicCache(load, ["fixture"], { revalidate: 1 });

    const first = cached();
    expect(cached()).toBe(first);
    resolve("value");
    expect(await first).toBe("value");
    expect(await cached()).toBe("value");
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("keeps argument keys separate and reloads after TTL expiry", async () => {
    const load = vi.fn(async (key: string) => key);
    const cached = publicCache(load, ["fixture"], { revalidate: 1 });

    expect(await cached("a")).toBe("a");
    expect(await cached("b")).toBe("b");
    expect(await cached("a")).toBe("a");
    expect(load).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(1000);
    expect(await cached("a")).toBe("a");
    expect(load).toHaveBeenCalledTimes(3);
  });

  it("propagates a failed load and allows a retry", async () => {
    const error = new Error("fixture load failed");
    const load = vi.fn().mockRejectedValueOnce(error).mockResolvedValueOnce("retry");
    const cached = publicCache(load, ["fixture"], { revalidate: 1 });

    await expect(cached()).rejects.toBe(error);
    expect(await cached()).toBe("retry");
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("retains a successful replacement when the expired original load fails", async () => {
    let rejectFirst!: (reason: Error) => void;
    const load = vi.fn()
      .mockImplementationOnce(() => new Promise<string>((_resolve, reject) => { rejectFirst = reject; }))
      .mockResolvedValue("fresh");
    const cached = publicCache(load, ["fixture"], { revalidate: 1 });

    const original = cached("key");
    const rejected = expect(original).rejects.toThrow("old load failed");
    vi.advanceTimersByTime(1000);
    expect(await cached("key")).toBe("fresh");
    rejectFirst(new Error("old load failed"));
    await rejected;

    expect(await cached("key")).toBe("fresh");
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("retains a pending replacement when the expired original load fails", async () => {
    let rejectFirst!: (reason: Error) => void;
    let resolveSecond!: (value: string) => void;
    const load = vi.fn()
      .mockImplementationOnce(() => new Promise<string>((_resolve, reject) => { rejectFirst = reject; }))
      .mockImplementationOnce(() => new Promise<string>((resolve) => { resolveSecond = resolve; }))
      .mockResolvedValue("unexpected reload");
    const cached = publicCache(load, ["fixture"], { revalidate: 1 });

    const original = cached("key");
    const rejected = expect(original).rejects.toThrow("old load failed");
    vi.advanceTimersByTime(1000);
    const replacement = cached("key");
    rejectFirst(new Error("old load failed"));
    await rejected;

    expect(cached("key")).toBe(replacement);
    expect(load).toHaveBeenCalledTimes(2);
    resolveSecond("fresh");
    expect(await replacement).toBe("fresh");
  });

  it("evicts the oldest key when the existing 256-entry capacity is reached", async () => {
    const load = vi.fn(async (key: number) => key);
    const cached = publicCache(load, ["fixture"], { revalidate: 1 });

    for (let key = 0; key < 257; key++) await cached(key);
    expect(await cached(1)).toBe(1);
    expect(load).toHaveBeenCalledTimes(257);
    expect(await cached(0)).toBe(0);
    expect(load).toHaveBeenCalledTimes(258);
  });

  it("serves successful stale data immediately while one refresh is pending", async () => {
    let resolveRefresh!: (value: string) => void;
    const refreshed = new Promise<string>((resolve) => { resolveRefresh = resolve; });
    const load = vi.fn().mockResolvedValueOnce("saved").mockReturnValueOnce(refreshed);
    const cached = publicCache(load, ["fixture"], { revalidate: 1, staleWhileRevalidate: 2 });
    const original = cached("key");
    await original;

    vi.advanceTimersByTime(1_000);
    expect(cached("key")).toBe(original);
    expect(await cached("key")).toBe("saved");
    expect(load).toHaveBeenCalledTimes(2);

    resolveRefresh("updated");
    await refreshed;
    expect(await cached("key")).toBe("updated");
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("waits for the existing refresh after the maximum stale age", async () => {
    let resolveRefresh!: (value: string) => void;
    const refreshed = new Promise<string>((resolve) => { resolveRefresh = resolve; });
    const load = vi.fn().mockResolvedValueOnce("saved").mockReturnValueOnce(refreshed);
    const cached = publicCache(load, ["fixture"], { revalidate: 1, staleWhileRevalidate: 2 });
    const original = cached();
    await original;
    vi.advanceTimersByTime(1_000);
    expect(cached()).toBe(original);

    vi.advanceTimersByTime(2_000);
    const waiting = cached();
    expect(waiting).not.toBe(original);
    expect(cached()).toBe(waiting);
    expect(load).toHaveBeenCalledTimes(2);
    resolveRefresh("updated");
    expect(await waiting).toBe("updated");
  });

  it("retains the successful value after a failed background refresh and retries", async () => {
    const load = vi.fn()
      .mockResolvedValueOnce("saved")
      .mockRejectedValueOnce(new Error("Refresh unavailable"))
      .mockResolvedValue("updated");
    const cached = publicCache(load, ["fixture"], { revalidate: 1, staleWhileRevalidate: 2 });
    await cached();
    vi.advanceTimersByTime(1_000);

    expect(await cached()).toBe("saved");
    expect(await cached()).toBe("saved");
    expect(await cached()).toBe("updated");
    expect(load).toHaveBeenCalledTimes(3);
  });

  it("propagates a refresh failure to callers waiting beyond the stale budget", async () => {
    let rejectRefresh!: (error: Error) => void;
    const refreshed = new Promise<string>((_resolve, reject) => { rejectRefresh = reject; });
    const load = vi.fn().mockResolvedValueOnce("saved").mockReturnValueOnce(refreshed);
    const cached = publicCache(load, ["fixture"], { revalidate: 1, staleWhileRevalidate: 2 });
    await cached();
    vi.advanceTimersByTime(1_000);
    expect(await cached()).toBe("saved");
    vi.advanceTimersByTime(2_000);
    const waiting = expect(cached()).rejects.toThrow("Refresh unavailable");
    rejectRefresh(new Error("Refresh unavailable"));
    await waiting;
  });

  it("starts the fresh TTL when a slow initial load completes", async () => {
    let resolve!: (value: string) => void;
    const load = vi.fn().mockImplementationOnce(() => new Promise<string>((done) => { resolve = done; }))
      .mockResolvedValue("updated");
    const cached = publicCache(load, ["fixture"], { revalidate: 1 });
    const first = cached();
    vi.advanceTimersByTime(900);
    resolve("saved");
    await first;
    vi.advanceTimersByTime(999);
    expect(await cached()).toBe("saved");
    expect(load).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(await cached()).toBe("updated");
  });
});
