import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ExtensionPairClient } from "./pair-client";

const { signOut } = vi.hoisted(() => ({ signOut: vi.fn() }));
vi.mock("@/lib/session-client", () => ({ signOut }));
const challenge = "a".repeat(64);
const account = { name: "Sample User", email: "sample@example.com" };
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });

beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks(); vi.useRealTimers(); });

describe("browser authorization screen", () => {
  it("shows the account and waits for explicit approval", () => {
    render(<ExtensionPairClient challenge={challenge} delivery="poll" account={account} />);
    expect(screen.getByText(account.email)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Authorize browser" })).toBeTruthy();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("cancels without creating a device credential", () => {
    render(<ExtensionPairClient challenge={challenge} delivery="poll" account={account} />);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("heading", { name: "Connection cancelled" })).toBeTruthy();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("authorizes once and confirms the extension has claimed its credential", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(json({ ok: true, data: { pairingId: "device-1" } }))
      .mockResolvedValueOnce(json({ ok: true, data: { status: "connected" } }));
    render(<ExtensionPairClient challenge={challenge} delivery="poll" account={account} />);
    fireEvent.click(screen.getByRole("button", { name: "Authorize browser" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Browser connected" })).toBeTruthy());
    expect(fetch).toHaveBeenNthCalledWith(1, expect.stringContaining("/extension-device/pair"), expect.objectContaining({
      credentials: "include", body: JSON.stringify({ challenge, delivery: "poll" }),
    }));
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("waits for actual redemption before showing success", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(json({ ok: true, data: { pairingId: "device-1" } }))
      .mockResolvedValueOnce(json({ ok: true, data: { status: "pending" } }));
    render(<ExtensionPairClient challenge={challenge} delivery="poll" account={account} />);
    fireEvent.click(screen.getByRole("button", { name: "Authorize browser" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("heading", { name: "Browser connected" })).toBeNull();
    expect(screen.getByText(/Waiting for the extension/)).toBeTruthy();
  });
  it("offers retry when approval fails", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(json({ ok: false, error: { message: "Sign in again" } }, 401));
    render(<ExtensionPairClient challenge={challenge} delivery="poll" account={account} />);
    fireEvent.click(screen.getByRole("button", { name: "Authorize browser" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("Sign in again"));
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
  });
  it("explains expired approval and lets the user retry", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(json({ ok: true, data: { pairingId: "device-1" } }))
      .mockResolvedValueOnce(json({ ok: true, data: { status: "expired" } }));
    render(<ExtensionPairClient challenge={challenge} delivery="poll" account={account} />);
    fireEvent.click(screen.getByRole("button", { name: "Authorize browser" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("expired"));
  });
  it("switches accounts and preserves the extension login callback", () => {
    render(<ExtensionPairClient challenge={challenge} delivery="poll" account={account} />);
    fireEvent.click(screen.getByRole("button", { name: "Use a different account" }));
    expect(signOut).toHaveBeenCalledWith({ redirectTo: `/login?callbackUrl=${encodeURIComponent(`/extension/pair?challenge=${challenge}&mode=poll`)}` });
  });
  it("does not trust a pairing message for another connection", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(json({ ok: true, data: { pairingId: "device-1", code: `acp_${challenge}` } }))
      .mockResolvedValueOnce(json({ ok: true, data: { status: "pending" } }));
    render(<ExtensionPairClient challenge={challenge} account={account} />);
    fireEvent.click(screen.getByRole("button", { name: "Authorize browser" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    act(() => window.dispatchEvent(new MessageEvent("message", {
      source: window, origin: window.location.origin,
      data: { source: "actorconsole-extension", type: "PAIR_RESULT", payload: { challenge: "wrong", ok: true } },
    })));
    expect(screen.queryByRole("heading", { name: "Browser connected" })).toBeNull();
  });
});
