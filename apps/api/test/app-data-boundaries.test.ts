import { beforeEach, describe, expect, it, vi } from "vitest";

const { counter, duration } = vi.hoisted(() => ({ counter: vi.fn(), duration: vi.fn() }));
vi.mock("@actorconsole/shared", async (importOriginal) => ({
  ...await importOriginal<typeof import("@actorconsole/shared")>(),
  incrementMetric: counter,
  observeMetric: duration,
}));
vi.mock("@actorconsole/db", async (importOriginal) => ({
  ...await importOriginal<typeof import("@actorconsole/db")>(),
  db: { websiteLogo: { findUnique: vi.fn().mockResolvedValue(null) } },
}));
vi.mock("../src/lib/queue.js", () => ({ getRedis: () => null, enqueue: vi.fn(), getQueuedJob: vi.fn() }));
import { app } from "../src/app.js";

describe("API data boundaries", () => {
  beforeEach(() => vi.clearAllMocks());
  it("uses one unmatched path label for arbitrary 404s", async () => {
    for (const name of ["a", "b", "c", "d"]) expect((await app.request(`/unknown-${name}`)).status).toBe(404);
    const paths = counter.mock.calls.map(([, labels]) => labels.path);
    expect(paths).toEqual(Array(4).fill("unmatched"));
  });
  it("uses a registered pattern rather than a dynamic asset ID", async () => {
    await app.request("/website-logo-assets/alice");
    await app.request("/website-logo-assets/bob");
    expect(counter.mock.calls.map(([, labels]) => labels.path)).toEqual(Array(2).fill("/website-logo-assets/:logoId"));
    expect(duration.mock.calls.map(([, , labels]) => labels.path)).toEqual(Array(2).fill("/website-logo-assets/:logoId"));
  });
  it("bounds the method label for arbitrary extension methods", async () => {
    await app.request("/unknown", { method: "CUSTOM_ONE" });
    await app.request("/unknown", { method: "CUSTOM_TWO" });
    expect(counter.mock.calls.map(([, labels]) => labels.method)).toEqual(["OTHER", "OTHER"]);
  });
  it("rejects a streamed Resend body at its smaller cap before downstream lookups", async () => {
    const cancel = vi.fn();
    let reads = 0;
    const request = new Request("http://localhost/webhooks/resend", {
      method: "POST", body: new ReadableStream({
        pull(controller) { reads += 1; controller.enqueue(new Uint8Array(600_000)); if (reads > 10) controller.close(); },
        cancel,
      }), duplex: "half",
    } as RequestInit);
    expect((await app.request(request)).status).toBe(413);
    expect(cancel).toHaveBeenCalledOnce();
    expect(reads).toBeLessThan(5);
  });
});
