import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DefaultDashboardPayload } from "@actorconsole/shared/default-dashboard";

const { push, refresh, navigate } = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
  navigate: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));
vi.mock("@/lib/client-navigation", () => ({ navigateInApp: navigate }));
vi.mock("@/components/charts/chart-system", () => ({
  ChartFrame: () => <div>Daily earnings chart</div>,
  ChartTooltip: () => null,
}));
import { DefaultDashboard } from "./default-dashboard";

const values = { revenueUsd: 50, usageCostUsd: 10, earningsUsd: 40, runs: 4 };
const payload: DefaultDashboardPayload = {
  from: "2026-10-07",
  to: "2026-10-08",
  timeZone: "UTC",
  billingMonth: "2026-10",
  currentBillingRevenueUsd: 250,
  billingWorkspacesCovered: 1,
  summary: values,
  partial: true,
  daily: [{ date: "2026-10-07", ...values, workspacesCovered: 1 }],
  workspaces: [
    {
      id: "w1",
      name: "Production",
      ...values,
      currentBillingRevenueUsd: 250,
      syncedAt: null,
      revenueAvailable: true,
      usageAvailable: true,
      partial: false,
    },
    {
      id: "w2",
      name: "Research",
      revenueUsd: null,
      usageCostUsd: null,
      earningsUsd: null,
      runs: 0,
      currentBillingRevenueUsd: null,
      syncedAt: null,
      revenueAvailable: false,
      usageAvailable: false,
      partial: true,
    },
  ],
};

describe("Default dashboard", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });
  it("renders combined metrics, daily history, and missing workspace data", () => {
    render(<DefaultDashboard payload={payload} />);
    expect(screen.getByText("Earnings, usage, and revenue across your 2 workspaces.")).toBeTruthy();
    expect(screen.getByText("2026-10-07")).toBeTruthy();
    expect(screen.getByText("Incomplete data")).toBeTruthy();
    expect(screen.getAllByText("—")).toHaveLength(4);
    expect(screen.getByText(/Some workspaces have incomplete/)).toBeTruthy();
    expect(screen.getAllByText("$40.00")).toHaveLength(3);
  });
  it("applies a date range through the Default URL", () => {
    render(<DefaultDashboard payload={payload} />);
    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2026-10-01" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(push).toHaveBeenCalledWith("/dashboard/default?from=2026-10-01&to=2026-10-08");
  });
  it("rejects a reversed date range without navigation", () => {
    render(<DefaultDashboard payload={payload} />);
    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2026-10-09" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(screen.getByRole("alert").textContent).toContain("1 to 370 days");
    expect(push).not.toHaveBeenCalled();
  });
  it("opens a real workspace through the authenticated selection endpoint", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ ok: true })));
    render(<DefaultDashboard payload={payload} />);
    fireEvent.click(screen.getByRole("button", { name: "Open Research" }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/dashboard"));
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining("/w2/select"), {
      method: "POST",
      credentials: "include",
    });
  });
  it("keeps Default visible and offers retry if workspace selection fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({}, { status: 500 })));
    render(<DefaultDashboard payload={payload} />);
    fireEvent.click(screen.getByRole("button", { name: "Open Research" }));
    await screen.findByText("Could not open the workspace. Try again.");
    expect(navigate).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Open Research" }).hasAttribute("disabled")).toBe(
      false,
    );
  });
});
