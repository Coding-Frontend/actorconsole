-- CreateTable
CREATE TABLE `StoreWatch` (
    `id` VARCHAR(191) NOT NULL,
    `businessProfileId` VARCHAR(191) NOT NULL,
    `storeActorId` VARCHAR(191) NOT NULL,
    `baseline` JSON NOT NULL,
    `alertsEnabled` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `checkedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `StoreWatch_businessProfileId_storeActorId_key`(`businessProfileId`, `storeActorId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ActorIntelligenceKey` (
    `id` VARCHAR(191) NOT NULL,
    `actorId` VARCHAR(191) NOT NULL,
    `keyHash` VARCHAR(191) NOT NULL,
    `prefix` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `lastUsedAt` DATETIME(3) NULL,

    UNIQUE INDEX `ActorIntelligenceKey_actorId_key`(`actorId`),
    UNIQUE INDEX `ActorIntelligenceKey_keyHash_key`(`keyHash`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ActorIssue` (
    `id` VARCHAR(191) NOT NULL,
    `actorId` VARCHAR(191) NOT NULL,
    `fingerprint` VARCHAR(64) NOT NULL,
    `name` VARCHAR(200) NOT NULL,
    `message` TEXT NOT NULL,
    `stack` TEXT NULL,
    `context` JSON NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'OPEN',
    `severity` VARCHAR(191) NOT NULL DEFAULT 'error',
    `eventCount` INTEGER NOT NULL DEFAULT 1,
    `firstSeenAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `lastSeenAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ActorIssue_actorId_status_lastSeenAt_idx`(`actorId`, `status`, `lastSeenAt`),
    UNIQUE INDEX `ActorIssue_actorId_fingerprint_key`(`actorId`, `fingerprint`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ActorErrorEvent` (
    `id` VARCHAR(191) NOT NULL,
    `issueId` VARCHAR(191) NOT NULL,
    `eventId` VARCHAR(100) NOT NULL,
    `runId` VARCHAR(100) NULL,
    `context` JSON NULL,
    `occurredAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ActorErrorEvent_occurredAt_idx`(`occurredAt`),
    UNIQUE INDEX `ActorErrorEvent_issueId_eventId_key`(`issueId`, `eventId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ActorExternalCost` (
    `id` VARCHAR(191) NOT NULL,
    `actorId` VARCHAR(191) NOT NULL,
    `eventId` VARCHAR(100) NOT NULL,
    `runId` VARCHAR(100) NULL,
    `source` VARCHAR(100) NOT NULL,
    `amountUsd` DECIMAL(14, 6) NOT NULL,
    `incurredAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ActorExternalCost_actorId_incurredAt_idx`(`actorId`, `incurredAt`),
    UNIQUE INDEX `ActorExternalCost_actorId_eventId_key`(`actorId`, `eventId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ActorTelemetryRun` (
    `id` VARCHAR(191) NOT NULL,
    `actorId` VARCHAR(191) NOT NULL,
    `runId` VARCHAR(100) NOT NULL,
    `customerHash` VARCHAR(64) NULL,
    `paid` BOOLEAN NOT NULL DEFAULT false,
    `status` VARCHAR(30) NOT NULL,
    `memoryAllocatedMb` INTEGER NULL,
    `memoryPeakMb` DOUBLE NULL,
    `durationSeconds` DOUBLE NULL,
    `reportedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ActorTelemetryRun_actorId_reportedAt_idx`(`actorId`, `reportedAt`),
    UNIQUE INDEX `ActorTelemetryRun_actorId_runId_key`(`actorId`, `runId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ActorRunRule` (
    `id` VARCHAR(191) NOT NULL,
    `actorId` VARCHAR(191) NOT NULL,
    `settings` JSON NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ActorRunRule_actorId_key`(`actorId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ActorGateUser` (
    `id` VARCHAR(191) NOT NULL,
    `actorId` VARCHAR(191) NOT NULL,
    `customerHash` VARCHAR(64) NOT NULL,
    `totalRuns` INTEGER NOT NULL DEFAULT 0,
    `firstSeenAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `lastAdmittedAt` DATETIME(3) NULL,

    UNIQUE INDEX `ActorGateUser_actorId_customerHash_key`(`actorId`, `customerHash`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ActorGateAdmission` (
    `id` VARCHAR(191) NOT NULL,
    `actorId` VARCHAR(191) NOT NULL,
    `runId` VARCHAR(100) NOT NULL,
    `customerHash` VARCHAR(64) NOT NULL,
    `admitted` BOOLEAN NOT NULL,
    `paid` BOOLEAN NOT NULL DEFAULT false,
    `reason` VARCHAR(100) NOT NULL,
    `retryAfterSeconds` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ActorGateAdmission_actorId_customerHash_admitted_createdAt_idx`(`actorId`, `customerHash`, `admitted`, `createdAt`),
    UNIQUE INDEX `ActorGateAdmission_actorId_runId_key`(`actorId`, `runId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `StoreWatch` ADD CONSTRAINT `StoreWatch_businessProfileId_fkey` FOREIGN KEY (`businessProfileId`) REFERENCES `BusinessProfile`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StoreWatch` ADD CONSTRAINT `StoreWatch_storeActorId_fkey` FOREIGN KEY (`storeActorId`) REFERENCES `StoreActor`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ActorIntelligenceKey` ADD CONSTRAINT `ActorIntelligenceKey_actorId_fkey` FOREIGN KEY (`actorId`) REFERENCES `Actor`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ActorIssue` ADD CONSTRAINT `ActorIssue_actorId_fkey` FOREIGN KEY (`actorId`) REFERENCES `Actor`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ActorErrorEvent` ADD CONSTRAINT `ActorErrorEvent_issueId_fkey` FOREIGN KEY (`issueId`) REFERENCES `ActorIssue`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ActorExternalCost` ADD CONSTRAINT `ActorExternalCost_actorId_fkey` FOREIGN KEY (`actorId`) REFERENCES `Actor`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ActorTelemetryRun` ADD CONSTRAINT `ActorTelemetryRun_actorId_fkey` FOREIGN KEY (`actorId`) REFERENCES `Actor`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ActorRunRule` ADD CONSTRAINT `ActorRunRule_actorId_fkey` FOREIGN KEY (`actorId`) REFERENCES `Actor`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ActorGateUser` ADD CONSTRAINT `ActorGateUser_actorId_fkey` FOREIGN KEY (`actorId`) REFERENCES `Actor`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ActorGateAdmission` ADD CONSTRAINT `ActorGateAdmission_actorId_fkey` FOREIGN KEY (`actorId`) REFERENCES `Actor`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
