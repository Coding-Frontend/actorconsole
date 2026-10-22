import { afterEach, expect, it, vi } from "vitest";
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
it("rejects private operations before making a request", async () => {
  vi.resetModules();
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  const { backendData } = await import("./backend-data");
  await expect(backendData("account")).rejects.toThrow("Unknown public");
  expect(fetch).not.toHaveBeenCalled();
});
it("deduplicates public reads, isolates returned objects and expires them", async () => {
  vi.resetModules();
  vi.useFakeTimers();
  const fetch = vi
    .fn()
    .mockImplementation(async () => Response.json({ ok: true, data: { items: ["original"] } }));
  vi.stubGlobal("fetch", fetch);
  const { backendData } = await import("./backend-data");
  const [a, b] = await Promise.all([
    backendData<{ items: string[] }>("summary"),
    backendData<{ items: string[] }>("summary"),
  ]);
  a.items.push("changed");
  expect(b.items).toEqual(["original"]);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch.mock.calls[0][1]).toMatchObject({ credentials: "omit" });
  await backendData("summary");
  expect(fetch).toHaveBeenCalledTimes(1);
  vi.advanceTimersByTime(60_001);
  await backendData("summary");
  expect(fetch).toHaveBeenCalledTimes(2);
});
it("does not cache failures or leak data between public query arguments", async () => {
  vi.resetModules();
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(new Response("offline", { status: 503 }))
    .mockResolvedValueOnce(new Response("offline", { status: 503 }))
    .mockResolvedValueOnce(new Response("offline", { status: 503 }))
    .mockImplementation(async () => Response.json({ ok: true, data: [] }));
  vi.stubGlobal("fetch", fetch);
  const { backendData } = await import("./backend-data");
  await expect(backendData("search-actors", ["alpha"])).rejects.toThrow("503");
  await backendData("search-actors", ["alpha"]);
  await backendData("search-actors", ["beta"]);
  expect(fetch).toHaveBeenCalledTimes(5);
});
it("shares the default profile read between the view and metadata without sharing filtered data", async () => {
  vi.resetModules();
  const fetch = vi
    .fn()
    .mockImplementation(async () => Response.json({ ok: true, data: { username: "alice" } }));
  vi.stubGlobal("fetch", fetch);
  const { backendData } = await import("./backend-data");
  await backendData("profile", ["alice", {}]);
  await backendData("profile", [
    "alice",
    {
      window: 30,
      actorPage: 1,
      actorQuery: undefined,
      actorCategory: undefined,
      actorSort: "active-users",
    },
  ]);
  expect(fetch).toHaveBeenCalledTimes(1);
  await backendData("profile", ["alice", { actorQuery: "different" }]);
  expect(fetch).toHaveBeenCalledTimes(2);
});
