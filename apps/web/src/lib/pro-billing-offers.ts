import {
  type ProBillingOption,
  type PaymentMode,
  type PaymentGatewayKey,
  currencyMinorUnitFactor,
} from "@actorconsole/shared/payment-gateways";

export type CheckoutGateway = {
  key: PaymentGatewayKey;
  name: string;
  mode?: PaymentMode;
  billingOptions?: ProBillingOption[];
};
export type ProOffer = { gateway: CheckoutGateway; option: ProBillingOption };

/** Live offers take precedence; preserve admin sort order within each mode. */
export function selectProOffers(gateways: readonly CheckoutGateway[]): ProOffer[] {
  const ordered = [...gateways].sort(
    (a, b) => Number(a.mode === "test") - Number(b.mode === "test"),
  );
  return (["month", "year"] as const).flatMap((interval) => {
    for (const gateway of ordered) {
      const option = gateway.billingOptions?.find((item) => item.interval === interval);
      if (option) return [{ gateway, option }];
    }
    return [];
  });
}

export function offerPrice(option: ProBillingOption) {
  if (option.amountMinor === undefined || !option.currency) return null;
  return new Intl.NumberFormat(undefined, { style: "currency", currency: option.currency }).format(
    option.amountMinor / currencyMinorUnitFactor(option.currency),
  );
}

/** Never compare prices across currencies or between test and live offers. */
export function annualSavings(offers: readonly ProOffer[]) {
  const monthly = offers.find(({ option }) => option.interval === "month");
  const yearly = offers.find(({ option }) => option.interval === "year");
  if (
    !monthly?.option.amountMinor ||
    yearly?.option.amountMinor === undefined ||
    !monthly.option.currency ||
    monthly.option.currency !== yearly.option.currency ||
    (monthly.gateway.mode ?? "live") !== (yearly.gateway.mode ?? "live")
  )
    return 0;
  return Math.max(
    0,
    Math.floor((1 - yearly.option.amountMinor / (monthly.option.amountMinor * 12)) * 100),
  );
}

export function monthlyEquivalent(option: ProBillingOption) {
  if (option.interval !== "year") return offerPrice(option);
  return offerPrice({
    ...option,
    amountMinor: option.amountMinor === undefined ? undefined : option.amountMinor / 12,
  });
}
