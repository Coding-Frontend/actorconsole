import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import type { AppEnv } from "../../src/app";
import { intelligenceRoutes } from "../../src/routes/intelligence";

describe("retired SDK administration", () => {
  const app = new Hono<AppEnv>();
  app.use("*", async (c, next) => {
    c.set("session", {
      userId: "test-user",
      email: "test@example.test",
      plan: "PRO",
      businessProfileId: "test-workspace",
    });
    await next();
  });
  app.route("/intelligence", intelligenceRoutes);

  it.each([
    ["POST", "/actors/actor/key"],
    ["DELETE", "/actors/actor/key"],
    ["PUT", "/actors/actor/rules"],
    ["GET", "/actors/actor/insights"],
    ["GET", "/issues"],
    ["PATCH", "/issues/issue"],
  ])("returns 404 for %s %s even with a workspace session", async (method, path) => {
    const response = await app.request(`/intelligence${path}`, { method });
    expect(response.status).toBe(404);
  });
});
