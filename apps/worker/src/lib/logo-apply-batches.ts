import {
  applyActorLogoRecommendation,
  db,
  LOGO_APPLY_UNCONFIRMED_MESSAGE,
  LogoApplyError,
  type LogoPublishingClient,
} from "@actorconsole/db";
import { logoApplyBatchJobId } from "@actorconsole/shared";

type QueueWriter = {
  add(name: string, payload: object, options: { jobId: string }): Promise<unknown>;
};

export type LogoApplyBatchPayload = { batchId: string; userId: string; businessProfileId: string };

/** QUEUED batch rows are the durable intent. Reusing the job ID makes re-dispatch safe. */
export async function dispatchPendingLogoApplyBatches(queue: QueueWriter, now = new Date()) {
  const batches = await db.actorLogoApplyBatch.findMany({
    // Give the API's own enqueue a moment before treating it as lost.
    where: { status: "QUEUED", createdAt: { lt: new Date(now.getTime() - 60_000) } },
    orderBy: { createdAt: "asc" },
    take: 25,
    select: { id: true, userId: true, businessProfileId: true },
  });
  for (const batch of batches) {
    const jobId = logoApplyBatchJobId(batch.id);
    await queue.add(
      "logo-apply-batch",
      {
        logoApplyBatch: {
          batchId: batch.id,
          userId: batch.userId,
          businessProfileId: batch.businessProfileId,
        },
      },
      { jobId },
    );
  }
  return batches.length;
}

export async function runLogoApplyBatch(
  jobId: string,
  payload: LogoApplyBatchPayload,
  deps: {
    getApify: () => Promise<LogoPublishingClient | null>;
    readLogo: (storagePath: string) => Promise<Uint8Array>;
    delay: () => Promise<void>;
    assertAccess?: () => Promise<void>;
  },
) {
  const batch = await db.actorLogoApplyBatch.findFirst({
    where: {
      id: payload.batchId,
      userId: payload.userId,
      businessProfileId: payload.businessProfileId,
    },
  });
  if (!batch) throw new Error("Logo apply batch is no longer available");
  if (!["QUEUED", "RUNNING"].includes(batch.status)) return { status: batch.status };
  const claim = await db.actorLogoApplyBatch.updateMany({
    where: { id: batch.id, OR: [{ status: "QUEUED" }, { status: "RUNNING", jobId }] },
    data: { status: "RUNNING", jobId, startedAt: batch.startedAt ?? new Date(), error: null },
  });
  if (!claim.count) return { status: "ALREADY_CLAIMED" };

  // A previous attempt of this job died mid-upload; Apify may or may not have
  // the picture, so hand those back to the reviewer instead of re-uploading.
  await db.actorLogoRecommendation.updateMany({
    where: { batchId: batch.id, status: "APPLYING" },
    data: { status: "PENDING", error: LOGO_APPLY_UNCONFIRMED_MESSAGE },
  });

  const actorWhere = {
    userId: payload.userId,
    businessProfileId: payload.businessProfileId,
    apifyRemovedAt: null,
  };
  const finish = async (status: string, error?: string) => {
    const [succeeded, failed] = await Promise.all([
      db.actorLogoRecommendation.count({ where: { batchId: batch.id, status: "APPLIED" } }),
      db.actorLogoRecommendation.count({
        where: { batchId: batch.id, status: { notIn: ["APPLIED", "QUEUED", "APPLYING"] } },
      }),
    ]);
    await db.actorLogoApplyBatch.update({
      where: { id: batch.id },
      data: {
        status,
        succeededCount: succeeded,
        failedCount: failed,
        error: error?.slice(0, 65_535) ?? null,
        ...(status === "RUNNING" ? {} : { completedAt: new Date() }),
      },
    });
    return { status, succeeded, failed, batchId: batch.id };
  };

  let apify: LogoPublishingClient | null;
  try {
    await deps.assertAccess?.();
    apify = await deps.getApify();
  } catch (error) {
    return failRemaining(batch.id, error instanceof Error ? error.message : String(error), finish);
  }
  if (!apify) {
    return failRemaining(
      batch.id,
      "Apify publishing credentials are unavailable or expired",
      finish,
    );
  }
  const client = apify;

  for (let processed = 0; ; processed += 1) {
    const current = await db.actorLogoApplyBatch.findUnique({
      where: { id: batch.id },
      select: { stopRequested: true },
    });
    if (current?.stopRequested) {
      await db.actorLogoRecommendation.updateMany({
        where: { batchId: batch.id, status: "QUEUED" },
        data: { status: "PENDING", batchId: null },
      });
      return finish("STOPPED");
    }
    const next = await db.actorLogoRecommendation.findFirst({
      where: { batchId: batch.id, status: "QUEUED" },
      orderBy: { id: "asc" },
      select: { id: true },
    });
    if (!next) break;
    if (processed > 0) await deps.delay();
    try {
      await applyActorLogoRecommendation({
        recommendationId: next.id,
        actorWhere,
        batchId: batch.id,
        getApify: async () => client,
        readLogo: deps.readLogo,
      });
      await db.auditLog
        .create({
          data: {
            actorId: payload.userId,
            action: "actor.logo.applied",
            resource: `recommendation:${next.id}`,
            after: { recommendationId: next.id, batchId: batch.id },
            source: "worker",
          },
        })
        .catch(() => undefined);
    } catch (error) {
      const known = error instanceof LogoApplyError;
      // Never leave the row QUEUED (the loop would pick it again) and never
      // retry a possibly accepted Apify write automatically.
      await db.actorLogoRecommendation.updateMany({
        where: { id: next.id, status: known ? "QUEUED" : { in: ["QUEUED", "APPLYING"] } },
        data: {
          status: "PENDING",
          error:
            known && error.code === "not_found"
              ? "This Actor is no longer in the workspace"
              : known
                ? error.message.slice(0, 65_535)
                : LOGO_APPLY_UNCONFIRMED_MESSAGE,
        },
      });
      if (known && error.code === "apify_publishing_credentials_required") {
        return failRemaining(batch.id, error.message, finish);
      }
    }
    await finish("RUNNING");
  }
  const result = await finish("COMPLETED");
  return result.failed && !result.succeeded ? finish("FAILED") : result;
}

async function failRemaining(
  batchId: string,
  message: string,
  finish: (status: string, error?: string) => Promise<{ status: string }>,
) {
  await db.actorLogoRecommendation.updateMany({
    where: { batchId, status: "QUEUED" },
    data: { status: "PENDING", error: message.slice(0, 65_535) },
  });
  return finish("FAILED", message);
}

/** A running batch updates its row after every Actor; silence this long means its job died. */
export const STALE_LOGO_BATCH_MS = 15 * 60_000;

/**
 * Finish batches whose job died for good (retries exhausted, worker lost), so
 * their logos return to review and the page stops following them.
 */
export async function recoverStaleLogoApplyBatches(now = new Date()) {
  const stale = await db.actorLogoApplyBatch.findMany({
    where: {
      status: "RUNNING",
      updatedAt: { lt: new Date(now.getTime() - STALE_LOGO_BATCH_MS) },
    },
    take: 25,
    select: { id: true },
  });
  for (const batch of stale) {
    await db.actorLogoRecommendation.updateMany({
      where: { batchId: batch.id, status: "QUEUED" },
      data: { status: "PENDING", batchId: null },
    });
    await db.actorLogoRecommendation.updateMany({
      where: { batchId: batch.id, status: "APPLYING" },
      data: { status: "PENDING", error: LOGO_APPLY_UNCONFIRMED_MESSAGE },
    });
    const [succeeded, failed] = await Promise.all([
      db.actorLogoRecommendation.count({ where: { batchId: batch.id, status: "APPLIED" } }),
      db.actorLogoRecommendation.count({
        where: { batchId: batch.id, status: { notIn: ["APPLIED", "QUEUED", "APPLYING"] } },
      }),
    ]);
    await db.actorLogoApplyBatch.updateMany({
      where: { id: batch.id, status: "RUNNING" },
      data: {
        status: "FAILED",
        succeededCount: succeeded,
        failedCount: failed,
        error: "The background job stopped unexpectedly. Logos that did not finish are back in review.",
        completedAt: now,
      },
    });
  }
  return stale.length;
}
