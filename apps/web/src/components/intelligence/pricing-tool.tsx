"use client";

import { useState } from "react";
import { AlertCircle, Download, RotateCcw } from "lucide-react";
import { calculatePricing } from "@actorconsole/shared/actor-intelligence";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { downloadCsv } from "./tool-actions";

const defaults = {
  pricePerThousand: "5",
  results: "10000",
  platformCost: "8",
  externalCost: "4",
};
type Field = keyof typeof defaults;
const fields: Array<{ key: Field; label: string; hint: string }> = [
  {
    key: "pricePerThousand",
    label: "Price per 1,000 results (USD)",
    hint: "The price you charge for 1,000 billable results.",
  },
  {
    key: "results",
    label: "Billable results",
    hint: "A whole number of results for this workload.",
  },
  {
    key: "platformCost",
    label: "Apify cost for this workload (USD)",
    hint: "Total platform and compute costs for the same workload.",
  },
  {
    key: "externalCost",
    label: "Other costs for this workload (USD)",
    hint: "Total paid proxy, AI, hosting, and payment fees.",
  },
];
const usd = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 6,
  }).format(value);

function fieldError(key: Field, value: string) {
  if (!value.trim()) return "Enter a value. Use 0 if there is no cost or volume.";
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return "Enter a non-negative number.";
  if (number > 1_000_000_000) return "Enter a value of 1,000,000,000 or less.";
  if (key === "results" && !Number.isInteger(number))
    return "Billable results must be a whole number.";
  if (key !== "results" && number > 0 && number < 0.000001)
    return "Use 0 or an amount of at least $0.000001.";
  return "";
}

export function PricingTool() {
  const [values, setValues] = useState(defaults);
  const errors = Object.fromEntries(
    fields.map(({ key }) => [key, fieldError(key, values[key])]),
  ) as Record<Field, string>;
  const parsed = {
    pricePerThousand: Number(values.pricePerThousand),
    results: Number(values.results),
    platformCost: Number(values.platformCost),
    externalCost: Number(values.externalCost),
  };
  const result = Object.values(errors).some(Boolean) ? null : calculatePricing(parsed);

  return (
    <div className="grid items-start gap-10 lg:grid-cols-[1.1fr_1fr] lg:gap-16">
      <form noValidate onSubmit={(event) => event.preventDefault()} className="min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display-tight text-2xl">Build your scenario</h2>
          <Button type="button" variant="ghost" size="sm" onClick={() => setValues(defaults)}>
            <RotateCcw aria-hidden="true" /> Reset example
          </Button>
        </div>
        <p className="text-muted-foreground mt-2 text-sm leading-6">
          Change any value to recalculate instantly. All amounts are in USD.
        </p>
        {[
          { legend: "Revenue inputs", items: fields.slice(0, 2) },
          { legend: "Workload costs", items: fields.slice(2) },
        ].map((group) => (
          <fieldset key={group.legend} className="border-border mt-8 space-y-5 border-t pt-5">
            <legend className="pr-3 text-sm font-semibold">{group.legend}</legend>
            {group.items.map(({ key, label, hint }) => (
              <div key={key} className="space-y-2">
                <label htmlFor={`pricing-${key}`} className="block text-sm font-medium">
                  {label}
                </label>
                <Input
                  id={`pricing-${key}`}
                  type="number"
                  min={0}
                  max={1_000_000_000}
                  step={key === "results" ? 1 : "any"}
                  inputMode={key === "results" ? "numeric" : "decimal"}
                  value={values[key]}
                  onChange={(event) =>
                    setValues((previous) => ({ ...previous, [key]: event.target.value }))
                  }
                  aria-invalid={Boolean(errors[key])}
                  aria-describedby={`pricing-${key}-hint${errors[key] ? ` pricing-${key}-error` : ""}`}
                  className="h-12 text-base tabular-nums shadow-none"
                />
                <p id={`pricing-${key}-hint`} className="text-muted-foreground text-xs leading-5">
                  {hint}
                </p>
                {errors[key] && (
                  <p id={`pricing-${key}-error`} className="text-destructive text-sm" role="alert">
                    {errors[key]}
                  </p>
                )}
              </div>
            ))}
          </fieldset>
        ))}
      </form>
      <section
        aria-label="Pricing scenario"
        className="border-border bg-card min-w-0 rounded-lg border p-5 sm:p-8"
      >
        <h2 className="font-display-tight text-2xl">Your pricing scenario</h2>
        <p className="text-muted-foreground mt-2 text-sm leading-6">
          Estimates for one workload using a per-result model.
        </p>
        <div aria-live="polite" aria-atomic="true">
          {result ? (
            <>
              <dl className="divide-border mt-6 divide-y">
                {[
                  ["Gross revenue", usd(result.revenue)],
                  ["Total costs", usd(result.costs)],
                  ["Estimated profit", usd(result.profit)],
                  [
                    "Profit margin",
                    result.margin === null ? "No revenue" : `${result.margin.toFixed(1)}%`,
                  ],
                  [
                    "Break-even price / 1,000",
                    result.breakEvenPerThousand === null
                      ? "No results"
                      : usd(result.breakEvenPerThousand),
                  ],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2 py-5"
                  >
                    <dt
                      className={
                        label === "Estimated profit"
                          ? "font-semibold"
                          : "text-muted-foreground text-sm"
                      }
                    >
                      {label}
                    </dt>
                    <dd
                      className={`break-all text-right font-semibold tabular-nums ${label === "Estimated profit" ? "text-3xl" : "text-lg"} ${label === "Estimated profit" && result.profit < 0 ? "text-destructive" : ""}`}
                    >
                      {value}
                    </dd>
                  </div>
                ))}
              </dl>
              <div className="border-border mt-4 border-t pt-5 text-sm leading-6">
                {parsed.results === 0 ? (
                  <p className="text-muted-foreground">
                    With no billable results, revenue is $0.00. Add result volume to calculate a
                    break-even price.
                  </p>
                ) : result.profit < 0 ? (
                  <p className="text-destructive flex items-start gap-2">
                    <AlertCircle className="mt-1 h-4 w-4 shrink-0" aria-hidden="true" />
                    Costs exceed revenue by {usd(-result.profit)}. Charge at least{" "}
                    {usd(result.breakEvenPerThousand!)} per 1,000 results to break even at this
                    volume.
                  </p>
                ) : result.revenue === 0 ? (
                  <p className="text-muted-foreground">
                    Revenue is zero at this price. Profit margin needs a price above $0.00.
                  </p>
                ) : (
                  <p className="text-muted-foreground">
                    {result.profit === 0
                      ? "This scenario breaks even."
                      : `This scenario earns ${usd(result.profit)} after costs.`}{" "}
                    Break-even assumes the same workload costs and result volume.
                  </p>
                )}
              </div>
            </>
          ) : (
            <div className="border-border my-8 border-y py-8">
              <p className="font-medium">Complete your scenario</p>
              <p className="text-muted-foreground mt-2 text-sm leading-6">
                Correct the highlighted fields to calculate revenue, profit, and break-even pricing.
              </p>
            </div>
          )}
        </div>
        <Button
          type="button"
          variant="outline"
          className="mt-6 w-full"
          disabled={!result}
          onClick={() => {
            if (!result) return;
            downloadCsv("actor-pricing-scenario.csv", [
              ["Metric", "Value", "Source"],
              ...fields.map(({ key, label }) => [label, parsed[key], "manual input"]),
              ["Gross revenue (USD)", result.revenue, "estimate"],
              ["Total costs (USD)", result.costs, "estimate"],
              ["Estimated profit (USD)", result.profit, "estimate"],
              ["Profit margin (%)", result.margin, "estimate"],
              ["Break-even price per 1,000 (USD)", result.breakEvenPerThousand, "estimate"],
            ]);
          }}
        >
          <Download aria-hidden="true" /> Export scenario
        </Button>
      </section>
    </div>
  );
}
