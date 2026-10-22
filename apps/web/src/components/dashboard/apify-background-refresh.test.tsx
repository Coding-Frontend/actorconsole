import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApifyBackgroundRefresh } from "./apify-background-refresh";
import { DASHBOARD_STATUS_CHANGED_EVENT } from "./dashboard-navigation";

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
const router = { refresh };
vi.mock("next/navigation", () => ({ useRouter: () => router }));

describe("Apify background validation across navigation", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    refresh.mockReset();
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("waits for the complete validation response before refreshing the current view", async () => {
    let finishBody!: (value: unknown) => void;
    const body = new Promise((resolve) => {
      finishBody = resolve;
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: () => body }));
    render(<ApifyBackgroundRefresh enabled apifyUserId="builder" />);
    await act(async () => {});
    expect(refresh).not.toHaveBeenCalled();
    await act(async () => finishBody({ ok: true }));
    await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
  });

  it("lets validation finish after navigation without refreshing the new page", async () => {
    let finish!: (value: Response) => void;
    const pending = new Promise<Response>((resolve) => {
      finish = resolve;
    });
    const fetchMock = vi.fn().mockReturnValue(pending);
    vi.stubGlobal("fetch", fetchMock);
    const onStatusChanged = vi.fn();
    window.addEventListener(DASHBOARD_STATUS_CHANGED_EVENT, onStatusChanged);
    try {
      const view = render(<ApifyBackgroundRefresh enabled apifyUserId="builder" />);
      const signal = fetchMock.mock.calls[0][1].signal as AbortSignal;
      view.unmount();
      expect(signal.aborted).toBe(false);
      await act(async () => finish(Response.json({ ok: true })));
      expect(refresh).not.toHaveBeenCalled();
      expect(onStatusChanged).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener(DASHBOARD_STATUS_CHANGED_EVENT, onStatusChanged);
    }
  });

  it("handles failed validation without navigating or raising an unhandled rejection", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network unavailable")));
    render(<ApifyBackgroundRefresh enabled apifyUserId="builder" />);
    await act(async () => {});
    expect(refresh).not.toHaveBeenCalled();
  });
});
