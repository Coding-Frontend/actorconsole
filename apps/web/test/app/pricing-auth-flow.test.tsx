import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
  error: vi.fn(),
  success: vi.fn(),
  message: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
}));
vi.mock("sonner", () => ({
  toast: { error: mocks.error, success: mocks.success, message: mocks.message },
}));
vi.mock("@/components/auth/social-buttons", () => ({
  SocialButtons: ({ callbackUrl }: { callbackUrl: string }) => (
    <div data-testid="social-destination">{callbackUrl}</div>
  ),
}));
import SignupPage from "../../src/app/(auth)/signup/page";
import LoginPage from "../../src/app/(auth)/login/page";
import VerifyEmailPage from "../../src/app/(auth)/signup/verify-email/page";
import { EmailPasswordForm } from "@/components/auth/email-password-form";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.clearAllMocks();
  window.history.replaceState(null, "", "/");
});
function fillCredentials() {
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "new@example.com" } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "new-password" } });
}
describe("pricing to authentication", () => {
  it("preserves Pro intent for social signup and switching to login", () => {
    window.history.replaceState(null, "", "/signup?callbackUrl=%2Fdashboard%2Fbilling");
    render(<SignupPage />);
    expect(screen.getByTestId("social-destination").textContent).toBe("/dashboard/billing");
    expect(screen.getByRole("link", { name: "Log in" }).getAttribute("href")).toBe(
      "/login?callbackUrl=%2Fdashboard%2Fbilling",
    );
    expect(screen.getByText(/50 actors and 500 monthly users free/)).toBeTruthy();
  });
  it("preserves Pro intent when switching from login to signup", async () => {
    render(
      await LoginPage({ searchParams: Promise.resolve({ callbackUrl: "/dashboard/billing" }) }),
    );
    expect(screen.getByRole("link", { name: "Sign up" }).getAttribute("href")).toBe(
      "/signup?callbackUrl=%2Fdashboard%2Fbilling",
    );
    expect(screen.getByTestId("social-destination").textContent).toBe("/dashboard/billing");
  });
  it.each(["signup", "login"] as const)(
    "keeps billing as the email-verification destination after %s",
    async (mode) => {
      vi.stubGlobal(
        "fetch",
        vi
          .fn()
          .mockResolvedValue(
            new Response(
              JSON.stringify(
                mode === "signup" ? { ok: true } : { ok: false, code: "EMAIL_UNVERIFIED" },
              ),
            ),
          ),
      );
      render(<EmailPasswordForm mode={mode} callbackUrl="/dashboard/billing" />);
      fillCredentials();
      fireEvent.click(
        screen.getByRole("button", {
          name: mode === "signup" ? "Create account" : "Sign in with email",
        }),
      );
      await waitFor(() =>
        expect(mocks.push).toHaveBeenCalledWith(
          "/signup/verify-email?email=new%40example.com&callbackUrl=%2Fdashboard%2Fbilling",
        ),
      );
    },
  );
  it("returns an existing customer to billing after password login", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }))));
    render(<EmailPasswordForm mode="login" callbackUrl="/dashboard/billing" />);
    fillCredentials();
    fireEvent.click(screen.getByRole("button", { name: "Sign in with email" }));
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/dashboard/billing"));
  });
  it.each(["/dashboard/billing", "https://evil.example.com"])(
    "verifies email with a safe return destination: %s",
    async (destination) => {
      vi.useFakeTimers();
      window.history.replaceState(
        null,
        "",
        `/signup/verify-email?email=new%40example.com&callbackUrl=${encodeURIComponent(destination)}`,
      );
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }))));
      render(<VerifyEmailPage />);
      fireEvent.change(screen.getByLabelText("Verification code"), { target: { value: "123456" } });
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Verify and continue" }));
      });
      expect(screen.getByText("Email verified")).toBeTruthy();
      await act(async () => {
        vi.advanceTimersByTime(800);
      });
      expect(mocks.push).toHaveBeenCalledWith(
        destination.startsWith("https:") ? "/dashboard" : destination,
      );
    },
  );
});
