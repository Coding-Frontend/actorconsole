"use client";

import { useState, useTransition, useId } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { API_BASE_URL } from "@/lib/api-base";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type BillingAddress = {
  company?: string | null;
  gstin?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  country?: string | null;
};

export function BillingAddressForm({
  initial,
  checkout = false,
  onSaved,
  onBack,
}: {
  initial: BillingAddress | null;
  checkout?: boolean;
  onSaved?: () => Promise<void>;
  onBack?: () => void;
}) {
  const id = useId();
  const [form, setForm] = useState({
    company: initial?.company ?? "",
    gstin: initial?.gstin ?? "",
    address: initial?.address ?? "",
    city: initial?.city ?? "",
    state: initial?.state ?? "",
    zip: initial?.zip ?? "",
    country: initial?.country ?? "IN",
  });
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function save() {
    setError(null);
    const address = Object.fromEntries(
      Object.entries(form).map(([key, value]) => [
        key,
        key === "country" ? value.trim().toUpperCase() : value.trim(),
      ]),
    );
    if (checkout && (!address.address || !address.city)) {
      setError("Enter your address and city to continue.");
      return;
    }
    if (!/^[A-Z]{2}$/.test(address.country)) {
      setError("Enter a two-letter country code, such as IN, US, or GB.");
      return;
    }
    startTransition(async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/account/billing-address`, {
          method: "PUT",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(address),
        });
        const body = await response.json();
        if (!response.ok || !body.ok) {
          throw new Error(body.error?.message ?? "Billing address could not be saved");
        }
        if (onSaved) await onSaved();
        else toast.success("Billing address saved");
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Could not continue. Please try again.";
        setError(message);
      }
    });
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      <fieldset disabled={pending} className="grid min-w-0 gap-4 sm:grid-cols-2">
        {(
          [
            ["company", "Company (optional)"],
            ["gstin", "GSTIN (optional)"],
            ["address", "Address"],
            ["city", "City"],
            ["state", "State / region (optional)"],
            ["zip", "Postal code (if applicable)"],
            ["country", "Country code"],
          ] as const
        ).map(([key, label]) => (
          <label
            key={key}
            htmlFor={`${id}-${key}`}
            className={key === "address" ? "space-y-1 sm:col-span-2" : "space-y-1"}
          >
            <span className="text-sm font-medium">{label}</span>
            <Input
              id={`${id}-${key}`}
              name={key}
              required={checkout && ["address", "city", "country"].includes(key)}
              autoComplete={
                {
                  company: "organization",
                  gstin: "off",
                  address: "street-address",
                  city: "address-level2",
                  state: "address-level1",
                  zip: "postal-code",
                  country: "country",
                }[key]
              }
              maxLength={
                {
                  company: 200,
                  gstin: 50,
                  address: 500,
                  city: 100,
                  state: 100,
                  zip: 20,
                  country: 2,
                }[key]
              }
              pattern={key === "country" ? "[A-Za-z]{2}" : undefined}
              aria-describedby={key === "country" ? `${id}-country-help` : undefined}
              value={form[key]}
              onChange={(event) =>
                setForm((current) => ({ ...current, [key]: event.target.value }))
              }
            />
            {key === "country" ? (
              <span id={`${id}-country-help`} className="text-muted-foreground block text-xs">
                Two-letter code, for example IN, US, or GB.
              </span>
            ) : null}
          </label>
        ))}
        {error ? (
          <p role="alert" className="text-destructive text-sm sm:col-span-2">
            {error}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-3 sm:col-span-2">
          <Button type="submit" disabled={pending}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {pending ? "Please wait…" : checkout ? "Continue to checkout" : "Save billing address"}
          </Button>
          {onBack ? (
            <Button type="button" variant="outline" disabled={pending} onClick={onBack}>
              Back to plans
            </Button>
          ) : null}
        </div>
      </fieldset>
    </form>
  );
}
