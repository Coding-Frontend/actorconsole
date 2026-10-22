import type { ApifyClientWrapper, ApifyRun } from "@actorconsole/apify";
import { classifyPublishingFailure } from "@actorconsole/shared";

export const BULK_PUBLISH_ELIGIBLE_ACTOR_STATUSES = ["PENDING", "QUOTA_BLOCKED"] as const;

type ActorRunClient = Pick<ApifyClientWrapper, "listActorRuns" | "startActorRun" | "waitForRun">;

const IN_PROGRESS_RUN_STATUSES = new Set(["READY", "RUNNING", "STARTING", "STOPPING", "ABORTING"]);

function isSuccessfulRun(run: ApifyRun): boolean {
  return run.status.trim().toUpperCase() === "SUCCEEDED";
}

/**
 * Apify Store publication requires the Actor to have a successful run. Reuse
 * an existing successful run, wait for one already in progress, or create a
 * validation run before the caller performs the publication write.
 */
export async function ensureSuccessfulActorRun(
  apify: ActorRunClient,
  actorId: string,
  input: Record<string, unknown> = {},
  waitSecs = 900,
): Promise<{ run: ApifyRun; started: boolean }> {
  const [latestRun] = await apify.listActorRuns(actorId, { limit: 1, desc: true });
  if (latestRun && isSuccessfulRun(latestRun)) {
    return { run: latestRun, started: false };
  }

  if (latestRun && IN_PROGRESS_RUN_STATUSES.has(latestRun.status.trim().toUpperCase())) {
    const finishedExistingRun = await apify.waitForRun(latestRun.id, waitSecs);
    if (isSuccessfulRun(finishedExistingRun)) {
      return { run: finishedExistingRun, started: false };
    }
  }

  const startedRun = await apify.startActorRun(actorId, input);
  const finishedRun = await apify.waitForRun(startedRun.id, waitSecs);
  if (!isSuccessfulRun(finishedRun)) {
    throw new Error(
      `Actor validation run ${finishedRun.id} finished with status ${finishedRun.status || "UNKNOWN"}; the Actor must complete a successful run before publishing.`,
    );
  }
  return { run: finishedRun, started: true };
}

export function resolveBulkPublishingFailure(error: unknown, quotaExceeded: boolean) {
  const failure = classifyPublishingFailure(error);
  if (quotaExceeded) {
    return {
      actorStatus: "QUOTA_BLOCKED" as const,
      resultStatus: "QUOTA_BLOCKED" as const,
      code: "APIFY_DAILY_PUBLICATION_LIMIT",
      retryable: true,
    };
  }
  if (!failure.retryable) {
    return {
      actorStatus: "BLOCKED" as const,
      resultStatus: "BLOCKED" as const,
      code: failure.code,
      retryable: false,
    };
  }
  return {
    actorStatus: "FAILED" as const,
    resultStatus: "FAILED" as const,
    code: failure.code,
    retryable: true,
  };
}
