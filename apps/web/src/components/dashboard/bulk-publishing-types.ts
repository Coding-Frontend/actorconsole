export type StoreFilter =
  "all" | "published" | "private" | "maintenance" | "deprecated" | "healthy";

export type ReadinessFilter =
  | "all"
  | "ready"
  | "needs-attention"
  | "unknown"
  | "missing-description"
  | "missing-readme"
  | "missing-input-schema"
  | "missing-output-schema"
  | "missing-key-value-store-schema"
  | "missing-tagged-build"
  | "missing-public-profile"
  | "email-not-verified"
  | "disposable-email";

export interface ActorItem {
  id: string;
  apifyActorId: string;
  username: string;
  actorName: string;
  title: string | null;
  currentImageUrl: string | null;
  storeIsPublic: boolean | null;
  storeIsDeprecated: boolean | null;
  storeNotice: string | null;
  storeStatusSyncedAt: string | null;
  publishReady: boolean | null;
  hasDescription: boolean | null;
  hasReadme: boolean | null;
  hasInputSchema: boolean | null;
  hasOutputSchema: boolean | null;
  hasKeyValueSchema: boolean | null;
  hasTaggedBuild?: boolean | null;
  hasPublicProfile?: boolean | null;
  hasVerifiedEmail?: boolean | null;
  hasNonDisposableEmail?: boolean | null;
  readinessSyncedAt: string | null;
}

export function isPrivateActor(
  actor: Pick<ActorItem, "storeIsPublic" | "storeIsDeprecated" | "storeNotice">,
): boolean {
  return actor.storeIsPublic === false;
}

export interface BulkSchedule {
  id: string;
  name: string;
  cronExpr: string;
  dailyLimit: number;
  enabled: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
  quotaBlockedUntil: string | null;
  actors: Array<{
    actorId: string;
    status: string;
    attemptCount?: number;
    lastError?: string | null;
    actor: { id?: string; title: string | null; actorName: string; username: string };
  }>;
  runs: Array<{
    id: string;
    status: string;
    attemptedCount: number;
    publishedCount: number;
    stoppedReason: string | null;
    result: Array<{
      actorId: string;
      status: string;
      code?: string;
      error?: string;
    }> | null;
    startedAt: string;
    completedAt: string | null;
    createdAt: string;
  }>;
}

export function isBulkScheduleActorEligible(status: string): boolean {
  return status === "PENDING" || status === "QUOTA_BLOCKED";
}

export type ActorOperationState = "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED";

export interface ActorOperation {
  jobId: string | null;
  operationId: string | null;
  state: string;
  label: string;
  startedAt: number;
  active: boolean;
  total: number;
  completed: number;
  succeeded: number;
  failed: number;
  error?: string;
  items: Record<
    string,
    { actorId: string; label: string; state: ActorOperationState; error?: string }
  >;
}

export interface BulkStatusOperation {
  id: string;
  action: string;
  status: string;
  jobId: string | null;
  underMaintenance: boolean | null;
  isDeprecated: boolean | null;
  actorCount: number;
  completedCount: number;
  succeededCount: number;
  failedCount: number;
  error: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BulkStatusOperationDetail extends BulkStatusOperation {
  items: Array<{
    id: string;
    actorId: string | null;
    apifyActorId: string;
    label: string;
    position: number;
    status: string;
    error: string | null;
    startedAt: string | null;
    completedAt: string | null;
  }>;
}

export const PUBLISHING_SELECTION_KEY = "actorconsole.bulk-publishing.selection.v1";

export function loadPublishingSelection(): ActorItem[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(PUBLISHING_SELECTION_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function savePublishingSelection(actors: ActorItem[]) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(PUBLISHING_SELECTION_KEY, JSON.stringify(actors));
}
