import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/components/marketing/pricing-cards", () => ({
  PricingCards: ({ isAuthenticated }: { isAuthenticated: boolean }) => (
    <div data-testid="plans">{String(isAuthenticated)}</div>
  ),
}));
import PricingPage from "../../src/app/(marketing)/pricing/page";
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
describe("pricing page", () => {
  it.each([false, true])(
    "uses session-aware CTAs and the shared comparison (logged in=%s)",
    async (signedIn) => {
      mocks.auth.mockResolvedValue(signedIn ? { user: { id: "user-1" } } : null);
      render(await PricingPage());
      expect(screen.getByTestId("plans").textContent).toBe(String(signedIn));
      expect(screen.getByRole("heading", { name: "Compare Free and Pro" })).toBeTruthy();
      expect(
        screen
          .getByRole("link", { name: signedIn ? /Open dashboard/ : /Create a free account/ })
          .getAttribute("href"),
      ).toBe(signedIn ? "/dashboard" : "/signup");
      expect(screen.getByText(/enter your billing address/)).toBeTruthy();
    },
  );
});
