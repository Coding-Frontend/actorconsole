import { afterEach, describe, expect, it, vi } from "vitest";
import { runLogoReviewBatch, selectAllLogoReviews, type LogoReviewFilters } from "./logo-review";

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

  it.each(["apply", "dismiss"] as const)(
    "runs %s only for the selected IDs, sequentially",
    async (action) => {
      let resolve!: (value: Response) => void;
      const fetch = vi
        .fn()
        .mockImplementationOnce(
          () =>
            new Promise<Response>((done) => {
              resolve = done;
            }),
        )
        .mockImplementation(async () => response({}));
      vi.stubGlobal("fetch", fetch);
      const onProgress = vi.fn();
      const running = runLogoReviewBatch({
        action,
        items: items.slice(0, 2),
        workspaceId: "workspace-1",
        signal: new AbortController().signal,
        shouldStop: () => false,
        onProgress,
      });
      expect(fetch).toHaveBeenCalledTimes(1);
      resolve(response({}));
      const results = await running;
      expect(fetch).toHaveBeenCalledTimes(2);
      expect(fetch.mock.calls.map(([url]) => String(url))).toEqual([
        expect.stringContaining(`/r1/${action}`),
        expect.stringContaining(`/r2/${action}`),
      ]);
      expect(results.map((item) => item.outcome)).toEqual([
        action === "apply" ? "applied" : "dismissed",
        action === "apply" ? "applied" : "dismissed",
      ]);
      expect(onProgress).toHaveBeenLastCalledWith(null, results);
      expect(
        fetch.mock.calls.every(
          ([, init]) => init.headers.get("x-business-profile-id") === "workspace-1",
        ),
      ).toBe(true);
    },
  );

  it("records a per-Actor failure and continues with the other selected Actors", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(response({}))
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              error: { code: "apify_logo_update_failed", message: "Apify rejected this Actor" },
            }),
            { status: 502 },
          ),
        )
        .mockResolvedValueOnce(response({})),
    );
    const results = await runLogoReviewBatch({
      action: "apply",
      items,
      workspaceId: "w1",
      signal: new AbortController().signal,
      shouldStop: () => false,
      onProgress: vi.fn(),
    });
    expect(results.map((item) => item.outcome)).toEqual(["applied", "failed", "applied"]);
    expect(results[1]).toMatchObject({
      id: "r2",
      message: "Apify rejected this Actor",
      retryable: true,
    });
  });

  it.each([
    [401, "unauthenticated"],
    [403, "forbidden"],
    [429, "rate_limited"],
    [409, "apify_publishing_credentials_required"],
  ])("stops after HTTP %s (%s) without sending the rest", async (status, code) => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ error: { code, message: "Check the connection" } }), {
          status: Number(status),
        }),
      );
    vi.stubGlobal("fetch", fetch);
    const results = await runLogoReviewBatch({
      action: "apply",
      items,
      workspaceId: "w1",
      signal: new AbortController().signal,
      shouldStop: () => false,
      onProgress: vi.fn(),
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(results).toHaveLength(1);
    expect(results[0]?.outcome).toBe("failed");
  });

  it("stops after the current Actor without canceling its accepted update", async () => {
    let stop = false;
    const fetch = vi.fn().mockImplementation(async () => {
      stop = true;
      return response({});
    });
    vi.stubGlobal("fetch", fetch);
    const results = await runLogoReviewBatch({
      action: "apply",
      items,
      workspaceId: "w1",
      signal: new AbortController().signal,
      shouldStop: () => stop,
      onProgress: vi.fn(),
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(results[0]?.outcome).toBe("applied");
  });

  it("ignores a response arriving after an abort and never launches another mutation", async () => {
    const controller = new AbortController();
    const fetch = vi.fn().mockImplementation(async () => {
      controller.abort();
      return response({});
    });
    vi.stubGlobal("fetch", fetch);
    const results = await runLogoReviewBatch({
      action: "apply",
      items,
      workspaceId: "w1",
      signal: controller.signal,
      shouldStop: () => false,
      onProgress: vi.fn(),
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(results).toEqual([]);
  });

  it("does not automatically retry a request whose outcome is unknown", async () => {
    const fetch = vi.fn().mockRejectedValue(new TypeError("Network error"));
    vi.stubGlobal("fetch", fetch);
    const results = await runLogoReviewBatch({
      action: "apply",
      items,
      workspaceId: "w1",
      signal: new AbortController().signal,
      shouldStop: () => false,
      onProgress: vi.fn(),
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(results[0]).toMatchObject({
      outcome: "failed",
      retryable: false,
      message: expect.stringContaining("Refresh to check"),
    });
  });

  it("stops on a successful response with an unreadable body rather than claiming success", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response("interrupted JSON", { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    const results = await runLogoReviewBatch({
      action: "apply",
      items,
      workspaceId: "w1",
      signal: new AbortController().signal,
      shouldStop: () => false,
      onProgress: vi.fn(),
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(results[0]).toMatchObject({ outcome: "failed", retryable: false });
  });
});
