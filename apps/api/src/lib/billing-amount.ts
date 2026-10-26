import { currencyMinorUnitFactor } from "@actorconsole/shared";

/** Currency and amount are provider metadata, never client pricing inputs. */
export function providerAmount(amountMinor: unknown, currency: unknown) {
  if (
    typeof currency !== "string" ||
    !/^[A-Za-z]{3}$/.test(currency) ||
    typeof amountMinor !== "number" ||
    !Number.isSafeInteger(amountMinor) ||
    amountMinor < 0
  ) {
    throw new Error("Payment provider returned an invalid amount or currency");
  }
  const normalized = currency.toUpperCase();
  return { amount: amountMinor / currencyMinorUnitFactor(normalized), currency: normalized };
}
