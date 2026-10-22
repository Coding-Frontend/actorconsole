import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { workspacePlanUsage } from "@actorconsole/shared/plans";
import type { WorkspaceAccess } from "@actorconsole/shared/workspace-access";

const { replace, route } = vi.hoisted(() => ({
  replace: vi.fn(),
  route: { path: "/dashboard/actors" },
}));
vi.mock("next/navigation", () => ({
  usePathname: () => route.path,
  useRouter: () => ({ replace }),
}));
vi.mock("@/components/dashboard/sidebar", () => ({
  DEFAULT_DASHBOARD_NAVIGATION_STATUS: {},
  DashboardSidebar: ({ workspaceRestricted }: { workspaceRestricted: boolean }) => (
    <p>{workspaceRestricted ? "Restricted navigation" : "Full navigation"}</p>
  ),
}));
vi.mock("@/components/dashboard/topbar", () => ({ DashboardTopbar: () => null }));
vi.mock("@/components/dashboard/announcement-banner", () => ({ AnnouncementBanner: () => null }));
vi.mock("@/components/marketing/policy-acceptance-banner", () => ({
  PolicyAcceptanceBanner: () => null,
}));
vi.mock("@/components/dashboard/command-palette", () => ({
  CommandPalette: () => null,
  useCommandPalette: () => ({ open: false, setOpen: vi.fn() }),
}));
vi.mock("@/components/dashboard/impersonation-banner", () => ({ ImpersonationBanner: () => null }));
vi.mock("@/components/dashboard/workspace-data-refresher", () => ({
  WorkspaceDataRefresher: () => null,
}));
vi.mock("@/components/dashboard/workspace-plan-banner", () => ({
  WorkspacePlanBanner: () => null,
}));
vi.mock("@/components/dashboard/workspace-apify-connection-banner", () => ({
  WorkspaceApifyConnectionBanner: () => null,
}));
vi.mock("./workspace-upgrade-screen", () => ({
  WorkspaceUpgradeScreen: ({ error }: { error: boolean }) => (
    <p>{error ? "Access check failed" : "Upgrade workspace"}</p>
  ),
}));
import { DashboardShell } from "./dashboard-shell";
import { WORKSPACE_CHANGED_EVENT } from "./onboarding-gate";
import { DASHBOARD_STATUS_CHANGED_EVENT } from "./dashboard-navigation";

function access(workspaceId: string, plan: "FREE" | "PRO", actors: number): WorkspaceAccess {
  const usage = workspacePlanUsage(plan, actors, 100);
  return { workspaceId, plan, restricted: usage.upgradeRequired, usage };
}
function response(data: unknown) {
  return { ok: true, json: async () => ({ data }) } as Response;
}

describe("workspace access in the dashboard shell", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    route.path = "/dashboard/actors";
  });
  it("replaces operational content and redirects over-limit workspaces", async () => {
    const restricted = access("w1", "FREE", 51);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(restricted)));
    render(
      <DashboardShell initialAccess={restricted}>
        <p>Actor operations</p>
      </DashboardShell>,
    );
    expect(screen.queryByText("Actor operations")).toBeNull();
    expect(screen.getByText("Restricted navigation")).toBeTruthy();
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/dashboard/upgrade"));
  });
  it("keeps always-available content accessible above the limits", async () => {
    route.path = "/dashboard/mcp";
    const restricted = access("w1", "FREE", 51);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(restricted)));
    render(
      <DashboardShell initialAccess={restricted}>
        <p>MCP setup</p>
      </DashboardShell>,
    );
    await screen.findByText("MCP setup");
    expect(screen.queryByText("Upgrade workspace")).toBeNull();
    expect(replace).not.toHaveBeenCalled();
  });
  it.each(["/dashboard/default", "/dashboard/default/publishing"])(
    "keeps %s available independently of the active workspace limit",
    async (path) => {
      route.path = path;
      const restricted = access("w1", "FREE", 51);
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(restricted)));
      render(
        <DashboardShell initialAccess={restricted}>
          <p>All workspace earnings</p>
        </DashboardShell>,
      );
      await screen.findByText("All workspace earnings");
      expect(screen.queryByText("Upgrade workspace")).toBeNull();
      expect(replace).not.toHaveBeenCalled();
    },
  );
  it.each(["/dashboard/tools/pricing", "/dashboard/tools/seo"])(
    "keeps %s available inside the shell for restricted workspaces",
    async (path) => {
      route.path = path;
      const restricted = access("w1", "FREE", 51);
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(restricted)));
      render(
        <DashboardShell initialAccess={restricted}>
          <p>Research tool</p>
        </DashboardShell>,
      );
      await screen.findByText("Research tool");
      expect(screen.getByText("Restricted navigation")).toBeTruthy();
      expect(screen.queryByText("Upgrade workspace")).toBeNull();
      expect(replace).not.toHaveBeenCalled();
    },
  );
  it("ignores a late access decision from the previously selected workspace", async () => {
    let resolveOld!: (value: Response) => void;
    let resolveNew!: (value: Response) => void;
    const oldRequest = new Promise<Response>((resolve) => {
      resolveOld = resolve;
    });
    const newRequest = new Promise<Response>((resolve) => {
      resolveNew = resolve;
    });
    let requests = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) =>
        url.endsWith("/workspace-access")
          ? ++requests === 1
            ? oldRequest
            : newRequest
          : Promise.resolve(response({})),
      ),
    );
    render(
      <DashboardShell initialAccess={access("old", "PRO", 100)}>
        <p>Actor operations</p>
      </DashboardShell>,
    );
    act(() => window.dispatchEvent(new Event(DASHBOARD_STATUS_CHANGED_EVENT)));
    await waitFor(() => expect(requests).toBe(1));
    act(() => window.dispatchEvent(new Event(WORKSPACE_CHANGED_EVENT)));
    expect(screen.queryByText("Actor operations")).toBeNull();
    await act(async () => resolveNew(response(access("new", "FREE", 51))));
    expect(screen.getByText("Upgrade workspace")).toBeTruthy();
    await act(async () => resolveOld(response(access("old", "PRO", 100))));
    expect(screen.getByText("Restricted navigation")).toBeTruthy();
    expect(screen.queryByText("Actor operations")).toBeNull();
  });
  it("restores navigation and exits the upgrade page after upgrading", async () => {
    route.path = "/dashboard/upgrade";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(access("w1", "PRO", 100))));
    render(
      <DashboardShell initialAccess={access("w1", "FREE", 51)}>
        <p>Upgrade page</p>
      </DashboardShell>,
    );
    await screen.findByText("Full navigation");
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/dashboard"));
  });
  it("hides operations if an eligibility check fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("unavailable")));
    render(
      <DashboardShell>
        <p>Actor operations</p>
      </DashboardShell>,
    );
    await screen.findByText("Access check failed");
    expect(screen.queryByText("Actor operations")).toBeNull();
    expect(screen.getByText("Restricted navigation")).toBeTruthy();
  });

  it("uses the server's fresh access decision during hydration", async () => {
    const fetch = vi.fn().mockResolvedValue(response({}));
    vi.stubGlobal("fetch", fetch);
    render(
      <DashboardShell initialAccess={access("w1", "PRO", 100)}>
        <p>Actor operations</p>
      </DashboardShell>,
    );
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    expect(fetch.mock.calls[0][0]).toContain("navigation-status");
    expect(screen.getByText("Actor operations")).toBeTruthy();
    expect(screen.queryByText("Access check failed")).toBeNull();
  });

  it("throttles focus bursts while explicit status changes remain fresh", async () => {
    const fetch = vi.fn().mockResolvedValue(response(access("w1", "PRO", 100)));
    vi.stubGlobal("fetch", fetch);
    render(
      <DashboardShell initialAccess={access("w1", "PRO", 100)}>
        <p>Actor operations</p>
      </DashboardShell>,
    );
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    act(() => {
      for (let i = 0; i < 10; i++) window.dispatchEvent(new Event("focus"));
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    act(() => window.dispatchEvent(new Event(DASHBOARD_STATUS_CHANGED_EVENT)));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(3));
  });
});
