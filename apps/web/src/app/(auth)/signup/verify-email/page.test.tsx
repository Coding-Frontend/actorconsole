import type { ReactNode } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
  trackEvent: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
}));
vi.mock("@/lib/analytics-events", () => ({ trackEvent: mocks.trackEvent }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/components/auth/auth-frame", () => ({
  AuthFrame: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AuthBrandSteps: () => null,
}));
import VerifyEmailPage from "./page";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  vi.clearAllTimers();
  vi.useRealTimers();
  window.history.replaceState({}, "", "/");
});

describe("verified signup events", () => {
  it.each([true, false])(
    "only counts a verified account when verification succeeds: %s",
    async (ok) => {
      vi.useFakeTimers();
      window.history.replaceState(
        {},
        "",
        "/signup/verify-email?email=private@example.com",
      );
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({ json: async () => ({ ok }) }),
      );
      render(<VerifyEmailPage />);
      const email = screen.getByLabelText("Email");
      // Field values and codes stay in the auth request, never in Analytics.
      fireEvent.change(screen.getByLabelText(/Verification code/), {
        target: { value: "123456" },
      });
      await act(async () => {
        fireEvent.submit(email.closest("form")!);
      });
      if (ok) {
        expect(mocks.trackEvent.mock.calls).toEqual([
          ["sign_up", { method: "email" }],
          ["email_verified", { method: "email" }],
        ]);
        await act(async () => {
          vi.advanceTimersByTime(800);
        });
        expect(mocks.push).toHaveBeenCalledWith("/dashboard");
      } else {
        expect(mocks.trackEvent).not.toHaveBeenCalled();
        expect(mocks.push).not.toHaveBeenCalled();
      }
    },
  );
});
