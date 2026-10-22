ALTER TABLE `ActorOptimizationRun`
  ADD COLUMN `kind` VARCHAR(191) NOT NULL DEFAULT 'GENERATE_IMPROVEMENTS',
  ADD COLUMN `requestedFields` JSON NULL;

CREATE INDEX `ActorOptimizationRun_businessProfileId_kind_createdAt_idx`
  ON `ActorOptimizationRun`(`businessProfileId`, `kind`, `createdAt`);
