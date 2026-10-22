-- New accounts must explicitly create a workspace before operational data is
-- available. Apify credentials are optional during onboarding, so API and
-- Console credentials can be stored independently for each workspace.

ALTER TABLE `ApifyToken`
  MODIFY `apifyUserId` VARCHAR(191) NULL,
  MODIFY `encryptedToken` TEXT NULL;

ALTER TABLE `OnboardingState`
  ADD COLUMN `credentialsStepCompletedAt` DATETIME(3) NULL,
  ADD COLUMN `planStepCompletedAt` DATETIME(3) NULL;

-- Preserve completed onboarding for existing workspaces while moving to the
-- explicit three-step flow.
UPDATE `OnboardingState`
SET
  `credentialsStepCompletedAt` = COALESCE(`credentialsStepCompletedAt`, `completedAt`),
  `planStepCompletedAt` = COALESCE(`planStepCompletedAt`, `completedAt`)
WHERE `completedAt` IS NOT NULL;
