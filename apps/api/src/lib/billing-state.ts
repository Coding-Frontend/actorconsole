import { db } from "@actorconsole/db";
import { providerSubscriptionPlan } from "@actorconsole/shared";
import { lockBillingWorkspace } from "./billing-checkout-operations.js";
import { retrieveProviderSubscription } from "./billing-providers.js";
import {
  getGatewayContext,
  subscriptionMatchesMode,
  type GatewayContext,
} from "./payment-gateway-settings.js";

/** Read revision before fetching; commit only if the local state still matches.
 * A conflicting writer causes redelivery/reconciliation, never a stale overwrite. */
export async function reconcileBillingSubscription(input: {
  context: GatewayContext;
  id: string;
  businessProfileId: string;
  userId?: string;
  checkoutId?: string;
  provisionalCheckout?: boolean;
}) {
  const { context } = input;
  const previous = await db.subscription.findUnique({
    where: { businessProfileId: input.businessProfileId },
  });
  if (!previous && (await getGatewayContext(context.gateway)).mode !== context.mode) return null;
  if (
    previous &&
    (previous.provider !== context.gateway ||
      !(await subscriptionMatchesMode(previous, context)) ||
      (previous.providerSubscriptionId && previous.providerSubscriptionId !== input.id) ||
      (context.gateway === "razorpay" &&
        previous.razorpaySubscriptionId &&
        previous.razorpaySubscriptionId !== input.id) ||
      (input.checkoutId &&
        previous.providerCheckoutId &&
        previous.providerCheckoutId !== input.checkoutId))
  )
    return null;
  const state = await retrieveProviderSubscription(context, input.id);
  if (
    (state.metadata.billingMode && state.metadata.billingMode !== context.mode) ||
    (state.metadata.businessProfileId &&
      state.metadata.businessProfileId !== input.businessProfileId) ||
    (input.userId && state.metadata.userId && state.metadata.userId !== input.userId) ||
    (previous?.checkoutOperationId &&
      !previous.providerSubscriptionId &&
      previous.checkoutOperationId !== state.metadata.checkoutOperationId)
  )
    return null;
  const plan = providerSubscriptionPlan(context.gateway, state.status, state.periodEnd);
  // Preserve provisional checkout access where it existed, except when the
  // provider confirms a terminal status that has already exhausted its period.
  const terminal = [
    "canceled",
    "cancelled",
    "unpaid",
    "incomplete_expired",
    "paused",
    "failed",
    "expired",
    "halted",
    "completed",
  ].includes(state.status);
  const nextPlan = input.provisionalCheckout && !terminal ? "PRO" : plan;
  return db.$transaction(async (tx) => {
    await lockBillingWorkspace(tx, input.businessProfileId);
    const current = await tx.subscription.findUnique({
      where: { businessProfileId: input.businessProfileId },
    });
    if (
      current?.id !== previous?.id ||
      (current?.stateVersion ?? 0) !== (previous?.stateVersion ?? 0) ||
      current?.provider !== previous?.provider ||
      current?.billingMode !== previous?.billingMode ||
      current?.razorpaySubscriptionId !== previous?.razorpaySubscriptionId ||
      current?.checkoutOperationId !== previous?.checkoutOperationId ||
      current?.status !== previous?.status ||
      current?.providerSubscriptionId !== previous?.providerSubscriptionId ||
      current?.updatedAt?.getTime() !== previous?.updatedAt?.getTime()
    ) {
      throw new Error("Subscription changed during provider reconciliation; retry delivery");
    }
    const data = {
      provider: context.gateway,
      billingMode: context.mode,
      providerSubscriptionId: state.id,
      status: state.status,
      currentPeriodEnd: state.periodEnd,
      cancelAtPeriodEnd: state.cancelAtPeriodEnd,
      providerCustomerId: state.customerId,
      providerProductId: state.productId,
      ...(input.checkoutId ? { providerCheckoutId: input.checkoutId } : {}),
      ...(context.gateway === "razorpay"
        ? { razorpaySubscriptionId: state.id, razorpayPlanId: state.productId }
        : {}),
    };
    let updated;
    if (current) {
      const claim = await tx.subscription.updateMany({
        where: {
          id: current.id,
          stateVersion: current.stateVersion,
          updatedAt: current.updatedAt,
          provider: current.provider,
          status: current.status,
          providerSubscriptionId: current.providerSubscriptionId,
        },
        data: { ...data, stateVersion: { increment: 1 } },
      });
      if (!claim.count)
        throw new Error("Subscription changed during reconciliation; retry delivery");
      updated = await tx.subscription.findUnique({ where: { id: current.id } });
    } else {
      updated = await tx.subscription.create({
        data: { ...data, businessProfileId: input.businessProfileId, userId: input.userId },
      });
    }
    if (previous?.checkoutOperationId)
      await tx.billingCheckoutOperation.updateMany({
        where: {
          id: previous.checkoutOperationId,
          businessProfileId: input.businessProfileId,
          provider: context.gateway,
          billingMode: context.mode,
          status: { in: ["RESERVED", "UNKNOWN"] },
        },
        data: {
          status: "SUCCEEDED",
          providerSubscriptionId: state.id,
          ...(input.checkoutId ? { providerCheckoutId: input.checkoutId } : {}),
        },
      });
    if (nextPlan)
      await tx.businessProfile.update({
        where: { id: input.businessProfileId },
        data: { plan: nextPlan },
      });
    return updated;
  });
}
