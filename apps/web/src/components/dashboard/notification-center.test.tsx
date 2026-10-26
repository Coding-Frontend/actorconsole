import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const push = vi.fn();
const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
}));

import { NotificationCenter } from "./notification-center";
import { WORKSPACE_CHANGED_EVENT } from "./onboarding-gate";

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

  it.each(["success", "failure"])("ignores an old workspace's late %s after switching twice", async (outcome) => {
    const requests: { resolve: (value: unknown) => void; reject: (error: Error) => void; signal: AbortSignal }[] = [];
    vi.stubGlobal("fetch", vi.fn((_url, options) => new Promise((resolve, reject) => requests.push({ resolve, reject, signal: options.signal }))));
    render(<NotificationCenter />);
    fireEvent.click(screen.getByRole("button", { name: "Workspace notifications" }));
    act(() => window.dispatchEvent(new Event(WORKSPACE_CHANGED_EVENT)));
    act(() => window.dispatchEvent(new Event(WORKSPACE_CHANGED_EVENT)));
    expect(requests).toHaveLength(3);
    expect(requests[0].signal.aborted).toBe(true);
    expect(requests[1].signal.aborted).toBe(true);
    const response = (title: string, unread: number) => ({ ok: true, json: async () => ({ ok: true, data: { unread, items: [{ id: title, title, readAt: null, createdAt: new Date().toISOString(), detailHref: "/dashboard/notifications/local", source: "actorconsole" }] } }) });
    await act(async () => requests[2].resolve(response("Current workspace", 2)));
    expect(screen.getByText("Current workspace")).toBeTruthy();
    await act(async () => {
      requests[1].resolve(response("Intermediate workspace", 9));
      if (outcome === "success") requests[0].resolve(response("Old workspace", 8));
      else requests[0].reject(new Error("Stale error"));
    });
    expect(screen.getByText("Current workspace")).toBeTruthy();
    expect(screen.queryByText("Old workspace")).toBeNull();
    expect(screen.queryByText("Intermediate workspace")).toBeNull();
    expect(screen.queryByText("Stale error")).toBeNull();
    expect(screen.getByRole("button", { name: "2 unread workspace notifications" })).toBeTruthy();
  });

  it("clears previous workspace content while the next inbox is pending and aborts on unmount", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, data: { unread: 1, items: [] } }) })
      .mockImplementation(() => new Promise(() => {}));
    vi.stubGlobal("fetch", fetcher);
    const view = render(<NotificationCenter />);
    await screen.findByRole("button", { name: "1 unread workspace notifications" });
    act(() => window.dispatchEvent(new Event(WORKSPACE_CHANGED_EVENT)));
    expect(screen.getByRole("button", { name: "Workspace notifications" })).toBeTruthy();
    view.unmount();
    expect(fetcher.mock.calls[1][1].signal.aborted).toBe(true);
  });
});
