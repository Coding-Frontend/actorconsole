/**
 * ActorSnapshot retention job.
 *
 * Delete ActorSnapshot rows older than ACTOR_SNAPSHOT_RETENTION_DAYS
 * (default 90). Usage-cost analytics are rolled up into UsageDaily rows, so
 * anything older than 90 days has no product use.
 *
 * Retention is a deletion job, not a backup; the Audit report
 * recommends regular pruning to keep the snapshots table from
 * growing unboundedly.
 *
 * Behaviour:
 *  - Reads the retention window from the env var on every call, so
 *    reconfiguring the env and restarting the worker is the only
 *    operational lever (no SIGHUP plumbing needed).
 *  - Logs the prune count to stdout AND emits a Sentry breadcrumb
 *    (when Sentry is configured) so the prune is visible in the
 *    performance timeline without being a noisy error event.
 *  - Swallows DB errors and logs them; retention failures must NOT
 *    crash the worker.
 */

import { db } from "@actorconsole/db";
import { getLogger } from "@actorconsole/shared";

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_RETENTION_DAYS = 90;
const MAX_RETENTION_DAYS = 3650;
const log = getLogger("worker:retention");

export function snapshotRetentionDays(): number {
  const raw = process.env.ACTOR_SNAPSHOT_RETENTION_DAYS;
  if (raw === undefined || raw === "") return DEFAULT_RETENTION_DAYS;
  const days = Number(raw);
  if (!Number.isInteger(days) || days < 1 || days > MAX_RETENTION_DAYS) {
    throw new Error(
      `ACTOR_SNAPSHOT_RETENTION_DAYS must be an integer from 1 to ${MAX_RETENTION_DAYS}`,
    );
  }
  return days;
}

export async function pruneOldSnapshots(): Promise<number | null> {
  const days = snapshotRetentionDays();
  const cutoff = new Date(Date.now() - days * DAY_MS);
  try {
    const { count } = await db.actorSnapshot.deleteMany({
      where: { capturedAt: { lt: cutoff } },
    });
    if (count > 0) {
      log.info({ count, retentionDays: days, cutoff }, "Pruned actor snapshots");
      // Sentry is an optional dep; the worker may run without it
      // configured. Best-effort breadcrumb.
      try {
        const Sentry = await import("@sentry/node");
        Sentry.addBreadcrumb({
          category: "retention",
          message: `Pruned ${count} ActorSnapshot rows`,
          data: { cutoff: cutoff.toISOString(), retentionDays: days },
          level: "info",
        });
      } catch {
        // Sentry not available — local log is the only signal.
      }
      return count;
    }
    return 0;
  } catch (err) {
    log.error({ err }, "Actor snapshot retention failed");
    return null;
  }
}
