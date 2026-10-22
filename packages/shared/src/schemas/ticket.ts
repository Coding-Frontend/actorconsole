import { z } from "zod";

export const ticketStatusSchema = z.enum(["OPEN", "PENDING", "RESPONDED", "RESOLVED", "CLOSED"]);
export type TicketStatus = z.infer<typeof ticketStatusSchema>;

export const ticketPrioritySchema = z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]);
export type TicketPriority = z.infer<typeof ticketPrioritySchema>;

export const ticketCategorySchema = z.enum([
  "BILLING",
  "TECHNICAL",
  "ACCOUNT",
  "FEATURE_REQUEST",
  "OTHER",
]);
export type TicketCategory = z.infer<typeof ticketCategorySchema>;

export const ticketAttachmentSchema = z.object({
  url: z.string().url(),
  name: z.string().min(1).max(255),
  size: z
    .number()
    .int()
    .nonnegative()
    .max(50 * 1024 * 1024),
  type: z.string().max(120).optional(),
});
export type TicketAttachment = z.infer<typeof ticketAttachmentSchema>;

export const createTicketSchema = z.object({
  subject: z.string().min(3).max(200),
  actorId: z.string().min(1).max(191).optional(),
  category: ticketCategorySchema,
  priority: ticketPrioritySchema.optional().default("NORMAL"),
  body: z.string().min(1).max(10_000),
  attachments: z.array(ticketAttachmentSchema).max(10).optional(),
});
export type CreateTicket = z.infer<typeof createTicketSchema>;

export const replyTicketSchema = z.object({
  body: z.string().min(1).max(10_000),
  attachments: z.array(ticketAttachmentSchema).max(10).optional(),
});
export type ReplyTicket = z.infer<typeof replyTicketSchema>;

export const updateTicketStatusSchema = z.object({
  status: ticketStatusSchema,
});
export type UpdateTicketStatus = z.infer<typeof updateTicketStatusSchema>;

export const assignTicketSchema = z.object({
  assignedToId: z.string().nullable(),
});
export type AssignTicket = z.infer<typeof assignTicketSchema>;

export const updateTicketPrioritySchema = z.object({
  priority: ticketPrioritySchema,
});
export type UpdateTicketPriority = z.infer<typeof updateTicketPrioritySchema>;

export const listTicketsQuerySchema = z.object({
  status: ticketStatusSchema.optional(),
  priority: ticketPrioritySchema.optional(),
  category: ticketCategorySchema.optional(),
  assignedToId: z.string().optional(),
  unassigned: z
    .union([z.literal("true"), z.literal("false")])
    .optional()
    .transform((v) => v === "true"),
  q: z.string().max(120).optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(500).optional().default(25),
});
export type ListTicketsQuery = z.infer<typeof listTicketsQuerySchema>;
