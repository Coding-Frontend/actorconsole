"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { PLAN_ACTOR_LIMITS, PLAN_MONTHLY_USER_LIMITS } from "@actorconsole/shared/plans";
import { Button } from "@/components/ui/button";
import {
  BillingFrequencyPicker,
  ProBenefits,
  ProPrice,
} from "@/components/billing/pro-offer-summary";
import { type ProOffer } from "@/lib/pro-billing-offers";

export function PricingPlanPicker({
  offers,
  features,
  isAuthenticated,
}: {
  offers: ProOffer[];
  features: { FREE: readonly string[]; PRO: readonly string[] };
  isAuthenticated: boolean;
}) {
  const [interval, setInterval] = useState<"month" | "year">("month");
  const selected = offers.find(({ option }) => option.interval === interval) ?? offers[0];
  const billingHref =
    selected?.option.interval === "year"
      ? "/dashboard/billing?interval=year"
      : "/dashboard/billing";
  return (
    <div className="mx-auto max-w-5xl">
      {offers.length ? (
        <div className="mb-8 flex justify-center">
          <BillingFrequencyPicker
            offers={offers}
            interval={selected.option.interval}
            onChange={setInterval}
          />
        </div>
      ) : null}
      <div className="grid gap-5 md:grid-cols-2">
        <article className="border-border bg-card order-2 flex flex-col rounded-md border p-6 sm:p-8 md:order-1">
          <h2 className="font-display-tight text-3xl">Free</h2>
          <p className="text-muted-foreground mt-2 text-sm">Get your workspace up and running.</p>
          <div className="mb-7 mt-7 space-y-2">
            <p className="flex items-baseline gap-2">
              <span className="font-display-tight text-5xl">$0</span>
              <span className="text-muted-foreground text-sm">/ month</span>
            </p>
            <p className="text-muted-foreground text-sm">
              No subscription fee. No credit card required.
            </p>
          </div>
          <p className="mb-4 text-sm font-semibold">
            {PLAN_ACTOR_LIMITS.FREE} actors · {PLAN_MONTHLY_USER_LIMITS.FREE} monthly users
          </p>
          <ul className="mb-8 space-y-3 text-sm">
            {[
              `Up to ${PLAN_ACTOR_LIMITS.FREE} actors per workspace`,
              `Up to ${PLAN_MONTHLY_USER_LIMITS.FREE} monthly users across your actors`,
              "Every workflow included within both limits",
            ].map((text) => (
              <li key={text} className="flex items-start gap-3">
                <Check
                  aria-hidden="true"
                  className="text-muted-foreground mt-0.5 size-4 shrink-0"
                />
                {text}
              </li>
            ))}
          </ul>
          <Button variant="outline" size="lg" asChild className="mt-auto w-full">
            <Link href={isAuthenticated ? "/dashboard" : "/signup"}>
              {isAuthenticated ? "Open dashboard" : "Start free"}
            </Link>
          </Button>
          <FeatureDisclosure title="Included workflows" features={features.FREE} />
        </article>
        <article className="plan-pro-panel bg-card relative order-1 flex flex-col rounded-md border p-6 sm:p-8 md:order-2">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-display-tight text-3xl">Pro</h2>
            <span className="plan-pro-wash text-foreground rounded-sm px-3 py-1 text-xs font-medium">
              Room to grow
            </span>
          </div>
          <p className="text-muted-foreground mt-2 text-sm">
            For a growing portfolio and audience.
          </p>
          <div className="mb-7 mt-7">
            <ProPrice offer={selected} />
          </div>
          <p className="mb-4 text-sm font-semibold">Unlimited actors and monthly users</p>
          <div className="mb-8">
            <ProBenefits />
          </div>
          {selected?.gateway.mode === "test" ? (
            <p className="text-warning mb-4 text-sm">
              Test checkout — no real payment will be collected.
            </p>
          ) : null}
          <Button size="lg" asChild className="mt-auto w-full">
            <Link
              href={
                isAuthenticated
                  ? billingHref
                  : `/signup?callbackUrl=${encodeURIComponent(billingHref)}`
              }
            >
              {isAuthenticated ? "Manage workspace plan" : "Choose Pro"}
              <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
          <FeatureDisclosure title="Included with Pro" features={features.PRO} />
        </article>
      </div>
      <p className="text-muted-foreground mx-auto mt-5 max-w-2xl text-center text-xs leading-5">
        Prices are per workspace. Pro subscriptions renew automatically. Final price and applicable
        taxes are confirmed at checkout.
      </p>
    </div>
  );
}

function FeatureDisclosure({ title, features }: { title: string; features: readonly string[] }) {
  return (
    <details className="border-border mt-5 border-t pt-4 text-sm">
      <summary className="cursor-pointer font-medium">{title}</summary>
      <ul className="text-muted-foreground mt-4 space-y-2">
        {features.map((feature) => (
          <li key={feature} className="flex gap-2">
            <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            {feature}
          </li>
        ))}
      </ul>
    </details>
  );
}
