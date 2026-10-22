ALTER TABLE `RevenueDaily`
    ADD COLUMN `successfulRuns` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `failedRuns` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `abortedRuns` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `timedOutRuns` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `resultCount` INTEGER NOT NULL DEFAULT 0;

CREATE TABLE `ActorRunSnapshot` (
    `id` VARCHAR(191) NOT NULL,
    `actorId` VARCHAR(191) NOT NULL,
    `apifyRunId` VARCHAR(191) NOT NULL,
    `buildId` VARCHAR(191) NULL,
    `status` VARCHAR(191) NOT NULL,
    `origin` VARCHAR(191) NULL,
    `resultCount` INTEGER NOT NULL DEFAULT 0,
    `usageCostUsd` DECIMAL(12, 4) NULL,
    `startedAt` DATETIME(3) NOT NULL,
    `finishedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    UNIQUE INDEX `ActorRunSnapshot_apifyRunId_key`(`apifyRunId`),
    INDEX `ActorRunSnapshot_actorId_startedAt_idx`(`actorId`, `startedAt`),
    INDEX `ActorRunSnapshot_actorId_status_startedAt_idx`(`actorId`, `status`, `startedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ActorBuildSnapshot` (
    `id` VARCHAR(191) NOT NULL,
    `actorId` VARCHAR(191) NOT NULL,
    `apifyBuildId` VARCHAR(191) NOT NULL,
    `buildNumber` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL,
    `sourceType` VARCHAR(191) NULL,
    `sourceUrl` TEXT NULL,
    `sourceFiles` JSON NULL,
    `sourceHash` VARCHAR(191) NULL,
    `commitSha` VARCHAR(191) NULL,
    `startedAt` DATETIME(3) NOT NULL,
    `finishedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    UNIQUE INDEX `ActorBuildSnapshot_apifyBuildId_key`(`apifyBuildId`),
    INDEX `ActorBuildSnapshot_actorId_startedAt_idx`(`actorId`, `startedAt`),
    INDEX `ActorBuildSnapshot_actorId_status_startedAt_idx`(`actorId`, `status`, `startedAt`),
    INDEX `ActorBuildSnapshot_sourceHash_idx`(`sourceHash`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `ActorRunSnapshot`
    ADD CONSTRAINT `ActorRunSnapshot_actorId_fkey`
    FOREIGN KEY (`actorId`) REFERENCES `Actor`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `ActorBuildSnapshot`
    ADD CONSTRAINT `ActorBuildSnapshot_actorId_fkey`
    FOREIGN KEY (`actorId`) REFERENCES `Actor`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
