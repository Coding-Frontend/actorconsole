import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFindFirst = vi.fn();

vi.mock("@actorconsole/db", () => ({
  db: {
    businessProfile: {
      findFirst: (...args: unknown[]) => mockFindFirst(...args),
    },
  },
}));

import { resolveBusinessProfile } from "../../src/lib/business-profile.js";

describe("resolveBusinessProfile", () => {
  beforeEach(() => vi.clearAllMocks());

  it("does not let a workspace API key switch scope through a request header", async () => {
    mockFindFirst.mockResolvedValueOnce({ id: "workspace_a", userId: "user_1", plan: "PRO" });
    const app = new Hono<any>();
    app.use("*", async (c, next) => {
      c.set("session", {
        userId: "user_1",
        email: "user@example.com",
        plan: "PRO",
        businessProfileId: "workspace_a",
        authMethod: "api-key",
      });
      await next();
    });
    app.use("*", resolveBusinessProfile());
    app.get("/", (c) => c.json({ workspaceId: c.get("session").businessProfileId }));

    const res = await app.request("/", {
      headers: { "x-business-profile-id": "workspace_b" },
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ workspaceId: "workspace_a" });
    expect(mockFindFirst).toHaveBeenCalledWith({
      where: { id: "workspace_a", userId: "user_1" },
    });
  });
});
