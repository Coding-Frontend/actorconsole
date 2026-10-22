-- Immutable build commits, credential validation state, durable schedule runs,
-- incremental sync checkpoints, deployment stages, and workspace cost budgets.

ALTER TABLE `ApifyToken`
  ADD COLUMN `apiTokenStatus` VARCHAR(191) NOT NULL DEFAULT 'NOT_CONFIGURED',
  ADD COLUMN `uiTokenStatus` VARCHAR(191) NOT NULL DEFAULT 'NOT_CONFIGURED',
  ADD COLUMN `cookiesStatus` VARCHAR(191) NOT NULL DEFAULT 'NOT_CONFIGURED',
  ADD COLUMN `validatedAt` DATETIME(3) NULL,
  ADD COLUMN `validationError` TEXT NULL;

ALTER TABLE `Actor`
  ADD COLUMN `lastBuildSyncAt` DATETIME(3) NULL,
  ADD COLUMN `lastRunSyncAt` DATETIME(3) NULL,
  ADD COLUMN `sourceSyncError` TEXT NULL;

ALTER TABLE `OnboardingState`
  ADD COLUMN `credentialMode` VARCHAR(191) NOT NULL DEFAULT 'LIMITED';

UPDATE `NotificationChannel`
SET `events` = JSON_ARRAY('schedule', 'deployment', 'usage_budget')
WHERE JSON_CONTAINS(`events`, '"review"');

ALTER TABLE `Deployment`
  ADD COLUMN `stage` VARCHAR(191) NOT NULL DEFAULT 'queued';

ALTER TABLE `ActorBuildSnapshot`
  ADD COLUMN `externalCommitSha` VARCHAR(191) NULL,
  ADD COLUMN `parentCommitSha` VARCHAR(191) NULL,
  ADD COLUMN `sourceState` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
  ADD COLUMN `sourceVerification` VARCHAR(191) NOT NULL DEFAULT 'UNAVAILABLE',
  ADD COLUMN `sourceError` TEXT NULL,
  ADD COLUMN `sourceFileCount` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `sourceSizeBytes` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `sourceCapturedAt` DATETIME(3) NULL,
  ADD COLUMN `diffCache` JSON NULL,
  ADD INDEX `ActorBuildSnapshot_actorId_commitSha_idx` (`actorId`, `commitSha`),
  ADD INDEX `ActorBuildSnapshot_actorId_sourceState_startedAt_idx` (`actorId`, `sourceState`, `startedAt`);

CREATE TABLE `ScheduleRun` (
  `id` VARCHAR(191) NOT NULL,
  `scheduleId` VARCHAR(191) NOT NULL,
  `status` VARCHAR(191) NOT NULL,
  `dryRun` BOOLEAN NOT NULL,
  `input` JSON NULL,
  `artifact` JSON NULL,
  `apifyRunId` VARCHAR(191) NULL,
  `deploymentId` VARCHAR(191) NULL,
  `error` TEXT NULL,
  `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `completedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `ScheduleRun_scheduleId_createdAt_idx` (`scheduleId`, `createdAt`),
  INDEX `ScheduleRun_status_createdAt_idx` (`status`, `createdAt`),
  INDEX `ScheduleRun_apifyRunId_idx` (`apifyRunId`),
  PRIMARY KEY (`id`),
  CONSTRAINT `ScheduleRun_scheduleId_fkey` FOREIGN KEY (`scheduleId`) REFERENCES `Schedule`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `UsageBudget` (
  `id` VARCHAR(191) NOT NULL,
  `businessProfileId` VARCHAR(191) NOT NULL,
  `actorId` VARCHAR(191) NULL,
  `period` VARCHAR(191) NOT NULL DEFAULT 'MONTHLY',
  `limitUsd` DECIMAL(12, 2) NOT NULL,
  `warningPercent` INTEGER NOT NULL DEFAULT 80,
  `enabled` BOOLEAN NOT NULL DEFAULT true,
  `lastAlertPeriod` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `UsageBudget_businessProfileId_actorId_period_key` (`businessProfileId`, `actorId`, `period`),
  INDEX `UsageBudget_businessProfileId_enabled_idx` (`businessProfileId`, `enabled`),
  PRIMARY KEY (`id`),
  CONSTRAINT `UsageBudget_businessProfileId_fkey` FOREIGN KEY (`businessProfileId`) REFERENCES `BusinessProfile`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
