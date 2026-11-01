-- Workspace creation explicitly marks only the first workspace as default.
-- Match the Prisma contract for callers that omit this optional field.
ALTER TABLE `BusinessProfile`
  MODIFY `isDefault` BOOLEAN NOT NULL DEFAULT false;
