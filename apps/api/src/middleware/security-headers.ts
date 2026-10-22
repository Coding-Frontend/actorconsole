import { secureHeaders } from "hono/secure-headers";
import type { MiddlewareHandler } from "hono";

const privateHeaders = secureHeaders();
const publicImageHeaders = secureHeaders({ crossOriginResourcePolicy: "cross-origin" });

/** Only the published logo endpoint may be embedded by the static frontend. */
export const apiSecurityHeaders: MiddlewareHandler = (c, next) => {
  const publicImage =
    ["GET", "HEAD"].includes(c.req.method) && /^\/website-logo-assets\/[^/]+$/.test(c.req.path);
  return (publicImage ? publicImageHeaders : privateHeaders)(c, next);
};
