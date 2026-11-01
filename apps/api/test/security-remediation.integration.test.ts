import { createHash, randomUUID } from "node:crypto";
import { Hono } from "hono";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "@actorconsole/db";
import { encrypt, totpCode } from "@actorconsole/shared";
import { completeUserLogin, authUserSelect } from "../src/lib/server-session.js";
import { withRequestContext } from "../src/lib/http-context.js";
import { claimManualPublishingRun } from "../../worker/src/lib/publishing-authorization.js";
import { accountRoutes } from "../src/routes/account.js";
import { actorRoutes } from "../src/routes/actors.js";
import { newsletterRoutes } from "../src/routes/newsletter.js";
import { onErrorHandler } from "../src/middleware/error.js";

const mail = vi.hoisted(() => ({ send: vi.fn().mockResolvedValue({ ok: true }) }));
vi.mock("../src/lib/email.js", () => ({
  sendEmail: mail.send,
  escapeHtml: (value: string) => value,
}));
vi.mock("../src/lib/rate-limit.js", () => ({ checkRateLimit: async () => ({ allowed: true }) }));
const target = process.env.ACTORCONSOLE_BILLING_TEST_DATABASE_URL;
const enabled =
  !!target &&
  target === process.env.DATABASE_URL &&
  /^mysql:\/\/[^/]+@(localhost|127\.0\.0\.1):\d+\/actorconsole_billing_test$/.test(target);

describe.skipIf(!enabled)("security fixes against disposable MariaDB", () => {
  const suffix = randomUUID();
  const userId = `security-${suffix}`;
  const adminId = `security-admin-${suffix}`;
  const workspaceId = `security-workspace-${suffix}`;
  const otherWorkspaceId = `security-other-${suffix}`;
  const secret = "JBSWY3DPEHPK3PXP";
  const passphrase = "security-integration-test-key-not-for-production";
  let scheduleId: string;
  beforeAll(async () => {
    vi.stubEnv("APP_ENCRYPTION_KEY", passphrase);
    vi.stubEnv("AUTH_URL", "https://fixture.example.test");
    await db.user.create({
      data: {
        id: userId,
        email: `${suffix}@fixture.example`,
        emailVerified: new Date(),
        totpEnabled: true,
        totpSecretEncrypted: encrypt(secret, passphrase, `totp:${userId}`),
      },
    });
    await db.user.create({
      data: { id: adminId, email: `admin-${suffix}@fixture.example`, role: "ADMIN" },
    });
    await db.businessProfile.create({
      data: {
        id: workspaceId,
        userId,
        name: "Security fixture",
        slug: `security-${suffix}`,
        plan: "PRO",
      },
    });
    await db.businessProfile.create({
      data: { id: otherWorkspaceId, userId, name: "Other fixture", slug: `other-${suffix}` },
    });
    const schedule = await db.bulkPublishSchedule.create({
      data: {
        userId,
        businessProfileId: workspaceId,
        name: "Paused fixture",
        cronExpr: "0 2 * * *",
        enabled: false,
      },
    });
    scheduleId = schedule.id;
  });
  afterAll(async () => {
    await db.newsletterSubscriber.deleteMany({ where: { email: `${suffix}@newsletter.example` } });
    await db.analyticsEvent.deleteMany({ where: { userId } });
    await db.user.deleteMany({ where: { id: { in: [userId, adminId] } } });
    vi.unstubAllEnvs();
    await db.$disconnect();
  });
  it("claims a TOTP counter only once across concurrent, independent login challenges", async () => {
    const tokens = [`first-${suffix}`, `second-${suffix}`];
    await db.twoFactorChallenge.createMany({
      data: tokens.map((token) => ({
        userId,
        tokenHash: createHash("sha256").update(token).digest("hex"),
        expiresAt: new Date(Date.now() + 60_000),
      })),
    });
    const user = await db.user.findUniqueOrThrow({ where: { id: userId }, select: authUserSelect });
    const code = totpCode(secret);
    const responses = await Promise.all(
      tokens.map((token) => {
        const request = new Request("https://fixture.example.test/auth/local/login", {
          method: "POST",
        });
        return withRequestContext(request, () =>
          completeUserLogin(request, user, { challengeToken: token, totpCode: code }),
        );
      }),
    );
    expect(responses.map((response) => response.status).sort()).toEqual([200, 401]);
    expect(await db.session.count({ where: { userId, impersonatedById: null } })).toBe(1);
  });
  it("consumes a bound manual publishing grant atomically and rejects expired or foreign grants", async () => {
    const grant = await db.bulkPublishManualRun.create({
      data: {
        scheduleId,
        userId,
        businessProfileId: workspaceId,
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    const schedule = { id: scheduleId, userId, businessProfileId: workspaceId };
    expect(
      (
        await Promise.all([
          claimManualPublishingRun(grant.id, schedule),
          claimManualPublishingRun(grant.id, schedule),
        ])
      ).sort(),
    ).toEqual([false, true]);
    expect(await claimManualPublishingRun(grant.id, schedule)).toBe(false);
    const expired = await db.bulkPublishManualRun.create({
      data: { scheduleId, userId, businessProfileId: workspaceId, expiresAt: new Date(0) },
    });
    expect(await claimManualPublishingRun(expired.id, schedule)).toBe(false);
    expect(
      await claimManualPublishingRun(grant.id, {
        ...schedule,
        businessProfileId: otherWorkspaceId,
      }),
    ).toBe(false);
  });
  it("blocks an actual administrator-derived session from owner deletion and credential mutations", async () => {
    const session = await db.session.create({
      data: {
        userId,
        sessionToken: `derived-${suffix}`,
        impersonatedById: adminId,
        impersonationExpiresAt: new Date(Date.now() + 60_000),
        expires: new Date(Date.now() + 60_000),
      },
    });
    const app = new Hono().onError(onErrorHandler).route("/account", accountRoutes);
    for (const [path, method, body] of [
      ["/account", "DELETE", { confirmation: "DELETE" }],
      ["/account/2fa/setup", "POST", {}],
      ["/account/api-keys", "POST", { name: "forged" }],
    ] as const) {
      const response = await app.request(path, {
        method,
        headers: {
          cookie: `authjs.session-token=${session.sessionToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      });
      expect(response.status).toBe(403);
    }
    expect(
      (await db.user.findUniqueOrThrow({ where: { id: userId } })).deletionScheduledFor,
    ).toBeNull();
    expect(await db.apiKey.count({ where: { userId } })).toBe(0);
    await db.user.update({ where: { id: adminId }, data: { role: "USER" } });
    expect(
      (
        await app.request("/account/profile", {
          headers: { cookie: `authjs.session-token=${session.sessionToken}` },
        })
      ).status,
    ).toBe(401);
  });
  it("filters account-global and other-workspace analytics at the database query", async () => {
    await db.analyticsEvent.createMany({
      data: [workspaceId, otherWorkspaceId, null].map((businessProfileId) => ({
        userId,
        businessProfileId,
        name: "security.fixture",
        source: "test",
      })),
    });
    const app = new Hono().onError(onErrorHandler);
    app.use("*", async (c, next) => {
      c.set("session", {
        userId,
        businessProfileId: workspaceId,
        email: "fixture@example.test",
        plan: "PRO",
        authMethod: "api-key",
      });
      await next();
    });
    app.route("/actors", actorRoutes);
    const response = await app.request("/actors/analytics/events");
    expect(response.status).toBe(200);
    const rows = (await response.json()).data;
    expect(rows).toHaveLength(1);
    expect(rows[0].businessProfileId).toBe(workspaceId);
  });
  it("requires a single-use mailbox confirmation to reactivate an opted-out subscriber", async () => {
    const email = `${suffix}@newsletter.example`;
    const subscriber = await db.newsletterSubscriber.create({
      data: {
        email,
        status: "UNSUBSCRIBED",
        token: `unsubscribe-${suffix}`,
        unsubscribedAt: new Date(),
      },
    });
    const app = new Hono().route("/newsletter", newsletterRoutes);
    const response = await app.request("/newsletter/subscribe", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
    });
    expect(response.status).toBe(200);
    expect(
      (await db.newsletterSubscriber.findUniqueOrThrow({ where: { id: subscriber.id } })).status,
    ).toBe("UNSUBSCRIBED");
    const token = /token=([a-f0-9]{64})/.exec(mail.send.mock.calls.at(-1)![0].html)![1];
    const confirm = () => app.request(`/newsletter/confirm?token=${token}`, { method: "POST" });
    const confirmations = await Promise.all([confirm(), confirm()]);
    expect(confirmations.map((result) => result.status).sort()).toEqual([200, 400]);
    expect(
      (await db.newsletterSubscriber.findUniqueOrThrow({ where: { id: subscriber.id } })).status,
    ).toBe("ACTIVE");
  });
});
