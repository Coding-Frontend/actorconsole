import { db } from "@actorconsole/db";
import { bulkActorStatusJobId } from "@actorconsole/shared";

type QueueWriter = {
  add(name: string, payload: object, options: { jobId: string }): Promise<unknown>;
};

/** QUEUED operation rows are the durable dispatch intent, not an assertion that
 * a timed-out Redis command failed. Reusing the job ID makes recovery safe. */
export async function dispatchPendingActorStatusOperations(queue: QueueWriter) {
  const operations = await db.bulkActorStatusOperation.findMany({
    where: { status: "QUEUED" },
    orderBy: { createdAt: "asc" },
    take: 25,
    select: { id: true, userId: true, businessProfileId: true },
  });
  for (const operation of operations) {
    const jobId = bulkActorStatusJobId(operation.id);
    await queue.add(
      "bulk-actor-status",
      {
        bulkActorStatus: {
          operationId: operation.id,
          userId: operation.userId,
          businessProfileId: operation.businessProfileId,
        },
      },
      { jobId },
    );
    await db.bulkActorStatusOperation.updateMany({
      where: { id: operation.id, status: "QUEUED" },
      data: { jobId, error: null },
    });
  }
  return operations.length;
}

export async function claimActorStatusOperation(
  operation: { id: string; status: string; startedAt: Date | null },
  jobId: string,
) {
  if (!["QUEUED", "RUNNING"].includes(operation.status)) return false;
  const claim = await db.bulkActorStatusOperation.updateMany({
    where: { id: operation.id, OR: [{ status: "QUEUED" }, { status: "RUNNING", jobId }] },
    data: { status: "RUNNING", jobId, startedAt: operation.startedAt ?? new Date(), error: null },
  });
  return claim.count > 0;
}
