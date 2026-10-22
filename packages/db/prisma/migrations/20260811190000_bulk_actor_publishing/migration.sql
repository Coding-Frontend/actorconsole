ALTER TABLE `Actor`
  ADD COLUMN `storeIsPublic` BOOLEAN NULL,
  ADD COLUMN `storeIsDeprecated` BOOLEAN NULL,
  ADD COLUMN `storeNotice` VARCHAR(191) NULL,
  ADD COLUMN `storeStatusSyncedAt` DATETIME(3) NULL;

CREATE TABLE `BulkPublishSchedule` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `businessProfileId` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `cronExpr` VARCHAR(191) NOT NULL,
  `dailyLimit` INTEGER NOT NULL DEFAULT 5,
  `enabled` BOOLEAN NOT NULL DEFAULT true,
  `lastRunAt` DATETIME(3) NULL,
  `nextRunAt` DATETIME(3) NULL,
  `quotaBlockedUntil` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  INDEX `BulkPublishSchedule_userId_businessProfileId_idx`(`userId`, `businessProfileId`),
  INDEX `BulkPublishSchedule_enabled_nextRunAt_idx`(`enabled`, `nextRunAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `BulkPublishScheduleActor` (
  `scheduleId` VARCHAR(191) NOT NULL,
  `actorId` VARCHAR(191) NOT NULL,
  `position` INTEGER NOT NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
  `attemptCount` INTEGER NOT NULL DEFAULT 0,
  `lastAttemptAt` DATETIME(3) NULL,
  `lastPublishedAt` DATETIME(3) NULL,
  `lastError` TEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `BulkPublishScheduleActor_scheduleId_position_key`(`scheduleId`, `position`),
  INDEX `BulkPublishScheduleActor_scheduleId_status_position_idx`(`scheduleId`, `status`, `position`),
  INDEX `BulkPublishScheduleActor_actorId_idx`(`actorId`),
  PRIMARY KEY (`scheduleId`, `actorId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `BulkPublishScheduleRun` (
  `id` VARCHAR(191) NOT NULL,
  `scheduleId` VARCHAR(191) NOT NULL,
  `status` VARCHAR(191) NOT NULL,
  `attemptedCount` INTEGER NOT NULL DEFAULT 0,
  `publishedCount` INTEGER NOT NULL DEFAULT 0,
  `stoppedReason` VARCHAR(191) NULL,
  `result` JSON NULL,
  `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `completedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `BulkPublishScheduleRun_scheduleId_createdAt_idx`(`scheduleId`, `createdAt`),
  INDEX `BulkPublishScheduleRun_status_createdAt_idx`(`status`, `createdAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `BulkPublishSchedule`
  ADD CONSTRAINT `BulkPublishSchedule_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `BulkPublishSchedule_businessProfileId_fkey` FOREIGN KEY (`businessProfileId`) REFERENCES `BusinessProfile`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `BulkPublishScheduleActor`
  ADD CONSTRAINT `BulkPublishScheduleActor_scheduleId_fkey` FOREIGN KEY (`scheduleId`) REFERENCES `BulkPublishSchedule`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `BulkPublishScheduleActor_actorId_fkey` FOREIGN KEY (`actorId`) REFERENCES `Actor`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `BulkPublishScheduleRun`
  ADD CONSTRAINT `BulkPublishScheduleRun_scheduleId_fkey` FOREIGN KEY (`scheduleId`) REFERENCES `BulkPublishSchedule`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
