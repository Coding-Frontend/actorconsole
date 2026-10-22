import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApifyExtensionConnect } from "./apify-extension-connect";

function bridge(type: string, payload: Record<string, unknown>) {
  window.dispatchEvent(new MessageEvent("message", {
    source: window,
    origin: window.location.origin,
    data: { source: "actorconsole-extension", type: `ACTORCONSOLE_APIFY_${type}`, payload },
  }));
}

const handoff = () => ({
  handoffId: "handoff-1",
  challenge: "challenge-value-that-is-long-enough-123456789",
  expiresAt: new Date(Date.now() + 300_000).toISOString(),
  workspace: { id: "workspace-1", name: "Primary workspace" },
  account: null,
});

async function start() {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Connect with extension" }));
  });
}

describe("extension connection recovery", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ ok: true, data: handoff() })));
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("offers a retry when a missing or stale content script never acknowledges the handoff", async () => {
    render(<ApifyExtensionConnect enabled onConnected={vi.fn()} />);
    await start();
    await act(async () => { await vi.advanceTimersByTimeAsync(20_000); });
    expect(screen.getByRole("alert").textContent).toContain("The extension did not respond. Reload this page");
    expect(screen.getByRole("button", { name: "Connect with extension" }).hasAttribute("disabled")).toBe(false);
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("keeps an acknowledged connection available for approval until the actual expiry", async () => {
    render(<ApifyExtensionConnect enabled onConnected={vi.fn()} />);
    await start();
    act(() => bridge("HANDOFF_REGISTERED", { handoffId: "handoff-1", ok: true }));
    await act(async () => { await vi.advanceTimersByTimeAsync(20_000); });
    expect(screen.getByText(/Approve cookie access at the top/)).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    await act(async () => { await vi.advanceTimersByTimeAsync(280_000); });
    expect(screen.getByRole("alert").textContent).toContain("connection expired");
  });

  it("ignores acknowledgements belonging to another connection", async () => {
    render(<ApifyExtensionConnect enabled onConnected={vi.fn()} />);
    await start();
    act(() => bridge("HANDOFF_REGISTERED", { handoffId: "other-handoff", ok: true }));
    await act(async () => { await vi.advanceTimersByTimeAsync(20_000); });
    expect(screen.getByRole("alert").textContent).toContain("extension did not respond");
  });

  it("preserves registration errors instead of replacing them with a timeout", async () => {
    render(<ApifyExtensionConnect enabled onConnected={vi.fn()} />);
    await start();
    act(() => bridge("HANDOFF_REGISTERED", { handoffId: "handoff-1", ok: false, error: "Reload Apify Console to detect your account." }));
    await act(async () => { await vi.advanceTimersByTimeAsync(300_000); });
    expect(screen.getByRole("alert").textContent).toBe("Reload Apify Console to detect your account.");
  });

  it("does not report expiry after a cookie was submitted while validation is in progress", async () => {
    const onConnected = vi.fn();
    let finish!: (response: Response) => void;
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ ok: true, data: handoff() }))
      .mockImplementationOnce(() => new Promise<Response>((resolve) => { finish = resolve; }));
    render(<ApifyExtensionConnect enabled apiKeyConfigured onConnected={onConnected} />);
    await start();
    act(() => bridge("HANDOFF_REGISTERED", { handoffId: "handoff-1", ok: true }));
    await act(async () => { await vi.advanceTimersByTimeAsync(299_000); });
    act(() => bridge("HANDOFF_COOKIE", {
      handoffId: "handoff-1", challenge: handoff().challenge,
      apifyRt: "test-refresh-cookie", expectedApifyUserId: "apifyUser123",
    }));
    await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByText("Validating the Apify Console session…")).toBeTruthy();
    await act(async () => finish(Response.json({ ok: true, data: { connected: true, apiKeyConfigured: true } })));
    expect(onConnected).toHaveBeenCalledWith({ connected: true, apiKeyConfigured: true });
    expect(screen.getByText("Apify Console access is connected to this workspace.")).toBeTruthy();
  });
});
