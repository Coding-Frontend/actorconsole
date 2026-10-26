-- DropForeignKey
ALTER TABLE `BillingCheckoutOperation` DROP FOREIGN KEY `BillingCheckoutOperation_businessProfileId_fkey`;

-- DropForeignKey
ALTER TABLE `BulkActorStatusOperation` DROP FOREIGN KEY `BulkActorStatusOperation_businessProfileId_fkey`;

-- DropIndex
DROP INDEX `BulkActorStatusOperation_businessProfileId_idempotencyKey_key` ON `BulkActorStatusOperation`;

-- AlterTable
ALTER TABLE `ActorOptimizationRun` MODIFY `approvalRequestHash` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `ActorRunSnapshot` DROP COLUMN `resultCountSyncedAt`;

-- AlterTable
ALTER TABLE `BulkActorStatusOperation` DROP COLUMN `idempotencyKey`,
    DROP COLUMN `requestHash`;

-- AlterTable
ALTER TABLE `BusinessProfile` MODIFY `isDefault` BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE `Subscription` DROP COLUMN `checkoutOperationId`,
    DROP COLUMN `stateVersion`;

-- DropTable
DROP TABLE `BillingCheckoutOperation`;

-- AddForeignKey
ALTER TABLE `KeywordWatch` ADD CONSTRAINT `KeywordWatch_businessProfileId_fkey` FOREIGN KEY (`businessProfileId`) REFERENCES `BusinessProfile`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
