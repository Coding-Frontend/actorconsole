import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { refreshWorkspaceActors, WORKSPACE_DATA_REFRESHED_EVENT } from "./actor-refresh";
beforeEach(() => vi.useFakeTimers());
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); window.localStorage.clear(); });

describe("Actor refresh polling", () => {
  it("keeps manual refresh immediate even during the automatic cooldown", async () => {
    window.localStorage.setItem("actorconsole:actor-auto-refresh-v2:workspace_1", String(Date.now()));
    const completed = vi.fn();
    window.addEventListener(WORKSPACE_DATA_REFRESHED_EVENT, completed);
    const fetch = vi.fn().mockResolvedValueOnce(Response.json({ data: { jobId: "job-1" } })).mockResolvedValueOnce(Response.json({ data: { state: "completed" } }));
    vi.stubGlobal("fetch", fetch);
    const pending = refreshWorkspaceActors();
    await vi.advanceTimersByTimeAsync(1_500);
    expect(await pending).toBe("completed");
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[0][1].method).toBe("POST");
    expect(completed).toHaveBeenCalledOnce();
    window.removeEventListener(WORKSPACE_DATA_REFRESHED_EVENT, completed);
  });
  it("backs off queued jobs and stops within the existing one-minute polling budget", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(Response.json({ data: { jobId: "job-1" } })).mockImplementation(async () => Response.json({ data: { state: "waiting" } }));
    vi.stubGlobal("fetch", fetch);
    const pending = refreshWorkspaceActors();
    await vi.advanceTimersByTimeAsync(1_500);
    expect(fetch).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(58_500);
    expect(await pending).toBe("unknown");
    const polls = fetch.mock.calls.length - 1;
    expect(polls).toBeLessThanOrEqual(13);
    expect(polls).toBeGreaterThan(3);
  });
  it("stops polling when navigation aborts the workspace request", async () => {
    const controller = new AbortController();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ data: { jobId: "job-1" } })));
    const pending = refreshWorkspaceActors({ signal: controller.signal });
    const rejected = expect(pending).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(100);
    controller.abort();
    await rejected;
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
