import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const push = vi.fn();
const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
}));

import { NotificationCenter } from "./notification-center";

describe("NotificationCenter", () => {
  beforeEach(() => {
    push.mockReset();
    refresh.mockReset();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          ok: true,
          data: {
            unread: 3,
            items: [
              {
                id: "notification-1",
                type: "actor.maintenance",
                title: "Actor needs maintenance review",
                body: "Clutch Scraper is marked under maintenance.",
                detailHref: "/dashboard/notifications/notification-1",
                readAt: null,
                createdAt: new Date().toISOString(),
                source: "actorconsole",
              },
            ],
          },
        }),
      }),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("opens a preview inbox without navigating and reserves the list route for View all", async () => {
    render(<NotificationCenter unreadNotifications={3} />);

    const trigger = screen.getByRole("button", { name: "3 unread workspace notifications" });
    expect(trigger.textContent).toContain("3");

    fireEvent.click(trigger);

    await screen.findByText("Actor needs maintenance review");
    expect(push).not.toHaveBeenCalled();
    expect(
      screen.getByRole("link", { name: /Actor needs maintenance review/i }).getAttribute("href"),
    ).toBe("/dashboard/notifications/notification-1");
    expect(screen.getByRole("link", { name: /View all notifications/i }).getAttribute("href")).toBe(
      "/dashboard/notifications",
    );
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  });
});
