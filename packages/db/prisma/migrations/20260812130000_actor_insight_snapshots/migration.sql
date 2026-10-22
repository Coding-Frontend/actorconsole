ALTER TABLE `Actor`
  ADD COLUMN `lastInsightSyncAt` DATETIME(3) NULL,
  ADD COLUMN `insightSyncStatus` VARCHAR(191) NULL,
  ADD COLUMN `insightSyncError` TEXT NULL;

CREATE TABLE `ActorInsightSnapshot` (
  `id` VARCHAR(191) NOT NULL,
  `actorId` VARCHAR(191) NOT NULL,
  `capturedOn` DATETIME(3) NOT NULL,
  `capturedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `periodStart` DATETIME(3) NOT NULL,
  `syncStatus` VARCHAR(191) NOT NULL DEFAULT 'COMPLETE',
  `totalRuns` INTEGER NULL, `succeededRuns` INTEGER NULL, `failedRuns` INTEGER NULL,
  `abortedRuns` INTEGER NULL, `timedOutRuns` INTEGER NULL, `resultCount` INTEGER NULL,
  `successRate` DOUBLE NULL, `activeUsers` INTEGER NULL, `totalUsers` INTEGER NULL,
  `uniqueStoreViewers` INTEGER NULL, `consolePageViews` INTEGER NULL, `usersWithRun` INTEGER NULL,
  `costUsd` DOUBLE NULL, `revenueUsd` DOUBLE NULL, `profitUsd` DOUBLE NULL, `profitMargin` DOUBLE NULL,
  `qualityScore` DOUBLE NULL, `qualityPercentile` DOUBLE NULL,
  `runStatistics` JSON NULL, `userStatistics` JSON NULL, `acquisition` JSON NULL,
  `monetization` JSON NULL, `quality` JSON NULL, `errors` JSON NULL,
  UNIQUE INDEX `ActorInsightSnapshot_actorId_capturedOn_key`(`actorId`, `capturedOn`),
  INDEX `ActorInsightSnapshot_actorId_periodStart_capturedOn_idx`(`actorId`, `periodStart`, `capturedOn`),
  INDEX `ActorInsightSnapshot_syncStatus_capturedAt_idx`(`syncStatus`, `capturedAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `ActorInsightSnapshot`
  ADD CONSTRAINT `ActorInsightSnapshot_actorId_fkey` FOREIGN KEY (`actorId`) REFERENCES `Actor`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
