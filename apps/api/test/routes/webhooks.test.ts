import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ─── Mocks ──────────────────────────────────────────────────────────────────

const { mockVerifyResendSig, mockEmailUpdateMany, mockNewsletterUpdateMany } = vi.hoisted(() => ({
  mockVerifyResendSig: vi.fn(),
  mockEmailUpdateMany: vi.fn(),
  mockNewsletterUpdateMany: vi.fn(),
}));

vi.mock("@actorconsole/shared", () => ({
  verifyResendSignature: (...args: unknown[]) => mockVerifyResendSig(...args),
  getLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

vi.mock("@actorconsole/db", () => ({
  db: {
    emailLog: { updateMany: (...args: unknown[]) => mockEmailUpdateMany(...args) },
    newsletterSubscriber: { updateMany: (...args: unknown[]) => mockNewsletterUpdateMany(...args) },
  },
}));

const mockGetIntegration = vi.fn();
vi.mock("../../src/lib/integrations.js", () => ({
  getIntegration: (...args: unknown[]) => mockGetIntegration(...args),
}));

import { webhookRoutes } from "../../src/routes/webhooks.js";
import { onErrorHandler } from "../../src/middleware/error.js";

function buildApp() {
  const app = new Hono();
  app.onError(onErrorHandler);
  app.route("/webhooks", webhookRoutes);
  return app;
}

describe("Webhook routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetIntegration.mockResolvedValue(null);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 404 for the removed Apify webhook without processing it", async () => {
    const res = await buildApp().request("/webhooks/apify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventType: "ACTOR.RUN.SUCCEEDED", actorId: "actor123" }),
    });
    expect(res.status).toBe(404);
    expect(mockGetIntegration).not.toHaveBeenCalled();
  });
  describe("POST /webhooks/resend", () => {
    it.each([
      { type: { includes: "bounced" } },
      { type: "email.bounced", data: { email_id: "email_1", to: ["builder@example.com", {}] } },
      { type: "email.delivered", data: { email_id: { not: null } } },
    ])("rejects malformed signed fields before any database writes: %j", async (body) => {
      mockGetIntegration.mockResolvedValue("whsec_test");
      mockVerifyResendSig.mockReturnValue(true);
      const res = await buildApp().request("/webhooks/resend", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      expect(res.status).toBe(400);
      expect(mockEmailUpdateMany).not.toHaveBeenCalled();
      expect(mockNewsletterUpdateMany).not.toHaveBeenCalled();
    });

    it("rejects unsigned events without database writes", async () => {
      mockGetIntegration.mockResolvedValue("whsec_test");
      mockVerifyResendSig.mockReturnValue(false);
      const res = await buildApp().request("/webhooks/resend", {
        method: "POST", body: JSON.stringify({ type: "email.bounced" }),
      });
      expect(res.status).toBe(401);
      expect(mockEmailUpdateMany).not.toHaveBeenCalled();
      expect(mockNewsletterUpdateMany).not.toHaveBeenCalled();
    });

    it("rejects a large streamed event before signature or integration lookup", async () => {
      const cancel = vi.fn();
      let reads = 0;
      const stream = new ReadableStream({
        pull(controller) {
          reads += 1;
          controller.enqueue(new Uint8Array(1_048_577));
          if (reads === 4) controller.close();
        },
        cancel,
      });
      const res = await buildApp().request(new Request("http://localhost/webhooks/resend", {
        method: "POST", body: stream, duplex: "half",
      } as RequestInit));
      expect(res.status).toBe(413);
      expect(mockGetIntegration).not.toHaveBeenCalled();
      expect(mockVerifyResendSig).not.toHaveBeenCalled();
      expect(cancel).toHaveBeenCalledOnce();
    });

    it("updates email delivery and newsletter state for a bounce", async () => {
      mockGetIntegration.mockResolvedValueOnce("whsec_test");
      mockVerifyResendSig.mockReturnValueOnce(true);
      mockEmailUpdateMany.mockResolvedValueOnce({ count: 1 });
      mockNewsletterUpdateMany.mockResolvedValueOnce({ count: 1 });

      const res = await buildApp().request("/webhooks/resend", {
        method: "POST",
        headers: {
          "svix-id": "msg_1",
          "svix-timestamp": String(Math.floor(Date.now() / 1000)),
          "svix-signature": "v1,test",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type: "email.bounced",
          data: { email_id: "email_1", to: ["builder@example.com"] },
        }),
      });

      expect(res.status).toBe(200);
      expect(mockEmailUpdateMany).toHaveBeenCalledWith({
        where: { providerId: "email_1" },
        data: { status: "bounced", eventType: "email.bounced", error: "email.bounced" },
      });
      expect(mockNewsletterUpdateMany).toHaveBeenCalledWith({
        where: { email: "builder@example.com" },
        data: { status: "BOUNCED", unsubscribedAt: expect.any(Date) },
      });
    });
  });
});
