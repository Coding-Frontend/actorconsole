import { Hono } from "hono";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/lib/queue.js", () => ({ getRedis: () => null }));
vi.mock("../../src/config/env.js", () => ({ apiEnv: { SUPPORT_EMAIL: "support@example.test" } }));
vi.mock("../../src/lib/email.js", () => ({
  escapeHtml: (text: string) => text,
  textToHtml: (text: string) => text,
  sendEmail: vi.fn().mockResolvedValue({ ok: true }),
}));
import { contactRoutes } from "../../src/routes/contact.js";
import { onErrorHandler } from "../../src/middleware/error.js";

afterEach(() => vi.unstubAllEnvs());

describe("contact requester quota with real local limiter and mocked delivery", () => {
  it.each([false, true])("blocks request eleven despite forged headers (trusted proxy: %s)", async (proxy) => {
    vi.stubEnv("TRUSTED_PROXY_IPS", proxy ? "127.0.0.1" : "");
    const app = new Hono().onError(onErrorHandler).route("/contact", contactRoutes);
    const statuses: number[] = [];
    for (let index = 0; index < 11; index += 1) {
      const response = await app.request("/contact", {
        method: "POST", headers: {
          "content-type": "application/json",
          "cf-connecting-ip": `203.0.113.${index + 1}`,
          "x-real-ip": `203.0.113.${index + 1}`,
          "x-forwarded-for": proxy ? `203.0.113.${index + 1}, 192.0.2.20` : `203.0.113.${index + 1}`,
        },
        body: JSON.stringify({ name: "Local fixture", email: `fixture-${proxy}-${index}@example.test`, subject: "support", message: "Bounded local fixture with delivery mocked." }),
      }, { incoming: { socket: { remoteAddress: proxy ? "127.0.0.1" : "192.0.2.10" } } });
      statuses.push(response.status);
    }
    expect(statuses).toEqual([...Array(10).fill(202), 429]);
  });
});
