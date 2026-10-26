import { db, Prisma } from "@actorconsole/db";
import { type ApifyClientWrapper, type ApifyRun } from "@actorconsole/apify";
import { getLogger } from "@actorconsole/shared";
import { actorReadinessData, loadActorPublishReadiness } from "./publish-readiness.js";

const log = getLogger("worker:operational-usage");
const DAY = 24 * 60 * 60 * 1000;

export async function syncActorOperationalData(
  apify: ApifyClientWrapper,
  actor: { id: string; apifyActorId: string },
) {
  const [syncState, oldestRun, liveActor] = await Promise.all([
    db.actor.findUnique({ where: { id: actor.id }, select: { lastRunSyncAt: true } }),
    db.actorRunSnapshot.findFirst({
      where: { actorId: actor.id },
      orderBy: { startedAt: "asc" },
      select: { startedAt: true },
    }),
    apify.getActor(actor.apifyActorId).catch(() => null),
  ]);
  const readiness = liveActor
    ? await loadActorPublishReadiness(apify, liveActor).catch(() => null)
    : null;
  const historyFloor = new Date(Date.now() - 90 * DAY);
  const covered = oldestRun && oldestRun.startedAt.getTime() <= historyFloor.getTime() + DAY;
  const floor =
    syncState?.lastRunSyncAt && covered
      ? new Date(syncState.lastRunSyncAt.getTime() - DAY)
      : historyFloor;
  floor.setUTCHours(0, 0, 0, 0);
  const runs = new Map<string, ApifyRun>();
  let complete = false;
  for (let offset = 0; offset < 10_000; offset += 1000) {
    const page = await apify.listActorRuns(actor.apifyActorId, {
      limit: 1000,
      offset,
      startedAfter: floor.toISOString(),
      desc: true,
    });
    for (const run of page) runs.set(run.id, run);
    if (page.length < 1000) {
      complete = true;
      break;
    }
  }
  if (!complete) {
    // Do not publish a truncated newest-N page as a complete daily total.
    const extra = await apify.listActorRuns(actor.apifyActorId, {
      limit: 1,
      offset: 10_000,
      startedAfter: floor.toISOString(),
      desc: true,
    });
    if (extra.length)
      throw new Error(
        "Run history exceeds the synchronization window; complete backfill is required",
      );
  }
  const counts = new Map<string, number>();
  const allRuns = [...runs.values()];
  for (let offset = 0; offset < allRuns.length; offset += 10) {
    await Promise.all(
      allRuns.slice(offset, offset + 10).map(async (run) => {
        if (!run.defaultDatasetId) {
          counts.set(run.id, 0);
          return;
        }
        try {
          const count = await apify.getDatasetItemCount(run.defaultDatasetId);
          if (Number.isSafeInteger(count) && count >= 0) counts.set(run.id, count);
        } catch {
          log.warn(
            { actorId: actor.id, runId: run.id },
            "Dataset count unavailable; retaining the last successful count",
          );
        }
      }),
    );
  }
  const touched = new Set(
    allRuns.map((run) => {
      const started = new Date(run.startedAt);
      if (!Number.isFinite(started.getTime()))
        throw new Error("Provider returned an invalid run timestamp");
      return started.toISOString().slice(0, 10);
    }),
  );
  await db.$transaction(
    async (tx) => {
      // Serialize rollups for this actor, after all provider I/O has completed.
      const locked = await tx.$queryRaw<Array<{ id: string }>>(
        Prisma.sql`SELECT id FROM Actor WHERE id = ${actor.id} FOR UPDATE`,
      );
      if (!locked.length) throw new Error("Actor is no longer available for synchronization");
      for (const run of allRuns) {
        const count = counts.get(run.id);
        const fields = {
          status: run.status,
          origin: run.origin ?? null,
          usageCostUsd: run.usageTotalUsd == null ? null : String(run.usageTotalUsd),
          finishedAt: run.finishedAt ? new Date(run.finishedAt) : null,
        };
        await tx.actorRunSnapshot.upsert({
          where: { actorId_apifyRunId: { actorId: actor.id, apifyRunId: run.id } },
          create: {
            ...fields,
            actorId: actor.id,
            apifyRunId: run.id,
            buildId: run.buildId ?? null,
            startedAt: new Date(run.startedAt),
            resultCount: count ?? 0,
            resultCountSyncedAt: count === undefined ? null : new Date(),
          },
          update: {
            ...fields,
            ...(count === undefined ? {} : { resultCount: count, resultCountSyncedAt: new Date() }),
          },
        });
      }
      if (touched.size) {
        const days = [...touched].sort();
        const stored = await tx.actorRunSnapshot.findMany({
          where: {
            actorId: actor.id,
            startedAt: {
              gte: new Date(`${days[0]}T00:00:00.000Z`),
              lt: new Date(new Date(`${days.at(-1)}T00:00:00.000Z`).getTime() + DAY),
            },
          },
          select: { startedAt: true, status: true, usageCostUsd: true, resultCount: true },
        });
        const totals = new Map<
          string,
          {
            runs: number;
            successfulRuns: number;
            failedRuns: number;
            abortedRuns: number;
            timedOutRuns: number;
            resultCount: number;
            usageCostUsd: Prisma.Decimal;
          }
        >();
        for (const run of stored) {
          const day = run.startedAt.toISOString().slice(0, 10);
          if (!touched.has(day)) continue;
          const bucket = totals.get(day) ?? {
            runs: 0,
            successfulRuns: 0,
            failedRuns: 0,
            abortedRuns: 0,
            timedOutRuns: 0,
            resultCount: 0,
            usageCostUsd: new Prisma.Decimal(0),
          };
          bucket.runs++;
          const status = run.status.toUpperCase();
          if (status === "SUCCEEDED") bucket.successfulRuns++;
          if (status === "FAILED") bucket.failedRuns++;
          if (status === "ABORTED") bucket.abortedRuns++;
          if (status === "TIMED-OUT") bucket.timedOutRuns++;
          bucket.resultCount += run.resultCount;
          bucket.usageCostUsd = bucket.usageCostUsd.add(run.usageCostUsd ?? 0);
          totals.set(day, bucket);
        }
        for (const [day, bucket] of totals) {
          const date = new Date(`${day}T00:00:00.000Z`);
          const data = { ...bucket, usageCostUsd: bucket.usageCostUsd.toString() };
          await tx.usageDaily.upsert({
            where: { actorId_date: { actorId: actor.id, date } },
            create: { ...data, actorId: actor.id, date, adjustmentUsd: null },
            update: data,
          });
        }
      }
      await tx.actor.update({
        where: { id: actor.id },
        data: {
          lastOperationalSyncAt: new Date(),
          lastRunSyncAt: new Date(),
          ...(readiness ? actorReadinessData(readiness) : {}),
        },
      });
    },
    { timeout: 60_000 },
  );
}
