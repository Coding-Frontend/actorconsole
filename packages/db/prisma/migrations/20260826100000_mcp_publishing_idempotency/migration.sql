ALTER TABLE `BulkPublishSchedule`
  ADD COLUMN `idempotencyKey` VARCHAR(191) NULL;

CREATE UNIQUE INDEX `BulkPublishSchedule_businessProfileId_idempotencyKey_key`
  ON `BulkPublishSchedule`(`businessProfileId`, `idempotencyKey`);

ALTER TABLE `BulkPublishSchedule`
  MODIFY COLUMN `enabled` BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE `ActorOptimizationRun`
  ADD COLUMN `approvalIdempotencyKey` VARCHAR(191) NULL,
  ADD COLUMN `approvalRequestHash` VARCHAR(64) NULL;
