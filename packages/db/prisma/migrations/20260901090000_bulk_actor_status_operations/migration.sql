CREATE TABLE `BulkActorStatusOperation` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `businessProfileId` VARCHAR(191) NOT NULL,
  `action` VARCHAR(191) NOT NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'QUEUED',
  `jobId` VARCHAR(191) NULL,
  `underMaintenance` BOOLEAN NULL,
  `isDeprecated` BOOLEAN NULL,
  `actorCount` INTEGER NOT NULL,
  `completedCount` INTEGER NOT NULL DEFAULT 0,
  `succeededCount` INTEGER NOT NULL DEFAULT 0,
  `failedCount` INTEGER NOT NULL DEFAULT 0,
  `error` TEXT NULL,
  `startedAt` DATETIME(3) NULL,
  `completedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `BulkActorStatusOperation_jobId_key`(`jobId`),
  INDEX `BulkActorStatusOperation_userId_businessProfileId_createdAt_idx`(`userId`, `businessProfileId`, `createdAt`),
  INDEX `BulkActorStatusOperation_businessProfileId_status_createdAt_idx`(`businessProfileId`, `status`, `createdAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `BulkActorStatusOperationItem` (
  `id` VARCHAR(191) NOT NULL,
  `operationId` VARCHAR(191) NOT NULL,
  `actorId` VARCHAR(191) NULL,
  `apifyActorId` VARCHAR(191) NOT NULL,
  `label` VARCHAR(191) NOT NULL,
  `position` INTEGER NOT NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'QUEUED',
  `error` TEXT NULL,
  `startedAt` DATETIME(3) NULL,
  `completedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `BulkActorStatusOperationItem_operationId_position_key`(`operationId`, `position`),
  INDEX `BulkActorStatusOperationItem_operationId_status_position_idx`(`operationId`, `status`, `position`),
  INDEX `BulkActorStatusOperationItem_actorId_idx`(`actorId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `BulkActorStatusOperation`
  ADD CONSTRAINT `BulkActorStatusOperation_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `BulkActorStatusOperation_businessProfileId_fkey` FOREIGN KEY (`businessProfileId`) REFERENCES `BusinessProfile`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `BulkActorStatusOperationItem`
  ADD CONSTRAINT `BulkActorStatusOperationItem_operationId_fkey` FOREIGN KEY (`operationId`) REFERENCES `BulkActorStatusOperation`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `BulkActorStatusOperationItem_actorId_fkey` FOREIGN KEY (`actorId`) REFERENCES `Actor`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
