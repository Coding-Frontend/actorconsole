import { beforeEach, describe, expect, it, vi } from "vitest";

const queueMocks = vi.hoisted(() => ({
  enqueue: vi.fn(),
  getQueuedJob: vi.fn(),
  getRedis: vi.fn(),
}));

vi.mock("../src/lib/queue.js", () => queueMocks);

import { app } from "../src/app.js";

describe("retired Actor SDK ingestion", () => {
  it.each(["errors", "costs", "runs", "gate"])(
    "does not accept SDK reports at /telemetry/%s",
    async (endpoint) => {
      const response = await app.request(`/telemetry/${endpoint}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer aci_${"b".repeat(64)}`,
        },
        body: JSON.stringify({ runId: "retired-sdk-run", userId: "user" }),
      });
      expect(response.status).toBe(404);
    },
  );
});

describe("full API CSRF integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ADMIN_API_KEY = "admin-test-key";
    queueMocks.enqueue.mockResolvedValue("logo-job-1");
    queueMocks.getRedis.mockReturnValue(null);
  });

  it("allows authenticated server-to-server bodyless POST requests", async () => {
    const response = await app.request("/admin/website-logos/runs/logos", {
      method: "POST",
      headers: { "x-admin-api-key": "admin-test-key" },
    });

    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ ok: true, data: { jobId: "logo-job-1" } });
    expect(queueMocks.enqueue).toHaveBeenCalledWith(
      "catalog",
      { catalog: "logos" },
      expect.objectContaining({ jobId: expect.stringMatching(/^website-logos-\d+$/) }),
    );
  });

  it("keeps cross-site browser form POST requests blocked as 403", async () => {
    const response = await app.request("/admin/website-logos/runs/logos", {
      method: "POST",
      headers: {
        "content-type": "text/plain",
        origin: "https://attacker.example",
        "sec-fetch-site": "cross-site",
        "x-admin-api-key": "admin-test-key",
      },
    });

    expect(response.status).toBe(403);
    expect(await response.text()).toBe("Forbidden");
    expect(queueMocks.enqueue).not.toHaveBeenCalled();
  });
});

describe("extension origins", () => {
  it.each(["a".repeat(32), "p".repeat(32), "abcdefghijklmnopabcdefghijklmnop"])(
    "allows an arbitrary Chrome extension ID %s on the device API",
    async (id) => {
      const origin = `chrome-extension://${id}`;
      const response = await app.request("/extension-device/poll", {
        method: "OPTIONS",
        headers: {
          origin,
          "access-control-request-method": "POST",
          "access-control-request-headers": "content-type",
        },
      });
      expect(response.status).toBe(204);
      expect(response.headers.get("access-control-allow-origin")).toBe(origin);
    },
  );
  it.each([
    "https://attacker.example",
    "chrome-extension://short",
    `chrome-extension://${"z".repeat(32)}`,
  ])("does not reflect an invalid or unrelated origin %s", async (origin) => {
    const response = await app.request("/extension-device/poll", {
      method: "OPTIONS",
      headers: { origin },
    });
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
  });
  it("keeps extension origins outside the session API", async () => {
    const response = await app.request("/account/me", {
      method: "OPTIONS",
      headers: { origin: `chrome-extension://${"a".repeat(32)}` },
    });
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
  });
  it("allows credentialless polling through CSRF but still validates input", async () => {
    const response = await app.request("/extension-device/poll", {
      method: "POST",
      headers: {
        origin: `chrome-extension://${"a".repeat(32)}`,
        "sec-fetch-site": "cross-site",
        "content-type": "application/json",
      },
      body: JSON.stringify({ verifier: "invalid" }),
    });
    expect(response.status).toBe(400);
  });
});
