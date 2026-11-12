"use client";

import type { UsageCostsPayload } from "@actorconsole/shared/financial-report";
export type { UsageCostsPayload } from "@actorconsole/shared/financial-report";

export function resolveCurrentServiceEntries(account: UsageCostsPayload["accountUsage"]) {
  const reported = Object.entries(account?.currentPeriod?.usage?.monthlyServiceUsage ?? {});
  if (reported.length) return reported;
  const calendar = Object.entries(account?.calendarMonth?.monthlyServiceUsage ?? {});
  if (calendar.length) return calendar;
  return Object.entries(account?.currentServices ?? {}).flatMap(([key, rows]) =>
    rows.map((row) => [key, row] as const),
  );
}
