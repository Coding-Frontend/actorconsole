CREATE TABLE `WorkspaceFinancialCache` (
  `id` VARCHAR(191) NOT NULL,
  `businessProfileId` VARCHAR(191) NOT NULL,
  `payload` JSON NOT NULL,
  `syncedAt` DATETIME(3) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `WorkspaceFinancialCache_businessProfileId_key`(`businessProfileId`),
  INDEX `WorkspaceFinancialCache_syncedAt_idx`(`syncedAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `WorkspaceFinancialCache`
  ADD CONSTRAINT `WorkspaceFinancialCache_businessProfileId_fkey`
  FOREIGN KEY (`businessProfileId`) REFERENCES `BusinessProfile`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;
