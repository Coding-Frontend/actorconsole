-- AlterTable
ALTER TABLE `ActorOptimizationRun` MODIFY `approvalRequestHash` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `BusinessProfile` MODIFY `isDefault` BOOLEAN NOT NULL DEFAULT false;
