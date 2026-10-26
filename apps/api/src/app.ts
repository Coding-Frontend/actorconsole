import { Hono } from "hono";
import { webAuthRoutes } from "./routes/web-auth.js";
import { publicCatalogRoutes } from "./routes/public-catalog.js";
import { cors } from "hono/cors";
import { csrf } from "hono/csrf";
import { routePath } from "hono/route";
import { requestBodyLimit } from "./middleware/request-body-limit.js";
import { apiSecurityHeaders } from "./middleware/security-headers.js";
import { healthRoutes } from "./routes/health.js";
import { intelligenceRoutes } from "./routes/intelligence.js";
import { openApiRoutes } from "./routes/openapi.js";
import { actorRoutes } from "./routes/actors.js";
import { actorOptimizationRoutes } from "./routes/actor-optimization.js";
import { actorLogoRecommendationRoutes } from "./routes/actor-logo-recommendations.js";
import { keywordRoutes } from "./routes/keywords.js";
import { bulkPublishingRoutes } from "./routes/bulk-publishing.js";
import { webhookRoutes } from "./routes/webhooks.js";
import { razorpayRoutes } from "./routes/razorpay.js";
import { billingRoutes } from "./routes/billing.js";
import { mcpProxyRoutes } from "./routes/mcp.js";
import { apifyRoutes } from "./routes/apify.js";
import { extensionDeviceRoutes } from "./routes/extension-device.js";
import { adminRoutes } from "./routes/admin.js";
import { adminAiProviderRoutes } from "./routes/admin-ai-providers.js";
import { adminWebsiteLogoRoutes } from "./routes/admin-website-logos.js";
import { websiteLogoAssetRoutes } from "./routes/website-logo-assets.js";
import { policyRoutes } from "./routes/policies.js";
import { ticketRoutes } from "./routes/tickets.js";
import { notificationRoutes } from "./routes/notifications.js";
import { accountRoutes } from "./routes/account.js";
import { paymentGatewayRoutes } from "./routes/payment-gateways.js";
import { announcementRoutes } from "./routes/announcements.js";
import { changelogRoutes } from "./routes/changelog.js";
import { statusRoutes } from "./routes/status.js";
import { faqRoutes } from "./routes/faq.js";
import { metricsRoutes } from "./routes/metrics.js";
import { blogPublicRoutes, blogAdminRoutes, newsletterSendRoutes } from "./routes/blog.js";
import { newsletterRoutes } from "./routes/newsletter.js";
import { contactRoutes } from "./routes/contact.js";
import { requireAuth, requireInteractiveSession } from "./middleware/auth.js";
import { errorHandler, onErrorHandler } from "./middleware/error.js";
import {
  requireActorApiKeyCapability,
  requireApiKeyMethodCapability,
  requireApiKeyMethodScope,
  requireApiKeyScope,
  requirePublishingApiKeyCapability,
} from "./middleware/api-key-scope.js";
import { apiEnv } from "./config/env.js";
import type { UserSession } from "@actorconsole/shared";
import { getLogger, incrementMetric, observeMetric } from "@actorconsole/shared";
import { randomUUID } from "node:crypto";
import { resolveBusinessProfile } from "./lib/business-profile.js";
import { requireWorkspaceOperationalAccess } from "./middleware/workspace-access.js";

export type AppEnv = {
  Variables: {
    session: UserSession;
  };
};

export const app = new Hono<AppEnv>();
const requestLog = getLogger("api:http");

const configuredOrigins = apiEnv.CORS_ORIGINS.split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

// The web app uses port 8080 in this repository's local development setup,
// while older env files still list the original 3000/3001 dev ports. Keep the
// explicit env allow-list authoritative in production, but make the local
// browser setup work without requiring every developer to edit CORS_ORIGINS.
const allowedOrigins = [
  ...configuredOrigins,
  ...(apiEnv.NODE_ENV === "development" ? ["http://localhost:8080", "http://127.0.0.1:8080"] : []),
].filter((origin, index, origins) => origins.indexOf(origin) === index);

// --- global middleware ---
app.use("*", async (c, next) => {
  const requestId = c.req.header("x-request-id") ?? randomUUID();
  const started = performance.now();
  c.header("x-request-id", requestId);
  try {
    await next();
  } finally {
    const durationSec = (performance.now() - started) / 1000;
    // Registered patterns keep arbitrary paths and identifiers out of metric labels.
    const registeredPath = routePath(c, -1);
    const path = registeredPath && !["*", "/*"].includes(registeredPath) ? registeredPath : "unmatched";
    const method = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "TRACE", "CONNECT"].includes(c.req.method)
      ? c.req.method : "OTHER";
    incrementMetric("actorconsole_http_requests_total", {
      method,
      path,
      status: c.res.status,
    });
    observeMetric("actorconsole_http_request_duration_seconds", durationSec, {
      method,
      path,
    });
    requestLog.info(
      {
        requestId,
        method: c.req.method,
        path,
        status: c.res.status,
        durationMs: Math.round(durationSec * 1000),
      },
      "HTTP request",
    );
  }
});
app.use(
  "*",
  cors({
    origin: (origin, c) => {
      // Unpacked builds receive different IDs. Device credentials, rather than
      // a Chrome Web Store registration, authorize extension API access.
      if (
        c.req.path.startsWith("/extension-device/") &&
        /^chrome-extension:\/\/[a-p]{32}$/.test(origin)
      ) {
        return origin;
      }
      return allowedOrigins.includes(origin) ? origin : null;
    },
    credentials: true,
    exposeHeaders: ["Content-Disposition", "X-Request-Id", "Retry-After"],
  }),
);
// CSRF protection: only accept browser form requests from our own origins.
// Hono rejects a missing Origin before invoking the configured origin callback,
// so explicitly bypass its browser-only check for server-to-server requests,
// signed webhooks, and authenticated CLI calls that send neither Fetch Metadata
// nor Origin headers.
const csrfProtection = csrf({
  origin: (origin) => allowedOrigins.includes(origin),
});
app.use("*", async (c, next) => {
  if (
    (c.req.path === "/extension-device/claim" ||
      c.req.path === "/extension-device/poll" ||
      (c.req.path.startsWith("/extension-device/") &&
        c.req.header("authorization")?.startsWith("Bearer acx_"))) &&
    !c.req.header("cookie")
  ) {
    return next();
  }
  if (!c.req.header("origin") && !c.req.header("sec-fetch-site")) return next();
  return csrfProtection(c, next);
});
app.use("*", apiSecurityHeaders);
app.use("*", errorHandler());
app.onError(onErrorHandler);
// Allow the existing 5 MiB image upload plus multipart overhead while bounding all parsers.
const defaultBodyLimit = requestBodyLimit(6 * 1024 * 1024);
const resendBodyLimit = requestBodyLimit(1_048_576);
app.use("*", (c, next) => (c.req.path === "/webhooks/resend" ? resendBodyLimit : defaultBodyLimit)(c, next));

// API-owned auth and public catalog routes precede protected actor/admin prefixes.
app.route("/", webAuthRoutes);
app.route("/", publicCatalogRoutes);

// --- public routes (no auth) ---
app.route("/health", healthRoutes);
app.use("/intelligence/*", requireAuth());
app.use("/intelligence/*", resolveBusinessProfile());
app.use("/intelligence/*", requireWorkspaceOperationalAccess);
app.route("/intelligence", intelligenceRoutes);
app.route("/metrics", metricsRoutes);
app.route("/payment-gateways", paymentGatewayRoutes);
app.route("/", openApiRoutes); // /openapi.json + /docs
app.route("/webhooks", webhookRoutes);
app.route("/website-logo-assets", websiteLogoAssetRoutes);

// --- Razorpay routes: only the signed webhook is public ---
const razorpayAuth = requireAuth();
app.use("/razorpay/*", async (c, next) => {
  if (c.req.path === "/razorpay/webhook") return next();
  return razorpayAuth(c, next);
});
app.use("/razorpay/*", async (c, next) => {
  if (c.req.path === "/razorpay/webhook") return next();
  return resolveBusinessProfile()(c, next);
});
app.use("/razorpay/*", async (c, next) => {
  if (c.req.path === "/razorpay/webhook") return next();
  return requireInteractiveSession()(c, next);
});
app.route("/razorpay", razorpayRoutes);

// --- Provider-neutral billing routes: signed webhooks are public; checkout is authenticated. ---
const billingAuth = requireAuth();
app.use("/billing/*", async (c, next) => {
  if (c.req.path.startsWith("/billing/webhooks/")) return next();
  return billingAuth(c, next);
});
app.use("/billing/*", async (c, next) => {
  if (c.req.path.startsWith("/billing/webhooks/")) return next();
  return resolveBusinessProfile()(c, next);
});
app.use("/billing/*", async (c, next) => {
  if (c.req.path.startsWith("/billing/webhooks/")) return next();
  return requireInteractiveSession()(c, next);
});
app.route("/billing", billingRoutes);

// --- authed user routes ---
app.use("/account/*", requireAuth());
app.use("/account/*", resolveBusinessProfile({ required: false }));
app.use("/account/*", requireInteractiveSession());
app.use("/account/*", requireApiKeyMethodScope());
app.use("/account/*", requireWorkspaceOperationalAccess);
app.use("/actors/*", requireAuth());
app.use("/actors/*", resolveBusinessProfile());
app.use("/actors/*", requireApiKeyMethodScope({ allowGranularMcp: true }));
app.use("/actors/*", requireActorApiKeyCapability());
app.use("/actors/*", requireWorkspaceOperationalAccess);
app.use("/keywords/*", requireAuth());
app.use("/keywords/*", resolveBusinessProfile());
app.use("/keywords/*", requireApiKeyMethodScope({ allowGranularMcp: true }));
app.use("/keywords/*", requireApiKeyMethodCapability("actors:read", "actors:write"));
app.use("/bulk-publishing/*", requireAuth());
app.use("/bulk-publishing/*", resolveBusinessProfile());
app.use("/bulk-publishing/*", requireApiKeyMethodScope({ allowGranularMcp: true }));
app.use("/bulk-publishing/*", requirePublishingApiKeyCapability());
app.use("/bulk-publishing/*", requireWorkspaceOperationalAccess);
app.use("/mcp/*", requireAuth());
app.use("/mcp/*", resolveBusinessProfile());
app.use("/mcp/*", requireApiKeyScope("mcp"));
app.use("/apify/*", requireAuth());
app.use("/apify/*", resolveBusinessProfile());
app.use("/apify/*", requireApiKeyMethodScope());
app.use("/apify/*", requireWorkspaceOperationalAccess);
app.use("/apify/connect", requireInteractiveSession());
app.use("/apify/disconnect", requireInteractiveSession());
app.use("/apify/extension/*", requireInteractiveSession());
app.use("/extension-device/pair", requireAuth());
app.use("/extension-device/pair", requireInteractiveSession());
app.use("/extension-device/pair/status", requireAuth());
app.use("/extension-device/pair/status", requireInteractiveSession());

// Register static optimization routes before the Actor ID catch-all routes.
app.route("/actors", actorLogoRecommendationRoutes);
app.route("/actors", actorOptimizationRoutes);
app.route("/actors", actorRoutes);
app.route("/keywords", keywordRoutes);
app.route("/bulk-publishing", bulkPublishingRoutes);
app.route("/mcp", mcpProxyRoutes);
app.route("/apify", apifyRoutes);
app.route("/extension-device", extensionDeviceRoutes);

// --- public + authed policy routes ---
app.route("/policies", policyRoutes);

// --- public blog routes (read-only) ---
app.route("/blog", blogPublicRoutes);

// --- public newsletter subscribe/unsubscribe routes ---
app.route("/newsletter", newsletterRoutes);
app.route("/contact", contactRoutes);

// --- authed ticket routes (admin checks live inside) ---
app.use("/tickets/*", requireAuth());
app.use("/tickets/*", resolveBusinessProfile({ required: false }));
app.route("/tickets", ticketRoutes);

// --- authed notification routes ---
app.use("/notifications/*", requireAuth());
app.use("/notifications/*", resolveBusinessProfile());
app.route("/notifications", notificationRoutes);
app.route("/account", accountRoutes);

// --- public + authed announcement routes ---
app.route("/announcements", announcementRoutes);

// --- public changelog routes (read-only) ---
app.route("/changelog", changelogRoutes);

// --- public status routes (read-only) ---
app.route("/status", statusRoutes);

// --- public FAQ routes (read-only) ---
app.route("/faq", faqRoutes);

// --- admin routes (require ADMIN role, enforced inside admin.ts) ---
app.route("/admin/ai-providers", adminAiProviderRoutes);
app.route("/admin/website-logos", adminWebsiteLogoRoutes);
app.route("/admin", adminRoutes);
app.route("/admin/blog", blogAdminRoutes);
app.route("/admin/newsletter", newsletterSendRoutes);

app.notFound((c) =>
  c.json(
    {
      ok: false,
      error: { code: "not_found", message: `No route for ${c.req.method} ${c.req.path}` },
    },
    404,
  ),
);
