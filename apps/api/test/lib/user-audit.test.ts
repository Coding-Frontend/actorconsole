import { Hono } from "hono";
import { afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("@actorconsole/db", () => ({ db: { auditLog: { create: mocks.create } } }));
import { recordUserAudit } from "../../src/lib/user-audit.js";
afterEach(() => vi.unstubAllEnvs());
it("stores the verified client address and impersonator identity despite spoofed prefixes", async () => {
  vi.stubEnv("TRUSTED_PROXY_IPS", "127.0.0.1,10.0.0.2");
  mocks.create.mockResolvedValue({});
  const app = new Hono().post("/", async (c) => {
    await recordUserAudit(
      c,
      {
        userId: "victim",
        email: "v@example.test",
        plan: "PRO",
        authMethod: "impersonation",
        impersonatedById: "admin",
      },
      "test",
      "test",
    );
    return c.text("ok");
  });
  await app.request(
    "/",
    {
      method: "POST",
      headers: {
        "x-forwarded-for": "203.0.113.99,192.0.2.20,10.0.0.2",
        "x-real-ip": "203.0.113.99",
      },
    },
    { incoming: { socket: { remoteAddress: "127.0.0.1" } } },
  );
  expect(mocks.create).toHaveBeenCalledWith({
    data: expect.objectContaining({ actorId: "victim", adminId: "admin", ip: "192.0.2.20" }),
  });
});
