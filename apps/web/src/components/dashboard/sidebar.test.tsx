import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const route = vi.hoisted(() => ({ path: "/dashboard" }));
vi.mock("next/navigation", () => ({ usePathname: () => route.path }));
vi.mock("@/lib/session-client", () => ({
  useSession: () => ({
    data: { user: { name: "Test Builder", email: "builder@example.com" } },
  }),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={String(href)} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("@/lib/firebase", () => ({ signOutFirebase: vi.fn() }));

import { signOutFirebase } from "@/lib/firebase";
import { DashboardSidebar } from "./sidebar";

describe("DashboardSidebar", () => {
  it.each(["/dashboard/default", "/dashboard/default/publishing"])(
    "shows both account overviews and selects the current destination at %s",
    (path) => {
      route.path = path;
      render(<DashboardSidebar workspacePlan="FREE" workspaceRestricted />);
      const earnings = screen.getByRole("link", { name: "Earnings overview" });
      const publishing = screen.getByRole("link", { name: "Publishing overview" });
      expect(earnings.getAttribute("href")).toBe("/dashboard/default");
      expect(publishing.getAttribute("href")).toBe("/dashboard/default/publishing");
      expect(
        (path.endsWith("/publishing") ? publishing : earnings).getAttribute("aria-current"),
      ).toBe("page");
      expect(
        (path.endsWith("/publishing") ? earnings : publishing).getAttribute("aria-current"),
      ).toBeNull();
      expect(screen.queryByRole("link", { name: "Upgrade to Pro" })).toBeNull();
      route.path = "/dashboard";
    },
  );
  it("hides operational destinations and keeps an upgrade path for restricted Free workspaces", () => {
    render(<DashboardSidebar workspacePlan="FREE" workspaceRestricted />);
    fireEvent.click(screen.getByRole("button", { name: /developer/i }));
    fireEvent.click(screen.getByRole("button", { name: /help/i }));
    for (const label of [
      "Overview",
      "Actors",
      "Activity",
      "Publishing",
      "Usage",
      "Costs",
      "Revenue",
    ]) {
      expect(screen.queryByRole("link", { name: new RegExp(`^${label}$`, "i") })).toBeNull();
    }
    for (const label of [
      "Keyword research",
      "Apify connection",
      "MCP access",
      "Support",
      "Documentation",
      "Upgrade to Pro",
    ]) {
      expect(screen.getByRole("link", { name: new RegExp(label, "i") })).toBeTruthy();
    }
  });
  beforeEach(() => {
    window.localStorage.clear();
    vi.mocked(signOutFirebase).mockReset();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: [] }),
      }),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("shows the complete workspace navigation without a Workspaces or Leaderboard item", async () => {
    render(
      <DashboardSidebar
        workspacePlan="FREE"
        navigationStatus={{
          unreadNotifications: 3,
          credentialIssue: true,
          expiredApiKeys: 0,
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /operations/i }));
    fireEvent.click(screen.getByRole("button", { name: /developer/i }));
    fireEvent.click(screen.getByRole("button", { name: /help/i }));

    for (const label of [
      "Overview",
      "Actors",
      "Keyword research",
      "Publishing",
      "Usage",
      "Costs",
      "Revenue",
      "Apify connection",
      "MCP access",
      "Support",
      "Documentation",
    ]) {
      expect(screen.getByRole("link", { name: new RegExp(label, "i") })).toBeTruthy();
    }
    expect(screen.queryByRole("link", { name: /^workspaces$/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /^leaderboard$/i })).toBeNull();

    expect(screen.getByRole("link", { name: /^publishing$/i }).getAttribute("href")).toBe(
      "/dashboard/publishing",
    );
    expect(screen.getByRole("link", { name: /^mcp access$/i }).getAttribute("href")).toBe(
      "/dashboard/mcp",
    );
    expect(screen.queryByRole("link", { name: /notifications/i })).toBeNull();
  });

  it("persists expanded desktop groups and keeps the active group open", () => {
    render(<DashboardSidebar workspacePlan="PRO" />);

    const operations = screen.getByRole("button", { name: /operations/i });
    expect(operations.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(operations);
    expect(operations.getAttribute("aria-expanded")).toBe("true");
    expect(window.localStorage.getItem("actorconsole:dashboard-navigation-groups")).toContain(
      "Operations",
    );
    expect(screen.getByRole("button", { name: /workspace/i }).getAttribute("aria-expanded")).toBe(
      "true",
    );
  });

  it("renders a fixed full-height mobile drawer and exposes account destinations", () => {
    const onClose = vi.fn();
    render(<DashboardSidebar mobileOpen onMobileClose={onClose} />);

    const mobileDrawer = screen.getByRole("dialog", { name: "Dashboard navigation" });
    expect(mobileDrawer).toBeTruthy();

    const mobile = within(mobileDrawer as HTMLElement);
    expect(mobile.getByText("Active workspace")).toBeTruthy();
    expect(mobile.getByRole("button", { name: "Select workspace" })).toBeTruthy();
    expect(mobile.getByText("Profile & account")).toBeTruthy();
    expect(mobile.queryByText("Workspace account")).toBeNull();
    fireEvent.click(mobile.getByRole("button", { name: /test builder/i }));
    for (const label of [
      "Profile",
      "Notification preferences",
      "Billing",
      "Data export",
      "Account deletion",
    ]) {
      expect(mobile.getAllByRole("link", { name: label }).length).toBeGreaterThan(0);
    }
    expect(mobile.getByRole("button", { name: /sign out/i })).toBeTruthy();
  });

  it("clears the app session on the first click even when Firebase sign-out fails", async () => {
    window.history.replaceState({}, "", "/dashboard");
    vi.mocked(signOutFirebase).mockRejectedValueOnce(new Error("Firebase unavailable"));
    render(<DashboardSidebar />);

    fireEvent.click(screen.getByRole("button", { name: /test builder/i }));
    fireEvent.click(screen.getByRole("button", { name: /^sign out$/i }));

    expect(fetch).toHaveBeenCalledWith("/api/auth/signout", { method: "POST" });
    expect(screen.getByRole("button", { name: /signing out/i }).hasAttribute("disabled")).toBe(
      true,
    );
    await waitFor(() => expect(signOutFirebase).toHaveBeenCalledOnce());
    await waitFor(() => expect(window.location.pathname).toBe("/"));
  });
});
