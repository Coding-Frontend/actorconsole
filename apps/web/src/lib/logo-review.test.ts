import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  logoReviewTiming,
  runLogoReviewBatch,
  selectAllLogoReviews,
  type LogoReviewFilters,
} from "./logo-review";

const items = [1, 2, 3].map((id) => ({
  id: `r${id}`,
  actor: { id: `a${id}`, title: `Actor ${id}`, actorName: `actor-${id}` },
}));
const filters: LogoReviewFilters = {
  status: "PENDING",
  query: "maps",
  websiteId: "website-1",
  thumbnail: "missing",
};
const response = (data: unknown) => new Response(JSON.stringify({ ok: true, data }));
afterEach(() => vi.unstubAllGlobals());

describe("bulk logo review requests", () => {
  it("selects every matching cursor page, deduplicates IDs and pins the workspace", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        response({ items: items.slice(0, 2), nextCursor: "r2", workspaceId: "workspace-1" }),
      )
      .mockResolvedValueOnce(
        response({ items: items.slice(1), nextCursor: null, workspaceId: "workspace-1" }),
      );
    vi.stubGlobal("fetch", fetch);
    expect(
      await selectAllLogoReviews(filters, "workspace-1", new AbortController().signal),
    ).toEqual(items);
    for (const [url, init] of fetch.mock.calls) {
      expect(String(url)).toContain("q=maps");
      expect(String(url)).toContain("websiteId=website-1");
      expect(String(url)).toContain("thumbnail=missing");
      expect(init.headers.get("x-business-profile-id")).toBe("workspace-1");
    }
    expect(fetch.mock.calls[1]?.[0]).toContain("after=r2");
  });

  it("rejects a selection returned for another workspace", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(response({ items, nextCursor: null, workspaceId: "other" })),
    );
    await expect(
      selectAllLogoReviews(filters, "workspace-1", new AbortController().signal),
    ).rejects.toThrow("workspace changed");
  });

  it("does not loop forever if the selection cursor does not advance", async () => {
    const fetch = vi
      .fn()
      .mockImplementation(async () =>
        response({ items, nextCursor: "r3", workspaceId: "workspace-1" }),
      );
    vi.stubGlobal("fetch", fetch);
    await expect(
      selectAllLogoReviews(filters, "workspace-1", new AbortController().signal),
    ).rejects.toThrow("finish selecting");
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  const batchView = (overrides: Record<string, unknown> = {}) => ({
    id: "b1",
    status: "COMPLETED",
    total: 2,
    stopRequested: false,
    error: null,
    workspaceId: "workspace-1",
    items: [
      { ...items[0]!, outcome: "applied", retryable: false },
      { ...items[1]!, outcome: "failed", message: "Apify rejected this Actor", retryable: true },
    ],
    ...overrides,
  });
  const run = (
    action: "apply" | "dismiss",
    extra: Partial<Parameters<typeof runLogoReviewBatch>[0]> = {},
  ) =>
    runLogoReviewBatch({
      action,
      items: items.slice(0, 2),
      workspaceId: "workspace-1",
      signal: new AbortController().signal,
      shouldStop: () => false,
      onProgress: vi.fn(),
      ...extra,
    });

  beforeEach(() => {
    logoReviewTiming.pollMs = 1;
  });

  it("starts one background batch for the selected IDs and follows it to the end", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        response(
          batchView({
            status: "RUNNING",
            items: [
              { ...items[0]!, outcome: "running", retryable: false },
              { ...items[1]!, outcome: "queued", retryable: false },
            ],
          }),
        ),
      )
      .mockResolvedValueOnce(response(batchView()));
    vi.stubGlobal("fetch", fetch);
    const onProgress = vi.fn();
    const results = await run("apply", { onProgress });

    expect(String(fetch.mock.calls[0]![0])).toMatch(/\/logo-recommendations\/batches$/);
    expect(fetch.mock.calls[0]![1]).toMatchObject({ method: "POST" });
    expect(JSON.parse(fetch.mock.calls[0]![1].body)).toEqual({ ids: ["r1", "r2"] });
    expect(String(fetch.mock.calls[1]![0])).toMatch(/\/batches\/b1$/);
    expect(onProgress).toHaveBeenNthCalledWith(1, items[0], [], 2);
    expect(results).toEqual([
      { ...items[0], outcome: "applied", retryable: false },
      { ...items[1], outcome: "failed", message: "Apify rejected this Actor", retryable: true },
    ]);
    expect(onProgress).toHaveBeenLastCalledWith(null, results, 2);
    expect(
      fetch.mock.calls.every(([, init]) => init.headers.get("x-business-profile-id") === "workspace-1"),
    ).toBe(true);
  });

  it("follows an existing batch without starting a new one", async () => {
    const fetch = vi.fn().mockResolvedValue(response(batchView()));
    vi.stubGlobal("fetch", fetch);
    await run("apply", { items: [], resumeBatchId: "b1" });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(String(fetch.mock.calls[0]![0])).toMatch(/\/batches\/b1$/);
    expect(fetch.mock.calls[0]![1].method).toBeUndefined();
  });

  it("keeps following the batch when one progress poll fails", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(response(batchView({ status: "RUNNING" })))
      .mockRejectedValueOnce(new TypeError("Network error"))
      .mockResolvedValueOnce(response(batchView()));
    vi.stubGlobal("fetch", fetch);
    const results = await run("apply");
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(results.map((item) => item.outcome)).toEqual(["applied", "failed"]);
  });

  it("asks the server to stop once and keeps what already finished", async () => {
    let stop = false;
    const fetch = vi.fn().mockImplementation(async (url: string) => {
      if (String(url).endsWith("/stop")) {
        return response(
          batchView({ status: "STOPPED", items: [{ ...items[0]!, outcome: "applied", retryable: false }] }),
        );
      }
      stop = true;
      return response(
        batchView({
          status: "RUNNING",
          items: [
            { ...items[0]!, outcome: "applied", retryable: false },
            { ...items[1]!, outcome: "queued", retryable: false },
          ],
        }),
      );
    });
    vi.stubGlobal("fetch", fetch);
    const results = await run("apply", { shouldStop: () => stop });
    expect(fetch.mock.calls.filter(([url]) => String(url).endsWith("/stop"))).toHaveLength(1);
    expect(results).toEqual([{ ...items[0], outcome: "applied", retryable: false }]);
  });

  it("stops following when the page goes away; the batch keeps running on the server", async () => {
    const controller = new AbortController();
    const fetch = vi.fn().mockImplementation(async () => {
      controller.abort();
      return response(batchView({ status: "RUNNING" }));
    });
    vi.stubGlobal("fetch", fetch);
    await run("apply", { signal: controller.signal });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each([
    [409, "apify_publishing_credentials_required", true],
    [409, "logo_recommendation_superseded", false],
    [403, "forbidden", true],
  ])("reports every selected Actor when the batch cannot start (HTTP %s %s)", async (status, code, retryable) => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: { code, message: "Check the connection" } }), {
          status: Number(status),
        }),
      ),
    );
    const results = await run("apply");
    expect(results).toHaveLength(2);
    expect(results.every((item) => item.outcome === "failed" && item.retryable === retryable)).toBe(true);
    expect(results[0]?.message).toBe("Check the connection");
  });

  it("does not automatically retry a start request whose outcome is unknown", async () => {
    const fetch = vi.fn().mockRejectedValue(new TypeError("Network error"));
    vi.stubGlobal("fetch", fetch);
    const results = await run("apply");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(results[0]).toMatchObject({
      outcome: "failed",
      retryable: false,
      message: expect.stringContaining("Refresh to check"),
    });
  });

  it("treats an unreadable success body as unknown rather than claiming success", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("interrupted JSON", { status: 200 })));
    const results = await run("apply");
    expect(results[0]).toMatchObject({ outcome: "failed", retryable: false });
  });

  it("dismisses the selected IDs in one request and reports ones that were no longer pending", async () => {
    const fetch = vi.fn().mockResolvedValue(response({ dismissed: ["r1"] }));
    vi.stubGlobal("fetch", fetch);
    const results = await run("dismiss");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(String(fetch.mock.calls[0]![0])).toMatch(/\/logo-recommendations\/dismiss$/);
    expect(JSON.parse(fetch.mock.calls[0]![1].body)).toEqual({ ids: ["r1", "r2"] });
    expect(results.map((item) => [item.id, item.outcome])).toEqual([
      ["r1", "dismissed"],
      ["r2", "failed"],
    ]);
  });

  it("stops dismissing after a failed request", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ error: { code: "forbidden", message: "No access" } }), { status: 403 }),
      );
    vi.stubGlobal("fetch", fetch);
    const results = await run("dismiss");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(results.every((item) => item.outcome === "failed" && item.message === "No access")).toBe(true);
  });
});
