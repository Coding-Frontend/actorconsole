import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SessionProvider, useSession } from "./session-client";
import { notifySessionChanged } from "./session-events";
function Probe() {
  const state = useSession();
  return <p>{state.data?.user?.id ?? state.status}</p>;
}
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("session refresh load controls", () => {
  it("refreshes immediately after sign-in and sign-out without waiting for focus", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(Response.json(null))
      .mockResolvedValueOnce(Response.json({ user: { id: "alice" } }))
      .mockResolvedValueOnce(Response.json(null));
    vi.stubGlobal("fetch", fetch);
    render(
      <SessionProvider>
        <Probe />
      </SessionProvider>,
    );
    await act(async () => {});
    expect(screen.getByText("unauthenticated")).toBeTruthy();
    await act(async () => notifySessionChanged());
    expect(screen.getByText("alice")).toBeTruthy();
    await act(async () => notifySessionChanged());
    expect(screen.queryByText("alice")).toBeNull();
    expect(screen.getByText("unauthenticated")).toBeTruthy();
    expect(fetch).toHaveBeenCalledTimes(3);
  });
  it("discards a pre-login session check that completes after the new session", async () => {
    let finishOld!: (response: Response) => void;
    const fetch = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            finishOld = resolve;
          }),
      )
      .mockResolvedValueOnce(Response.json({ user: { id: "alice" } }));
    vi.stubGlobal("fetch", fetch);
    render(
      <SessionProvider>
        <Probe />
      </SessionProvider>,
    );
    await act(async () => notifySessionChanged());
    expect(screen.getByText("alice")).toBeTruthy();
    await act(async () => finishOld(Response.json(null)));
    expect(screen.getByText("alice")).toBeTruthy();
  });
  it("collapses focus and visibility bursts, then revalidates after thirty seconds", async () => {
    const fetch = vi.fn().mockImplementation(async () => Response.json({ user: { id: "alice" } }));
    vi.stubGlobal("fetch", fetch);
    render(
      <SessionProvider>
        <Probe />
      </SessionProvider>,
    );
    await act(async () => {});
    expect(screen.getByText("alice")).toBeTruthy();
    act(() => {
      for (let i = 0; i < 10; i++) {
        window.dispatchEvent(new Event("focus"));
        document.dispatchEvent(new Event("visibilitychange"));
      }
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    await act(async () => vi.advanceTimersByTimeAsync(30_001));
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("does not share identity across separate provider lifetimes", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ user: { id: "alice" } }))
      .mockResolvedValueOnce(Response.json({ user: { id: "bob" } }));
    vi.stubGlobal("fetch", fetch);
    const first = render(
      <SessionProvider>
        <Probe />
      </SessionProvider>,
    );
    await act(async () => {});
    first.unmount();
    render(
      <SessionProvider>
        <Probe />
      </SessionProvider>,
    );
    await act(async () => {});
    expect(screen.queryByText("alice")).toBeNull();
    expect(screen.getByText("bob")).toBeTruthy();
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
