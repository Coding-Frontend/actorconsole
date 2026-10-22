import { Hono } from "hono";
import { z } from "zod";
import { apiEnv } from "../config/env.js";
import { checkRateLimit } from "../lib/rate-limit.js";
import { JsonResponse, withRequestContext } from "../lib/http-context.js";
import { readWebSession } from "../lib/web-session.js";
import { canRecoverMimicSession } from "../lib/session-recovery.js";
import { POST as login } from "./web-auth/login.js";
import { POST as register } from "./web-auth/register.js";
import { POST as verifyEmail } from "./web-auth/verify-email.js";
import { POST as resetPassword } from "./web-auth/reset-password.js";
import { POST as forgotPassword } from "./web-auth/forgot-password.js";
import { POST as resendVerification } from "./web-auth/resend-verification.js";
import { POST as firebaseSession } from "./web-auth/firebase-session.js";
import { POST as signout } from "./web-auth/signout.js";
import { POST as impersonate } from "./web-auth/impersonate.js";
import { POST as exitImpersonation } from "./web-auth/impersonate-exit.js";
import { GET as impersonationStatus } from "./web-auth/impersonate-status.js";

const email = z.string().max(320);
const password = z.string().min(1).max(128);
const twoFactor = { totpCode: z.string().max(128).optional(), challengeToken: z.string().max(128).optional() };
const handlers = [
  ["/auth/local/login", login, z.object({ email, password, ...twoFactor })],
  ["/auth/local/register", register, z.object({ email, password, termsAccepted: z.boolean() })],
  ["/auth/local/verify-email", verifyEmail, z.object({ email, code: z.string().max(6) })],
  ["/auth/local/reset-password", resetPassword, z.object({ email, code: z.string().max(6), password })],
  ["/auth/local/forgot-password", forgotPassword, z.object({ email })],
  ["/auth/local/resend-verification", resendVerification, z.object({ email })],
  ["/auth/firebase-session", firebaseSession, z.object({ idToken: z.string().min(1).max(16_384), ...twoFactor })],
] as const;

export const webAuthRoutes = new Hono();
const allowedOrigins = new Set([
  ...apiEnv.CORS_ORIGINS.split(",").map((value) => value.trim()),
  ...(apiEnv.NODE_ENV === "development" ? ["http://localhost:8080", "http://127.0.0.1:8080"] : []),
]);
const authPolicy: import("hono").MiddlewareHandler = async (c, next) => {
  c.header("cache-control", "private, no-store");
  if (c.req.method !== "GET" && c.req.method !== "HEAD") {
    const origin = c.req.header("origin");
    if ((origin && !allowedOrigins.has(origin)) || c.req.header("sec-fetch-site") === "cross-site")
      return c.json({ ok: false, error: "Untrusted request origin" }, 403);
  }
  await next();
  c.res.headers.set("cache-control", "private, no-store");
};
webAuthRoutes.use("/auth/*", authPolicy);
webAuthRoutes.use("/admin/impersonate", authPolicy);
webAuthRoutes.use("/admin/impersonate/*", authPolicy);
for (const [path, handler, schema] of handlers) {
  webAuthRoutes.post(path, async (c) => {
    if (Number(c.req.header("content-length") ?? 0) > 32_768)
      return c.json({ ok: false, error: "Request too large" }, 413);
    const payload = await c.req.raw.clone().text();
    if (payload.length > 32_768) return c.json({ ok: false, error: "Request too large" }, 413);
    let body: unknown;
    try { body = JSON.parse(payload); } catch { return c.json({ ok: false, error: "Invalid JSON" }, 400); }
    if (!schema.safeParse(body).success) return c.json({ ok: false, error: "Invalid request" }, 400);
    const ip = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? c.req.header("x-real-ip") ?? "unknown";
    const limit = await checkRateLimit(`authentication:${path}:${ip}`, { windowMs: 15 * 60_000, max: 30 });
    if (!limit.allowed) {
      c.header("retry-after", String(Math.max(1, Math.ceil(limit.retryAfterMs / 1000))));
      return c.json({ ok: false, error: "Too many attempts. Please try again later." }, 429);
    }
    return withRequestContext(c.req.raw, () => handler(c.req.raw));
  });
}
webAuthRoutes.get("/auth/session", async (c) => JsonResponse.json(await readWebSession(c.req.raw)));
webAuthRoutes.get("/auth/session-recovery", (c) => withRequestContext(c.req.raw, async () => JsonResponse.json({ available: await canRecoverMimicSession() })));
webAuthRoutes.post("/auth/signout", (c) => withRequestContext(c.req.raw, signout));
webAuthRoutes.post("/admin/impersonate", (c) => withRequestContext(c.req.raw, () => impersonate(c.req.raw)));
webAuthRoutes.post("/admin/impersonate/exit", (c) => withRequestContext(c.req.raw, exitImpersonation));
webAuthRoutes.get("/admin/impersonate/status", (c) => withRequestContext(c.req.raw, impersonationStatus));
