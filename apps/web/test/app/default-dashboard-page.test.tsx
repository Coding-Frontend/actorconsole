import { beforeEach, describe, expect, it, vi } from "vitest";
const { request, redirect } = vi.hoisted(() => ({ request: vi.fn(), redirect: vi.fn() }));
vi.mock("@/lib/server-api", () => ({ authenticatedServerFetch: request }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/components/dashboard/default-dashboard", () => ({ DefaultDashboard: () => null }));
import Page from "../../src/app/(dashboard)/dashboard/default/page";
describe("Default dashboard page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    redirect.mockImplementation(() => {
      throw new Error("redirect");
    });
  });
  it("loads only the account-wide endpoint with supported range filters", async () => {
    request.mockResolvedValue(Response.json({ ok: true, data: {} }));
    await Page({
      searchParams: Promise.resolve({ from: "2026-10-01", to: "2026-10-08", actorIds: "other" }),
    });
    expect(request).toHaveBeenCalledWith(
      "/account/default-dashboard?from=2026-10-01&to=2026-10-08",
    );
  });
  it("returns to the real workspace overview when fewer than two workspaces remain", async () => {
    request.mockResolvedValue(
      Response.json({ error: { code: "default_unavailable" } }, { status: 409 }),
    );
    await expect(Page({ searchParams: Promise.resolve({}) })).rejects.toThrow("redirect");
    expect(redirect).toHaveBeenCalledWith("/dashboard");
  });
  it("surfaces an API error without manufacturing zero totals", async () => {
    request.mockResolvedValue(
      Response.json({ error: { message: "Reporting unavailable" } }, { status: 503 }),
    );
    await expect(Page({ searchParams: Promise.resolve({}) })).rejects.toThrow(
      "Reporting unavailable",
    );
  });
});
