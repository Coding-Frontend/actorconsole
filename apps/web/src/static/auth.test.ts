import { afterEach, describe, expect, it, vi } from "vitest";
afterEach(() => vi.unstubAllGlobals());
describe("static session reads", () => {
  it("deduplicates concurrent checks without retaining an earlier identity", async () => {
    vi.resetModules();
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ user: { id: "alice" } }))
      .mockResolvedValueOnce(Response.json(null));
    vi.stubGlobal("fetch", fetch);
    const { auth } = await import("./auth");
    const sessions = await Promise.all([auth(), auth(), auth()]);
    expect(sessions.every((session) => session?.user.id === "alice")).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(await auth()).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[0][1]).toMatchObject({ credentials: "include", cache: "no-store" });
  });
  it("does not retain a failed identity check", async () => {
    vi.resetModules();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(new Response("unavailable", { status: 503 }))
        .mockResolvedValueOnce(new Response("unavailable", { status: 503 }))
        .mockResolvedValueOnce(new Response("unavailable", { status: 503 }))
        .mockResolvedValueOnce(Response.json(null)),
    );
    const { auth } = await import("./auth");
    await expect(auth()).rejects.toThrow("Session unavailable");
    expect(await auth()).toBeNull();
  });
});
