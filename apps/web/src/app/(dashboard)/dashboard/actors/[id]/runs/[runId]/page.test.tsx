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
});
