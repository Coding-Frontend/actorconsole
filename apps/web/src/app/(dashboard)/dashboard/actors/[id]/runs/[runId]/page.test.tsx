import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("@/lib/server-api", () => ({ authenticatedServerFetch: mocks.fetch }));
vi.mock("@/components/dashboard/workspace-apify-required-page", () => ({ workspaceApifyRequiredPage: vi.fn().mockResolvedValue(null) }));
import ActorRunPage from "./page";

afterEach(cleanup);
beforeEach(() => vi.clearAllMocks());

const actor = { id: "actor", title: "Example scraper", username: "alice", actorName: "scraper" };
const run = { id: "saved-run", status: "FAILED", startedAt: "2026-08-31T10:00:00Z", usageTotalUsd: 0.0016 };

describe("historical Actor run view", () => {
  it("shows the preserved summary and unavailable storage notice for an expired log URL", async () => {
    mocks.fetch.mockResolvedValue(Response.json({ data: { actor, run, storageUnavailable: true } }));
    render(await ActorRunPage({ params: Promise.resolve({ id: "actor", runId: "saved-run" }), searchParams: Promise.resolve({ section: "logs" }) }));
    expect(screen.getByRole("status").textContent).toContain("saved summary");
    expect(screen.getByText("$0.0016")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Run overview" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Logs" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Dataset" })).toBeNull();
  });
  it("retains normal storage navigation and logs for a live run", async () => {
    mocks.fetch.mockResolvedValue(Response.json({ data: { actor, run, log: "Completed run output" } }));
    render(await ActorRunPage({ params: Promise.resolve({ id: "actor", runId: "saved-run" }), searchParams: Promise.resolve({ section: "logs" }) }));
    expect(screen.getByText("Completed run output")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Dataset" })).toBeTruthy();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it.each(["result/51", "result 51 & next?", "résultat/51"])("keeps the key list cursor when previewing %s on a later page", async (key) => {
    mocks.fetch.mockResolvedValue(Response.json({
      data: {
        actor,
        run,
        keyValueStore: {
          items: [{ key, size: 20 }],
          isTruncated: true,
          nextExclusiveStartKey: "result/100",
          record: { key, contentType: "text/plain", value: "Saved result", tooLarge: false },
        },
      },
    }));
    render(await ActorRunPage({
      params: Promise.resolve({ id: "actor", runId: "saved-run" }),
      searchParams: Promise.resolve({ section: "key-value-store", cursor: "result/50", key }),
    }));

    const recordUrl = new URL(screen.getByRole("link", { name: `${key} 20 bytes` }).getAttribute("href")!, "http://localhost");
    expect(recordUrl.searchParams.get("cursor")).toBe("result/50");
    expect(recordUrl.searchParams.get("key")).toBe(key);
    expect(screen.getByText("Saved result")).toBeTruthy();
    expect(mocks.fetch).toHaveBeenCalledWith(expect.stringContaining("cursor=result%2F50"));
  });

  it.each([100_000, 100_020])("keeps dataset navigation correct at offset %s", async (offset) => {
    mocks.fetch.mockResolvedValue(Response.json({ data: {
      actor, run, dataset: { items: [{ result: "Saved result" }], total: 100_021, offset, limit: 20 },
    } }));
    render(await ActorRunPage({
      params: Promise.resolve({ id: "actor", runId: "saved-run" }),
      searchParams: Promise.resolve({ section: "dataset", offset: String(offset) }),
    }));
    expect(screen.getByRole("link", { name: "Previous" }).getAttribute("href")).toContain(`offset=${offset - 20}`);
    if (offset === 100_000) expect(screen.getByRole("link", { name: "Next" }).getAttribute("href")).toContain("offset=100020");
    else expect(screen.queryByRole("link", { name: "Next" })).toBeNull();
    expect(mocks.fetch).toHaveBeenCalledWith(expect.stringContaining(`offset=${offset}`));
  });
});
