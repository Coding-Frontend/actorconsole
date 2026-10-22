import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PublishingOverviewPayload } from "@actorconsole/shared/default-dashboard";
const { navigate, refresh } = vi.hoisted(() => ({ navigate: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/lib/client-navigation", () => ({ navigateInApp: navigate }));
import { PublishingOverview } from "./publishing-overview";

const payload: PublishingOverviewPayload = {
  summary: {
    actors: 10,
    published: 4,
    private: 5,
    unknown: 1,
    schedules: 26,
    activeSchedules: 2,
    pending: 5,
    queuedPublished: 3,
    failed: 1,
    blocked: 2,
  },
  workspaces: [
    { id: "w2", name: "Research", actors: 10, published: 4, private: 5, unknown: 1, schedules: 26 },
  ],
  schedules: [
    {
      id: "s1",
      name: "Daily queue",
      workspaceId: "w2",
      workspaceName: "Research",
      enabled: false,
      nextRunAt: null,
      quotaBlockedUntil: null,
      actors: 5,
      pending: 2,
      published: 1,
      failed: 1,
      blocked: 1,
      lastRun: null,
    },
  ],
  operations: [],
  page: 1,
  pageSize: 25,
  totalSchedules: 26,
};
describe("publishing overview", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });
  it("shows combined publishing, paused queues, unknown data, and pagination", () => {
    render(<PublishingOverview payload={payload} />);
    expect(screen.getByText("Publishing overview")).toBeTruthy();
    expect(screen.getByText(/1 actors with unknown visibility/)).toBeTruthy();
    expect(screen.getByText(/5 pending · 3 published · 1 failed · 2 blocked/)).toBeTruthy();
    expect(screen.getAllByText("Paused")).toHaveLength(2);
    expect(screen.getByRole("link", { name: "Next" }).getAttribute("href")).toBe(
      "/dashboard/default/publishing?page=2",
    );
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(refresh).toHaveBeenCalled();
  });
  it("selects the schedule's workspace before opening its publishing tools", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ ok: true })));
    render(<PublishingOverview payload={payload} />);
    fireEvent.click(screen.getByRole("button", { name: "Manage Daily queue in Research" }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/dashboard/publishing/schedules"));
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/business-profiles/w2/select"),
      expect.objectContaining({ method: "POST", credentials: "include" }),
    );
  });
  it("shows a recoverable error when workspace selection fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({}, { status: 500 })));
    render(<PublishingOverview payload={payload} />);
    fireEvent.click(screen.getByRole("button", { name: "Open publishing for Research" }));
    await screen.findByRole("alert");
    expect(navigate).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Open publishing for Research" }).hasAttribute("disabled"),
    ).toBe(false);
  });
});
