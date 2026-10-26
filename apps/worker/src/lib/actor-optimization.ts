import { UnrecoverableError, type Job } from "bullmq";
import { db, Prisma } from "@actorconsole/db";
import { getUserApifyClient } from "@actorconsole/apify";
import { auditActorListing, AiProviderUnavailableError } from "@actorconsole/ai";
import {
  actorListingStateSchema,
  actorOptimizationFieldSchema,
  type ActorOptimizationField,
  inferActorLanguage,
  extractKeywords,
  incrementMetric,
  scoreActorListing,
  listingImprovement,
} from "@actorconsole/shared";
import { assertWorkspacePlanAccess } from "./plan-access.js";
import { actorOptimizationState, optimizationFingerprint } from "./actor-optimization-state.js";

export type OptimizationPayload = { action: "audit" | "apply"; resultId: string };
interface RetryContext { attemptsMade: number; attemptsMax: number }
function isFinalAttempt(context?: RetryContext): boolean {
  return !context || context.attemptsMade + 1 >= context.attemptsMax;
}

const defaultOptimizationFields: ActorOptimizationField[] = ["title", "description"];

function requestedOptimizationFields(value: unknown) {
  const fields = Array.isArray(value)
    ? value.filter(
        (field): field is ActorOptimizationField =>
          (field === "title" || field === "description" || field === "pricing") &&
          actorOptimizationFieldSchema.safeParse(field).success,
      )
    : [];
  return new Set(fields.length > 0 ? fields : defaultOptimizationFields);
}

async function updateOptimizationRunAfterAudit(runId: string, failed: boolean) {
  const run = await db.actorOptimizationRun.update({
    where: { id: runId },
    data: failed ? { failedCount: { increment: 1 } } : { completedCount: { increment: 1 } },
  });
  if (run.completedCount + run.failedCount < run.totalCount) return;
  await db.actorOptimizationRun.update({
    where: { id: runId },
    data: {
      status: run.completedCount > 0 ? "READY_FOR_APPROVAL" : "FAILED",
      completedAt: new Date(),
    },
  });
}

export async function runOptimizationAudit(resultId: string, retryContext?: RetryContext) {
  const result = await db.actorOptimizationResult.findUnique({
    where: { id: resultId },
    include: { actor: true, run: true },
  });
  if (!result) throw new Error("Actor optimization result no longer exists");
  if (["READY_FOR_APPROVAL", "APPROVED", "APPLIED"].includes(result.status)) return;

  await Promise.all([
    db.actorOptimizationResult.update({
      where: { id: resultId },
      data: { status: "AUDITING", error: null },
    }),
    db.actorOptimizationRun.updateMany({
      where: { id: result.runId, status: "QUEUED" },
      data: { status: "RUNNING", startedAt: new Date() },
    }),
  ]);

  try {
    await assertWorkspacePlanAccess(result.run.userId, result.run.businessProfileId);
    const apify = await getUserApifyClient(result.run.userId, result.run.businessProfileId);
    if (!apify) throw new Error("No Apify token is available for this workspace");
    const [liveActor, basicInfo] = await Promise.all([
      apify.getActor(result.actor.apifyActorId),
      apify.getActorBasicInfo(result.actor.apifyActorId),
    ]);
    if (!liveActor) throw new Error("The selected Actor no longer exists on Apify");
    const current = actorOptimizationState(liveActor, basicInfo);
    const { title, description, readme } = current;
    const language = inferActorLanguage({ title, description, readme });
    const keywords = extractKeywords({ title, description, max: 10 });
    const generated = await auditActorListing({ current, language, keywords });
    const aiProposal = actorListingStateSchema
      .pick({ title: true, description: true, pricing: true })
      .parse(generated.proposal);
    const requestedFields = requestedOptimizationFields(result.run.requestedFields);
    const focusedRun = result.run.kind !== "GENERATE_IMPROVEMENTS";
    const currentBreakdown = scoreActorListing(current);
    const aiBreakdown = scoreActorListing(aiProposal);
    const proposal = {
      title: requestedFields.has("title")
        ? focusedRun || aiBreakdown.title >= currentBreakdown.title
          ? aiProposal.title
          : current.title
        : current.title,
      description:
        requestedFields.has("description") &&
        (focusedRun || aiBreakdown.description >= currentBreakdown.description)
          ? aiProposal.description
          : current.description,
      // Categories are assigned by Apify. Preserve the synchronized value in
      // the snapshot for comparison, but never generate or apply it.
      categories: [...current.categories],
      readme: current.readme,
      inputSchema: current.inputSchema,
      outputSchema: current.outputSchema,
      keyValueStoreSchema: current.keyValueStoreSchema,
      pricing: requestedFields.has("pricing")
        ? (aiProposal.pricing ?? current.pricing)
        : current.pricing,
    };
    const proposedBreakdown = scoreActorListing(proposal);
    const improvement = listingImprovement(currentBreakdown.total, proposedBreakdown.total);
    const fingerprint = optimizationFingerprint(current);

    await db.actorOptimizationResult.update({
      where: { id: resultId },
      data: {
        status: "READY_FOR_APPROVAL",
        metadataFingerprint: fingerprint,
        currentState: current as Prisma.InputJsonValue,
        proposedState: proposal as Prisma.InputJsonValue,
        issues: { items: generated.issues, summary: generated.summary } as Prisma.InputJsonValue,
        currentBreakdown: currentBreakdown as Prisma.InputJsonValue,
        proposedBreakdown: proposedBreakdown as Prisma.InputJsonValue,
        currentScore: currentBreakdown.total,
        proposedScore: proposedBreakdown.total,
        improvementPoints: improvement.points,
        improvementPercent: improvement.percent,
        approvedFields: Prisma.JsonNull,
        approvedAt: null,
        appliedAt: null,
        error: null,
      },
    });
    await updateOptimizationRunAfterAudit(result.runId, false);
    incrementMetric("actorconsole_actor_optimization_total", {
      action: "audit",
      status: "success",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const unrecoverableProviderFailure =
      (error instanceof AiProviderUnavailableError && !error.retryable) ||
      error instanceof UnrecoverableError;
    if (unrecoverableProviderFailure || isFinalAttempt(retryContext)) {
      await db.actorOptimizationResult.update({
        where: { id: resultId },
        data: { status: "FAILED", error: message.slice(0, 8_000) },
      });
      await updateOptimizationRunAfterAudit(result.runId, true);
      incrementMetric("actorconsole_actor_optimization_total", {
        action: "audit",
        status: "failed",
      });
    } else {
      await db.actorOptimizationResult.update({
        where: { id: resultId },
        data: { status: "QUEUED", error: `Retry pending: ${message}`.slice(0, 8_000) },
      });
    }
    if (unrecoverableProviderFailure) throw new UnrecoverableError(message);
    throw error;
  }
}

async function finishOptimizationApplication(runId: string, applied: boolean) {
  if (applied) {
    await db.actorOptimizationRun.update({
      where: { id: runId },
      data: { appliedCount: { increment: 1 } },
    });
  }
  const [approved, terminal] = await Promise.all([
    db.actorOptimizationResult.count({ where: { runId, approvedAt: { not: null } } }),
    db.actorOptimizationResult.count({
      where: {
        runId,
        approvedAt: { not: null },
        status: { in: ["APPLIED", "APPLY_FAILED", "STALE"] },
      },
    }),
  ]);
  if (approved === 0 || terminal < approved) return;
  const failed = await db.actorOptimizationResult.count({
    where: { runId, status: { in: ["APPLY_FAILED", "STALE"] } },
  });
  await db.actorOptimizationRun.update({
    where: { id: runId },
    data: { status: failed > 0 ? "PARTIALLY_APPLIED" : "APPLIED", appliedAt: new Date() },
  });
}

export async function runOptimizationApply(resultId: string, retryContext?: RetryContext) {
  const result = await db.actorOptimizationResult.findUnique({
    where: { id: resultId },
    include: { actor: true, run: true },
  });
  if (!result) throw new Error("Actor optimization result no longer exists");
  if (result.status === "APPLIED") return;
  if (result.status !== "APPROVED" && result.status !== "APPLYING") {
    throw new Error("This Actor proposal has not been approved");
  }
  const proposed = actorListingStateSchema.parse(result.proposedState);
  const rawApprovedFields = Array.isArray(result.approvedFields) ? result.approvedFields : [];
  const approvedFields = new Set(
    rawApprovedFields.filter(
      (field) => actorOptimizationFieldSchema.safeParse(field).success,
    ) as ActorOptimizationField[],
  );
  await db.actorOptimizationResult.update({
    where: { id: resultId },
    data: { status: "APPLYING", error: null },
  });

  try {
    if (
      rawApprovedFields.some((field) =>
        ["readme", "inputSchema", "outputSchema", "keyValueStoreSchema"].includes(String(field)),
      )
    ) {
      throw new Error("Source-file changes are no longer supported");
    }
    if (approvedFields.size === 0) throw new Error("No Actor fields were approved");
    await assertWorkspacePlanAccess(result.run.userId, result.run.businessProfileId);
    const apify = await getUserApifyClient(result.run.userId, result.run.businessProfileId);
    if (!apify) throw new Error("No Apify token is available for this workspace");
    const [liveActor, basicInfo] = await Promise.all([
      apify.getActor(result.actor.apifyActorId),
      apify.getActorBasicInfo(result.actor.apifyActorId),
    ]);
    if (!liveActor) throw new Error("The selected Actor no longer exists on Apify");
    const currentFingerprint = optimizationFingerprint(actorOptimizationState(liveActor, basicInfo));
    if (currentFingerprint !== result.metadataFingerprint) {
      await db.actorOptimizationResult.update({
        where: { id: resultId },
        data: {
          status: "STALE",
          error:
            "The Actor changed after this proposal was generated. Recheck it before approving again.",
        },
      });
      await finishOptimizationApplication(result.runId, false);
      return;
    }
    if (approvedFields.has("title") || approvedFields.has("description")) {
      await apify.updateActorMetadata(result.actor.apifyActorId, {
        ...(approvedFields.has("title") ? { title: proposed.title } : {}),
        ...(approvedFields.has("description") ? { description: proposed.description } : {}),
      });
    }
    let pricingStartedAt: string | null = null;
    let pricingChanged = false;
    if (approvedFields.has("pricing")) {
      const pricing = proposed.pricing;
      if (!pricing || Object.keys(pricing.events).length === 0) {
        throw new Error("The AI proposal did not produce pay-per-event pricing to approve");
      }
      const pricingUpdate = await apify.appendActorPricing(result.actor.apifyActorId, {
        pricingModel: "PAY_PER_EVENT",
        minimalMaxTotalChargeUsd: 0.5,
        isPPEPlatformUsagePaidByUser: true,
        isPriceChangeNotificationSuppressed: false,
        apifyMarginPercentage: 0.2,
        reasonForChange: "Approved ActorConsole optimization proposal",
        pricingPerEvent: { actorChargeEvents: pricing.events },
      });
      pricingStartedAt = pricingUpdate.startedAt ?? null;
      pricingChanged = pricingUpdate.changed;
    }
    await db.$transaction([
      db.actor.update({
        where: { id: result.actorId },
        data: {
          ...(approvedFields.has("title") ? { title: proposed.title } : {}),
          ...(approvedFields.has("description")
            ? { description: proposed.description, hasDescription: true }
            : {}),
          ...(approvedFields.has("pricing") && proposed.pricing
            ? {
                currentPricing: {
                  ...proposed.pricing,
                  ...(pricingStartedAt ? { startedAt: pricingStartedAt } : {}),
                } as Prisma.InputJsonValue,
              }
            : {}),
          readinessSyncedAt: new Date(),
          currentCopy: {
            approvedOptimizationResultId: result.id,
            fields: [...approvedFields],
          } as Prisma.InputJsonValue,
        },
      }),
      ...(approvedFields.has("pricing") && proposed.pricing && pricingChanged
        ? [
            db.pricingHistory.create({
              data: {
                actorId: result.actorId,
                model: "PAY_PER_EVENT",
                amount: null,
                currency: "USD",
                payload: {
                  ...proposed.pricing,
                  ...(pricingStartedAt ? { startedAt: pricingStartedAt } : {}),
                } as Prisma.InputJsonValue,
                changedBy: "user",
                reason: "Approved ActorConsole optimization proposal",
              },
            }),
          ]
        : []),
    ]);
    await db.actorOptimizationResult.update({
      where: { id: resultId },
      data: { status: "APPLIED", appliedAt: new Date(), error: null },
    });
    await db.auditLog.create({
      data: {
        actorId: result.run.userId,
        action: "actor.optimization.applied",
        resource: `actor:${result.actor.apifyActorId}`,
        after: {
          optimizationResultId: result.id,
          fields: [...approvedFields],
        } as Prisma.InputJsonValue,
        source: "worker",
      },
    });
    await finishOptimizationApplication(result.runId, true);
    incrementMetric("actorconsole_actor_optimization_total", {
      action: "apply",
      status: "success",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (error instanceof UnrecoverableError || isFinalAttempt(retryContext)) {
      await db.actorOptimizationResult.update({
        where: { id: resultId },
        data: { status: "APPLY_FAILED", error: message.slice(0, 8_000) },
      });
      await finishOptimizationApplication(result.runId, false);
      incrementMetric("actorconsole_actor_optimization_total", {
        action: "apply",
        status: "failed",
      });
    } else {
      await db.actorOptimizationResult.update({
        where: { id: resultId },
        data: { status: "APPROVED", error: `Retry pending: ${message}`.slice(0, 8_000) },
      });
    }
    throw error;
  }
}

export async function runOptimizationJob(job: Job<OptimizationPayload>) {
  const retryContext = { attemptsMade: job.attemptsMade, attemptsMax: job.opts.attempts ?? 1 };
  if (job.data.action === "audit") return runOptimizationAudit(job.data.resultId, retryContext);
  return runOptimizationApply(job.data.resultId, retryContext);
}
