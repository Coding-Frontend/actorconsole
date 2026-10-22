"use client";

import { type ProBillingOption, type PaymentMode } from "@actorconsole/shared/payment-gateways";
import { PLAN_ACTOR_LIMITS, PLAN_MONTHLY_USER_LIMITS } from "@actorconsole/shared/plans";
import { API_BASE_URL } from "@/lib/api-base";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/ui/action-dialog";
import { BillingAddressForm, type BillingAddress } from "./billing-address-form";
import { formatDate } from "@/lib/utils";
import { selectProOffers, offerPrice, type ProOffer } from "@/lib/pro-billing-offers";
import { PlanComparison } from "@/components/billing/plan-comparison";
import {
  BillingFrequencyPicker,
  ProBenefits,
  ProPrice,
} from "@/components/billing/pro-offer-summary";
import { ArrowRight } from "lucide-react";

interface Props {
  plan: "FREE" | "PRO";
  initialInterval?: "month" | "year";
  canCancelSubscription: boolean;
  gateways: Array<{
    key: "stripe" | "razorpay" | "dodo";
    name: string;
    billingOptions?: ProBillingOption[];
    mode?: PaymentMode;
  }>;
  billingAddress?: BillingAddress | null;
  subscription?: {
    billingMode?: string | null;
    status: string;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
  } | null;
}

export function BillingCard({
  plan,
  canCancelSubscription,
  gateways,
  billingAddress = null,
  subscription,
  initialInterval = "month",
}: Props) {
  const router = useRouter();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [checkoutOffer, setCheckoutOffer] = useState<ProOffer | null>(null);
  const checkoutHeading = useRef<HTMLHeadingElement>(null);
  const upgradeButton = useRef<HTMLButtonElement>(null);
  const offers = selectProOffers(gateways);
  const [chosenInterval, setChosenInterval] =
    useState<ProBillingOption["interval"]>(initialInterval);
  const selectedOffer =
    offers.find(({ option }) => option.interval === chosenInterval) ?? offers[0];

  useEffect(() => {
    if (checkoutOffer) checkoutHeading.current?.focus();
  }, [checkoutOffer]);

  async function checkout() {
    if (!checkoutOffer) return;
    const res = await fetch(`${API_BASE_URL}/billing/checkout`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        plan: "PRO",
        gateway: checkoutOffer.gateway.key,
        interval: checkoutOffer.option.interval,
      }),
    });
    const body = await res.json();
    if (!res.ok)
      throw new Error(body?.error?.message ?? "Checkout could not be opened. Please try again.");
    const checkoutUrl = body?.data?.checkoutUrl;
    if (!checkoutUrl || typeof checkoutUrl !== "string")
      throw new Error("Checkout is temporarily unavailable. Please try again or contact support.");
    window.location.href = checkoutUrl;
  }

  async function cancelSubscription() {
    const res = await fetch(`${API_BASE_URL}/billing/cancel`, {
      method: "POST",
      credentials: "include",
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body?.error?.message ?? `HTTP ${res.status}`);
    }
    toast.success("Subscription cancelled. Access continues until period end.");
    router.refresh();
  }

  return (
    <div className="space-y-10">
      <div className={plan === "FREE" ? "grid items-stretch gap-5 lg:grid-cols-[1fr_1.3fr]" : ""}>
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle className="font-display-tight text-2xl sm:text-3xl">
                {plan === "PRO" ? "Pro" : "Free"}
              </CardTitle>
              <Badge variant="secondary">Current plan</Badge>
            </div>
            <CardDescription>
              {plan === "FREE"
                ? "You are currently on the Free plan."
                : "You are currently on the Pro plan."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {plan === "FREE" ? (
              <div className="pb-3">
                <p className="flex items-baseline gap-2">
                  <span className="font-display-tight text-5xl">$0</span>
                  <span className="text-muted-foreground text-sm">/ month</span>
                </p>
                <p className="text-muted-foreground mt-2 text-sm">No subscription fee.</p>
              </div>
            ) : null}
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-muted-foreground text-sm">Actors per workspace</p>
                <p className="mt-1 text-xl font-semibold tabular-nums">
                  {plan === "FREE" ? `Up to ${PLAN_ACTOR_LIMITS.FREE}` : "Unlimited"}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground text-sm">Monthly users across your actors</p>
                <p className="mt-1 text-xl font-semibold tabular-nums">
                  {plan === "FREE" ? `Up to ${PLAN_MONTHLY_USER_LIMITS.FREE}` : "Unlimited"}
                </p>
              </div>
            </div>
            <p className="text-muted-foreground text-sm">
              {plan === "FREE"
                ? "All workflows are included within both limits. Upgrade to Pro when your workspace exceeds either limit."
                : "All workflows are included, with no actor or monthly-user limits."}
            </p>
            <p className="text-muted-foreground text-xs">
              Monthly users are summed across your actors for the past 30 days. The same person can
              count in more than one actor.
            </p>
            {plan === "FREE" ? (
              <p className="border-border border-t pt-4 text-sm leading-6">
                Growing your portfolio? Pro keeps your tools available when either Free limit is
                exceeded.
              </p>
            ) : null}
            {subscription?.billingMode === "test" ? (
              <Badge variant="warning">Test subscription</Badge>
            ) : null}
            {subscription ? (
              <div className="border-border bg-muted/20 grid gap-3 border p-4 text-sm sm:grid-cols-2">
                <div>
                  <p className="text-muted-foreground text-xs">Subscription status</p>
                  <p className="mt-1 font-medium capitalize">
                    {subscription.cancelAtPeriodEnd
                      ? "Cancels at period end"
                      : subscription.status.replaceAll("_", " ")}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">
                    {subscription.cancelAtPeriodEnd ? "Access until" : "Next billing date"}
                  </p>
                  <p className="mt-1 font-medium">
                    {subscription.currentPeriodEnd
                      ? formatDate(subscription.currentPeriodEnd, { withTime: true })
                      : "Date unavailable"}
                  </p>
                </div>
              </div>
            ) : null}
            {canCancelSubscription ? (
              <Button variant="outline" size="sm" onClick={() => setCancelOpen(true)}>
                Cancel subscription
              </Button>
            ) : null}
            {plan === "PRO" ? (
              <details className="border-border border-t pt-4">
                <summary className="focus-visible:ring-ring cursor-pointer text-sm font-medium focus-visible:ring-2">
                  Manage billing address
                </summary>
                <div className="mt-4">
                  <BillingAddressForm initial={billingAddress} />
                </div>
              </details>
            ) : null}
          </CardContent>
        </Card>
        {plan === "FREE" ? (
          <Card className="plan-pro-panel">
            <CardHeader>
              <CardTitle
                className="font-display-tight text-2xl sm:text-3xl"
                ref={checkoutHeading}
                tabIndex={checkoutOffer ? -1 : undefined}
              >
                {checkoutOffer ? "Billing address" : "Grow with Pro"}
              </CardTitle>
              <CardDescription>
                {checkoutOffer
                  ? `Pro · ${checkoutOffer.option.interval === "year" ? "Yearly" : "Monthly"} billing${offerPrice(checkoutOffer.option) ? ` · ${offerPrice(checkoutOffer.option)} per ${checkoutOffer.option.interval === "year" ? "year" : "month"}` : ""}`
                  : "Unlimited actors. Unlimited monthly users. One workspace."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {checkoutOffer ? (
                <>
                  <p className="text-muted-foreground text-sm">
                    Enter your billing details before continuing to checkout. Your plan changes
                    after payment is confirmed.
                  </p>
                  {checkoutOffer.gateway.mode === "test" ? (
                    <p className="text-warning text-sm" role="status">
                      Test checkout — no real payment will be collected.
                    </p>
                  ) : null}
                  <BillingAddressForm
                    initial={billingAddress}
                    checkout
                    onSaved={checkout}
                    onBack={() => {
                      setCheckoutOffer(null);
                      requestAnimationFrame(() => upgradeButton.current?.focus());
                    }}
                  />
                </>
              ) : (
                <>
                  {offers.length ? (
                    <BillingFrequencyPicker
                      offers={offers}
                      interval={selectedOffer.option.interval}
                      onChange={setChosenInterval}
                    />
                  ) : (
                    <p className="text-muted-foreground text-sm">
                      Online subscription checkout is temporarily unavailable. Contact billing
                      support.
                    </p>
                  )}
                  {selectedOffer ? (
                    <div className="py-3">
                      <ProPrice offer={selectedOffer} />
                    </div>
                  ) : null}
                  <div className="pb-3">
                    <ProBenefits />
                  </div>
                  {selectedOffer?.gateway.mode === "test" ? (
                    <p className="text-warning text-sm" role="status">
                      Test checkout — no real payment will be collected.
                    </p>
                  ) : null}
                  <Button
                    ref={upgradeButton}
                    size="lg"
                    className="w-full"
                    onClick={() => selectedOffer && setCheckoutOffer(selectedOffer)}
                    disabled={!selectedOffer}
                  >
                    Upgrade to Pro
                    <ArrowRight aria-hidden="true" />
                  </Button>
                  <p className="text-muted-foreground text-xs leading-5">
                    Subscriptions renew automatically. Final price and applicable taxes are shown at
                    checkout. You can cancel future renewals from this page.
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        ) : null}
      </div>
      <PlanComparison />
      <ConfirmDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title="Cancel this subscription?"
        description={`Your ${plan} workspace will keep its paid access until ${subscription?.currentPeriodEnd ? formatDate(subscription.currentPeriodEnd, { withTime: true }) : "the current billing period ends"}. Future renewals will stop.`}
        confirmLabel="Cancel subscription"
        destructive
        onConfirm={cancelSubscription}
      />
    </div>
  );
}
