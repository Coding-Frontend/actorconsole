import { timingSafeEqual } from "node:crypto";
import { Hono } from "hono";
import { metricsText } from "@actorconsole/shared";
import type { AppEnv } from "../app.js";

function authorized(c: { req: { header(name: string): string | undefined } }): boolean {
  const expected = process.env.METRICS_TOKEN;
  if (!expected) return process.env.NODE_ENV !== "production";
  const provided = c.req.header("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const metricsRoutes = new Hono<AppEnv>().get("/", (c) => {
  if (!authorized(c)) return c.text("Unauthorized\n", 401);
  c.header("content-type", "text/plain; version=0.0.4; charset=utf-8");
  c.header("cache-control", "no-store");
  return c.body(metricsText());
});
