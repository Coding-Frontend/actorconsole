ALTER TABLE `Subscription`
  ADD COLUMN `stateVersion` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `checkoutOperationId` VARCHAR(191) NULL;
CREATE TABLE `BillingCheckoutOperation` (
  `id` VARCHAR(191) NOT NULL,
  `businessProfileId` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `provider` VARCHAR(191) NOT NULL,
  `billingMode` VARCHAR(191) NOT NULL,
  `productId` VARCHAR(191) NOT NULL,
  `interval` VARCHAR(191) NOT NULL,
  `status` VARCHAR(191) NOT NULL,
  `providerCheckoutId` VARCHAR(191) NULL,
  `providerSubscriptionId` VARCHAR(191) NULL,
  `checkoutUrl` TEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `BillingCheckoutOperation_businessProfileId_key` (`businessProfileId`),
  PRIMARY KEY (`id`),
  CONSTRAINT `BillingCheckoutOperation_businessProfileId_fkey` FOREIGN KEY (`businessProfileId`) REFERENCES `BusinessProfile` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE `BulkActorStatusOperation`
  ADD COLUMN `idempotencyKey` VARCHAR(191) NULL,
  ADD COLUMN `requestHash` VARCHAR(191) NULL;
CREATE UNIQUE INDEX `BulkActorStatusOperation_businessProfileId_idempotencyKey_key`
  ON `BulkActorStatusOperation` (`businessProfileId`, `idempotencyKey`);
ALTER TABLE `ActorRunSnapshot` ADD COLUMN `resultCountSyncedAt` DATETIME(3) NULL;
