import { z } from "zod";

export const policySlugSchema = z.enum(["TERMS", "PRIVACY", "COOKIES", "REFUND", "AUP", "DPA"]);
export type PolicySlug = z.infer<typeof policySlugSchema>;

export const policyStatusSchema = z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]);
export type PolicyStatus = z.infer<typeof policyStatusSchema>;

export const createPolicyDraftSchema = z.object({
  title: z.string().min(2).max(200),
  body: z.string().min(1).max(200_000),
  version: z.string().regex(/^\d+\.\d+\.\d+$/, "Use semver, e.g. 1.2.3"),
});
export type CreatePolicyDraft = z.infer<typeof createPolicyDraftSchema>;

export const updatePolicyDraftSchema = createPolicyDraftSchema.partial();
export type UpdatePolicyDraft = z.infer<typeof updatePolicyDraftSchema>;

export const acceptPolicySchema = z.object({
  version: z.string().min(1).max(50),
});
export type AcceptPolicy = z.infer<typeof acceptPolicySchema>;
