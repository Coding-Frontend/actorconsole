import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const { success, error } = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));

vi.mock("sonner", () => ({
  toast: { success, error, info: vi.fn() },
}));

import { NotificationDetailActions } from "./notification-detail-actions";

describe("NotificationDetailActions", () => {
  beforeEach(() => {
    success.mockReset();
    error.mockReset();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes("/notifications/") && url.endsWith("/read")) {
          return { ok: true, json: async () => ({ ok: true }) } as Response;
        }
        if (url.endsWith("/bulk-publishing/actors/status") && init?.method === "PATCH") {
          return {
            ok: true,
            json: async () => ({ ok: true, data: { operationId: "operation-1" } }),
          } as Response;
        }
        if (url.endsWith("/bulk-publishing/status-operations/operation-1")) {
          return {
            ok: true,
            json: async () => ({ ok: true, data: { status: "SUCCEEDED", items: [] } }),
          } as Response;
        }
        throw new Error(`Unexpected request: ${url}`);
      }),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("clears maintenance through the durable Actor status operation", async () => {
    render(
      <NotificationDetailActions
        notificationId="notification-1"
        unread
        actorId="actor-1"
        actions={[
          {
            id: "clear-maintenance",
            label: "Clear maintenance",
            description: "Return the Actor to active status.",
          },
        ]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Clear maintenance" }));

    await screen.findByRole("button", { name: "Completed" });
    expect(success).toHaveBeenCalledWith("Clear maintenance completed");

    const statusCall = vi
      .mocked(fetch)
      .mock.calls.find(
        ([input, init]) =>
          String(input).endsWith("/bulk-publishing/actors/status") && init?.method === "PATCH",
      );
    expect(statusCall).toBeTruthy();
    expect(JSON.parse(String(statusCall?.[1]?.body))).toEqual({
      actorIds: ["actor-1"],
      underMaintenance: false,
    });
    await waitFor(() => expect(error).not.toHaveBeenCalled());
  });
});
