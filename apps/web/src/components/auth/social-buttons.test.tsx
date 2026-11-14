import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
  signInWithGoogle: vi.fn(),
  signInWithGitHub: vi.fn(),
  exchangeFirebaseToken: vi.fn(),
  error: vi.fn(),
  message: vi.fn(),
  trackEvent: vi.fn(),
}));
vi.mock("@/lib/analytics-events", () => ({ trackEvent: mocks.trackEvent }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
}));
vi.mock("sonner", () => ({
  toast: { error: mocks.error, message: mocks.message },
}));
vi.mock("@/lib/firebase", () => ({
  signInWithGoogle: (...args: unknown[]) => mocks.signInWithGoogle(...args),
  signInWithGitHub: (...args: unknown[]) => mocks.signInWithGitHub(...args),
  exchangeFirebaseToken: (...args: unknown[]) =>
    mocks.exchangeFirebaseToken(...args),
}));

import { SocialButtons } from "./social-buttons";

describe("SocialButtons", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.resetAllMocks();
  });

  it("offers Google and GitHub and completes a Google session exchange", async () => {
    const firebaseUser = { uid: "firebase-user" };
    mocks.signInWithGoogle.mockResolvedValue({ user: firebaseUser });
    mocks.exchangeFirebaseToken.mockResolvedValue({ ok: true });

    render(<SocialButtons callbackUrl="/admin" />);

    expect(
      screen.getByRole("button", { name: "Continue with Google" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Continue with GitHub" }),
    ).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", { name: "Continue with Google" }),
    );

    await waitFor(() =>
      expect(mocks.exchangeFirebaseToken).toHaveBeenCalledWith(
        {},
        firebaseUser,
      ),
    );
    expect(mocks.push).toHaveBeenCalledWith("/admin");
    expect(mocks.refresh).toHaveBeenCalledOnce();
    expect(mocks.trackEvent).toHaveBeenCalledWith("login", {
      method: "google",
    });
  });

  it("completes a GitHub session exchange", async () => {
    const firebaseUser = { uid: "github-firebase-user" };
    mocks.signInWithGitHub.mockResolvedValue({ user: firebaseUser });
    mocks.exchangeFirebaseToken.mockResolvedValue({ ok: true });

    render(<SocialButtons />);
    fireEvent.click(
      screen.getByRole("button", { name: "Continue with GitHub" }),
    );

    await waitFor(() =>
      expect(mocks.exchangeFirebaseToken).toHaveBeenCalledWith(
        {},
        firebaseUser,
      ),
    );
    expect(mocks.push).toHaveBeenCalledWith("/dashboard");
  });

  it("records a social signup only when the backend created a new application account", async () => {
    mocks.signInWithGitHub.mockResolvedValue({
      user: { uid: "new-firebase-user" },
    });
    mocks.exchangeFirebaseToken.mockResolvedValue({
      ok: true,
      isNewUser: true,
    });
    render(<SocialButtons />);
    fireEvent.click(
      screen.getByRole("button", { name: "Continue with GitHub" }),
    );
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/dashboard"));
    expect(mocks.trackEvent).toHaveBeenCalledOnce();
    expect(mocks.trackEvent).toHaveBeenCalledWith("sign_up", {
      method: "github",
    });
  });

  it("does not record a login while two-factor verification is pending", async () => {
    mocks.signInWithGoogle.mockResolvedValue({
      user: { uid: "firebase-user" },
    });
    mocks.exchangeFirebaseToken.mockResolvedValue({
      ok: true,
      requiresTwoFactor: true,
      challengeToken: "private-challenge",
    });
    render(<SocialButtons />);
    fireEvent.click(
      screen.getByRole("button", { name: "Continue with Google" }),
    );
    await screen.findByLabelText("Authenticator code");
    expect(mocks.trackEvent).not.toHaveBeenCalled();
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it.each([
    ["Google", mocks.signInWithGoogle],
    ["GitHub", mocks.signInWithGitHub],
  ])(
    "stops loading after the %s popup closes without settling",
    async (provider, signIn) => {
      vi.useFakeTimers();
      signIn.mockImplementation(() => new Promise(() => {}));
      render(<SocialButtons />);

      fireEvent.click(
        screen.getByRole("button", { name: `Continue with ${provider}` }),
      );
      expect(
        screen
          .getByRole("button", { name: `Continue with ${provider}` })
          .getAttribute("aria-busy"),
      ).toBe("true");

      await act(async () => {
        window.dispatchEvent(new Event("blur"));
        window.dispatchEvent(new Event("focus"));
        vi.advanceTimersByTime(2000);
        await Promise.resolve();
      });

      expect(
        screen
          .getByRole("button", { name: "Continue with Google" })
          .hasAttribute("disabled"),
      ).toBe(false);
      expect(
        screen
          .getByRole("button", { name: "Continue with GitHub" })
          .hasAttribute("disabled"),
      ).toBe(false);
      expect(mocks.exchangeFirebaseToken).not.toHaveBeenCalled();
      expect(mocks.error).not.toHaveBeenCalled();
    },
  );
});
