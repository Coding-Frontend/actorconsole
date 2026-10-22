ALTER TABLE `Actor`
  ADD COLUMN `publishReady` BOOLEAN NULL,
  ADD COLUMN `hasDescription` BOOLEAN NULL,
  ADD COLUMN `hasCategories` BOOLEAN NULL,
  ADD COLUMN `hasReadme` BOOLEAN NULL,
  ADD COLUMN `hasInputSchema` BOOLEAN NULL,
  ADD COLUMN `hasOutputSchema` BOOLEAN NULL,
  ADD COLUMN `hasKeyValueSchema` BOOLEAN NULL,
  ADD COLUMN `readinessSyncedAt` DATETIME(3) NULL;

CREATE INDEX `Actor_businessProfileId_publishReady_idx`
  ON `Actor`(`businessProfileId`, `publishReady`);
CREATE INDEX `Actor_businessProfileId_hasDescription_idx`
  ON `Actor`(`businessProfileId`, `hasDescription`);
CREATE INDEX `Actor_businessProfileId_hasCategories_idx`
  ON `Actor`(`businessProfileId`, `hasCategories`);
CREATE INDEX `Actor_businessProfileId_hasReadme_idx`
  ON `Actor`(`businessProfileId`, `hasReadme`);
CREATE INDEX `Actor_businessProfileId_hasInputSchema_idx`
  ON `Actor`(`businessProfileId`, `hasInputSchema`);
CREATE INDEX `Actor_businessProfileId_hasOutputSchema_idx`
  ON `Actor`(`businessProfileId`, `hasOutputSchema`);
CREATE INDEX `Actor_businessProfileId_hasKeyValueSchema_idx`
  ON `Actor`(`businessProfileId`, `hasKeyValueSchema`);
