// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { workspacePlanUsage } from "@actorconsole/shared/plans";
import { WORKSPACE_ACCESS_HEADER } from "@actorconsole/shared/workspace-access";
import middleware from "./middleware";

function request(path: string, spoof = false) {
  return new NextRequest(`https://actorconsole.com${path}`, {
    headers: {
      cookie: "authjs.session-token=session; actorconsole.workspace=w1",
      ...(spoof ? { [WORKSPACE_ACCESS_HEADER]: "spoofed" } : {}),
    },
  });
}
function installAccess(plan: "FREE" | "PRO", actors: number, users: number) {
  const usage = workspacePlanUsage(plan, actors, users);
  const access = { workspaceId: "w1", plan, restricted: usage.upgradeRequired, usage };
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ data: access })));
  return access;
}
describe("dashboard workspace middleware", () => {
  afterEach(() => vi.unstubAllGlobals());
  it.each([
    [51, 0],
    [1, 501],
  ])("redirects a Free workspace with %i actors and %i users", async (actors, users) => {
    installAccess("FREE", actors, users);
    const response = await middleware(request("/dashboard/actors/a1"));
    expect(response.headers.get("location")).toBe("https://actorconsole.com/dashboard/upgrade");
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/account/workspace-access"),
      expect.objectContaining({
        cache: "no-store",
        headers: { cookie: "authjs.session-token=session; actorconsole.workspace=w1" },
      }),
    );
  });
  it.each(["FREE", "PRO"] as const)(
    "allows eligible %s pages and replaces spoofed access",
    async (plan) => {
      const access = installAccess(
        plan,
        plan === "FREE" ? 50 : 1000,
        plan === "FREE" ? 500 : 10000,
      );
      const response = await middleware(request("/dashboard/usage", true));
      expect(response.headers.get("location")).toBeNull();
      expect(response.headers.get(`x-middleware-request-${WORKSPACE_ACCESS_HEADER}`)).toBe(
        JSON.stringify(access),
      );
    },
  );
  it.each([
    "/dashboard/keywords",
    "/dashboard/tools/pricing",
    "/dashboard/tools/seo",
    "/dashboard/mcp",
    "/dashboard/support",
    "/dashboard/billing",
    "/dashboard/apify",
    "/dashboard/account",
    "/dashboard/upgrade",
  ])("keeps %s available even if the check is unavailable", async (path) => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("unavailable")));
    const response = await middleware(request(path, true));
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get(`x-middleware-request-${WORKSPACE_ACCESS_HEADER}`)).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("fails closed on an unavailable check and allows recovery", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("unavailable")));
    expect((await middleware(request("/dashboard"))).headers.get("location")).toBe(
      "https://actorconsole.com/dashboard/upgrade?access=unavailable",
    );
  });
  it("redirects an expired session to login", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 401 })));
    expect((await middleware(request("/dashboard/actors"))).headers.get("location")).toContain(
      "/login?callbackUrl=",
    );
  });
});
