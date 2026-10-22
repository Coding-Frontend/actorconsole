-- Track initialized plan-copy sets separately so an intentionally empty plan
-- is not repopulated by a later idempotent content seed.
CREATE TABLE `PlanMarketingFeatureConfig` (
  `plan` ENUM('FREE', 'PRO', 'STUDIO') NOT NULL,
  `managed` BOOLEAN NOT NULL DEFAULT false,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`plan`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
