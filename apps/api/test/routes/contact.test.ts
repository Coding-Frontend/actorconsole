import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { onErrorHandler } from "../../src/middleware/error.js";

const { mockCheckRateLimit, mockSendEmail } = vi.hoisted(() => ({
  mockCheckRateLimit: vi.fn(),
  mockSendEmail: vi.fn(),
}));

vi.mock("../../src/config/env.js", () => ({
  apiEnv: { SUPPORT_EMAIL: "support@example.com" },
}));

vi.mock("../../src/lib/rate-limit.js", () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
}));

vi.mock("../../src/lib/email.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../src/lib/email.js")>();
  return {
    ...original,
    sendEmail: (...args: unknown[]) => mockSendEmail(...args),
  };
});

import { contactRoutes } from "../../src/routes/contact.js";

function buildApp() {
  const app = new Hono();
  app.onError(onErrorHandler);
  app.route("/contact", contactRoutes);
  return app;
}

const validMessage = {
  name: "Ada Developer",
  email: "ada@example.com",
  subject: "support",
  message: "My actor synchronization is failing.",
};

describe("contact route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCheckRateLimit.mockResolvedValue({ allowed: true });
    mockSendEmail.mockResolvedValue({ ok: true, id: "email_1" });
  });

  it("delivers a validated message and acknowledges provider acceptance", async () => {
    const response = await buildApp().request("/contact", {
      method: "POST",
      headers: { "content-type": "application/json", "x-real-ip": "192.0.2.10" },
      body: JSON.stringify(validMessage),
    });

    expect(response.status).toBe(202);
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "support@example.com",
        replyTo: "ada@example.com",
        subject: "[ActorConsole contact] Technical support",
      }),
    );
    expect(await response.json()).toEqual({ ok: true, data: { accepted: true } });
  });

  it("rejects malformed input", async () => {
    const response = await buildApp().request("/contact", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...validMessage, email: "invalid", message: "short" }),
    });
    expect(response.status).toBe(400);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("rate-limits repeated messages", async () => {
    mockCheckRateLimit
      .mockResolvedValueOnce({ allowed: true })
      .mockResolvedValueOnce({ allowed: false });
    const response = await buildApp().request("/contact", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(validMessage),
    });
    expect(response.status).toBe(429);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("reports delivery failures without claiming success", async () => {
    mockSendEmail.mockResolvedValueOnce({
      ok: false,
      reason: "send_failed",
      error: "provider unavailable",
    });
    const response = await buildApp().request("/contact", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(validMessage),
    });
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe("contact_delivery_failed");
  });
});
