import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));
vi.mock("@/lib/server-api", () => ({ authenticatedServerFetch: mocks.fetch }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
  usePathname: () => "/dashboard/billing/history",
  useSearchParams: () => new URLSearchParams(),
  redirect: mocks.redirect,
}));
import BillingPage from "../../src/app/(dashboard)/dashboard/settings/billing/page";
import PaymentHistoryPage from "../../src/app/(dashboard)/dashboard/billing/history/page";
import { isOnboardingExemptPath } from "@/components/dashboard/onboarding-gate";
import { isRestrictedDashboardPath } from "@actorconsole/shared/workspace-access";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
function response(data: unknown) {
  return new Response(JSON.stringify({ ok: true, data }));
}
const data = {
  workspace: { id: "workspace-1", name: "My workspace" },
  plan: "FREE",
  subscriptions: [],
  billingAddresses: null,
  payments: [
    {
      id: "payment-1",
      amount: "19",
      currency: "USD",
      description: "Pro monthly",
      status: "captured",
      createdAt: "2026-10-01T10:00:00Z",
      billingMode: "test",
    },
  ],
  paymentsPagination: { total: 30, page: 1, limit: 25 },
};

describe("billing pages", () => {
  it("keeps the billing landing page focused on plans, with links to history and support", async () => {
    mocks.fetch.mockImplementation((url: string) =>
      Promise.resolve(response(url.includes("payment-gateways") ? [] : data)),
    );
    render(await BillingPage({}));
    expect(screen.getByText("You are currently on the Free plan.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Payment history" }).getAttribute("href")).toBe(
      "/dashboard/billing/history",
    );
    expect(screen.getByText("Compare Free and Pro")).toBeTruthy();
    expect(screen.queryByText("Pro monthly")).toBeNull();
    expect(screen.queryByLabelText("Address")).toBeNull();
  });
  it.each(["month", "year"])(
    "returns new accounts to billing after workspace creation (%s)",
    async (interval) => {
      mocks.fetch.mockImplementation((url: string) =>
        Promise.resolve(
          url.includes("payment-gateways")
            ? response([])
            : new Response(JSON.stringify({ error: { code: "workspace_required" } }), {
                status: 409,
              }),
        ),
      );
      await expect(BillingPage({ searchParams: Promise.resolve({ interval }) })).rejects.toThrow(
        `REDIRECT:/dashboard/onboarding?callbackUrl=${encodeURIComponent(interval === "year" ? "/dashboard/billing?interval=year" : "/dashboard/billing")}`,
      );
    },
  );

  it("loads workspace payment history with its own pagination URLs and test-payment labels", async () => {
    mocks.fetch.mockResolvedValue(response(data));
    render(await PaymentHistoryPage({ searchParams: Promise.resolve({}) }));
    expect(mocks.fetch).toHaveBeenCalledWith("/account/billing-overview?page=1&limit=25");
    expect(screen.getByText("Pro monthly")).toBeTruthy();
    expect(screen.getByText("$19.00")).toBeTruthy();
    expect(screen.getByText("Test payment")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Next/ }).getAttribute("href")).toBe(
      "/dashboard/billing/history?page=2&limit=25",
    );
    expect(screen.getByRole("link", { name: "Back to billing" }).getAttribute("href")).toBe(
      "/dashboard/billing",
    );
    expect(mocks.fetch).toHaveBeenCalledOnce();
  });
  it("shows an honest empty history without plan or address controls", async () => {
    mocks.fetch.mockResolvedValue(
      response({ ...data, payments: [], paymentsPagination: { total: 0, page: 1, limit: 25 } }),
    );
    render(await PaymentHistoryPage({ searchParams: Promise.resolve({}) }));
    expect(screen.getByText("No payments yet.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Upgrade to Pro" })).toBeNull();
    expect(screen.queryByLabelText("Address")).toBeNull();
  });
  it.each(["1.5", "-1", "garbage", "100001"])(
    "normalizes invalid history page %s",
    async (page) => {
      mocks.fetch.mockResolvedValue(response(data));
      await PaymentHistoryPage({ searchParams: Promise.resolve({ page, limit: "10" }) });
      expect(mocks.fetch).toHaveBeenCalledWith("/account/billing-overview?page=1&limit=10");
    },
  );
  it("redirects out-of-range pages to the last workspace history page", async () => {
    mocks.fetch.mockResolvedValue(
      response({ ...data, payments: [], paymentsPagination: { total: 30, page: 9, limit: 25 } }),
    );
    await expect(
      PaymentHistoryPage({ searchParams: Promise.resolve({ page: "9" }) }),
    ).rejects.toThrow("REDIRECT:/dashboard/billing/history?page=2&limit=25");
  });
  it("surfaces API errors instead of reporting no payments", async () => {
    mocks.fetch.mockResolvedValue(new Response("Unavailable", { status: 503 }));
    await expect(PaymentHistoryPage({ searchParams: Promise.resolve({}) })).rejects.toThrow(
      "Could not load payment history",
    );
  });
  it.each(["/dashboard/billing/history", "/dashboard/settings/billing/history"])(
    "keeps %s accessible without an Apify connection or within a restricted Free workspace",
    (path) => {
      expect(isOnboardingExemptPath(path)).toBe(true);
      expect(isRestrictedDashboardPath(path)).toBe(false);
    },
  );
});
