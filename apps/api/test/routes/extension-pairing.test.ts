import { createHash } from "node:crypto";
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppEnv } from "../../src/app.js";
import { onErrorHandler } from "../../src/middleware/error.js";

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn(), updateMany: vi.fn(),
  deleteMany: vi.fn(), count: vi.fn(), user: vi.fn(),
}));
vi.mock("@actorconsole/db", () => ({ db: {
  user: { findUnique: mocks.user },
  apifyExtensionDevice: {
    findFirst: mocks.findFirst, findUnique: mocks.findUnique, create: mocks.create,
    updateMany: mocks.updateMany, deleteMany: mocks.deleteMany, count: mocks.count,
  },
} }));
import { extensionDeviceRoutes } from "../../src/routes/extension-device.js";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const verifier = "b".repeat(64);
const challenge = hash(verifier);
const user = { id: "user-1", name: "Sample", username: "sample", email: "sample@example.com", image: null, suspendedAt: null, deletionScheduledFor: null };
const device = () => ({
  id: "device-1", userId: user.id, tokenHash: null, claimHash: null,
  pairChallengeHash: hash(challenge), revokedAt: null,
  claimExpiresAt: new Date(Date.now() + 300_000), expiresAt: new Date(Date.now() + 86_400_000), user,
});

function app(authMethod = "session") {
  const app = new Hono<AppEnv>();
  app.onError(onErrorHandler);
  app.use("*", async (c, next) => {
    c.set("session", { userId: user.id, authMethod } as never);
    await next();
  });
  app.route("/extension-device", extensionDeviceRoutes);
  return app;
}
function post(path: string, body: unknown, authMethod = "session") {
  return app(authMethod).request(`/extension-device/${path}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
}

describe("browser device authorization", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.user.mockResolvedValue(user);
    mocks.findFirst.mockResolvedValue(null);
    mocks.create.mockResolvedValue(device());
    mocks.count.mockResolvedValue(0);
    mocks.updateMany.mockResolvedValue({ count: 1 });
  });

  it("authorizes an unpublished extension without any extension ID", async () => {
    const response = await post("pair", { challenge, delivery: "poll" });
    expect(response.status).toBe(200);
    expect((await response.json()).data).toMatchObject({ pairingId: "device-1", userId: user.id });
    expect(mocks.create).toHaveBeenCalledWith({ data: expect.objectContaining({ claimHash: null, pairChallengeHash: hash(challenge) }) });
  });
  it("does not send a redeemable code to the polling approval page", async () => {
    const response = await post("pair", { challenge, delivery: "poll" });
    const data = (await response.json()).data;
    expect(data.code).toBeUndefined();
    expect(data.token).toBeUndefined();
    expect(data.verifier).toBeUndefined();
  });
  it("requires an interactive login to approve a device", async () => {
    expect((await post("pair", { challenge, delivery: "poll" }, "api_key")).status).toBe(403);
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("reuses a pending approval after a browser retry", async () => {
    mocks.findFirst.mockResolvedValue({ id: "existing-device" });
    const response = await post("pair", { challenge, delivery: "poll" });
    expect((await response.json()).data.pairingId).toBe("existing-device");
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("preserves one-time code login for older extension builds", async () => {
    const response = await post("pair", { challenge });
    expect((await response.json()).data.code).toMatch(/^acp_[a-f0-9]{64}$/);
    expect(mocks.create).toHaveBeenCalledWith({ data: expect.objectContaining({ claimHash: expect.any(String) }) });
  });
  it("waits for approval before issuing any credential", async () => {
    const response = await post("poll", { verifier });
    expect(await response.json()).toEqual({ ok: true, data: { status: "pending" } });
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });
  it("redeems the private verifier and stores only a token hash", async () => {
    mocks.findFirst.mockResolvedValue(device());
    const response = await post("poll", { verifier });
    const data = (await response.json()).data;
    expect(data).toMatchObject({ status: "connected", userId: user.id });
    expect(data.token).toMatch(/^acx_[a-f0-9]{64}$/);
    expect(mocks.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: {
      pairChallengeHash: hash(challenge), claimHash: null, tokenHash: null,
    } }));
    expect(mocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: {
      tokenHash: hash(data.token), pairChallengeHash: null, claimExpiresAt: null,
    } }));
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
  it("cannot redeem the public challenge as a verifier", async () => {
    mocks.findFirst.mockImplementation(({ where }) => where.pairChallengeHash === hash(challenge) ? device() : null);
    expect((await (await post("poll", { verifier: challenge })).json()).data.status).toBe("pending");
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });
  it.each(["expired", "revoked", "suspended", "deleted"])("rejects a %s approval", async (reason) => {
    const value = device();
    if (reason === "expired") value.claimExpiresAt = new Date(0);
    if (reason === "revoked") Object.assign(value, { revokedAt: new Date() });
    if (reason === "suspended") value.user = { ...user, suspendedAt: new Date() } as never;
    if (reason === "deleted") value.user = { ...user, deletionScheduledFor: new Date() } as never;
    mocks.findFirst.mockResolvedValue(value);
    expect((await post("poll", { verifier })).status).toBe(409);
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });
  it("refuses a second concurrent redemption", async () => {
    mocks.findFirst.mockResolvedValue(device());
    mocks.updateMany.mockResolvedValue({ count: 0 });
    expect((await post("poll", { verifier })).status).toBe(409);
  });
  it("only reports connection status to the account that approved it", async () => {
    mocks.findFirst.mockResolvedValue({ ...device(), tokenHash: "secret-hash" });
    const response = await app().request("/extension-device/pair/status?id=device-1");
    expect(await response.json()).toEqual({ ok: true, data: { status: "connected" } });
    expect(mocks.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "device-1", userId: user.id } }));
  });
  it("rejects invalid verifiers before querying credentials", async () => {
    expect((await post("poll", { verifier: "short" })).status).toBe(400);
    expect(mocks.findFirst).not.toHaveBeenCalled();
  });
});
