/**
 * Lightweight analytics event logger. Fires async (never awaited) from
 * key user actions so the admin dashboard has real data to show.
 *
 * Writes to the `AnalyticsEvent` table. Errors are caught and logged
 * but never propagate to the caller.
 */

import { db } from "@actorconsole/db";

export function trackEvent(
  name: string,
  opts: {
    userId?: string | null;
    properties?: Record<string, unknown>;
    source?: string;
    sessionId?: string | null;
  } = {},
): void {
  void db.analyticsEvent
    .create({
      data: {
        name,
        userId: opts.userId ?? null,
        properties: (opts.properties ?? undefined) as any,
        source: opts.source ?? "api",
        sessionId: opts.sessionId ?? null,
      },
    })
    .catch(() => undefined);
}
