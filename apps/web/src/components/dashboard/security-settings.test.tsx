import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SecuritySettings } from "./security-settings";

const ok = (data: object) => new Response(JSON.stringify({ ok: true, data }));
const failure = (message: string, code = "invalid_code", status = 400) =>
  new Response(JSON.stringify({ ok: false, error: { message, code } }), { status });
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
describe("security settings", () => {
  it("retries status loading and walks setup, invalid-code recovery, regeneration and disabling", async () => {
    const codes = ["AAAA-BBBB", "CCCC-DDDD"];
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(failure("Status unavailable", "unavailable", 503))
      .mockResolvedValueOnce(ok({ enabled: false, setupPending: false, recoveryCodesRemaining: 0 }))
      .mockResolvedValueOnce(ok({ secret: "JBSWY3DPEHPK3PXP" }))
      .mockResolvedValueOnce(failure("Invalid authenticator code"))
      .mockResolvedValueOnce(ok({ enabled: true, recoveryCodes: codes }))
      .mockResolvedValueOnce(failure("Invalid or used recovery code"))
      .mockResolvedValueOnce(ok({ recoveryCodes: ["EEEE-FFFF", "GGGG-HHHH"] }))
      .mockResolvedValueOnce(ok({ enabled: false }));
    vi.stubGlobal("fetch", fetcher);
    render(<SecuritySettings />);
    await screen.findByText("Status unavailable");
    fireEvent.click(screen.getByRole("button", { name: /Retry|Try again/i }));
    fireEvent.click(await screen.findByRole("button", { name: "Set up authenticator" }));
    await screen.findByLabelText("Authenticator setup key");
    fireEvent.change(screen.getByLabelText(/Enter the six-digit/), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Enable two-factor authentication" }));
    await screen.findByText("Invalid authenticator code");
    expect((screen.getByLabelText(/Enter the six-digit/) as HTMLInputElement).value).toBe("123456");
    fireEvent.click(screen.getByRole("button", { name: "Enable two-factor authentication" }));
    await screen.findByRole("list", { name: "New recovery codes" });
    expect(screen.getByText("2 unused recovery codes remaining.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "I saved my recovery codes" }));
    expect(screen.queryByText(codes[0])).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Regenerate recovery codes" }));
    fireEvent.change(screen.getByLabelText("Authenticator or unused recovery code"), {
      target: { value: "AAAA-BBBB" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Generate new recovery codes" }));
    expect((await within(screen.getByRole("dialog")).findByRole("alert")).textContent).toContain(
      "Invalid or used",
    );
    fireEvent.click(screen.getByRole("button", { name: "Generate new recovery codes" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByText("EEEE-FFFF")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Turn off two-factor authentication" }));
    fireEvent.change(screen.getByLabelText("Authenticator or unused recovery code"), {
      target: { value: "123456" },
    });
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Turn off two-factor authentication",
      }),
    );
    await screen.findByText("Two-factor authentication is turned off.");
    expect(screen.queryByText("EEEE-FFFF")).toBeNull();
  });

  it("explains recent sign-in requirements and never claims setup succeeded", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          ok({ enabled: false, setupPending: false, recoveryCodesRemaining: 0 }),
        )
        .mockResolvedValueOnce(failure("Sign in again", "reauthentication_required", 403)),
    );
    render(<SecuritySettings />);
    fireEvent.click(await screen.findByRole("button", { name: "Set up authenticator" }));
    await screen.findByRole("button", { name: "Sign out and sign in again" });
    expect(screen.queryByLabelText("Authenticator setup key")).toBeNull();
  });
});
