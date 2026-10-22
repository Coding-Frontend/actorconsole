import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ api: vi.fn(), notFound: vi.fn() }));
vi.mock("@/lib/admin/server-api", () => ({ api: mocks.api }));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound, redirect: vi.fn() }));
vi.mock("@/components/dashboard/financial-analytics-page", () => ({
  FinancialAnalyticsPage: ({ kind }: { kind: string }) => <div>Analytics: {kind}</div>,
}));
import WorkspacePage from "./page";

const workspace = {
  id: "workspace_1",
  name: "Store team",
  slug: "store-team",
  plan: "PRO",
  industry: null,
  website: null,
  isDefault: true,
  createdAt: "2026-10-01T00:00:00Z",
  user: {
    id: "user_1",
    name: "Owner",
    email: "owner@example.com",
    role: "USER",
    suspendedAt: null,
    deletionScheduledFor: null,
  },
  _count: { actors: 51, bulkPublishSchedules: 2, notifications: 3 },
  apifyTokens: [],
  notificationPreference: null,
};
function load(section?: string) {
  return WorkspacePage({
    params: Promise.resolve({ id: "user_1", workspaceId: "workspace_1" }),
    searchParams: Promise.resolve({ section }),
  });
}

describe("Admin workspace details", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.api.mockResolvedValue({
      ok: true,
      data: { workspace, items: [], total: 0, page: 1, limit: 25 },
    });
  });
  afterEach(cleanup);
  it("provides every workspace section and a workspace-specific mimic action", async () => {
    render(await load());
    expect(screen.getByRole("navigation", { name: "Workspace sections" })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Schedules/ }).getAttribute("href")).toBe(
      "/admin/users/user_1/workspaces/workspace_1?section=schedules",
    );
    expect(screen.getByRole("link", { name: /Notifications/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Mimic this user" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Open this page as user" })).toBeTruthy();
  });
  it("links actors to their admin detail pages and paginates the selected section", async () => {
    mocks.api.mockResolvedValue({
      ok: true,
      data: {
        workspace,
        items: [{ id: "actor_1", title: "Product scraper", actorName: "scraper" }],
        total: 51,
        page: 1,
        limit: 25,
      },
    });
    render(await load("actors"));
    expect(screen.getByRole("link", { name: "View details" }).getAttribute("href")).toBe(
      "/admin/actors/actor_1",
    );
    expect(screen.getByRole("link", { name: "Next" }).getAttribute("href")).toContain(
      "section=actors&page=2",
    );
  });
  it("shows notification content and read state without marking it read", async () => {
    mocks.api.mockResolvedValue({
      ok: true,
      data: {
        workspace,
        items: [
          {
            id: "notification_1",
            title: "Publishing completed",
            body: "Two Actors are live.",
            type: "publishing",
            readAt: null,
          },
        ],
        total: 1,
        page: 1,
        limit: 25,
      },
    });
    render(await load("notifications"));
    expect(screen.getByText("Two Actors are live.")).toBeTruthy();
    expect(screen.getByText("Unread")).toBeTruthy();
    expect(mocks.api).toHaveBeenCalledTimes(1);
    expect(mocks.api.mock.calls[0][1]).not.toHaveProperty("method");
  });
  it("renders the shared financial view within the admin workspace", async () => {
    mocks.api
      .mockResolvedValueOnce({
        ok: true,
        data: { workspace, items: [], total: 0, page: 1, limit: 25 },
      })
      .mockResolvedValueOnce({ ok: true, data: { items: [] } });
    render(await load("revenue"));
    expect(screen.getByText("Analytics: revenue")).toBeTruthy();
    expect(mocks.api.mock.calls[1][0]).toBe(
      "/admin/users/user_1/workspaces/workspace_1/analytics/revenue",
    );
  });
  it("shows a clear API failure instead of an empty workspace", async () => {
    mocks.api.mockResolvedValue({
      ok: false,
      status: 503,
      error: { message: "Service unavailable" },
    });
    render(await load());
    expect(screen.getByRole("alert").textContent).toContain("Service unavailable");
  });
});
