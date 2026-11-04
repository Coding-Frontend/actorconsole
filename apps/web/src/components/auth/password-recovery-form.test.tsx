import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PasswordRecoveryForm } from "./password-recovery-form";

const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
const response = (status: number, body: object) => new Response(JSON.stringify(body), { status });
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  push.mockReset();
});

describe("password recovery", () => {
  it("keeps the email step on HTTP, malformed response and network failures, then allows retry", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(response(503, { error: "Recovery unavailable" }))
      .mockResolvedValueOnce(new Response("<html>Proxy failure</html>"))
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValue(response(200, { ok: true }));
    vi.stubGlobal("fetch", fetcher);
    render(<PasswordRecoveryForm />);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "fixture@example.test" } });
    for (const message of ["Recovery unavailable", "could not be completed", "Could not reach"]) {
      fireEvent.click(screen.getByRole("button", { name: "Send reset code" }));
      expect((await screen.findByRole("alert")).textContent).toContain(message);
      expect(screen.queryByLabelText("Reset code")).toBeNull();
      expect(document.activeElement).toBe(screen.getByRole("alert"));
    }
    fireEvent.click(screen.getByRole("button", { name: "Send reset code" }));
    await screen.findByLabelText("Reset code");
    expect(screen.getByRole("status").textContent).toContain("If this email is registered");
    fireEvent.click(screen.getByRole("button", { name: "Change email" }));
    expect((screen.getByLabelText("Email") as HTMLInputElement).value).toBe("fixture@example.test");
  });

  it("preserves entries after an invalid code and resets successfully; supports resend and email correction", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const fetcher = vi.fn().mockImplementation(() => Promise.resolve(response(200, { ok: true })));
    vi.stubGlobal("fetch", fetcher);
    render(<PasswordRecoveryForm />);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "fixture@example.test" } });
    fireEvent.click(screen.getByRole("button", { name: "Send reset code" }));
    await screen.findByLabelText("Reset code");
    expect(
      (screen.getByRole("button", { name: /Resend code in/ }) as HTMLButtonElement).disabled,
    ).toBe(true);
    await act(async () => {
      vi.setSystemTime(Date.now() + 61_000);
      await new Promise((resolve) => setTimeout(resolve, 1050));
    });
    fireEvent.click(screen.getByRole("button", { name: "Resend code" }));
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    fireEvent.change(screen.getByLabelText("Reset code"), { target: { value: "123456" } });
    fireEvent.change(screen.getByLabelText("New password"), {
      target: { value: "Fixture-password-123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Show new password" }));
    expect(screen.getByLabelText("New password").getAttribute("type")).toBe("text");
    fetcher.mockResolvedValueOnce(response(400, { error: "Invalid or expired code" }));
    fireEvent.click(screen.getByRole("button", { name: "Set new password" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Invalid or expired");
    expect((screen.getByLabelText("Reset code") as HTMLInputElement).value).toBe("123456");
    expect(push).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Set new password" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/login?reset=success"));
    expect((screen.getByLabelText("New password") as HTMLInputElement).value).toBe("");
  });
});
