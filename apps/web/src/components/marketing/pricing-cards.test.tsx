import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ features: vi.fn(), offers: vi.fn() }));
vi.mock("@/lib/plan-marketing-features", () => ({ getPlanMarketingFeatures: mocks.features }));
vi.mock("@/lib/public-pro-offers", () => ({ getPublicProOffers: mocks.offers }));
import { PricingCards } from "./pricing-cards";

beforeEach(() => {
  mocks.features.mockResolvedValue({
    FREE: ["Apify synchronization"],
    PRO: ["Everything in Free"],
  });
  mocks.offers.mockResolvedValue([
    {
      gateway: { key: "stripe", name: "Stripe", mode: "live" },
      option: { interval: "month", amountMinor: 1900, currency: "USD" },
    },
    {
      gateway: { key: "dodo", name: "Dodo Payments", mode: "live" },
      option: { interval: "year", amountMinor: 19000, currency: "USD" },
    },
  ]);
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("public pricing cards", () => {
  it.each([true, false])(
    "sends logged-in users directly to dashboard or billing (homeGrid=%s)",
    async (homeGrid) => {
      render(await PricingCards({ homeGrid, isAuthenticated: true }));
      expect(screen.getByRole("link", { name: /Open dashboard/ }).getAttribute("href")).toBe(
        "/dashboard",
      );
      expect(screen.getByRole("link", { name: /Manage workspace plan/ }).getAttribute("href")).toBe(
        "/dashboard/billing",
      );
      expect(screen.queryByRole("link", { name: /Start free|Choose Pro/ })).toBeNull();
    },
  );
  it("preserves the billing destination for new Pro customers", async () => {
    render(await PricingCards({ homeGrid: true }));
    expect(screen.getByRole("link", { name: /Start free/ }).getAttribute("href")).toBe("/signup");
    expect(screen.getByRole("link", { name: /Choose Pro/ }).getAttribute("href")).toBe(
      "/signup?callbackUrl=%2Fdashboard%2Fbilling",
    );
  });
  it("shows configured monthly and full-year totals without provider choices", async () => {
    render(await PricingCards({ homeGrid: true }));
    expect((screen.getByRole("radio", { name: "Monthly" }) as HTMLInputElement).checked).toBe(true);
    expect(screen.getByText("$19.00")).toBeTruthy();
    expect(screen.getByText("Save 16%")).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: /Yearly/ }));
    expect(screen.getByText("$15.83")).toBeTruthy();
    expect(screen.getByText(/\$190\.00 billed yearly.*Charged for the full year/)).toBeTruthy();
    expect(screen.getByText(/50 actors · 500 monthly users/)).toBeTruthy();
    expect(screen.getByText("Unlimited actors and monthly users")).toBeTruthy();
    expect(screen.queryByText("Dodo Payments")).toBeNull();
  });
  it("does not advertise yearly checkout when only monthly is available", async () => {
    mocks.offers.mockResolvedValue([
      {
        gateway: { key: "dodo", name: "Dodo Payments", mode: "live" },
        option: { interval: "month", amountMinor: 1900, currency: "USD" },
      },
    ]);
    render(await PricingCards({}));
    expect(screen.queryByText("Yearly")).toBeNull();
    expect(screen.getByText("$19.00")).toBeTruthy();
  });
  it("keeps CTAs usable and does not invent prices when discovery is unavailable", async () => {
    mocks.offers.mockResolvedValue([]);
    render(await PricingCards({ homeGrid: true, isAuthenticated: true }));
    expect(screen.getByText(/Current prices and available billing frequencies/)).toBeTruthy();
    expect(screen.getByRole("link", { name: /Manage workspace plan/ }).getAttribute("href")).toBe(
      "/dashboard/billing",
    );
    expect(screen.queryByText(/\$19/)).toBeNull();
  });
  it.each([true, false])(
    "preserves yearly intent into billing (signed in=%s)",
    async (isAuthenticated) => {
      render(await PricingCards({ isAuthenticated }));
      fireEvent.click(screen.getByRole("radio", { name: /Yearly/ }));
      expect(
        screen
          .getByRole("link", { name: isAuthenticated ? /Manage workspace plan/ : /Choose Pro/ })
          .getAttribute("href"),
      ).toBe(
        isAuthenticated
          ? "/dashboard/billing?interval=year"
          : "/signup?callbackUrl=%2Fdashboard%2Fbilling%3Finterval%3Dyear",
      );
      fireEvent.click(screen.getByRole("radio", { name: "Monthly" }));
      expect(
        screen
          .getByRole("link", { name: isAuthenticated ? /Manage workspace plan/ : /Choose Pro/ })
          .getAttribute("href"),
      ).toBe(isAuthenticated ? "/dashboard/billing" : "/signup?callbackUrl=%2Fdashboard%2Fbilling");
    },
  );
});
