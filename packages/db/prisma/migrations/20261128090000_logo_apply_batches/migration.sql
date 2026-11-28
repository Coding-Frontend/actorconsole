-- Background bulk logo apply batches.
CREATE TABLE `ActorLogoApplyBatch` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `businessProfileId` VARCHAR(191) NOT NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'QUEUED',
  `jobId` VARCHAR(191) NULL,
  `total` INTEGER NOT NULL,
  `succeededCount` INTEGER NOT NULL DEFAULT 0,
  `failedCount` INTEGER NOT NULL DEFAULT 0,
  `stopRequested` BOOLEAN NOT NULL DEFAULT false,
  `error` TEXT NULL,
  `startedAt` DATETIME(3) NULL,
  `completedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `ActorLogoApplyBatch_jobId_key`(`jobId`),
  INDEX `ActorLogoApplyBatch_businessProfileId_status_createdAt_idx`(`businessProfileId`, `status`, `createdAt`),
  INDEX `ActorLogoApplyBatch_status_createdAt_idx`(`status`, `createdAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `ActorLogoApplyBatch`
  ADD CONSTRAINT `ActorLogoApplyBatch_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `ActorLogoApplyBatch_businessProfileId_fkey` FOREIGN KEY (`businessProfileId`) REFERENCES `BusinessProfile`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `ActorLogoRecommendation`
  ADD COLUMN `batchId` VARCHAR(191) NULL,
  ADD INDEX `ActorLogoRecommendation_batchId_status_idx`(`batchId`, `status`),
  ADD CONSTRAINT `ActorLogoRecommendation_batchId_fkey` FOREIGN KEY (`batchId`) REFERENCES `ActorLogoApplyBatch`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- Logo discovery retry backoff and periodic refresh.
ALTER TABLE `WebsiteIdentity`
  ADD COLUMN `logoAttempts` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `logoNextAttemptAt` DATETIME(3) NULL,
  ADD COLUMN `logoCheckedAt` DATETIME(3) NULL,
  ADD INDEX `WebsiteIdentity_status_logoNextAttemptAt_idx`(`status`, `logoNextAttemptAt`);

-- Spread the first refresh of existing logos over their last update times.
UPDATE `WebsiteIdentity` SET `logoCheckedAt` = `updatedAt` WHERE `currentLogoId` IS NOT NULL;
