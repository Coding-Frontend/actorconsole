import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
  signInWithGoogle: vi.fn(),
  signInWithGitHub: vi.fn(),
  exchangeFirebaseToken: vi.fn(),
  error: vi.fn(),
  message: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
}));
vi.mock("sonner", () => ({
  toast: { error: mocks.error, message: mocks.message },
}));
vi.mock("@/lib/firebase", () => ({
  signInWithGoogle: (...args: unknown[]) => mocks.signInWithGoogle(...args),
  signInWithGitHub: (...args: unknown[]) => mocks.signInWithGitHub(...args),
  exchangeFirebaseToken: (...args: unknown[]) => mocks.exchangeFirebaseToken(...args),
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

    expect(screen.getByRole("button", { name: "Continue with Google" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Continue with GitHub" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));

    await waitFor(() => expect(mocks.exchangeFirebaseToken).toHaveBeenCalledWith({}, firebaseUser));
    expect(mocks.push).toHaveBeenCalledWith("/admin");
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it("completes a GitHub session exchange", async () => {
    const firebaseUser = { uid: "github-firebase-user" };
    mocks.signInWithGitHub.mockResolvedValue({ user: firebaseUser });
    mocks.exchangeFirebaseToken.mockResolvedValue({ ok: true });

    render(<SocialButtons />);
    fireEvent.click(screen.getByRole("button", { name: "Continue with GitHub" }));

    await waitFor(() => expect(mocks.exchangeFirebaseToken).toHaveBeenCalledWith({}, firebaseUser));
    expect(mocks.push).toHaveBeenCalledWith("/dashboard");
  });

  it.each([
    ["Google", mocks.signInWithGoogle],
    ["GitHub", mocks.signInWithGitHub],
  ])("stops loading after the %s popup closes without settling", async (provider, signIn) => {
    vi.useFakeTimers();
    signIn.mockImplementation(() => new Promise(() => {}));
    render(<SocialButtons />);

    fireEvent.click(screen.getByRole("button", { name: `Continue with ${provider}` }));
    expect(screen.getByRole("button", { name: `Continue with ${provider}` }).hasAttribute("disabled")).toBe(true);

    await act(async () => {
      window.dispatchEvent(new Event("blur"));
      window.dispatchEvent(new Event("focus"));
      vi.advanceTimersByTime(2000);
      await Promise.resolve();
    });

    expect(screen.getByRole("button", { name: "Continue with Google" }).hasAttribute("disabled")).toBe(false);
    expect(screen.getByRole("button", { name: "Continue with GitHub" }).hasAttribute("disabled")).toBe(false);
    expect(mocks.exchangeFirebaseToken).not.toHaveBeenCalled();
    expect(mocks.error).not.toHaveBeenCalled();
  });
});
