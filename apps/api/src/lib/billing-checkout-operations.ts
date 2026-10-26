import { randomUUID } from "node:crypto";
import { db, Prisma } from "@actorconsole/db";
import {
  subscriptionBlocksCheckout,
  type BillingInterval,
  type PaymentGatewayKey,
} from "@actorconsole/shared";
import { AppError } from "../middleware/error.js";
import type { CheckoutResult } from "./billing-providers.js";
import type { GatewayContext } from "./payment-gateway-settings.js";
import { isDefinitiveProviderRejection } from "./billing-provider-errors.js";

/** All billing writers use this short local lock; no provider call runs under it. */
export async function lockBillingWorkspace(
  tx: Prisma.TransactionClient,
  businessProfileId: string,
  userId?: string,
) {
  const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT id FROM BusinessProfile WHERE id = ${businessProfileId}
    ${userId ? Prisma.sql`AND userId = ${userId}` : Prisma.empty} FOR UPDATE
  `);
  if (!rows.length) throw new AppError("workspace_required", "Workspace is unavailable", 409);
}

export async function reserveBillingCheckout(input: {
  businessProfileId: string;
  userId: string;
  context: GatewayContext;
  productId: string;
  interval: BillingInterval;
}) {
  return db.$transaction(async (tx) => {
    await lockBillingWorkspace(tx, input.businessProfileId, input.userId);
    const existing = await tx.subscription.findUnique({
      where: { businessProfileId: input.businessProfileId },
    });
    const operation = await tx.billingCheckoutOperation.findUnique({
      where: { businessProfileId: input.businessProfileId },
    });
    if (operation && ["RESERVED", "UNKNOWN"].includes(operation.status)) {
      throw new AppError(
        "checkout_in_progress",
        "A checkout is pending reconciliation. Retry its saved operation rather than creating another checkout.",
        409,
      );
    }
    if (existing && subscriptionBlocksCheckout(existing)) {
      throw new AppError(
        existing.provider === "manual"
          ? "admin_managed_subscription"
          : "subscription_change_required",
        "Cancel or reconcile the existing subscription before starting another checkout.",
        409,
      );
    }
    const id = randomUUID();
    const data = {
      id,
      businessProfileId: input.businessProfileId,
      userId: input.userId,
      provider: input.context.gateway,
      billingMode: input.context.mode,
      productId: input.productId,
      interval: input.interval,
      status: "RESERVED",
      providerCheckoutId: null,
      providerSubscriptionId: null,
      checkoutUrl: null,
    };
    await tx.billingCheckoutOperation.upsert({
      where: { businessProfileId: input.businessProfileId },
      create: data,
      update: data,
    });
    const reserved = {
      provider: input.context.gateway,
      billingMode: input.context.mode,
      source: "gateway",
      userId: input.userId,
      checkoutOperationId: id,
      status: "checkout_pending",
      providerCustomerId: null,
      providerSubscriptionId: null,
      providerCheckoutId: null,
      providerProductId: input.productId,
      razorpayCustomerId: null,
      razorpaySubscriptionId: null,
      razorpayPlanId: input.context.gateway === "razorpay" ? input.productId : null,
      cancelAtPeriodEnd: false,
      currentPeriodEnd: null,
      shortUrl: null,
    };
    await tx.subscription.upsert({
      where: { businessProfileId: input.businessProfileId },
      create: { ...reserved, businessProfileId: input.businessProfileId },
      update: { ...reserved, stateVersion: { increment: 1 } },
    });
    return id;
  });
}

export async function completeBillingCheckout(operationId: string, checkout: CheckoutResult) {
  await db.$transaction(async (tx) => {
    const operation = await tx.billingCheckoutOperation.findUnique({ where: { id: operationId } });
    if (!operation) throw new Error("Checkout reservation is unavailable");
    await lockBillingWorkspace(tx, operation.businessProfileId);
    const current = await tx.subscription.findUnique({
      where: { businessProfileId: operation.businessProfileId },
    });
    if (
      !current ||
      current.checkoutOperationId !== operationId ||
      current.provider !== checkout.gateway ||
      current.billingMode !== operation.billingMode ||
      (current.providerSubscriptionId &&
        checkout.providerSubscriptionId &&
        current.providerSubscriptionId !== checkout.providerSubscriptionId)
    ) {
      throw new Error("Checkout ownership changed; reconcile the provider result");
    }
    await tx.subscription.update({
      where: { id: current.id },
      data: {
        providerCheckoutId: checkout.checkoutId,
        shortUrl: checkout.checkoutUrl,
        providerProductId: checkout.providerProductId,
        providerSubscriptionId:
          current.providerSubscriptionId ?? checkout.providerSubscriptionId ?? null,
        ...(checkout.gateway === "razorpay"
          ? { razorpaySubscriptionId: checkout.providerSubscriptionId }
          : {}),
        // A signed webhook may have completed while checkout was in flight.
        ...(current.status === "checkout_pending" ? { status: checkout.status } : {}),
        stateVersion: { increment: 1 },
      },
    });
    await tx.billingCheckoutOperation.update({
      where: { id: operationId },
      data: {
        status: "SUCCEEDED",
        providerCheckoutId: checkout.checkoutId,
        providerSubscriptionId: checkout.providerSubscriptionId,
        checkoutUrl: checkout.checkoutUrl,
      },
    });
  });
}

export async function failBillingCheckout(operationId: string, error: unknown) {
  const definitive = isDefinitiveProviderRejection(error);
  await db.$transaction(async (tx) => {
    const operation = await tx.billingCheckoutOperation.findUnique({ where: { id: operationId } });
    if (!operation) throw new Error("Checkout reservation is unavailable");
    await lockBillingWorkspace(tx, operation.businessProfileId);
    await tx.billingCheckoutOperation.updateMany({
      where: { id: operationId, status: "RESERVED" },
      data: { status: definitive ? "FAILED" : "UNKNOWN" },
    });
    if (definitive)
      await tx.subscription.updateMany({
        where: {
          businessProfileId: operation.businessProfileId,
          checkoutOperationId: operationId,
          status: "checkout_pending",
        },
        data: { status: "checkout_failed", stateVersion: { increment: 1 } },
      });
  });
}

export function isCheckoutGateway(value: string): value is PaymentGatewayKey {
  return ["stripe", "dodo", "razorpay"].includes(value);
}
