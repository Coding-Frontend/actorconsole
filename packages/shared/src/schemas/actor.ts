import { z } from "zod";

export const apifyActorIdSchema = z.string().min(1);

export const actorSummarySchema = z.object({
  id: z.string(),
  apifyActorId: apifyActorIdSchema,
  username: z.string(),
  actorName: z.string(),
  title: z.string().nullable(),
  description: z.string().nullable(),
  imageUrl: z.string().url().nullable(),
  totalRuns: z.number().int().nullable(),
  usersTotal: z.number().int().nullable(),
  rating: z.number().min(0).max(5).nullable(),
  isPublic: z.boolean(),
  categories: z.array(z.string()),
});

export const actorLanguageSchema = z.enum(["javascript", "typescript", "python", "other"]);

export const updateActorCopySchema = z.object({
  apifyActorId: apifyActorIdSchema,
  title: z.string().min(1).max(100).optional(),
  description: z.string().min(1).max(500).optional(),
  seoTitle: z.string().min(1).max(60).optional(),
  seoDescription: z.string().min(1).max(160).optional(),
  readme: z.string().max(50_000).optional(),
});

export type UpdateActorCopy = z.infer<typeof updateActorCopySchema>;
