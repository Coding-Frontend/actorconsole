import { afterEach, expect, it, vi } from "vitest";
import { fetchRead } from "./read-request";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
it("recovers transient HTTP and network read failures within three attempts", async () => {
  vi.useFakeTimers();
  const request = vi
    .fn()
    .mockRejectedValueOnce(new TypeError("network"))
    .mockResolvedValueOnce(new Response(null, { status: 503 }))
    .mockResolvedValueOnce(Response.json({ ok: true }));
  vi.stubGlobal("fetch", request);
  const result = fetchRead("https://example.test", { credentials: "include" });
  await vi.runAllTimersAsync();
  expect((await result).status).toBe(200);
  expect(request).toHaveBeenCalledTimes(3);
  expect(request.mock.calls[2][1].credentials).toBe("include");
});
it.each([401, 403, 404])("does not retry HTTP %s", async (status) => {
  const request = vi.fn().mockResolvedValue(new Response(null, { status }));
  vi.stubGlobal("fetch", request);
  expect((await fetchRead("https://example.test")).status).toBe(status);
  expect(request).toHaveBeenCalledTimes(1);
});
it("never replays a mutation", async () => {
  const request = vi.fn().mockResolvedValue(new Response(null, { status: 503 }));
  vi.stubGlobal("fetch", request);
  await fetchRead("https://example.test", { method: "POST", body: "schedule" });
  expect(request).toHaveBeenCalledTimes(1);
});
it("respects a long server rate limit and caller cancellation", async () => {
  const request = vi
    .fn()
    .mockResolvedValue(new Response(null, { status: 429, headers: { "Retry-After": "60" } }));
  vi.stubGlobal("fetch", request);
  expect((await fetchRead("https://example.test")).status).toBe(429);
  expect(request).toHaveBeenCalledTimes(1);
  const controller = new AbortController();
  request.mockRejectedValue(new TypeError("network"));
  const result = fetchRead("https://example.test", { signal: controller.signal });
  controller.abort(new Error("cancelled"));
  await expect(result).rejects.toThrow("network");
  expect(request).toHaveBeenCalledTimes(2);
});
