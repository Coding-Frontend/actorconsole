import { z } from "zod";

const id = z.string().min(1).max(191);
export const publishingJobSchema = z.union([
  z.object({ bulkPublishScheduleId: id, manualRunAuthorizationId: id.optional() }).strict(),
  z
    .object({
      bulkActorStatus: z.object({ operationId: id, userId: id, businessProfileId: id }).strict(),
    })
    .strict(),
]);
export type PublishingJobPayload = z.infer<typeof publishingJobSchema>;
