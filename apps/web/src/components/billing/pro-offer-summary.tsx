"use client";

import { useId } from "react";
import { Check } from "lucide-react";
import { type ProBillingOption } from "@actorconsole/shared/payment-gateways";
import {
  annualSavings,
  monthlyEquivalent,
  offerPrice,
  type ProOffer,
} from "@/lib/pro-billing-offers";

export function BillingFrequencyPicker({
  offers,
  interval,
  onChange,
}: {
  offers: readonly ProOffer[];
  interval: ProBillingOption["interval"];
  onChange: (interval: ProBillingOption["interval"]) => void;
}) {
  const id = useId();
  const savings = annualSavings(offers);
  return (
    <fieldset>
      <legend className="sr-only">Choose your billing frequency</legend>
      <div className="border-border bg-muted/50 inline-flex max-w-full flex-wrap gap-1 rounded-md border p-1">
        {offers.map(({ option, gateway }) => (
          <label
            key={option.interval}
            htmlFor={`${id}-${option.interval}`}
            className={`focus-within:ring-foreground focus-within:ring-offset-background relative flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-sm px-4 text-sm font-medium transition-colors focus-within:ring-2 focus-within:ring-offset-2 ${interval === option.interval ? "bg-signal-orange text-[var(--color-ink)]" : "text-muted-foreground hover:text-foreground"}`}
          >
            <input
              id={`${id}-${option.interval}`}
              type="radio"
              name={`${id}-billing-frequency`}
              value={option.interval}
              checked={interval === option.interval}
              onChange={() => onChange(option.interval)}
              className="sr-only"
            />
            {option.interval === "year" ? "Yearly" : "Monthly"}
            {option.interval === "year" && savings > 0 ? (
              <span className="text-xs font-semibold">Save {savings}%</span>
            ) : null}
            {gateway.mode === "test" ? <span className="text-warning text-xs">Test</span> : null}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function ProPrice({ offer }: { offer?: ProOffer }) {
  const price = offer ? monthlyEquivalent(offer.option) : null;
  return (
    <div aria-live="polite" aria-atomic="true" className="space-y-2">
      {price ? (
        <p className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-display-tight text-foreground text-5xl tabular-nums">{price}</span>
          <span className="text-muted-foreground text-sm">/ month</span>
        </p>
      ) : (
        <p className="text-foreground text-xl font-semibold">Price confirmed at checkout</p>
      )}
      <p className="text-muted-foreground min-h-5 text-sm">
        {offer
          ? offer.option.interval === "year"
            ? `${offerPrice(offer.option) ?? "Annual total confirmed at checkout"} billed yearly · Charged for the full year`
            : "Billed monthly. Cancel future renewals anytime."
          : "Current prices and available billing frequencies are shown in workspace billing."}
      </p>
    </div>
  );
}

export function ProBenefits() {
  return (
    <ul className="space-y-3 text-sm">
      {[
        "Unlimited actors per workspace",
        "Unlimited monthly users across your actors",
        "Every Free workflow, with both limits removed",
      ].map((text) => (
        <li key={text} className="flex items-start gap-3">
          <Check aria-hidden="true" className="text-success mt-0.5 size-4 shrink-0" />
          {text}
        </li>
      ))}
    </ul>
  );
}
