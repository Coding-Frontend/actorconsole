import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";

const { counter, duration, delivery } = vi.hoisted(() => ({
  counter: vi.fn(), duration: vi.fn(), delivery: vi.fn().mockResolvedValue({ count: 1 }),
}));
vi.mock("@actorconsole/shared", async (importOriginal) => ({
  ...await importOriginal<typeof import("@actorconsole/shared")>(),
  incrementMetric: counter,
  observeMetric: duration,
}));
vi.mock("@actorconsole/db", async (importOriginal) => ({
  ...await importOriginal<typeof import("@actorconsole/db")>(),
  db: {
    websiteLogo: { findUnique: vi.fn().mockResolvedValue(null) },
    emailLog: { updateMany: delivery },
  },
}));
vi.mock("../src/lib/integrations.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("../src/lib/integrations.js")>(),
  getIntegration: vi.fn().mockResolvedValue(`whsec_${Buffer.from("test-resend-signing-key").toString("base64")}`),
}));
vi.mock("../src/lib/queue.js", () => ({ getRedis: () => null, enqueue: vi.fn(), getQueuedJob: vi.fn() }));
import { app } from "../src/app.js";

describe("API data boundaries", () => {
  beforeEach(() => vi.clearAllMocks());
  it("uses one unmatched path label for arbitrary 404s", async () => {
    for (const name of ["a", "b", "c", "d"]) expect((await app.request(`/unknown-${name}`)).status).toBe(404);
    const paths = counter.mock.calls.map(([, labels]) => labels.path);
    expect(paths).toEqual(Array(4).fill("unmatched"));
  });
  it("uses a registered pattern rather than a dynamic asset ID", async () => {
    await app.request("/website-logo-assets/alice");
    await app.request("/website-logo-assets/bob");
    expect(counter.mock.calls.map(([, labels]) => labels.path)).toEqual(Array(2).fill("/website-logo-assets/:logoId"));
    expect(duration.mock.calls.map(([, , labels]) => labels.path)).toEqual(Array(2).fill("/website-logo-assets/:logoId"));
  });
  it("bounds the method label for arbitrary extension methods", async () => {
    await app.request("/unknown", { method: "CUSTOM_ONE" });
    await app.request("/unknown", { method: "CUSTOM_TWO" });
    expect(counter.mock.calls.map(([, labels]) => labels.method)).toEqual(["OTHER", "OTHER"]);
  });
  it("rejects a streamed Resend body at its smaller cap before downstream lookups", async () => {
    const cancel = vi.fn();
    let reads = 0;
    const request = new Request("http://localhost/webhooks/resend", {
      method: "POST", body: new ReadableStream({
        pull(controller) { reads += 1; controller.enqueue(new Uint8Array(600_000)); if (reads > 10) controller.close(); },
        cancel,
      }), duplex: "half",
    } as RequestInit);
    expect((await app.request(request)).status).toBe(413);
    expect(cancel).toHaveBeenCalledOnce();
    expect(reads).toBeLessThan(5);
  });

  it.each([false, true])("preserves real signature verification through both body guards (tampered: %s)", async (tampered) => {
    const body = '\r\n{ "type": "email.delivered", "data": { "email_id": "fixture_delivery" }, "label": "é" }\r\n';
    const id = "msg_body_guard_fixture";
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = createHmac("sha256", Buffer.from("test-resend-signing-key"))
      .update(`${id}.${timestamp}.${body}`, "utf8").digest("base64");
    const bytes = Buffer.from(tampered ? body.replace("é", "e") : body);
    const split = bytes.indexOf(0xc3) + 1;
    const response = await app.request(new Request("http://localhost/webhooks/resend", {
      method: "POST",
      headers: { "svix-id": id, "svix-timestamp": timestamp, "svix-signature": `v1,${signature}` },
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(bytes.subarray(0, split));
          controller.enqueue(bytes.subarray(split));
          controller.close();
        },
      }),
      duplex: "half",
    } as RequestInit));
    expect(response.status).toBe(tampered ? 401 : 200);
    if (tampered) {
      expect(delivery).not.toHaveBeenCalled();
    } else {
      expect(delivery).toHaveBeenCalledOnce();
      expect(delivery).toHaveBeenCalledWith({
        where: { providerId: "fixture_delivery" },
        data: { status: "delivered", eventType: "email.delivered", error: null },
      });
    }
  });
});
