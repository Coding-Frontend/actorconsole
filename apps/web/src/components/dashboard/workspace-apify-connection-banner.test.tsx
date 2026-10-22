import { cleanup, render, screen, waitFor, act, fireEvent } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WORKSPACE_DATA_REFRESHED_EVENT } from "@/lib/actor-refresh";
const mocks = vi.hoisted(() => ({ pathname: "/dashboard/keywords" }));
vi.mock("next/navigation", () => ({ usePathname: () => mocks.pathname }));
import { WorkspaceApifyConnectionBanner } from "./workspace-apify-connection-banner";

const statusResponse = (data: object) => new Response(JSON.stringify({ data }));
beforeEach(() => {
  mocks.pathname = "/dashboard/keywords";
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("workspace connection guidance", () => {
  it.each([
    "/dashboard",
    "/dashboard/actors",
    "/dashboard/keywords",
    "/dashboard/activity",
    "/dashboard/mcp",
    "/dashboard/billing",
    "/dashboard/profile",
    "/dashboard/support",
  ])("offers workspace setup on %s", async (pathname) => {
    mocks.pathname = pathname;
    const fetchMock = vi.fn().mockResolvedValue(statusResponse({ connected: false }));
    vi.stubGlobal("fetch", fetchMock);
    render(<WorkspaceApifyConnectionBanner workspaceId="bp1" />);
    expect(await screen.findByRole("link", { name: "Connect Apify" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "How to connect Apify" })).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/apify/status"),
      expect.objectContaining({ headers: { "x-business-profile-id": "bp1" } }),
    );
  });

  it("does not display a disconnected warning for a working API-only connection", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        statusResponse({ connected: true, apiKeyConfigured: true, apiOperationsAvailable: true }),
      );
    vi.stubGlobal("fetch", fetchMock);
    render(<WorkspaceApifyConnectionBanner workspaceId="bp1" />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(screen.queryByLabelText("Apify workspace setup")).toBeNull();
  });

  it("offers Console setup on Revenue while the API key continues working", async () => {
    mocks.pathname = "/dashboard/revenue";
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          statusResponse({ connected: true, apiKeyConfigured: true, apiOperationsAvailable: true }),
        ),
    );
    render(<WorkspaceApifyConnectionBanner workspaceId="bp1" />);
    expect(await screen.findByRole("link", { name: "Connect Apify Console" })).toBeTruthy();
  });

  it("removes the prompt after connection and synchronizing", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(statusResponse({ connected: false }))
      .mockResolvedValueOnce(statusResponse({ connected: true, apiKeyConfigured: true }));
    vi.stubGlobal("fetch", fetchMock);
    render(<WorkspaceApifyConnectionBanner workspaceId="bp1" />);
    await screen.findByRole("link", { name: "Connect Apify" });
    act(() => window.dispatchEvent(new Event(WORKSPACE_DATA_REFRESHED_EVENT)));
    await waitFor(() => expect(screen.queryByLabelText("Apify workspace setup")).toBeNull());
  });

  it("discards a stale connected response when changing workspaces", async () => {
    let resolveOld!: (response: Response) => void;
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            resolveOld = resolve;
          }),
      )
      .mockResolvedValueOnce(statusResponse({ connected: false }));
    vi.stubGlobal("fetch", fetchMock);
    const view = render(<WorkspaceApifyConnectionBanner workspaceId="bp1" />);
    view.rerender(<WorkspaceApifyConnectionBanner workspaceId="bp2" />);
    await screen.findByRole("link", { name: "Connect Apify" });
    await act(async () => resolveOld(statusResponse({ connected: true, apiKeyConfigured: true })));
    expect(screen.getByRole("link", { name: "Connect Apify" })).toBeTruthy();
  });

  it("offers retry for failed status checks without claiming no account is connected", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(statusResponse({ connected: true, apiKeyConfigured: true }));
    vi.stubGlobal("fetch", fetchMock);
    render(<WorkspaceApifyConnectionBanner workspaceId="bp1" />);
    await screen.findByText("Could not check the Apify connection");
    expect(screen.queryByText(/has no Apify account/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Retry connection check" }));
    await waitFor(() => expect(screen.queryByLabelText("Apify workspace setup")).toBeNull());
  });

  it.each([
    "/dashboard/apify",
    "/dashboard/onboarding",
    "/dashboard/usage",
    "/dashboard/publishing/schedules",
  ])("avoids a duplicate prompt on %s", async (pathname) => {
    mocks.pathname = pathname;
    const fetchMock = vi.fn().mockResolvedValue(statusResponse({ connected: false }));
    vi.stubGlobal("fetch", fetchMock);
    render(<WorkspaceApifyConnectionBanner workspaceId="bp1" />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(screen.queryByLabelText("Apify workspace setup")).toBeNull();
  });
});
