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
});
