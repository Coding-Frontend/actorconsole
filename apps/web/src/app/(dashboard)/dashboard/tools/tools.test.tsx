import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  path: "/dashboard/tools/pricing",
  replace: vi.fn(),
  access: { workspaceId: "w1", plan: "FREE", restricted: true, usage: null },
}));
vi.mock("next/navigation", () => ({
  usePathname: () => mocks.path,
  useSearchParams: () => new URLSearchParams("actor=owner%2Factor"),
  useRouter: () => ({ replace: mocks.replace }),
  redirect: (path: string) => {
    throw new Error(`Unexpected redirect: ${path}`);
  },
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={String(href)} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("next/headers", () => ({ cookies: async () => new Map() }));
vi.mock("@actorconsole/db", () => ({
  db: { user: { findUnique: async () => ({ suspendedAt: null, deletionScheduledFor: null }) } },
}));
vi.mock("@/lib/auth", () => ({ auth: async () => ({ user: { id: "u1" } }) }));
vi.mock("@/lib/impersonation", () => ({
  getMimicStatus: async () => null,
  ORIGINAL_SESSION_COOKIE: "original-session",
}));
vi.mock("@/lib/server-workspace-access", () => ({
  getServerWorkspaceAccess: async () => mocks.access,
}));
vi.mock("@/lib/session-client", () => ({
  useSession: () => ({ data: { user: { name: "Test Builder" } } }),
}));
vi.mock("@/lib/firebase", () => ({ signOutFirebase: vi.fn() }));
vi.mock("@/components/dashboard/business-profile-switcher", () => ({
  BusinessProfileSwitcher: () => <button>Test workspace</button>,
}));
vi.mock("@/components/dashboard/notification-center", () => ({
  NotificationCenter: () => <button>Notifications</button>,
}));
vi.mock("@/components/dashboard/announcement-banner", () => ({ AnnouncementBanner: () => null }));
vi.mock("@/components/marketing/policy-acceptance-banner", () => ({
  PolicyAcceptanceBanner: () => null,
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
vi.mock("@/components/dashboard/onboarding-gate", () => ({
  WORKSPACE_CHANGED_EVENT: "workspace-changed",
  OnboardingGate: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("@/components/dashboard/command-palette", () => ({
  CommandPalette: () => null,
  useCommandPalette: () => ({ open: false, setOpen: vi.fn() }),
}));

import DashboardLayout from "../layout";
import PricingPage from "./pricing/page";
import SeoPage from "./seo/page";

beforeEach(() => {
  window.localStorage.clear();
  vi.clearAllMocks();
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: mocks.access }) }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("dashboard research tool routes", () => {
  it.each([
    ["pricing", "Pricing calculator", PricingPage],
    ["seo", "SEO audit", SeoPage],
  ] as const)(
    "renders %s inside the real dashboard shell with internal navigation",
    async (tool, title, Page) => {
      mocks.path = `/dashboard/tools/${tool}`;
      render(await DashboardLayout({ children: <Page /> }));
      const sidebar = screen.getByRole("complementary");
      const activeLink = within(sidebar).getByRole("link", { name: title });
      expect(activeLink.getAttribute("href")).toBe(mocks.path);
      expect(activeLink.getAttribute("aria-current")).toBe("page");
      expect(
        screen
          .getByRole("heading", { name: title, level: 1 })
          .closest("header")
          ?.classList.contains("dashboard-topbar"),
      ).toBe(true);
      const navigation = screen.getByRole("navigation", { name: "Research tools" });
      expect(
        within(navigation).getByRole("link", { name: "Pricing calculator" }).getAttribute("href"),
      ).toBe("/dashboard/tools/pricing");
      expect(within(navigation).getByRole("link", { name: "SEO audit" }).getAttribute("href")).toBe(
        "/dashboard/tools/seo",
      );
      expect(
        within(navigation).getByRole("link", { name: "Actor research" }).getAttribute("href"),
      ).toBe("/dashboard/research");
      expect(screen.queryByRole("contentinfo")).toBeNull();
      expect(mocks.replace).not.toHaveBeenCalled();
      if (tool === "pricing") {
        expect(screen.getByRole("region", { name: "Pricing scenario" })).toBeTruthy();
      } else {
        expect((screen.getByLabelText("Public Actor") as HTMLInputElement).value).toBe(
          "owner/actor",
        );
      }
      fireEvent.click(screen.getByRole("button", { name: "Toggle sidebar" }));
      const mobileSidebar = screen.getAllByRole("complementary")[1];
      const mobileLink = within(mobileSidebar).getByRole("link", { name: title });
      expect(mobileLink.getAttribute("href")).toBe(mocks.path);
      expect(mobileLink.getAttribute("aria-current")).toBe("page");
    },
  );
});
