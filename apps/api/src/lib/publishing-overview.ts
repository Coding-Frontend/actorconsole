import { db } from "@actorconsole/db";
import type { UserSession } from "@actorconsole/shared";
import type { PublishingOverviewPayload } from "@actorconsole/shared/default-dashboard";
import { AppError } from "../middleware/error.js";

export async function loadPublishingOverview(
  session: UserSession,
  requestedPage = 1,
): Promise<PublishingOverviewPayload> {
  if (session.authMethod === "api-key") {
    throw new AppError(
      "interactive_session_required",
      "Use an account session to view All Workspaces",
      403,
    );
  }
  const where = { userId: session.userId, businessProfile: { userId: session.userId } };
  const pageSize = 25;
  const [profiles, inventory, scheduleCounts, queue, totalSchedules, operations] =
    await Promise.all([
      db.businessProfile.findMany({
        where: { userId: session.userId },
        select: { id: true, name: true },
        orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
      }),
      db.actor.groupBy({
        by: ["businessProfileId", "storeIsPublic"],
        where: { ...where, apifyRemovedAt: null },
        _count: { _all: true },
      }),
      db.bulkPublishSchedule.groupBy({
        by: ["businessProfileId", "enabled"],
        where,
        _count: { _all: true },
      }),
      db.bulkPublishScheduleActor.groupBy({
        by: ["scheduleId", "status"],
        where: { schedule: where },
        _count: { _all: true },
      }),
      db.bulkPublishSchedule.count({ where }),
      db.bulkActorStatusOperation.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 20,
        select: {
          id: true,
          businessProfileId: true,
          action: true,
          status: true,
          actorCount: true,
          succeededCount: true,
          failedCount: true,
          createdAt: true,
          businessProfile: { select: { name: true } },
        },
      }),
    ]);
  const page = Math.min(
    Math.max(1, requestedPage),
    Math.max(1, Math.ceil(totalSchedules / pageSize)),
  );
  const schedules = await db.bulkPublishSchedule.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: (page - 1) * pageSize,
    take: pageSize,
    select: {
      id: true,
      name: true,
      businessProfileId: true,
      enabled: true,
      nextRunAt: true,
      quotaBlockedUntil: true,
      businessProfile: { select: { name: true } },
      _count: { select: { actors: true } },
      runs: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { status: true, publishedCount: true, startedAt: true },
      },
    },
  });
  const statusCounts = new Map<string, number>();
  for (const row of queue) {
    // Quota-blocked entries remain retryable but still need attention in the overview.
    const status = row.status === "QUOTA_BLOCKED" ? "BLOCKED" : row.status;
    for (const key of [status, `${row.scheduleId}:${status}`]) {
      statusCounts.set(key, (statusCounts.get(key) ?? 0) + row._count._all);
    }
  }
  const countStatus = (status: string, scheduleId?: string) =>
    statusCounts.get(scheduleId ? `${scheduleId}:${status}` : status) ?? 0;
  const workspaces = profiles.map((profile) => {
    const rows = inventory.filter((row) => row.businessProfileId === profile.id);
    const count = (visibility: boolean | null) =>
      rows.reduce((sum, row) => sum + (row.storeIsPublic === visibility ? row._count._all : 0), 0);
    return {
      ...profile,
      actors: rows.reduce((sum, row) => sum + row._count._all, 0),
      published: count(true),
      private: count(false),
      unknown: count(null),
      schedules: scheduleCounts
        .filter((row) => row.businessProfileId === profile.id)
        .reduce((sum, row) => sum + row._count._all, 0),
    };
  });
  const sum = (key: "actors" | "published" | "private" | "unknown") =>
    workspaces.reduce((total, workspace) => total + workspace[key], 0);
  return {
    summary: {
      actors: sum("actors"),
      published: sum("published"),
      private: sum("private"),
      unknown: sum("unknown"),
      schedules: totalSchedules,
      activeSchedules: scheduleCounts.reduce(
        (total, row) => total + (row.enabled ? row._count._all : 0),
        0,
      ),
      pending: countStatus("PENDING"),
      queuedPublished: countStatus("PUBLISHED"),
      failed: countStatus("FAILED"),
      blocked: countStatus("BLOCKED"),
    },
    workspaces,
    schedules: schedules.map((schedule) => ({
      id: schedule.id,
      name: schedule.name,
      workspaceId: schedule.businessProfileId,
      workspaceName: schedule.businessProfile.name,
      enabled: schedule.enabled,
      nextRunAt: schedule.nextRunAt?.toISOString() ?? null,
      quotaBlockedUntil: schedule.quotaBlockedUntil?.toISOString() ?? null,
      actors: schedule._count.actors,
      pending: countStatus("PENDING", schedule.id),
      published: countStatus("PUBLISHED", schedule.id),
      failed: countStatus("FAILED", schedule.id),
      blocked: countStatus("BLOCKED", schedule.id),
      lastRun: schedule.runs[0]
        ? { ...schedule.runs[0], startedAt: schedule.runs[0].startedAt.toISOString() }
        : null,
    })),
    operations: operations.map((operation) => ({
      id: operation.id,
      workspaceId: operation.businessProfileId,
      workspaceName: operation.businessProfile.name,
      action: operation.action,
      status: operation.status,
      actorCount: operation.actorCount,
      succeededCount: operation.succeededCount,
      failedCount: operation.failedCount,
      createdAt: operation.createdAt.toISOString(),
    })),
    page,
    pageSize,
    totalSchedules,
  };
}
