import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EmailPasswordForm } from "./email-password-form";

const navigation = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
const analytics = vi.hoisted(() => ({ trackEvent: vi.fn() }));
vi.mock("@/lib/analytics-events", () => analytics);
vi.mock("next/navigation", () => ({ useRouter: () => navigation }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn(), message: vi.fn() } }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

async function challenge() {
  render(<EmailPasswordForm mode="login" />);
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "audit@example.com" } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "fixture-password" } });
  fireEvent.submit(screen.getByRole("button", { name: "Sign in with email" }).closest("form")!);
  await screen.findByLabelText("Authenticator code");
}

describe("email/password verification UI", () => {
  it.each(["123456", "recovery-code-text"])(
    "submits %s from the displayed verification step",
    async (code) => {
      const fetcher = vi
        .fn()
        .mockResolvedValueOnce({
          json: async () => ({
            ok: true,
            requiresTwoFactor: true,
            challengeToken: "fixture-challenge",
          }),
        })
        .mockResolvedValue({ json: async () => ({ ok: true }) });
      vi.stubGlobal("fetch", fetcher);
      await challenge();
      expect(analytics.trackEvent).not.toHaveBeenCalled();
      // DOM availability can precede React's passive focus effect.
      await waitFor(() =>
        expect(document.activeElement).toBe(screen.getByLabelText("Authenticator code")),
      );
      fireEvent.change(screen.getByLabelText("Authenticator code"), { target: { value: code } });
      const button = screen.getByRole("button", { name: "Verify and continue" });
      expect(button.getAttribute("type")).toBe("submit");
      fireEvent.submit(button.closest("form")!);
      await waitFor(() => expect(navigation.push).toHaveBeenCalledWith("/dashboard"));
      expect(analytics.trackEvent).toHaveBeenCalledOnce();
      expect(analytics.trackEvent).toHaveBeenCalledWith("login", { method: "email" });
      expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({
        email: "audit@example.com",
        password: "fixture-password",
        totpCode: code,
        challengeToken: "fixture-challenge",
      });
    },
  );

  it.each([new TypeError("Network unavailable"), new SyntaxError("Invalid JSON")])(
    "handles interrupted verification and preserves retry input",
    async (failure) => {
      const fetcher = vi
        .fn()
        .mockResolvedValueOnce({
          json: async () => ({
            ok: true,
            requiresTwoFactor: true,
            challengeToken: "fixture-challenge",
          }),
        })
        .mockRejectedValueOnce(failure)
        .mockResolvedValue({ json: async () => ({ ok: true }) });
      vi.stubGlobal("fetch", fetcher);
      await challenge();
      fireEvent.change(screen.getByLabelText("Authenticator code"), {
        target: { value: "123456" },
      });
      fireEvent.submit(screen.getByLabelText("Authenticator code").closest("form")!);
      expect((await screen.findByRole("alert")).textContent).toContain(failure.message);
      expect((screen.getByLabelText("Authenticator code") as HTMLInputElement).value).toBe(
        "123456",
      );
      expect(navigation.push).not.toHaveBeenCalled();
      fireEvent.submit(screen.getByLabelText("Authenticator code").closest("form")!);
      await waitFor(() => expect(navigation.push).toHaveBeenCalledWith("/dashboard"));
      expect(JSON.parse(fetcher.mock.calls[2][1].body).challengeToken).toBe("fixture-challenge");
    },
  );

  it("ignores empty codes and repeated pending submits", async () => {
    let finish!: (value: unknown) => void;
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce({
        json: async () => ({
          ok: true,
          requiresTwoFactor: true,
          challengeToken: "fixture-challenge",
        }),
      })
      .mockImplementation(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      );
    vi.stubGlobal("fetch", fetcher);
    await challenge();
    const form = screen.getByLabelText("Authenticator code").closest("form")!;
    fireEvent.submit(form);
    expect(fetcher).toHaveBeenCalledTimes(1);
    fireEvent.change(screen.getByLabelText("Authenticator code"), { target: { value: "123456" } });
    act(() => {
      fireEvent.submit(form);
      fireEvent.submit(form);
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
    await act(async () => finish({ json: async () => ({ ok: false, error: "Code expired" }) }));
    expect(screen.getByRole("alert").textContent).toContain("Code expired");
  });
});
