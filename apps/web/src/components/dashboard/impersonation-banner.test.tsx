import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ImpersonationBanner } from "./impersonation-banner";

const status = {
  user: { id: "user_1", name: "Workspace owner", email: "owner@example.com" },
  expiresAt: new Date(Date.now() + 900_000).toISOString(),
};
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("Mimic session banner", () => {
  it("renders the target identity immediately and provides an exit on every page", () => {
    render(<ImpersonationBanner status={status} />);
    expect(screen.getByRole("region", { name: "Mimic user session" }).textContent).toContain(
      "You are currently seeing the page as Workspace owner.",
    );
    expect(screen.getByText("(owner@example.com)")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Return to admin" })).toBeTruthy();
  });
  it("does not appear for a normal user session", () => {
    render(<ImpersonationBanner status={null} />);
    expect(screen.queryByRole("region")).toBeNull();
  });
  it("keeps the banner and enables retry when return fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ ok: false, error: "Session service unavailable" }, { status: 503 }),
        ),
    );
    render(<ImpersonationBanner status={status} />);
    fireEvent.click(screen.getByRole("button", { name: "Return to admin" }));
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain("Session service unavailable"),
    );
    expect(
      (screen.getByRole("button", { name: "Return to admin" }) as HTMLButtonElement).disabled,
    ).toBe(false);
    expect(screen.getByRole("region", { name: "Mimic user session" })).toBeTruthy();
  });
  it("automatically requests admin restoration as the mimic session expires", async () => {
    vi.useFakeTimers();
    const fetch = vi
      .fn()
      .mockResolvedValue(Response.json({ ok: false, error: "Retry" }, { status: 503 }));
    vi.stubGlobal("fetch", fetch);
    render(
      <ImpersonationBanner
        status={{ ...status, expiresAt: new Date(Date.now() + 10_000).toISOString() }}
      />,
    );
    await vi.advanceTimersByTimeAsync(5_000);
    expect(fetch).toHaveBeenCalledWith("/api/admin/impersonate/exit", { method: "POST" });
  });
});
