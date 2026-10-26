import {
  Worker,
  Queue,
  type Job,
  type JobsOptions,
  type ConnectionOptions,
} from "bullmq";
import IORedis from "ioredis";
import cronParser from "cron-parser";
import { refreshStoreWatchAlerts } from "./lib/watch-alerts.js";
import { runOptimizationJob, type OptimizationPayload } from "./lib/actor-optimization.js";

import { admitWorkspaceActors, db, getIntegration, Prisma, purgeDueUsers } from "@actorconsole/db";
import {
  getAdminApifyClient,
  getUserApifyClient,
  createApifyClient,
  type ApifyActorBasicInfo,
  type ApifyActorDetail,
  type ApifyActorSummary,
  type ApifyPricingInfo,
  type ApifyRun,
  ApifyClientError,
} from "@actorconsole/apify";
import { Resend } from "resend";
import nodemailer, { type Transporter } from "nodemailer";

import {
  getLogger,
  getAppBaseUrl,
  initNodeSentry,
  planHasFeature,
  renderNewsletterEmail,
  incrementMetric,
  analyzeActorPublishReadiness,
  type ActorPublishReadiness,
} from "@actorconsole/shared";
import { initOpenTelemetry } from "@actorconsole/shared/telemetry";
import { assertWorkspacePlanAccess } from "./lib/plan-access.js";
import { refreshWorkspaceAudience } from "./lib/workspace-audience.js";

import { createLeaderLock, scheduleTickLock } from "./lib/leader-election.js";
import {
  needsDailyStoreCatalogCatchup,
  syncStoreActorDetails,
  syncStoreSearchCatalog,
} from "./lib/store-catalog.js";
import { classifyWebsiteCatalog, enrichWebsiteLogos } from "./lib/website-catalog.js";
import { syncActorInsights } from "./lib/actor-insights.js";
import { actorReadinessData, loadActorPublishReadiness } from "./lib/publish-readiness.js";
import {
  BULK_PUBLISH_ELIGIBLE_ACTOR_STATUSES,
  ensureSuccessfulActorRun,
  resolveBulkPublishingFailure,
} from "./lib/bulk-publishing.js";

// Initialise Sentry before any other imports that might throw.
await initOpenTelemetry("actorconsole-worker");
await initNodeSentry("worker");
const log = getLogger("worker");
const usageSyncLock = createLeaderLock("actorconsole:worker:usage-sync:lock", 5 * 60 * 60);
const retentionLock = createLeaderLock("actorconsole:worker:retention:lock", 23 * 60 * 60);
const configuredApifyBulkDelay = Number(process.env.APIFY_BULK_OPERATION_DELAY_MS);
const APIFY_BULK_OPERATION_DELAY_MS = Number.isFinite(configuredApifyBulkDelay)
  ? Math.min(60_000, Math.max(0, configuredApifyBulkDelay))
  : 1_000;

function publicationReadinessMessage(blocking: ActorPublishReadiness["blocking"]): string {
  if (blocking.includes("readme")) return "README is missing from the default build.";
  const missingInput = blocking.includes("inputSchema");
  const missingOutput = blocking.includes("outputSchema");
  if (missingInput && missingOutput) {
    return "The default build is missing required input and output schemas.";
  }
  if (missingInput) return "The default build is missing a required input schema.";
  if (missingOutput) return "The default build is missing a required output schema.";
  if (blocking.includes("taggedBuild")) {
    return "The Actor needs a successful tagged build before it can be published.";
  }
  if (blocking.includes("publicProfile")) {
    return "A public Apify profile is required before Actors can be published.";
  }
  if (blocking.includes("verifiedEmail")) {
    return "Verify the Apify account email before publishing Actors.";
  }
  if (blocking.includes("nonDisposableEmail")) {
    return "A non-disposable Apify account email is required for publishing.";
  }
  return "The Actor does not satisfy Apify's publication requirements.";
}

function publicationFailureReadinessData(code: string) {
  if (code === "MISSING_TAGGED_BUILD") return { hasTaggedBuild: false };
  if (code === "PUBLIC_PROFILE_REQUIRED") return { hasPublicProfile: false };
  if (code === "EMAIL_NOT_VERIFIED") return { hasVerifiedEmail: false };
  if (code === "DISPOSABLE_EMAIL") return { hasNonDisposableEmail: false };
  if (code === "ACTOR_RUN_FAILED") return { publishReady: false };
  return {};
}

// ----- runtime singletons ----------------------------------------------------

declare global {
  var __redis: IORedis | undefined;
}

function getRedis(): IORedis {
  if (!process.env.REDIS_URL) throw new Error("REDIS_URL is not set");
  if (!global.__redis) {
    global.__redis = new IORedis(process.env.REDIS_URL, {
      maxRetriesPerRequest: null,
    });
  }
  return global.__redis;
}

let resendClient: Resend | null = null;
let resendApiKey: string | null = null;
let smtpClient: Transporter | null = null;
let smtpClientKey: string | null = null;

async function sendEmail(to: string, subject: string, html: string) {
  const [providerValue, from] = await Promise.all([
    getIntegration("email_provider"),
    getIntegration("email_from_address"),
  ]);
  const provider = providerValue?.trim().toLowerCase() || "resend";
  if (!from) {
    await db.emailLog
      .create({
        data: {
          to: to.slice(0, 500),
          subject,
          status: "failed",
          error: "Email integration is not fully configured",
        },
      })
      .catch((err) => log.warn({ err }, "Could not persist failed email log"));
    return { ok: false as const, reason: "Email integration is not fully configured" };
  }
  const address = from.match(/<([^<>\s]+)>/)?.[1] ?? from;
  if (
    !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(address) ||
    !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(to)
  ) {
    const reason = "Email sender or recipient address is invalid";
    await db.emailLog
      .create({ data: { to: to.slice(0, 500), subject, status: "failed", error: reason } })
      .catch(() => undefined);
    return { ok: false as const, reason };
  }

  if (provider === "smtp") {
    const [host, portValue, secureValue, username, password] = await Promise.all([
      getIntegration("smtp_host"),
      getIntegration("smtp_port"),
      getIntegration("smtp_secure"),
      getIntegration("smtp_username"),
      getIntegration("smtp_password"),
    ]);
    const port = Number(portValue || "587");
    if (
      !host ||
      Boolean(username) !== Boolean(password) ||
      !Number.isInteger(port) ||
      port < 1 ||
      port > 65_535
    ) {
      const reason = "SMTP integration is not fully configured";
      await db.emailLog
        .create({ data: { to: to.slice(0, 500), subject, status: "failed", error: reason } })
        .catch(() => undefined);
      return { ok: false as const, reason };
    }
    const secure = secureValue === "true";
    const cacheKey = JSON.stringify([host, port, secure, username, password]);
    if (!smtpClient || smtpClientKey !== cacheKey) {
      smtpClient = nodemailer.createTransport({
        host,
        port,
        secure,
        auth: username && password ? { user: username, pass: password } : undefined,
      });
      smtpClientKey = cacheKey;
    }
    const response = await smtpClient.sendMail({ from, to, subject, html });
    await db.emailLog
      .create({
        data: {
          to: to.slice(0, 500),
          subject,
          status: "sent",
          providerId: response.messageId,
        },
      })
      .catch((err) => log.warn({ err }, "Could not persist email log"));
    return { ok: true as const, id: response.messageId };
  }

  const apiKey = await getIntegration("resend_api_key");
  if (!apiKey) {
    await db.emailLog
      .create({
        data: {
          to: to.slice(0, 500),
          subject,
          status: "failed",
          error: "Email integration is not fully configured",
        },
      })
      .catch((err) => log.warn({ err }, "Could not persist failed email log"));
    return { ok: false as const, reason: "Email integration is not fully configured" };
  }
  if (!resendClient || resendApiKey !== apiKey) {
    resendClient = new Resend(apiKey);
    resendApiKey = apiKey;
  }
  const response = await resendClient.emails.send({
    from,
    to,
    subject,
    html,
  });
  if (response.error) {
    await db.emailLog
      .create({
        data: { to: to.slice(0, 500), subject, status: "failed", error: response.error.message },
      })
      .catch((err) => log.warn({ err }, "Could not persist failed email log"));
    return { ok: false as const, reason: response.error.message };
  }
  await db.emailLog
    .create({
      data: {
        to: to.slice(0, 500),
        subject,
        status: "sent",
        providerId: response.data?.id ?? null,
      },
    })
    .catch((err) => log.warn({ err }, "Could not persist email log"));
  return { ok: true as const, id: response.data?.id };
}

function jsonObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function nextBulkPublishRun(cronExpr: string) {
  try {
    return cronParser.parseExpression(cronExpr, { utc: true }).next().toDate();
  } catch {
    return null;
  }
}

type BulkActorStatusPayload = {
  operationId: string;
  userId: string;
  businessProfileId: string;
};

type BulkActorStatusProgressItem = {
  actorId: string;
  label: string;
  status: "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED";
  error?: string;
};

async function runBulkActorStatusOperation(job: Job, payload: BulkActorStatusPayload) {
  const operation = await db.bulkActorStatusOperation.findFirst({
    where: {
      id: payload.operationId,
      userId: payload.userId,
      businessProfileId: payload.businessProfileId,
    },
    include: { items: { include: { actor: true }, orderBy: { position: "asc" } } },
  });
  if (!operation) throw new Error("Bulk status operation is no longer available");

  const actorById = new Map(
    operation.items.flatMap((item) => (item.actor ? [[item.actor.id, item.actor] as const] : [])),
  );
  const itemIdByActorId = new Map(
    operation.items.flatMap((item) => (item.actorId ? [[item.actorId, item.id] as const] : [])),
  );
  const items: BulkActorStatusProgressItem[] = operation.items.map((storedItem) => {
    const actor = storedItem.actorId ? actorById.get(storedItem.actorId) : null;
    const alreadySucceeded = storedItem.status === "SUCCEEDED";
    return {
      actorId: storedItem.actorId ?? storedItem.apifyActorId,
      label: storedItem.label,
      status: alreadySucceeded ? "SUCCEEDED" : actor ? "QUEUED" : "FAILED",
      ...(actor || alreadySucceeded
        ? {}
        : { error: "Actor is no longer available in this workspace" }),
    };
  });

  await db.bulkActorStatusOperationItem.updateMany({
    where: {
      operationId: operation.id,
      status: { not: "SUCCEEDED" },
      actorId: { in: [...actorById.keys()] },
    },
    data: { status: "QUEUED", error: null, startedAt: null, completedAt: null },
  });

  await db.bulkActorStatusOperation.update({
    where: { id: operation.id },
    data: { status: "RUNNING", startedAt: operation.startedAt ?? new Date(), error: null },
  });

  const publishProgress = async () => {
    const completed = items.filter(
      (item) => item.status === "SUCCEEDED" || item.status === "FAILED",
    ).length;
    await job.updateProgress({
      kind: "BULK_ACTOR_STATUS",
      total: items.length,
      completed,
      succeeded: items.filter((item) => item.status === "SUCCEEDED").length,
      failed: items.filter((item) => item.status === "FAILED").length,
      items,
    });
    await db.bulkActorStatusOperation.update({
      where: { id: operation.id },
      data: {
        status: "RUNNING",
        completedCount: completed,
        succeededCount: items.filter((item) => item.status === "SUCCEEDED").length,
        failedCount: items.filter((item) => item.status === "FAILED").length,
      },
    });
  };
  const finishOperation = async (topLevelError?: string) => {
    const succeeded = items.filter((item) => item.status === "SUCCEEDED").length;
    const failed = items.filter((item) => item.status === "FAILED").length;
    const status = succeeded === items.length ? "SUCCEEDED" : succeeded > 0 ? "PARTIAL" : "FAILED";
    await db.bulkActorStatusOperation.update({
      where: { id: operation.id },
      data: {
        status,
        completedCount: succeeded + failed,
        succeededCount: succeeded,
        failedCount: failed,
        error: topLevelError ?? null,
        completedAt: new Date(),
      },
    });
    return { total: items.length, updated: succeeded, failed, items, operationId: operation.id };
  };

  try {
    for (const item of items.filter((candidate) => candidate.status === "FAILED")) {
      const storedItem = operation.items.find(
        (candidate) => (candidate.actorId ?? candidate.apifyActorId) === item.actorId,
      );
      if (storedItem) {
        await db.bulkActorStatusOperationItem.update({
          where: { id: storedItem.id },
          data: { status: "FAILED", error: item.error, completedAt: new Date() },
        });
      }
    }
    await assertWorkspacePlanAccess(payload.userId, payload.businessProfileId);
    await publishProgress();

    const apify = await getUserApifyClient(payload.userId, payload.businessProfileId);
    if (!apify) throw new Error("Bulk status updates require connected Apify credentials");

    for (let index = 0; index < items.length; index += 1) {
      const item = items[index]!;
      if (item.status === "FAILED") continue;
      const actor = actorById.get(item.actorId)!;
      const storedItemId = itemIdByActorId.get(item.actorId)!;
      item.status = "RUNNING";
      await db.bulkActorStatusOperationItem.update({
        where: { id: storedItemId },
        data: { status: "RUNNING", error: null, startedAt: new Date(), completedAt: null },
      });
      await publishProgress();
      try {
        const updated = await apify.updateActorStoreStatus(actor.apifyActorId, {
          underMaintenance: operation.underMaintenance ?? undefined,
          isDeprecated: operation.isDeprecated ?? undefined,
        });
        await db.$transaction([
          db.actor.update({
            where: { id: actor.id },
            data: {
              storeIsPublic: updated.isPublic,
              storeIsDeprecated: updated.isDeprecated,
              storeNotice: updated.notice,
              storeStatusSyncedAt: new Date(),
            },
          }),
          db.bulkActorStatusOperationItem.update({
            where: { id: storedItemId },
            data: { status: "SUCCEEDED", completedAt: new Date() },
          }),
        ]);
        item.status = "SUCCEEDED";
      } catch (error) {
        item.status = "FAILED";
        item.error = (error instanceof Error ? error.message : String(error)).slice(0, 500);
        await db.bulkActorStatusOperationItem.update({
          where: { id: storedItemId },
          data: { status: "FAILED", error: item.error, completedAt: new Date() },
        });
      }
      await publishProgress();
      if (index + 1 < items.length) await delayApifyBulkOperation();
    }

    return finishOperation();
  } catch (error) {
    const message = (error instanceof Error ? error.message : String(error)).slice(0, 500);
    const unfinished = operation.items.filter((storedItem) => {
      const item = items.find(
        (candidate) => (storedItem.actorId ?? storedItem.apifyActorId) === candidate.actorId,
      );
      return item && item.status !== "SUCCEEDED" && item.status !== "FAILED";
    });
    await Promise.all(
      unfinished.map((storedItem) =>
        db.bulkActorStatusOperationItem.update({
          where: { id: storedItem.id },
          data: { status: "FAILED", error: message, completedAt: new Date() },
        }),
      ),
    );
    for (const item of items) {
      if (item.status === "QUEUED" || item.status === "RUNNING") {
        item.status = "FAILED";
        item.error = message;
      }
    }
    await publishProgress();
    await finishOperation(message);
    throw error;
  }
}

async function runBulkPublishSchedule(job: Job, scheduleId: string, force = false) {
  const redis = getRedis();
  const runLock = createLeaderLock(`actorconsole:worker:bulk-publish:${scheduleId}:lock`, 60 * 60);
  if (!(await runLock.tryAcquire(redis))) {
    const outcome = {
      status: "SKIPPED_ALREADY_RUNNING",
      scheduleId,
      attemptedCount: 0,
      publishedCount: 0,
    };
    await job.updateProgress({
      kind: "BULK_PUBLISH_SCHEDULE",
      total: 0,
      completed: 0,
      published: 0,
      failed: 0,
      items: [],
      skippedReason: "A publishing run for this schedule is already in progress.",
    });
    return outcome;
  }

  try {
    return await runBulkPublishScheduleUnlocked(job, scheduleId, force);
  } finally {
    await runLock
      .release(redis)
      .catch((error) =>
        log.warn({ err: error, scheduleId }, "Could not release bulk publishing run lock"),
      );
  }
}

async function runBulkPublishScheduleUnlocked(job: Job, scheduleId: string, force = false) {
  const schedule = await db.bulkPublishSchedule.findUnique({
    where: { id: scheduleId },
    include: {
      businessProfile: { select: { plan: true } },
      actors: {
        where: { status: { in: [...BULK_PUBLISH_ELIGIBLE_ACTOR_STATUSES] } },
        orderBy: { position: "asc" },
        include: { actor: true },
      },
    },
  });
  if (!schedule || (!schedule.enabled && !force)) return;
  if (!planHasFeature(schedule.businessProfile.plan, "publishing")) return;
  await assertWorkspacePlanAccess(schedule.userId, schedule.businessProfileId);
  if (schedule.actors.length === 0) {
    await db.bulkPublishSchedule.update({
      where: { id: schedule.id },
      data: { enabled: false, nextRunAt: null, quotaBlockedUntil: null },
    });
    const outcome = {
      status: "QUEUE_COMPLETE",
      scheduleId: schedule.id,
      attemptedCount: 0,
      publishedCount: 0,
      remainingCount: 0,
    };
    await job.updateProgress({
      kind: "BULK_PUBLISH_SCHEDULE",
      total: 0,
      completed: 0,
      published: 0,
      failed: 0,
      items: [],
      queueComplete: true,
    });
    return outcome;
  }
  const now = new Date();
  if (schedule.quotaBlockedUntil && schedule.quotaBlockedUntil > now) {
    await db.bulkPublishSchedule.update({
      where: { id: schedule.id },
      data: { nextRunAt: nextBulkPublishRun(schedule.cronExpr) },
    });
    return;
  }
  const run = await db.bulkPublishScheduleRun.create({
    data: { scheduleId: schedule.id, status: "RUNNING" },
  });
  const apify = await getUserApifyClient(schedule.userId, schedule.businessProfileId);
  if (!apify) {
    const message = "Connect a valid Apify API key before running this publishing schedule.";
    await db.bulkPublishScheduleRun.update({
      where: { id: run.id },
      data: {
        status: "FAILED",
        stoppedReason: "APIFY_API_KEY_REQUIRED",
        result: [{ actorId: "", status: "FAILED", error: message }] as Prisma.InputJsonValue,
        completedAt: new Date(),
      },
    });
    await job.updateProgress({
      kind: "BULK_PUBLISH_SCHEDULE",
      runId: run.id,
      total: 0,
      completed: 0,
      published: 0,
      failed: 1,
      items: [],
      error: message,
    });
    return { runId: run.id, status: "FAILED", error: message };
  }
  let attemptedCount = 0;
  let publishedCount = 0;
  let stoppedReason: string | null = null;
  const candidates = schedule.actors.slice(0, schedule.dailyLimit);
  const results: Array<{ actorId: string; status: string; code?: string; error?: string }> =
    candidates.map((item) => ({ actorId: item.actorId, status: "QUEUED" }));

  const publishProgress = async () => {
    const completed = results.filter((result) =>
      ["PUBLISHED", "ALREADY_PUBLISHED", "FAILED", "BLOCKED", "QUOTA_BLOCKED"].includes(
        result.status,
      ),
    ).length;
    await Promise.all([
      job.updateProgress({
        kind: "BULK_PUBLISH_SCHEDULE",
        runId: run.id,
        total: candidates.length,
        completed,
        published: publishedCount,
        failed: results.filter(
          (result) => result.status === "FAILED" || result.status === "BLOCKED",
        ).length,
        items: results,
      }),
      db.bulkPublishScheduleRun.update({
        where: { id: run.id },
        data: {
          attemptedCount,
          publishedCount,
          result: results as Prisma.InputJsonValue,
        },
      }),
    ]);
  };
  await publishProgress();

  for (let index = 0; index < candidates.length; index += 1) {
    const item = candidates[index]!;
    results[index] = { actorId: item.actorId, status: "RUNNING" };
    attemptedCount += 1;
    await publishProgress();
    try {
      const live = await apify.getActor(item.actor.apifyActorId);
      if (!live) throw new Error("Actor was not found on Apify");
      const publicationPreflight = await apify.getActorPublicationPreflight(
        item.actor.apifyActorId,
      );
      const readiness = await loadActorPublishReadiness(apify, live, {
        publicProfile: publicationPreflight.checks.publicProfile,
        verifiedEmail: publicationPreflight.checks.verifiedEmail,
        nonDisposableEmail: publicationPreflight.checks.nonDisposableEmail,
      });
      await db.actor.update({
        where: { id: item.actorId },
        data: actorReadinessData(readiness),
      });
      if (readiness.blocking.length > 0) {
        throw new Error(publicationReadinessMessage(readiness.blocking));
      }
      if (!live.isPublic) {
        await ensureSuccessfulActorRun(
          apify,
          item.actor.apifyActorId,
          jsonObject(live.defaultRunInput) ?? {},
        );
      }
      // Clearing lifecycle flags is a separate operation from publishing.
      // A private but otherwise healthy Actor only needs the API owner write;
      // requiring Console status verification here made private Actors fail
      // whenever the optional UI token/cookie had expired.
      const needsLifecycleReset =
        !live.isPublic || live.isDeprecated === true || live.notice === "UNDER_MAINTENANCE";
      if (needsLifecycleReset) {
        await apify.updateActorStoreStatus(item.actor.apifyActorId, {
          underMaintenance: false,
          isDeprecated: false,
        });
      }
      if (!live.isPublic) {
        const published = await apify.publishActor(item.actor.apifyActorId);
        if (!published.isPublic) {
          throw new Error("Apify did not confirm that the Actor was published");
        }
      }
      const publishedAt = new Date();
      await db.$transaction([
        db.bulkPublishScheduleActor.update({
          where: {
            scheduleId_actorId: { scheduleId: schedule.id, actorId: item.actorId },
          },
          data: {
            status: "PUBLISHED",
            attemptCount: { increment: 1 },
            lastAttemptAt: publishedAt,
            lastPublishedAt: publishedAt,
            lastError: null,
          },
        }),
        db.actor.update({
          where: { id: item.actorId },
          data: {
            storeIsPublic: true,
            storeIsDeprecated: false,
            storeNotice: "NONE",
            storeStatusSyncedAt: publishedAt,
            hasTaggedBuild: true,
            hasPublicProfile: true,
            hasVerifiedEmail: true,
            hasNonDisposableEmail: true,
          },
        }),
      ]);
      publishedCount += 1;
      results[index] = {
        actorId: item.actorId,
        status: needsLifecycleReset || !live.isPublic ? "PUBLISHED" : "ALREADY_PUBLISHED",
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const quotaExceeded =
        error instanceof ApifyClientError && error.code === "daily_publication_limit";
      const failure = resolveBulkPublishingFailure(error, quotaExceeded);
      await db.$transaction([
        db.bulkPublishScheduleActor.update({
          where: { scheduleId_actorId: { scheduleId: schedule.id, actorId: item.actorId } },
          data: {
            status: failure.actorStatus,
            attemptCount: { increment: 1 },
            lastAttemptAt: new Date(),
            lastError: message,
          },
        }),
        db.actor.update({
          where: { id: item.actorId },
          data: publicationFailureReadinessData(failure.code),
        }),
      ]);
      results[index] = {
        actorId: item.actorId,
        status: failure.resultStatus,
        code: failure.code,
        error: message,
      };
      if (quotaExceeded) {
        stoppedReason = "APIFY_DAILY_PUBLICATION_LIMIT";
        for (let pendingIndex = index + 1; pendingIndex < results.length; pendingIndex += 1) {
          results[pendingIndex] = {
            actorId: results[pendingIndex]!.actorId,
            status: "NOT_ATTEMPTED",
            error:
              "Deferred until the next daily run because Apify's publication limit was reached.",
          };
        }
        await publishProgress();
        break;
      }
    }
    await publishProgress();
    if (index + 1 < candidates.length) await delayApifyBulkOperation();
  }

  const nextRunAt = nextBulkPublishRun(schedule.cronExpr);
  const remainingCount = await db.bulkPublishScheduleActor.count({
    where: {
      scheduleId: schedule.id,
      status: { in: [...BULK_PUBLISH_ELIGIBLE_ACTOR_STATUSES] },
    },
  });
  const finalStatus = stoppedReason
    ? "QUOTA_BLOCKED"
    : results.some((result) => result.status === "FAILED" || result.status === "BLOCKED")
      ? "PARTIAL"
      : "SUCCEEDED";
  await db.$transaction([
    db.bulkPublishScheduleRun.update({
      where: { id: run.id },
      data: {
        status: finalStatus,
        attemptedCount,
        publishedCount,
        stoppedReason,
        result: results as Prisma.InputJsonValue,
        completedAt: new Date(),
      },
    }),
    db.bulkPublishSchedule.update({
      where: { id: schedule.id },
      data: {
        enabled: remainingCount > 0,
        lastRunAt: new Date(),
        nextRunAt: remainingCount > 0 ? nextRunAt : null,
        quotaBlockedUntil: stoppedReason ? nextRunAt : null,
      },
    }),
    db.notification.create({
      data: {
        userId: schedule.userId,
        businessProfileId: schedule.businessProfileId,
        type: stoppedReason ? "bulk-publishing.quota-blocked" : "bulk-publishing.completed",
        title: stoppedReason
          ? "Bulk publishing paused until the next daily run"
          : `Bulk publishing completed: ${publishedCount} Actor${publishedCount === 1 ? "" : "s"}`,
        body: stoppedReason
          ? "Apify reported its daily publication limit. No remaining Actors were attempted."
          : `${attemptedCount} attempted, ${publishedCount} published, ${results.filter((result) => result.status === "BLOCKED").length} need attention.`,
        link: "/dashboard/publishing/schedules",
      },
    }),
  ]);
  const outcome = {
    runId: run.id,
    status: finalStatus,
    attemptedCount,
    publishedCount,
    remainingCount,
    stoppedReason,
    items: results,
  };
  await job.updateProgress({
    kind: "BULK_PUBLISH_SCHEDULE",
    runId: run.id,
    total: candidates.length,
    completed: results.filter((result) => result.status !== "NOT_ATTEMPTED").length,
    published: publishedCount,
    failed: results.filter((result) => result.status === "FAILED" || result.status === "BLOCKED")
      .length,
    items: results,
  });
  return outcome;
}

function delayApifyBulkOperation(): Promise<void> {
  if (APIFY_BULK_OPERATION_DELAY_MS <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, APIFY_BULK_OPERATION_DELAY_MS));
}

// ----- schedule handlers -----------------------------------------------------

// ----- daily snapshot job ----------------------------------------------------

function activePricingInfo(
  pricingInfos: ApifyPricingInfo[] | null | undefined,
  at = new Date(),
): ApifyPricingInfo | undefined {
  const timestamp = at.getTime();
  return [...(pricingInfos ?? [])]
    .filter((pricing) => !pricing.startedAt || Date.parse(pricing.startedAt) <= timestamp)
    .sort((left, right) => {
      const leftTime = left.startedAt ? Date.parse(left.startedAt) : 0;
      const rightTime = right.startedAt ? Date.parse(right.startedAt) : 0;
      return rightTime - leftTime;
    })[0];
}

async function runSnapshot(actorId?: string, bootstrapInsights = false) {
  const adminApify = await getAdminApifyClient();
  let cursor: string | undefined;
  do {
    const actors = actorId
      ? await db.actor.findMany({ where: { id: actorId, apifyRemovedAt: null } })
      : await db.actor.findMany({
          where: { apifyRemovedAt: null },
          take: 100,
          orderBy: { id: "asc" },
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        });
    if (actors.length === 0) break;

    for (const a of actors) {
      const workspaceApify = await getUserApifyClient(a.userId, a.businessProfileId);
      let apify = workspaceApify ?? adminApify;
      if (!apify) continue;
      try {
        // Store-level stats expose all-time runs, not a 30-day window. Use the
        // synchronized per-day billing records for the windowed run metric and
        // leave it empty until that first-party source is available.
        let actor;
        try {
          actor = await apify.getActor(a.apifyActorId);
        } catch (error) {
          if (!adminApify || !workspaceApify || apify === workspaceApify) throw error;
          log.warn(
            { error, actorId: a.apifyActorId },
            "Platform Apify credential could not read actor; using workspace credential",
          );
          apify = workspaceApify;
          actor = await apify.getActor(a.apifyActorId);
        }
        const basicInfo = await apify.getActorBasicInfo(a.apifyActorId).catch(() => null);
        const stats = basicInfo?.stats ?? actor?.stats ?? {};
        const currentPricing = activePricingInfo(basicInfo?.pricingInfos ?? actor?.pricingInfos);
        const usageSince = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const usage = await db.usageDaily.aggregate({
          where: { actorId: a.id, date: { gte: usageSince } },
          _sum: { runs: true },
        });
        await Promise.all([
          db.actorSnapshot.create({
            data: {
              actorId: a.id,
              capturedAt: new Date(),
              runs30d: stats.publicActorRunStats30Days?.TOTAL ?? usage._sum.runs ?? null,
              usersTotal: stats.totalUsers ?? actor?.totalUsers ?? null,
              monthlyUsers: stats.totalUsers30Days ?? stats.monthlyUsers ?? null,
              rating: stats.actorReviewRating ?? stats.rating ?? null,
              pricing: currentPricing
                ? (currentPricing as unknown as Prisma.InputJsonValue)
                : Prisma.JsonNull,
            },
          }),
          db.actor.update({
            where: { id: a.id },
            data: {
              title: basicInfo?.title ?? actor?.title,
              description: basicInfo?.description ?? actor?.description,
              currentImageUrl: basicInfo?.pictureUrl ?? actor?.pictureUrl,
              ...(currentPricing
                ? { currentPricing: currentPricing as unknown as Prisma.InputJsonValue }
                : {}),
            },
          }),
        ]);
        await syncActorOperationalData(workspaceApify ?? apify, {
          id: a.id,
          apifyActorId: a.apifyActorId,
        });
        await syncActorInsights({
          actor: { id: a.id, apifyActorId: a.apifyActorId },
          apify: workspaceApify ?? apify,
          bootstrap: bootstrapInsights,
        });
      } catch (err) {
        log.warn({ err, actorId: a.apifyActorId }, "Actor snapshot failed");
        if (actorId) throw err;
      }
    }
    if (actorId || actors.length < 100) break;
    cursor = actors.at(-1)!.id;
  } while (cursor);
}

async function listWorkspaceActors(apify: {
  listMyActors(options: { limit: number; offset: number }): Promise<ApifyActorSummary[]>;
}) {
  const actors: ApifyActorSummary[] = [];
  const pageSize = 100;
  for (let offset = 0; offset < 10_000; offset += pageSize) {
    const page = await apify.listMyActors({ limit: pageSize, offset });
    actors.push(...page);
    if (page.length < pageSize) return actors;
  }
  throw new Error("Actor inventory exceeds the sync pagination limit; reconciliation was skipped");
}

async function refreshWorkspacePublishingInventory(
  input: { userId: string; businessProfileId: string },
  job: Job,
) {
  const profile = await db.businessProfile.findFirst({
    where: { id: input.businessProfileId, userId: input.userId },
    select: { id: true },
  });
  if (!profile) throw new Error("Workspace is unavailable for publishing inventory refresh");
  const apify = await getUserApifyClient(input.userId, input.businessProfileId);
  if (!apify) throw new Error("Workspace Apify credentials are unavailable");

  const inventory = await listWorkspaceActors(apify);
  const admission = await admitWorkspaceActors(input.userId, input.businessProfileId, inventory, {
    reconcile: true,
  });
  const actors = admission.items;
  let completed = 0;
  let verifiedStatuses = 0;
  const batchSize = 2;
  await job.updateProgress({ total: actors.length, completed, verifiedStatuses });

  for (let offset = 0; offset < actors.length; offset += batchSize) {
    const batch = actors.slice(offset, offset + batchSize);
    const results = await Promise.all(
      batch.map(async (actor) => {
        let detail: ApifyActorBasicInfo | ApifyActorDetail | null = null;
        if (!actor.storeStatusAvailable || actor.storeVisibilityAvailable !== true) {
          try {
            detail = await apify.getActorBasicInfo(actor.id);
          } catch (consoleError) {
            // A stale Console credential must not hide lifecycle state when
            // the workspace API key can still read the owned Actor.
            detail = await apify.getActor(actor.id).catch((apiError) => {
              log.warn(
                { consoleError, apiError, actorId: actor.id },
                "Publishing inventory status could not be verified",
              );
              return null;
            });
          }
        }

        const statusAvailable = actor.storeStatusAvailable || Boolean(detail);
        const source = detail ?? actor;
        const publicationPreflight =
          source.isPublic === false
            ? await apify.getActorPublicationPreflight(actor.id).catch((error) => {
                log.warn(
                  { error, actorId: actor.id },
                  "Publication preflight could not be fully synchronized",
                );
                return null;
              })
            : null;
        const pricing = activePricingInfo(source.pricingInfos ?? actor.pricingInfos);
        const description = source.description ?? actor.description;
        const categories = source.categories ?? actor.categories;
        const artifactReadiness = await loadActorPublishReadiness(apify, actor, {
          taggedBuild: publicationPreflight?.checks.taggedBuild,
          publicProfile: publicationPreflight?.checks.publicProfile,
          verifiedEmail: publicationPreflight?.checks.verifiedEmail,
          nonDisposableEmail: publicationPreflight?.checks.nonDisposableEmail,
        }).catch((error) => {
          log.warn({ error, actorId: actor.id }, "Default build readiness could not be verified");
          return analyzeActorPublishReadiness({
            description,
            artifactChecks: {
              readme: null,
              inputSchema: null,
              outputSchema: null,
              keyValueStoreSchema: null,
            },
          });
        });
        const syncedAt = new Date();
        const statusData = statusAvailable
          ? {
              ...(typeof source.isPublic === "boolean"
                ? { storeIsPublic: source.isPublic }
                : actor.storeVisibilityAvailable
                  ? { storeIsPublic: actor.isPublic }
                  : {}),
              ...(typeof source.isDeprecated === "boolean"
                ? { storeIsDeprecated: source.isDeprecated }
                : actor.storeDeprecationAvailable
                  ? { storeIsDeprecated: actor.isDeprecated ?? false }
                  : {}),
              ...(typeof source.notice === "string"
                ? { storeNotice: source.notice }
                : actor.storeNoticeAvailable
                  ? { storeNotice: actor.notice ?? "NONE" }
                  : {}),
              storeStatusSyncedAt: syncedAt,
            }
          : {};
        const readinessData = {
          ...actorReadinessData(artifactReadiness),
          hasDescription: Boolean(description?.trim()),
          // Category assignment is display-only and never gates publication.
          ...(Array.isArray(categories) ? { hasCategories: categories.length > 0 } : {}),
          ...(source.isPublic === true
            ? {
                hasTaggedBuild: true,
                hasPublicProfile: true,
                hasVerifiedEmail: true,
                hasNonDisposableEmail: true,
              }
            : publicationPreflight
              ? {
                  hasTaggedBuild: publicationPreflight.checks.taggedBuild,
                  ...(publicationPreflight.checks.publicProfile === null
                    ? {}
                    : { hasPublicProfile: publicationPreflight.checks.publicProfile }),
                  ...(publicationPreflight.checks.verifiedEmail === null
                    ? {}
                    : { hasVerifiedEmail: publicationPreflight.checks.verifiedEmail }),
                  ...(publicationPreflight.checks.nonDisposableEmail === null
                    ? {}
                    : {
                        hasNonDisposableEmail: publicationPreflight.checks.nonDisposableEmail,
                      }),
                }
              : {}),
        };

        await db.actor.upsert({
          where: {
            businessProfileId_apifyActorId: {
              businessProfileId: input.businessProfileId,
              apifyActorId: actor.id,
            },
          },
          create: {
            userId: input.userId,
            businessProfileId: input.businessProfileId,
            apifyActorId: actor.id,
            username: source.username ?? actor.username,
            actorName: source.name ?? actor.name,
            title: source.title ?? actor.title,
            description,
            currentImageUrl: source.pictureUrl ?? actor.pictureUrl,
            ...(pricing ? { currentPricing: pricing as unknown as Prisma.InputJsonValue } : {}),
            ...statusData,
            ...readinessData,
          },
          update: {
            userId: input.userId,
            username: source.username ?? actor.username,
            actorName: source.name ?? actor.name,
            title: source.title ?? actor.title,
            description,
            currentImageUrl: source.pictureUrl ?? actor.pictureUrl,
            ...(pricing ? { currentPricing: pricing as unknown as Prisma.InputJsonValue } : {}),
            ...statusData,
            ...readinessData,
          },
        });
        return statusAvailable;
      }),
    );

    completed += batch.length;
    verifiedStatuses += results.filter(Boolean).length;
    await job.updateProgress({ total: actors.length, completed, verifiedStatuses });
    if (completed < actors.length && APIFY_BULK_OPERATION_DELAY_MS > 0) {
      await new Promise((resolve) => setTimeout(resolve, APIFY_BULK_OPERATION_DELAY_MS));
    }
  }

  if (actors.length)
    await db.onboardingState.updateMany({
      where: { userId: input.userId, businessProfileId: input.businessProfileId },
      data: { actorImported: true },
    });
  return {
    importedActors: actors.length,
    verifiedStatuses,
    skipped: admission.skipped,
    usage: admission.usage,
  };
}

async function bootstrapWorkspaceInsights(
  input: { userId: string; businessProfileId: string },
  queue: Queue,
) {
  const profile = await db.businessProfile.findFirst({
    where: { id: input.businessProfileId, userId: input.userId },
    select: { id: true },
  });
  if (!profile) throw new Error("Workspace is unavailable for Apify insight bootstrap");
  const apify = await getUserApifyClient(input.userId, input.businessProfileId);
  if (!apify) throw new Error("Workspace Apify credentials are unavailable");
  const inventory = await listWorkspaceActors(apify);
  const admission = await admitWorkspaceActors(input.userId, input.businessProfileId, inventory, {
    reconcile: true,
  });
  const items = admission.items;
  const upserts: Array<{ id: string }> = [];
  for (let offset = 0; offset < items.length; offset += 50) {
    const batch = items.slice(offset, offset + 50);
    upserts.push(
      ...(await Promise.all(
        batch.map((actor) => {
          const pricing = activePricingInfo(actor.pricingInfos);
          return db.actor.upsert({
            where: {
              businessProfileId_apifyActorId: {
                businessProfileId: input.businessProfileId,
                apifyActorId: actor.id,
              },
            },
            create: {
              userId: input.userId,
              businessProfileId: input.businessProfileId,
              apifyActorId: actor.id,
              username: actor.username,
              actorName: actor.name,
              title: actor.title,
              description: actor.description,
              currentImageUrl: actor.pictureUrl,
              currentPricing: pricing ? (pricing as unknown as Prisma.InputJsonValue) : undefined,
              ...(actor.storeStatusAvailable
                ? {
                    ...(actor.storeVisibilityAvailable ? { storeIsPublic: actor.isPublic } : {}),
                    ...(actor.storeDeprecationAvailable
                      ? { storeIsDeprecated: actor.isDeprecated ?? false }
                      : {}),
                    ...(actor.storeNoticeAvailable ? { storeNotice: actor.notice ?? "NONE" } : {}),
                    storeStatusSyncedAt: new Date(),
                  }
                : {}),
            },
            update: {
              username: actor.username,
              actorName: actor.name,
              title: actor.title,
              description: actor.description,
              currentImageUrl: actor.pictureUrl,
              ...(pricing ? { currentPricing: pricing as unknown as Prisma.InputJsonValue } : {}),
              ...(actor.storeStatusAvailable
                ? {
                    ...(actor.storeVisibilityAvailable ? { storeIsPublic: actor.isPublic } : {}),
                    ...(actor.storeDeprecationAvailable
                      ? { storeIsDeprecated: actor.isDeprecated ?? false }
                      : {}),
                    ...(actor.storeNoticeAvailable ? { storeNotice: actor.notice ?? "NONE" } : {}),
                    storeStatusSyncedAt: new Date(),
                  }
                : {}),
            },
            select: { id: true },
          });
        }),
      )),
    );
  }
  await db.onboardingState.updateMany({
    where: { userId: input.userId, businessProfileId: input.businessProfileId },
    data: { actorImported: true },
  });
  if (upserts.length) {
    const stamp = Date.now();
    await queue.addBulk(
      upserts.map((actor) => ({
        name: "actor-insight-bootstrap",
        data: { actorId: actor.id, bootstrapInsights: true },
        opts: { jobId: `actor-insight-bootstrap-${actor.id}-${stamp}` },
      })),
    );
  }
  await db.apifyToken.updateMany({
    where: { userId: input.userId, businessProfileId: input.businessProfileId },
    data: { insightsBootstrapPending: false, insightsBootstrapError: null },
  });
  log.info({ ...input, actors: upserts.length }, "Workspace Actor insight bootstrap queued");
  return upserts.length;
}

async function enqueueAllActorSnapshots(queue: Queue) {
  const pendingBootstraps = await db.apifyToken.findMany({
    where: { insightsBootstrapPending: true, encryptedToken: { not: null } },
    select: { userId: true, businessProfileId: true },
    take: 1_000,
  });
  if (pendingBootstraps.length) {
    const day = new Date().toISOString().slice(0, 10);
    await queue.addBulk(
      pendingBootstraps.map((workspace) => ({
        name: "workspace-insight-bootstrap-retry",
        data: { workspaceBootstrap: workspace },
        opts: { jobId: `workspace-insight-bootstrap:${workspace.businessProfileId}:${day}` },
      })),
    );
  }
  let cursor: string | undefined;
  const day = new Date().toISOString().slice(0, 10);
  do {
    const actors = await db.actor.findMany({
      where: { apifyRemovedAt: null },
      select: { id: true, lastInsightSyncAt: true },
      orderBy: { id: "asc" },
      take: 250,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (actors.length === 0) break;
    await queue.addBulk(
      actors.map((actor) => ({
        name: "actor-snapshot",
        data: { actorId: actor.id, bootstrapInsights: actor.lastInsightSyncAt === null },
        opts: { jobId: `actor-snapshot:${actor.id}:${day}` },
      })),
    );
    if (actors.length < 250) break;
    cursor = actors.at(-1)!.id;
  } while (cursor);
}

type NewsletterArticle = {
  title: string;
  url: string;
  excerpt: string;
  publishedAt?: string;
};

async function runNewsletterCampaign(campaignId: string) {
  const campaign = await db.newsletterCampaign.findUnique({ where: { id: campaignId } });
  if (!campaign || ["COMPLETED", "PARTIAL", "FAILED"].includes(campaign.status)) return;

  await db.newsletterCampaign.update({
    where: { id: campaignId },
    data: { status: "RUNNING", startedAt: campaign.startedAt ?? new Date(), error: null },
  });

  const articles = campaign.articles as unknown as NewsletterArticle[];
  const appUrl = getAppBaseUrl();
  let sent = 0;
  let failed = 0;
  let cursor: string | undefined;

  do {
    const subscribers = await db.newsletterSubscriber.findMany({
      where: { status: "ACTIVE" },
      select: { id: true, email: true, name: true, token: true },
      orderBy: { id: "asc" },
      take: 100,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (subscribers.length === 0) break;

    for (const subscriber of subscribers) {
      const previous = await db.newsletterDelivery.findUnique({
        where: { campaignId_subscriberId: { campaignId, subscriberId: subscriber.id } },
      });
      if (previous?.status === "SENT") {
        sent++;
        continue;
      }
      if (previous?.status === "SENDING") {
        failed++;
        continue;
      }

      await db.newsletterDelivery.upsert({
        where: { campaignId_subscriberId: { campaignId, subscriberId: subscriber.id } },
        create: {
          campaignId,
          subscriberId: subscriber.id,
          email: subscriber.email,
          status: "SENDING",
        },
        update: { status: "SENDING", error: null },
      });

      try {
        const result = await sendEmail(
          subscriber.email,
          campaign.subject,
          renderNewsletterEmail({
            appUrl,
            userName: subscriber.name ?? undefined,
            newsletterTitle: campaign.title,
            articles,
            unsubscribeUrl: `${appUrl}/newsletter/unsubscribe?token=${encodeURIComponent(subscriber.token)}`,
          }),
        );
        if (!result.ok) throw new Error(result.reason);
        await db.newsletterDelivery.update({
          where: { campaignId_subscriberId: { campaignId, subscriberId: subscriber.id } },
          data: { status: "SENT", providerId: result.id ?? null, sentAt: new Date() },
        });
        sent++;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Newsletter delivery failed";
        await db.newsletterDelivery.update({
          where: { campaignId_subscriberId: { campaignId, subscriberId: subscriber.id } },
          data: { status: "FAILED", error: message.slice(0, 10_000) },
        });
        failed++;
      }
    }

    if (subscribers.length < 100) break;
    cursor = subscribers.at(-1)!.id;
  } while (cursor);

  const totalRecipients = sent + failed;
  const status = failed === 0 ? "COMPLETED" : sent === 0 ? "FAILED" : "PARTIAL";
  await db.newsletterCampaign.update({
    where: { id: campaignId },
    data: {
      status,
      totalRecipients,
      sentCount: sent,
      failedCount: failed,
      completedAt: new Date(),
      error: failed > 0 ? `${failed} recipient deliveries failed or require review` : null,
    },
  });
}

// ----- ActorSnapshot retention (Phase 4.7) ---------------------------------
//
// The actual implementation lives in ./lib/retention.ts so it can be
// unit-tested in isolation. The worker just calls it on a daily tick.

import { pruneOldSnapshots } from "./lib/retention.js";

// ----- daily revenue sync (Phase 4) -----------------------------------------

async function syncUsageCosts() {
  const today = new Date();
  // Inclusive start/end yields the full 370-day reporting window.
  const historyStart = new Date(today.getTime() - 369 * 24 * 60 * 60 * 1000);
  const from = historyStart.toISOString().slice(0, 10);
  const to = today.toISOString().slice(0, 10);
  let upserted = 0;
  const connectedUsers = await db.apifyToken.findMany({
    select: { userId: true, businessProfileId: true },
  });
  for (const { userId, businessProfileId } of connectedUsers) {
    const apify = await getUserApifyClient(userId, businessProfileId);
    if (!apify) continue;
    try {
      const actors = await db.actor.findMany({
        where: { userId, businessProfileId },
        select: { id: true, apifyActorId: true },
      });
      let items: Awaited<ReturnType<typeof apify.getBillingDailyUsage>> = [];
      try {
        items = await apify.getBillingDailyUsage(from, to);
      } catch (err) {
        log.warn(
          { err, userId, businessProfileId },
          "Apify billing history unavailable; run/build analytics will still be synchronized",
        );
      }
      const actorByApifyId = new Map(
        actors.map((a: { id: string; apifyActorId: string }) => [a.apifyActorId, a.id]),
      );
      for (const item of items) {
        const dbActorId = actorByApifyId.get(item.actorId);
        if (!dbActorId) continue;
        const date = new Date(item.date + "T00:00:00.000Z");
        await db.usageDaily.upsert({
          where: { actorId_date: { actorId: dbActorId, date } },
          create: {
            actorId: dbActorId,
            date,
            usageCostUsd: String(item.amountUsd),
            runs: item.runs,
            adjustmentUsd: null,
          },
          update: {
            usageCostUsd: String(item.amountUsd),
            runs: item.runs,
          },
        });
        upserted++;
      }
      for (const actor of actors) {
        try {
          await syncActorOperationalData(apify, actor);
        } catch (err) {
          log.warn(
            { err, userId, businessProfileId, apifyActorId: actor.apifyActorId },
            "Actor operational sync failed; continuing with other actors",
          );
        }
      }
      log.debug({ userId, records: items.length }, "Fetched per-user Apify usage-cost records");
    } catch (err) {
      log.warn({ err, userId }, "Per-user usage-cost sync failed; continuing with other accounts");
    }
  }
  log.info({ upserted }, "Stored Apify usage-cost records");
  return { upserted, users: connectedUsers.length, skipped: connectedUsers.length === 0 };
}

type TrackedActorRef = { id: string; apifyActorId: string };

async function syncActorOperationalData(
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

// ----- worker bootstrap ------------------------------------------------------

function redisConnectionOptions(redis: IORedis): ConnectionOptions {
  const opts: ConnectionOptions = {
    host: redis.options.host ?? "127.0.0.1",
    port: redis.options.port ?? 6379,
  };
  if (redis.options.password) opts.password = redis.options.password;
  if (redis.options.username) opts.username = redis.options.username;
  return opts;
}

/**
 * Per-queue retry / backoff policy. Imported from the shared package so
 * the API and the worker agree on retry semantics. See
 * `@actorconsole/shared/queue/retry-policies` for the full rationale.
 */
import { QUEUE_RETRY_POLICIES } from "@actorconsole/shared";
const defaultJobOptions: Record<string, JobsOptions> = QUEUE_RETRY_POLICIES;

/**
 * Distributed lock for the schedule tick (see `lib/leader-election.ts`).
 * Only one worker replica should scan for due schedules per tick interval;
 * otherwise multi-replica deployments double-enqueue every job.
 */
async function tickScheduleQueue() {
  const redis = getRedis();
  const acquired = await scheduleTickLock.tryAcquire(redis);
  if (!acquired) {
    // Another replica is handling this tick. No-op.
    return;
  }

  try {
    // Find due publishing schedules and enqueue them via Redis directly.
    const now = new Date();
    const dueBulk = await db.bulkPublishSchedule.findMany({
      where: { enabled: true, nextRunAt: { lte: now } },
      take: 25,
    });
    if (dueBulk.length === 0) return;
    const q = new Queue("schedules", {
      connection: redisConnectionOptions(redis),
      defaultJobOptions: QUEUE_RETRY_POLICIES.schedules,
    });
    try {
      for (const schedule of dueBulk) {
        await q.add(
          "bulk-publishing",
          { bulkPublishScheduleId: schedule.id },
          {
            jobId: `bulk-publish:${schedule.id}:${schedule.nextRunAt?.getTime() ?? now.getTime()}`,
          },
        );
      }
    } finally {
      await q.close();
    }
  } catch (err) {
    log.error({ err }, "Schedule queue tick failed");
    // Release the lock early on error so the next tick can retry quickly.
    await scheduleTickLock.release(redis).catch(() => {});
  }
}

async function start() {
  const redis = getRedis();
  const connection = redisConnectionOptions(redis);

  // Register Queue objects with retry/backoff defaults. BullMQ applies
  // these to all jobs added to the queue, and the API process (which also
  // creates Queue instances) will pick up the same defaults when adding
  // jobs via shared lib/queue helpers.
  const queueRegistry: Queue[] = [];
  for (const [name, defaults] of Object.entries(defaultJobOptions)) {
    queueRegistry.push(
      new Queue(name, {
        connection,
        defaultJobOptions: defaults,
      }),
    );
  }
  const snapshotsQueue = queueRegistry.find((queue) => queue.name === "snapshots");
  const catalogQueue = queueRegistry.find((queue) => queue.name === "catalog");
  await snapshotsQueue?.upsertJobScheduler(
    "daily-actor-snapshots",
    { pattern: "0 2 * * *", tz: "UTC" },
    { name: "daily-actor-snapshots", data: {} },
  );
  // Catalog crawling can take many minutes. Keep it on a dedicated queue so
  // a platform-wide crawl can never block a workspace's initial Actor sync.
  await Promise.all([
    snapshotsQueue?.removeJobScheduler("daily-store-catalog-search"),
    snapshotsQueue?.removeJobScheduler("hourly-store-catalog-details"),
  ]);
  await catalogQueue?.upsertJobScheduler(
    "daily-store-catalog-search",
    { pattern: "0 1 * * *", tz: "UTC" },
    { name: "store-catalog-search", data: { catalog: "search" } },
  );
  await catalogQueue?.upsertJobScheduler(
    "hourly-store-catalog-details",
    { pattern: "15 * * * *", tz: "UTC" },
    { name: "store-catalog-details", data: { catalog: "details" } },
  );
  await catalogQueue?.upsertJobScheduler(
    "daily-website-classification",
    { pattern: "30 3 * * *", tz: "UTC" },
    { name: "website-classification", data: { catalog: "websites" } },
  );
  await catalogQueue?.upsertJobScheduler(
    "daily-website-logo-enrichment",
    { pattern: "0 4 * * *", tz: "UTC" },
    { name: "website-logo-enrichment", data: { catalog: "logos" } },
  );
  // A deployment or a temporary worker outage should not leave the public
  // leaderboard stale until the following day's fixed cron time. The job ID
  // makes this safe across worker replicas and restarts.
  if (catalogQueue) {
    const now = new Date();
    const dayStart = new Date(now);
    dayStart.setUTCHours(0, 0, 0, 0);
    const [latestSearch, latestSnapshot, snapshotCount, catalogActorCount] = await Promise.all([
      db.storeCatalogSync.findFirst({
        where: { operation: "SEARCH_FULL", status: "COMPLETED", completedAt: { not: null } },
        orderBy: { completedAt: "desc" },
        select: { completedAt: true },
      }),
      db.storeActorSnapshot.findFirst({
        where: {
          capturedAt: { gte: dayStart },
          storeActor: { apifyActorId: { not: { contains: "/" } } },
        },
        orderBy: { capturedAt: "desc" },
        select: { capturedAt: true },
      }),
      db.storeActorSnapshot.count({
        where: {
          capturedAt: { gte: dayStart },
          storeActor: { apifyActorId: { not: { contains: "/" } } },
        },
      }),
      db.storeActor.count({
        where: {
          isPublic: true,
          apifyActorId: { not: { contains: "/" } },
          lastSeenAt: { gte: dayStart },
        },
      }),
    ]);
    if (
      needsDailyStoreCatalogCatchup({
        now,
        latestSearchCompletedAt: latestSearch?.completedAt ?? null,
        latestSnapshotAt: latestSnapshot?.capturedAt ?? null,
        snapshotCount,
        catalogActorCount,
      })
    ) {
      const dayKey = dayStart.toISOString().slice(0, 10);
      // Include the observed coverage in the deterministic key. A prior
      // partial run can therefore be retried after it has persisted more
      // snapshots, while simultaneous worker starts still deduplicate the
      // same catch-up request. Remove finished jobs so a failed day never
      // permanently blocks recovery behind a stale BullMQ job record.
      const catchupJobId = `store-catalog-search-catchup-${dayKey}-${catalogActorCount}-${snapshotCount}`;
      await catalogQueue.add(
        "store-catalog-search-catchup",
        { catalog: "search" },
        { jobId: catchupJobId, removeOnComplete: true, removeOnFail: true },
      );
      log.info(
        { dayKey, snapshotCount, catalogActorCount, catchupJobId },
        "Queued incomplete daily Apify Store catalog synchronization",
      );
    }
  }

  let tickTimer: ReturnType<typeof setTimeout> | undefined;
  const scheduleNextTick = () => {
    const delayMs = 30_000 + Math.floor(Math.random() * 5_000);
    tickTimer = setTimeout(async () => {
      await tickScheduleQueue().catch((err) => log.error({ err }, "Schedule queue tick failed"));
      scheduleNextTick();
    }, delayMs);
  };
  tickScheduleQueue().catch((err) => log.error({ err }, "Initial schedule queue tick failed"));
  scheduleNextTick();

  const worker = new Worker(
    "schedules",
    async (job) => {
      const { bulkPublishScheduleId, bulkActorStatus, force } = job.data as {
        bulkPublishScheduleId?: string;
        bulkActorStatus?: BulkActorStatusPayload;
        force?: boolean;
      };
      if (bulkActorStatus) {
        return runBulkActorStatusOperation(job, bulkActorStatus);
      }
      if (bulkPublishScheduleId) {
        return runBulkPublishSchedule(job, bulkPublishScheduleId, force);
      }
      throw new Error("Publishing job is missing its identifier");
    },
    {
      connection,
      concurrency: Number(process.env.WORKER_CONCURRENCY ?? 5),
    },
  );

  const snapshotWorker = new Worker(
    "snapshots",
    async (job) => {
      const { actorId, catalog } = job.data as {
        actorId?: string;
        catalog?: "search" | "details";
        bootstrapInsights?: boolean;
        workspaceBootstrap?: { userId: string; businessProfileId: string };
        workspaceInventory?: { userId: string; businessProfileId: string };
      };
      // Drain jobs left by releases that used the shared snapshots queue.
      // The actual crawl is performed by catalogWorker below.
      if (catalog) {
        if (!catalogQueue) throw new Error("Catalog queue is unavailable");
        await catalogQueue.add(
          `store-catalog-${catalog}`,
          { catalog },
          {
            jobId: `legacy-${String(job.id ?? catalog).replaceAll(":", "-")}`,
          },
        );
      } else if (job.data.workspaceInventory) {
        return refreshWorkspacePublishingInventory(job.data.workspaceInventory, job);
      } else if (job.data.workspaceBootstrap && snapshotsQueue) {
        try {
          await bootstrapWorkspaceInsights(job.data.workspaceBootstrap, snapshotsQueue);
        } catch (error) {
          await db.apifyToken.updateMany({
            where: {
              userId: job.data.workspaceBootstrap.userId,
              businessProfileId: job.data.workspaceBootstrap.businessProfileId,
            },
            data: {
              insightsBootstrapPending: true,
              insightsBootstrapError: (error instanceof Error
                ? error.message
                : String(error)
              ).slice(0, 8_000),
            },
          });
          throw error;
        }
      } else if (actorId) await runSnapshot(actorId, Boolean(job.data.bootstrapInsights));
      else if (snapshotsQueue) await enqueueAllActorSnapshots(snapshotsQueue);
    },
    { connection, concurrency: 1 },
  );

  const catalogWorker = new Worker(
    "catalog",
    async (job) => {
      const { catalog } = job.data as {
        catalog?: "search" | "details" | "websites" | "logos";
      };
      if (!catalog) throw new Error("Catalog job is missing its sync mode");
      if (catalog === "websites") {
        const result = await classifyWebsiteCatalog({
          concurrency: Number(process.env.WEBSITE_CLASSIFICATION_CONCURRENCY ?? 25),
          retryCount: job.attemptsMade,
        });
        log.info({ result }, "Actor website catalog classified");
        return result;
      }
      if (catalog === "logos") {
        const result = await enrichWebsiteLogos({
          limit: Number(process.env.WEBSITE_LOGO_ENRICHMENT_BATCH_SIZE ?? 100),
          delayMs: Number(process.env.WEBSITE_LOGO_ENRICHMENT_DELAY_MS ?? 150),
          retryCount: job.attemptsMade,
        });
        if (result.error) log.warn({ result }, "Website logo enrichment skipped");
        else log.info({ result }, "Official website logos enriched");
        return result;
      }
      // Public Store listing and public Actor details must never inherit an
      // administrator's publishing credential. The SDK sends a configured API
      // token even for public endpoints; a stale credential therefore turns a
      // normally anonymous Store request into a 401/403 and freezes the
      // platform leaderboard. Keep this crawler deliberately anonymous.
      const apify = createApifyClient({});
      if (catalog === "search") {
        const result = await syncStoreSearchCatalog(apify, {
          completeCatalog: true,
          // The public Store API stops returning rows beyond its offset
          // ceiling even when it reports a larger total. Reconcile the
          // official sitemap by default so every daily leaderboard snapshot
          // is complete; deployments can explicitly disable it only for
          // maintenance via APIFY_STORE_RECONCILE_BUILDERS=false.
          reconcileBuilders: process.env.APIFY_STORE_RECONCILE_BUILDERS !== "false",
          builderConcurrency: Number(process.env.APIFY_STORE_BUILDER_CONCURRENCY ?? 4),
          builderBatchDelayMs: Number(process.env.APIFY_STORE_BUILDER_BATCH_DELAY_MS ?? 150),
          maxBuilders: Number(process.env.APIFY_STORE_MAX_BUILDERS ?? Number.POSITIVE_INFINITY),
        });
        log.info({ result }, "Apify Store search catalog synchronized");
        const dayKey = new Date().toISOString().slice(0, 10);
        await catalogQueue?.add(
          "store-catalog-details-after-search",
          { catalog: "details" },
          { jobId: `store-catalog-details-after-search-${dayKey}` },
        );
        await catalogQueue?.add(
          "website-classification-after-search",
          { catalog: "websites" },
          { jobId: `website-classification-after-search-${dayKey}` },
        );
      } else {
        const result = await syncStoreActorDetails(apify, {
          limit: Number(process.env.APIFY_STORE_DETAIL_BATCH_SIZE ?? 5000),
          concurrency: Number(process.env.APIFY_STORE_DETAIL_CONCURRENCY ?? 4),
          batchDelayMs: Number(process.env.APIFY_STORE_DETAIL_BATCH_DELAY_MS ?? 350),
        });
        log.info({ result }, "Apify Store Actor details synchronized");
      }
      await refreshStoreWatchAlerts().catch((error) =>
        log.error({ error }, "Store watch alerts failed"),
      );
    },
    { connection, concurrency: 1 },
  );

  // Keep audience totals independent of long-running inventory/insight jobs.
  const audienceWorker = new Worker<{ userId: string; businessProfileId: string }>(
    "audience",
    (job) => refreshWorkspaceAudience(job.data),
    { connection, concurrency: 1 },
  );

  const newsletterWorker = new Worker(
    "newsletter",
    async (job) => {
      const { campaignId } = job.data as { campaignId: string };
      await runNewsletterCampaign(campaignId);
    },
    { connection, concurrency: 1 },
  );

  const optimizationWorker = new Worker<OptimizationPayload>("optimization", runOptimizationJob, {
    connection,
    concurrency: Number(process.env.OPTIMIZATION_WORKER_CONCURRENCY ?? 2),
  });

  // Register retry/backoff policies for every queue. BullMQ applies these
  // to all jobs that don't override them. Exponential backoff protects
  // downstream APIs (Apify and AI providers) from thundering-herd retries
  // when there's a transient outage.
  for (const [name, workerInstance] of [
    ["schedules", worker],
    ["snapshots", snapshotWorker],
    ["audience", audienceWorker],
    ["catalog", catalogWorker],
    ["optimization", optimizationWorker],
  ] as const) {
    workerInstance.on("failed", (job, err) => {
      // Surface permanent failures (last attempt) to Sentry with queue context.
      // Transient retries are visible in BullMQ's UI / logs without alert noise.
      const attemptsMade = job?.attemptsMade ?? 0;
      const attemptsMax = job?.opts.attempts ?? 1;
      if (attemptsMade >= attemptsMax) {
        incrementMetric("actorconsole_worker_jobs_failed_total", { queue: name });
        import("@sentry/node")
          .then((Sentry) => {
            Sentry.captureException(err, {
              level: "error",
              tags: {
                queue: name,
                jobId: job?.id,
                jobName: job?.name,
                permanentFailure: "true",
              },
              extra: {
                data: job?.data,
                attemptsMade,
                attemptsMax,
              },
            });
          })
          .catch(() => {
            // Sentry not available — fall through to local log only.
          });
      }
    });
  }

  // Usage-cost sync runs every 6 hours independently of actor snapshots.
  const runUsageSyncAsLeader = async () => {
    if (!(await usageSyncLock.tryAcquire(redis))) return;
    await syncUsageCosts().catch(async (err) => {
      await usageSyncLock.release(redis).catch(() => undefined);
      throw err;
    });
  };
  runUsageSyncAsLeader().catch((err) => log.error({ err }, "Initial usage-cost sync failed"));
  const usageCostTick = setInterval(
    () => {
      runUsageSyncAsLeader().catch((err) => log.error({ err }, "Usage-cost sync failed"));
    },
    6 * 60 * 60 * 1000,
  );

  // Retention tick — runs once a day. First run is immediate on boot so
  // long-running deployments prune any backlog on the next deploy.
  const runRetentionAsLeader = async () => {
    if (!(await retentionLock.tryAcquire(redis))) return;
    try {
      await pruneOldSnapshots();
      const count = await purgeDueUsers();
      if (count > 0) log.info({ count }, "Purged accounts past their deletion grace period");
      const expired = await db.subscription.findMany({
        where: {
          currentPeriodEnd: { lt: new Date() },
          businessProfileId: { not: null },
          OR: [
            { provider: "manual", status: "active" },
            { status: { in: ["cancelled", "completed"] } },
          ],
        },
        select: { id: true, businessProfileId: true },
      });
      for (const subscription of expired) {
        if (!subscription.businessProfileId) continue;
        await db.$transaction([
          db.subscription.update({
            where: { id: subscription.id },
            data: { status: "expired", cancelAtPeriodEnd: true },
          }),
          db.businessProfile.update({
            where: { id: subscription.businessProfileId },
            data: { plan: "FREE" },
          }),
        ]);
      }
      if (expired.length > 0)
        log.info({ count: expired.length }, "Expired manual grants reconciled");
    } catch (err) {
      await retentionLock.release(redis).catch(() => undefined);
      throw err;
    }
  };
  runRetentionAsLeader().catch((err) => log.error({ err }, "Initial retention pass failed"));
  const retentionTick = setInterval(
    () => {
      runRetentionAsLeader().catch((err) => log.error({ err }, "Retention pass failed"));
    },
    24 * 60 * 60 * 1000,
  );

  for (const w of [
    worker,
    snapshotWorker,
    audienceWorker,
    catalogWorker,
    newsletterWorker,
    optimizationWorker,
  ]) {
    w.on("completed", (job) => {
      incrementMetric("actorconsole_worker_jobs_completed_total", { queue: w.name });
      log.info({ jobName: job.name, jobId: job.id }, "Worker job completed");
    });
  }

  log.info(
    { queues: ["schedules", "snapshots", "audience", "catalog", "newsletter", "optimization"] },
    "Worker listening",
  );

  const shutdown = async () => {
    if (tickTimer) clearTimeout(tickTimer);
    clearInterval(usageCostTick);
    clearInterval(retentionTick);
    await Promise.all([
      worker.close(),
      snapshotWorker.close(),
      audienceWorker.close(),
      catalogWorker.close(),
      newsletterWorker.close(),
      optimizationWorker.close(),
      ...queueRegistry.map((q) => q.close()),
    ]);
    await redis.quit();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

start().catch((err) => {
  log.fatal({ err }, "Worker boot failed");
  process.exit(1);
});
