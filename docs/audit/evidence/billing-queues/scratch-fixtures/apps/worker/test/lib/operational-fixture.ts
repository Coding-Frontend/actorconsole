import { db } from "@actorconsole/db";
import { getUserApifyClient, type ApifyRun } from "@actorconsole/apify";
import { getLogger } from "@actorconsole/shared";
import { actorReadinessData, loadActorPublishReadiness } from "../../src/lib/publish-readiness.js";
const log = getLogger("audit:operational-fixture");
type TrackedActorRef = { id: string; apifyActorId: string };

export async function syncActorOperationalData(
  apify: NonNullable<Awaited<ReturnType<typeof getUserApifyClient>>>,
  actor: TrackedActorRef,
): Promise<void> {
  const [actorSyncState, oldestStoredRun, liveActor] = await Promise.all([
    db.actor.findUnique({
      where: { id: actor.id },
      select: { lastRunSyncAt: true },
    }),
    db.actorRunSnapshot.findFirst({
      where: { actorId: actor.id },
      orderBy: { startedAt: "asc" },
      select: { startedAt: true },
    }),
    apify.getActor(actor.apifyActorId).catch(() => null),
  ]);
  const readiness = liveActor
    ? await loadActorPublishReadiness(apify, liveActor).catch((error) => {
        log.warn({ error, actorId: actor.id }, "Default build readiness could not be synchronized");
        return null;
      })
    : null;
  const historyFloor = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const hasHistoricalCoverage =
    oldestStoredRun &&
    oldestStoredRun.startedAt.getTime() <= historyFloor.getTime() + 24 * 60 * 60 * 1000;
  const runFloor =
    actorSyncState?.lastRunSyncAt && hasHistoricalCoverage
      ? new Date(actorSyncState.lastRunSyncAt.getTime() - 24 * 60 * 60 * 1000)
      : historyFloor;
  const startedAfter = runFloor.toISOString();
  const runs: ApifyRun[] = [];
  for (let offset = 0; offset < 10_000; offset += 1000) {
    const page = await apify.listActorRuns(actor.apifyActorId, {
      limit: 1000,
      offset,
      startedAfter,
      desc: true,
    });
    runs.push(...page);
    if (page.length < 1000) break;
  }
  const resultCounts = new Map<string, number>();
  for (let offset = 0; offset < runs.length; offset += 10) {
    const batch = runs.slice(offset, offset + 10);
    const counts = await Promise.all(
      batch.map(async (run) => {
        if (!run.defaultDatasetId) return [run.id, 0] as const;
        try {
          return [run.id, await apify.getDatasetItemCount(run.defaultDatasetId)] as const;
        } catch {
          return [run.id, 0] as const;
        }
      }),
    );
    for (const [runId, count] of counts) resultCounts.set(runId, count);
  }

  const daily = new Map<
    string,
    {
      date: Date;
      runs: number;
      successfulRuns: number;
      failedRuns: number;
      abortedRuns: number;
      timedOutRuns: number;
      resultCount: number;
      usageCostUsd: number;
    }
  >();
  for (const run of runs) {
    const startedAt = new Date(run.startedAt);
    if (!Number.isFinite(startedAt.getTime())) continue;
    const dayKey = startedAt.toISOString().slice(0, 10);
    const bucket = daily.get(dayKey) ?? {
      date: new Date(`${dayKey}T00:00:00.000Z`),
      runs: 0,
      successfulRuns: 0,
      failedRuns: 0,
      abortedRuns: 0,
      timedOutRuns: 0,
      resultCount: 0,
      usageCostUsd: 0,
    };
    const status = run.status.toUpperCase();
    bucket.runs += 1;
    if (status === "SUCCEEDED") bucket.successfulRuns += 1;
    else if (status === "FAILED") bucket.failedRuns += 1;
    else if (status === "ABORTED") bucket.abortedRuns += 1;
    else if (status === "TIMED-OUT") bucket.timedOutRuns += 1;
    bucket.resultCount += resultCounts.get(run.id) ?? 0;
    bucket.usageCostUsd += run.usageTotalUsd ?? 0;
    daily.set(dayKey, bucket);

    await db.actorRunSnapshot.upsert({
      where: { actorId_apifyRunId: { actorId: actor.id, apifyRunId: run.id } },
      create: {
        actorId: actor.id,
        apifyRunId: run.id,
        buildId: run.buildId ?? null,
        status: run.status,
        origin: run.origin ?? null,
        resultCount: resultCounts.get(run.id) ?? 0,
        usageCostUsd: run.usageTotalUsd == null ? null : String(run.usageTotalUsd),
        startedAt,
        finishedAt: run.finishedAt ? new Date(run.finishedAt) : null,
      },
      update: {
        status: run.status,
        origin: run.origin ?? null,
        resultCount: resultCounts.get(run.id) ?? 0,
        usageCostUsd: run.usageTotalUsd == null ? null : String(run.usageTotalUsd),
        finishedAt: run.finishedAt ? new Date(run.finishedAt) : null,
      },
    });
  }

  for (const bucket of daily.values()) {
    await db.usageDaily.upsert({
      where: { actorId_date: { actorId: actor.id, date: bucket.date } },
      create: {
        actorId: actor.id,
        date: bucket.date,
        usageCostUsd: String(bucket.usageCostUsd),
        runs: bucket.runs,
        successfulRuns: bucket.successfulRuns,
        failedRuns: bucket.failedRuns,
        abortedRuns: bucket.abortedRuns,
        timedOutRuns: bucket.timedOutRuns,
        resultCount: bucket.resultCount,
        adjustmentUsd: null,
      },
      update: {
        usageCostUsd: String(bucket.usageCostUsd),
        runs: bucket.runs,
        successfulRuns: bucket.successfulRuns,
        failedRuns: bucket.failedRuns,
        abortedRuns: bucket.abortedRuns,
        timedOutRuns: bucket.timedOutRuns,
        resultCount: bucket.resultCount,
      },
    });
  }
  await db.actor.update({
    where: { id: actor.id },
    data: {
      lastOperationalSyncAt: new Date(),
      lastRunSyncAt: new Date(),
      ...(readiness ? actorReadinessData(readiness) : {}),
    },
  });
}
