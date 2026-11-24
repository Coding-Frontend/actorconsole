"use client";

import {
  currencyMinorUnitFactor,
  type ProBillingOption,
  type PaymentMode,
  type PaymentGatewayKey,
} from "@actorconsole/shared/payment-gateways";
import {
  PLAN_ACTOR_LIMITS,
  PLAN_MONTHLY_USER_LIMITS,
} from "@actorconsole/shared/plans";
import { API_BASE_URL } from "@/lib/api-base";
import { trackEvent, trackEventBeforeNavigation } from "@/lib/analytics-events";
import { paymentAnalyticsForCheckout } from "@/lib/payment-analytics";
import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/ui/action-dialog";
import {
  BillingAddressForm,
  type BillingAddress,
} from "./billing-address-form";
import { formatDate } from "@/lib/utils";
import {
  selectProOffers,
  offerPrice,
  type ProOffer,
} from "@/lib/pro-billing-offers";
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
  paymentReturn?: boolean;
  canCancelSubscription: boolean;
  gateways: Array<{
    key: PaymentGatewayKey;
    name: string;
    billingOptions?: ProBillingOption[];
    mode?: PaymentMode;
  }>;
  billingAddress?: BillingAddress | null;
  subscription?: {
    provider?: string;
    billingMode?: string | null;
    status: string;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
  } | null;
}

function checkoutContext({ gateway, option }: ProOffer) {
  return {
    gateway: gateway.key,
    payment_mode: gateway.mode ?? ("unknown" as const),
    billing_interval: option.interval,
  };
}

type HostedCheckoutDetails = Partial<Record<"name" | "phone", string>>;
type HostedCheckoutFlow = "pay" | "review";

export function BillingCard({
  plan,
  canCancelSubscription,
  gateways,
  billingAddress = null,
  subscription,
  initialInterval = "month",
  paymentReturn,
}: Props) {
  const router = useRouter();
  const detailsId = useId();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [checkoutOffer, setCheckoutOffer] = useState<ProOffer | null>(null);
  const [openingCheckout, setOpeningCheckout] = useState(false);
  const [missingDetails, setMissingDetails] = useState<HostedCheckoutDetails>({});
  const [checkoutDetails, setCheckoutDetails] = useState<HostedCheckoutDetails>({});
  const [checkoutError, setCheckoutError] = useState<string>();
  const [detailsSubmitted, setDetailsSubmitted] = useState(false);
  const checkoutInProgress = useRef(false);
  const checkoutHeading = useRef<HTMLHeadingElement>(null);
  const upgradeButton = useRef<HTMLButtonElement>(null);
  const offers = selectProOffers(gateways);
  const [chosenInterval, setChosenInterval] =
    useState<ProBillingOption["interval"]>(initialInterval);
  const selectedOffer =
    offers.find(({ option }) => option.interval === chosenInterval) ??
    offers[0];

  useEffect(() => {
    if (checkoutOffer) checkoutHeading.current?.focus();
  }, [checkoutOffer]);

  useEffect(() => {
    if (!paymentReturn || plan === "PRO" || subscription?.status === "test_completed") return;
    const timer = window.setInterval(() => router.refresh(), 2500);
    const stop = window.setTimeout(() => window.clearInterval(timer), 30_000);
    return () => {
      window.clearInterval(timer);
      window.clearTimeout(stop);
    };
  }, [paymentReturn, plan, router, subscription?.status]);

  function startCheckout(hostedCheckoutFlow: HostedCheckoutFlow = "pay") {
    if (!selectedOffer) return;
    const { option } = selectedOffer;
    const price =
      option.currency && option.amountMinor !== undefined
        ? option.amountMinor / currencyMinorUnitFactor(option.currency)
        : undefined;
    void trackEvent("select_plan", {
      plan: "PRO",
      billing_interval: option.interval,
      source: "billing",
    });
    void trackEvent("begin_checkout", {
      ...checkoutContext(selectedOffer),
      ...(price !== undefined
        ? { currency: option.currency, value: price }
        : {}),
      items: [
        {
          item_id: "pro",
          item_name: "Pro",
          item_variant: option.interval,
          ...(price !== undefined ? { price } : {}),
          quantity: 1,
        },
      ],
    });
    if (selectedOffer.gateway.key === "codingfrontend") {
      openHostedCheckout(selectedOffer, hostedCheckoutFlow);
    } else {
      setCheckoutOffer(selectedOffer);
    }
  }

  function backToPlans() {
    setCheckoutOffer(null);
    setMissingDetails({});
    setCheckoutDetails({});
    setCheckoutError(undefined);
    setDetailsSubmitted(false);
    requestAnimationFrame(() => upgradeButton.current?.focus());
  }

  function openHostedCheckout(offer: ProOffer, flow: HostedCheckoutFlow, details?: HostedCheckoutDetails) {
    setCheckoutError(undefined);
    void checkout(offer, flow, details).catch((error: unknown) => {
      setCheckoutError(error instanceof Error ? error.message : "Checkout could not be opened.");
    });
  }

  async function checkout(offer: ProOffer, flow?: HostedCheckoutFlow, details?: HostedCheckoutDetails) {
    if (checkoutInProgress.current) return;
    checkoutInProgress.current = true;
    setOpeningCheckout(true);
    const context = checkoutContext(offer);
    let reason: "network" | "provider" | "invalid_response" = "network";
    try {
      const analytics = await paymentAnalyticsForCheckout();
      const res = await fetch(`${API_BASE_URL}/billing/checkout`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          plan: "PRO",
          gateway: offer.gateway.key,
          interval: offer.option.interval,
          ...(analytics ? { analytics } : {}),
          ...(flow ? { hostedCheckoutFlow: flow } : {}),
          ...(details ? { checkoutDetails: details } : {}),
        }),
      });
      reason = res.ok ? "invalid_response" : "provider";
      const body = await res.json();
      if (res.status === 422 && flow === "pay" && body?.error?.code === "checkout_details_required") {
        const fields = body.error.fields;
        setDetailsSubmitted(Boolean(details));
        setMissingDetails({
          ...(typeof fields?.name === "string" ? { name: fields.name } : {}),
          ...(typeof fields?.phone === "string" ? { phone: fields.phone } : {}),
        });
        setCheckoutOffer(offer);
        return;
      }
      if (!res.ok)
        throw new Error(
          body?.error?.message ??
            "Checkout could not be opened. Please try again.",
        );
      const checkoutUrl = body?.data?.checkoutUrl;
      if (!checkoutUrl || typeof checkoutUrl !== "string")
        throw new Error(
          "Checkout is temporarily unavailable. Please try again or contact support.",
        );
      await trackEventBeforeNavigation("checkout_redirected", context);
      const url = new URL(checkoutUrl);
      if (offer.gateway.key === "codingfrontend") {
        const expectedHost = offer.gateway.mode === "test"
          ? url.hostname.endsWith(".codingfrontend.in") || url.hostname.endsWith(".workers.dev")
          : url.hostname === "codingfrontend.in";
        if (url.protocol !== "https:" || url.username || url.password || url.port || !expectedHost)
          throw new Error("The hosted checkout address is invalid.");
        if (typeof body.data.checkoutPrefill === "string")
          url.hash = new URLSearchParams({ prefill: body.data.checkoutPrefill }).toString();
      }
      window.location.href = url.href;
    } catch (error) {
      void trackEvent("checkout_failed", { ...context, reason });
      throw error;
    } finally {
      checkoutInProgress.current = false;
      setOpeningCheckout(false);
    }
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
    void trackEvent("subscription_cancelled", {
      payment_mode:
        subscription?.billingMode === "test" ||
        subscription?.billingMode === "live"
          ? subscription.billingMode
          : "unknown",
    });
    toast.success("Subscription cancelled. Access continues until period end.");
    router.refresh();
  }

  return (
    <div className="space-y-10">
      <div
        className={
          plan === "FREE"
            ? "grid items-stretch gap-5 lg:grid-cols-[1fr_1.3fr]"
            : ""
        }
      >
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
                <p className="text-muted-foreground mt-2 text-sm">
                  No subscription fee.
                </p>
              </div>
            ) : null}
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-muted-foreground text-sm">
                  Actors per workspace
                </p>
                <p className="mt-1 text-xl font-semibold tabular-nums">
                  {plan === "FREE"
                    ? `Up to ${PLAN_ACTOR_LIMITS.FREE}`
                    : "Unlimited"}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground text-sm">
                  Monthly users across your actors
                </p>
                <p className="mt-1 text-xl font-semibold tabular-nums">
                  {plan === "FREE"
                    ? `Up to ${PLAN_MONTHLY_USER_LIMITS.FREE}`
                    : "Unlimited"}
                </p>
              </div>
            </div>
            <p className="text-muted-foreground text-sm">
              {plan === "FREE"
                ? "All workflows are included within both limits. Upgrade to Pro when your workspace exceeds either limit."
                : "All workflows are included, with no actor or monthly-user limits."}
            </p>
            <p className="text-muted-foreground text-xs">
              Monthly users are summed across your actors for the past 30 days.
              The same person can count in more than one actor.
            </p>
            {plan === "FREE" ? (
              <p className="border-border border-t pt-4 text-sm leading-6">
                Growing your portfolio? Pro keeps your tools available when
                either Free limit is exceeded.
              </p>
            ) : null}
            {paymentReturn && plan === "FREE" && subscription?.status !== "test_completed" ? (
              <Alert tone="warning">
                Waiting for payment confirmation. This page will refresh automatically.
              </Alert>
            ) : null}
            {paymentReturn && subscription?.status === "test_completed" ? (
              <Alert tone="warning">Test payment confirmed.</Alert>
            ) : null}
            {subscription?.billingMode === "test" && subscription.status !== "test_completed" ? (
              <Badge variant="warning">Test subscription</Badge>
            ) : null}
            {subscription ? (
              <div className="border-border bg-muted/20 grid gap-3 border p-4 text-sm sm:grid-cols-2">
                <div>
                  <p className="text-muted-foreground text-xs">
                    Subscription status
                  </p>
                  <p className="mt-1 font-medium capitalize">
                    {subscription.cancelAtPeriodEnd
                      ? "Cancels at period end"
                      : subscription.status.replaceAll("_", " ")}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">
                    {subscription.cancelAtPeriodEnd || subscription.provider === "codingfrontend"
                      ? "Access until"
                      : "Next billing date"}
                  </p>
                  <p className="mt-1 font-medium">
                    {subscription.currentPeriodEnd
                      ? formatDate(subscription.currentPeriodEnd, {
                          withTime: true,
                        })
                      : "Date unavailable"}
                  </p>
                </div>
              </div>
            ) : null}
            {canCancelSubscription ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCancelOpen(true)}
              >
                Cancel subscription
              </Button>
            ) : null}
            {plan === "PRO" && subscription?.provider !== "codingfrontend" ? (
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
                {checkoutOffer?.gateway.key === "codingfrontend"
                  ? "Checkout details"
                  : checkoutOffer ? "Billing address" : "Grow with Pro"}
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
                    {checkoutOffer.gateway.key === "codingfrontend"
                      ? "We’ll save these details for your next checkout."
                      : "Enter your billing details before continuing to checkout. Your plan changes after payment is confirmed."}
                  </p>
                  {checkoutOffer.gateway.mode === "test" ? (
                    <Alert tone="warning">
                      Test checkout — no real payment will be collected.
                    </Alert>
                  ) : null}
                  {checkoutOffer.gateway.key === "codingfrontend" ? (
                    <form onSubmit={(event) => {
                      event.preventDefault();
                      openHostedCheckout(checkoutOffer, "pay", checkoutDetails);
                    }}>
                      <fieldset disabled={openingCheckout} className="space-y-4">
                        {(["name", "phone"] as const).map((field) => missingDetails[field] && (
                          <div key={field} className="space-y-1">
                            <label htmlFor={`${detailsId}-${field}`} className="block text-sm font-medium">
                              {field === "name" ? "Billing name" : "Phone number with country code"}
                            </label>
                            <Input
                              id={`${detailsId}-${field}`}
                              name={field}
                              type={field === "phone" ? "tel" : "text"}
                              autoComplete={field === "phone" ? "tel" : "name"}
                              maxLength={field === "phone" ? 32 : 120}
                              value={checkoutDetails[field] ?? ""}
                              onChange={(event) => setCheckoutDetails({
                                ...checkoutDetails,
                                [field]: event.target.value,
                              })}
                              aria-invalid={detailsSubmitted || undefined}
                              aria-describedby={`${detailsId}-${field}-help`}
                              required
                            />
                            <span id={`${detailsId}-${field}-help`} className="text-muted-foreground block text-xs"
                              role={detailsSubmitted ? "alert" : undefined}>
                              {missingDetails[field]}
                            </span>
                          </div>
                        ))}
                        {checkoutError ? <Alert tone="danger">{checkoutError}</Alert> : null}
                        <div className="flex flex-wrap gap-3">
                          <Button type="submit" loading={openingCheckout} loadingText="Opening checkout…">
                            Save and pay
                          </Button>
                          <Button type="button" variant="outline" onClick={backToPlans}>
                            Back to plans
                          </Button>
                        </div>
                        <Button type="button" variant="link" className="h-auto px-0"
                          onClick={() => openHostedCheckout(checkoutOffer, "review")}>
                          Review checkout or apply coupon
                        </Button>
                      </fieldset>
                    </form>
                  ) : (
                    <BillingAddressForm
                      initial={billingAddress}
                      checkout
                      onSaved={() => checkout(checkoutOffer)}
                      onBack={backToPlans}
                    />
                  )}
                </>
              ) : (
                <>
                  {offers.length ? (
                    <BillingFrequencyPicker
                      offers={offers}
                      interval={selectedOffer.option.interval}
                      onChange={(interval) => {
                        setChosenInterval(interval);
                        setCheckoutError(undefined);
                      }}
                    />
                  ) : (
                    <p className="text-muted-foreground text-sm">
                      Online subscription checkout is temporarily unavailable.
                      Contact billing support.
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
                    <Alert tone="warning">
                      Test checkout — no real payment will be collected.
                    </Alert>
                  ) : null}
                  {checkoutError ? <Alert tone="danger">{checkoutError}</Alert> : null}
                  <Button
                    ref={upgradeButton}
                    size="lg"
                    className="w-full"
                    onClick={() => startCheckout()}
                    disabled={!selectedOffer || openingCheckout}
                  >
                    {openingCheckout ? "Opening checkout…" : selectedOffer?.gateway.key === "codingfrontend" ? "Pay" : "Upgrade to Pro"}
                    <ArrowRight aria-hidden="true" />
                  </Button>
                  {selectedOffer?.gateway.key === "codingfrontend" ? (
                    <Button type="button" variant="link" className="h-auto px-0"
                      disabled={openingCheckout} onClick={() => startCheckout("review")}>
                      Review checkout or apply coupon
                    </Button>
                  ) : null}
                  <p className="text-muted-foreground text-xs leading-5">
                    {selectedOffer?.gateway.key === "codingfrontend"
                      ? "Continue to CodingFrontend to review your billing details and pay for the selected period."
                      : "Subscriptions renew automatically. Final price and applicable taxes are shown at checkout. You can cancel future renewals from this page."}
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
