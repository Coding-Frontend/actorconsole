import { Hono } from "hono";
import { db } from "@actorconsole/db";
import { isValidPaymentGateway } from "@actorconsole/shared";
import { gatewayReadiness, gatewayBillingOptions } from "../lib/billing-providers.js";
import type { AppEnv } from "../app.js";

/** Public discovery for payment gateways that can complete checkout now. */
export const paymentGatewayRoutes = new Hono<AppEnv>().get("/", async (c) => {
  const candidates = await db.paymentGateway.findMany({
    where: { enabled: true },
    orderBy: { sortOrder: "asc" },
    select: { key: true, name: true, sortOrder: true },
  });
  const gateways = await Promise.all(
    candidates.map(async (gateway) => {
      if (!isValidPaymentGateway(gateway.key)) return null;
      const readiness = await gatewayReadiness(gateway.key);
      if (!readiness.ready) return null;
      const billingOptions = await gatewayBillingOptions(gateway.key, readiness.mode);
      return billingOptions.length ? { ...gateway, mode: readiness.mode, billingOptions } : null;
    }),
  );

  return c.json({
    ok: true,
    data: gateways.filter((gateway) => gateway !== null),
  });
});
