import { afterEach, expect, it, vi } from "vitest";
vi.mock("../lib/public-comparison", () => ({
  parseComparisonWindow: () => 30,
  parseComparisonIds: (values: string[]) => values,
  searchPublicComparison: vi.fn(),
  loadPublicComparison: vi.fn(),
}));
import { installApiRequests, normalizeApiUrl } from "./requests";
import { loadPublicComparison } from "../lib/public-comparison";
let restore: (() => void) | undefined;
const initialUrl = window.location.href;
afterEach(() => {
  restore?.();
  restore = undefined;
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  window.history.replaceState(null, "", initialUrl);
});

it("keeps production QA read-only after client-side navigation", async () => {
  const fetch = vi.fn().mockResolvedValue(Response.json({ ok: true }));
  vi.stubGlobal("fetch", fetch);
  window.history.replaceState(null, "", "?qa=read-only");
  restore = installApiRequests();
  window.history.replaceState(null, "", "/dashboard");
  expect((await window.fetch("/api/actors/refresh", { method: "POST" })).status).toBe(403);
  expect(fetch).not.toHaveBeenCalled();
  await window.fetch("/api/auth/firebase-session", { method: "POST", body: "login" });
  expect(fetch).toHaveBeenCalledTimes(1);
});
it("rewrites API paths without redirecting unrelated origins", () => {
  expect(normalizeApiUrl("/api/backend/account?x=1")).toBe(
    "http://localhost:4000/account?x=1",
  );
  expect(normalizeApiUrl("https://other.example/api/account")).toBe(
    "https://other.example/api/account",
  );
});
it("sends credentials to Node.js while respecting explicitly public reads", async () => {
  const fetch = vi.fn().mockResolvedValue(Response.json({ ok: true }));
  vi.stubGlobal("fetch", fetch);
  restore = installApiRequests();
  await window.fetch("/api/account", { method: "POST", body: "payload" });
  expect(fetch.mock.calls[0]).toEqual([
    "http://localhost:4000/account",
    expect.objectContaining({ method: "POST", body: "payload", credentials: "include" }),
  ]);
  await window.fetch("/api/public/catalog/summary", { credentials: "omit" });
  expect(fetch.mock.calls[1][1].credentials).toBe("omit");
});
it("rejects comparison mutations and propagates cancelled responses", async () => {
  vi.stubGlobal("fetch", vi.fn());
  restore = installApiRequests();
  expect((await window.fetch("/api/public/comparison", { method: "POST" })).status).toBe(405);
  const controller = new AbortController();
  vi.mocked(loadPublicComparison).mockImplementation(async () => {
    controller.abort(new DOMException("Cancelled", "AbortError"));
    return { items: [], missing: 0 } as never;
  });
  await expect(
    window.fetch("/api/public/comparison?item=one", { signal: controller.signal }),
  ).rejects.toThrow("Cancelled");
});
it("blocks preview mutations including automatic Actor refresh, while permitting sign-in", async () => {
  const fetch = vi.fn().mockImplementation(async () => Response.json({ ok: true }));
  vi.stubGlobal("fetch", fetch);
  restore = installApiRequests({ readOnly: true });
  for (const [path, method] of [
    ["/api/actors/refresh", "POST"],
    ["/api/actors/actor1", "PATCH"],
    ["/api/admin/users/user1", "DELETE"],
  ]) {
    expect((await window.fetch(path, { method })).status).toBe(403);
  }
  expect(fetch).not.toHaveBeenCalled();
  await window.fetch("/api/auth/local/login", { method: "POST", body: "login" });
  expect(fetch).toHaveBeenCalledTimes(1);
});
it("keeps Request-based public fetches credential-free", async () => {
  const fetch = vi.fn().mockResolvedValue(Response.json({ ok: true }));
  vi.stubGlobal("fetch", fetch);
  restore = installApiRequests();
  await window.fetch(
    new Request(`${window.location.origin}/api/public/catalog/summary`, { credentials: "omit" }),
  );
  expect(fetch.mock.calls[0][1].credentials).toBe("omit");
});
