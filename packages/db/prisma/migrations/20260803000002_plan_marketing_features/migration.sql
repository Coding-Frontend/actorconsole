-- Admin-managed marketing feature copy for each billing plan.
-- The application seeds defaults idempotently; this migration only creates
-- the durable storage and indexes.
CREATE TABLE `PlanMarketingFeature` (
  `id` VARCHAR(191) NOT NULL,
  `plan` ENUM('FREE', 'PRO', 'STUDIO') NOT NULL,
  `label` VARCHAR(500) NOT NULL,
  `sortOrder` INTEGER NOT NULL DEFAULT 0,
  `enabled` BOOLEAN NOT NULL DEFAULT true,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `PlanMarketingFeature_plan_label_key` (`plan`, `label`),
  INDEX `PlanMarketingFeature_plan_enabled_sortOrder_idx` (`plan`, `enabled`, `sortOrder`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
