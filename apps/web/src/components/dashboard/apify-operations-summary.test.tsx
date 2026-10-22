import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ApifyOperationsSummaryLoader,
  ApifyOperationsSummaryPanel,
} from "./apify-operations-summary";
import { DASHBOARD_STATUS_CHANGED_EVENT } from "@/components/dashboard/dashboard-navigation";
import { WorkspaceAccessContext } from "./workspace-access-context";
import { workspacePlanUsage } from "@actorconsole/shared/plans";

describe("Apify operations summary", () => {
  it("hides operational summaries on the always-available connection page when Pro is required", () => {
    vi.stubGlobal("fetch", vi.fn());
    const { container } = render(
      <WorkspaceAccessContext.Provider
        value={{
          access: {
            workspaceId: "w1",
            plan: "FREE",
            restricted: true,
            usage: workspacePlanUsage("FREE", 51, 100),
          },
          loading: false,
          error: false,
          refresh: vi.fn(),
        }}
      >
        <ApifyOperationsSummaryLoader />
      </WorkspaceAccessContext.Provider>,
    );
    expect(container.textContent).toBe("");
    expect(fetch).not.toHaveBeenCalled();
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("renders immediately with a loader and replaces it with live operations", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            ok: true,
            data: {
              connected: true,
              api: { configured: true, available: true, inventory: { actors: 863 } },
              console: null,
            },
          }),
          { status: 200 },
        ),
      ),
    );

    render(<ApifyOperationsSummaryLoader />);

    expect(screen.getByLabelText("Loading Apify surfaces")).toBeTruthy();
    expect(await screen.findByText("863")).toBeTruthy();
    expect(screen.queryByLabelText("Loading Apify surfaces")).toBeNull();
  });

  it("renders API and Console resources from independent live surfaces", () => {
    render(
      <ApifyOperationsSummaryPanel
        data={{
          connected: true,
          api: {
            configured: true,
            available: true,
            inventory: {
              actors: 863,
              runs: 4200,
              datasets: 180,
              keyValueStores: 170,
              requestQueues: 92,
            },
          },
          console: {
            configured: true,
            available: true,
            sections: {
              organizations: { available: true, count: 2 },
              proxy: { available: true, billingCycles: 3 },
              billing: { available: true, serviceGroups: 4 },
              notifications: { available: true, total: 12, unread: 5 },
            },
          },
        }}
      />,
    );

    expect(screen.getByText("Connected Apify surfaces")).toBeTruthy();
    expect(screen.getByText("863")).toBeTruthy();
    expect(screen.getByText("4,200")).toBeTruthy();
    expect(screen.getByText(/Apify Console feed · 5 unread/)).toBeTruthy();
    expect(screen.getByText("API: live")).toBeTruthy();
    expect(screen.getByText("Console: live")).toBeTruthy();
  });

  it("refreshes manually and after a dashboard status change", async () => {
    const responseFor = (actors: number) =>
      new Response(
        JSON.stringify({
          ok: true,
          data: {
            connected: true,
            api: { configured: true, available: true, inventory: { actors } },
            console: null,
          },
        }),
        { status: 200 },
      );
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(responseFor(1))
      .mockResolvedValueOnce(responseFor(2))
      .mockResolvedValueOnce(responseFor(3));
    vi.stubGlobal("fetch", fetchMock);

    render(<ApifyOperationsSummaryLoader />);

    expect(await screen.findByText("1")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Refresh live Apify data" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("2")).toBeTruthy();

    window.dispatchEvent(new Event(DASHBOARD_STATUS_CHANGED_EVENT));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(await screen.findByText("3")).toBeTruthy();
  });

  it("keeps API inventory visible when Console authentication is unavailable", () => {
    render(
      <ApifyOperationsSummaryPanel
        data={{
          connected: true,
          api: { configured: true, available: true, inventory: { actors: 12, runs: 40 } },
          console: { configured: true, available: false, sections: {} },
        }}
      />,
    );

    expect(screen.getByText("12")).toBeTruthy();
    expect(screen.getByText("40")).toBeTruthy();
    expect(screen.getByText("API: live")).toBeTruthy();
    expect(screen.getByText("Console: unavailable")).toBeTruthy();
    expect(
      screen.getByText(
        /Reconnect the Apify session; the API key and API inventory can continue working/i,
      ),
    ).toBeTruthy();
  });
});
