import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard/actors" }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={String(href)} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("@/components/dashboard/business-profile-switcher", () => ({
  BusinessProfileSwitcher: () => <button type="button">Test workspace</button>,
}));
vi.mock("@/components/theme-toggle", () => ({
  ThemeToggle: () => <button type="button">Theme</button>,
}));
vi.mock("@/components/dashboard/notification-center", () => ({
  NotificationCenter: ({ unreadNotifications }: { unreadNotifications: number }) => (
    <button type="button" aria-label={`${unreadNotifications} unread notifications`}>
      {unreadNotifications}
    </button>
  ),
}));

import { DashboardTopbar } from "./topbar";

describe("DashboardTopbar", () => {
  afterEach(cleanup);

  it("keeps the workspace switcher and exposes notifications outside the sidebar", () => {
    render(<DashboardTopbar unreadNotifications={7} />);

    expect(screen.getByRole("heading", { name: "Actors" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Test workspace" })).toBeTruthy();
    const notifications = screen.getByRole("button", { name: "7 unread notifications" });
    expect(notifications.textContent).toContain("7");
  });
});
