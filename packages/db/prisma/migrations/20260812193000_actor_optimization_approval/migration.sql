CREATE TABLE `ActorOptimizationRun` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `businessProfileId` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'QUEUED',
    `totalCount` INTEGER NOT NULL,
    `completedCount` INTEGER NOT NULL DEFAULT 0,
    `failedCount` INTEGER NOT NULL DEFAULT 0,
    `appliedCount` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `startedAt` DATETIME(3) NULL,
    `completedAt` DATETIME(3) NULL,
    `approvedAt` DATETIME(3) NULL,
    `appliedAt` DATETIME(3) NULL,

    INDEX `ActorOptimizationRun_businessProfileId_createdAt_idx`(`businessProfileId`, `createdAt`),
    INDEX `ActorOptimizationRun_userId_status_createdAt_idx`(`userId`, `status`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ActorOptimizationResult` (
    `id` VARCHAR(191) NOT NULL,
    `runId` VARCHAR(191) NOT NULL,
    `actorId` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'QUEUED',
    `sourceFingerprint` VARCHAR(191) NULL,
    `currentState` JSON NULL,
    `proposedState` JSON NULL,
    `issues` JSON NULL,
    `currentBreakdown` JSON NULL,
    `proposedBreakdown` JSON NULL,
    `currentScore` INTEGER NULL,
    `proposedScore` INTEGER NULL,
    `improvementPoints` INTEGER NULL,
    `improvementPercent` DOUBLE NULL,
    `approvedFields` JSON NULL,
    `approvedAt` DATETIME(3) NULL,
    `appliedAt` DATETIME(3) NULL,
    `error` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ActorOptimizationResult_runId_actorId_key`(`runId`, `actorId`),
    INDEX `ActorOptimizationResult_runId_status_idx`(`runId`, `status`),
    INDEX `ActorOptimizationResult_actorId_createdAt_idx`(`actorId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `ActorOptimizationRun`
    ADD CONSTRAINT `ActorOptimizationRun_userId_fkey`
    FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT `ActorOptimizationRun_businessProfileId_fkey`
    FOREIGN KEY (`businessProfileId`) REFERENCES `BusinessProfile`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `ActorOptimizationResult`
    ADD CONSTRAINT `ActorOptimizationResult_runId_fkey`
    FOREIGN KEY (`runId`) REFERENCES `ActorOptimizationRun`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT `ActorOptimizationResult_actorId_fkey`
    FOREIGN KEY (`actorId`) REFERENCES `Actor`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
