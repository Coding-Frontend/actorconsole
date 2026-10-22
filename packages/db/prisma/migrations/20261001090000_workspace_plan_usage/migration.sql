ALTER TABLE `BusinessProfile`
  ADD COLUMN `apifyActorCount` INTEGER NULL,
  ADD COLUMN `apifyMonthlyUsers` INTEGER NULL,
  ADD COLUMN `apifyMonthlyUsersComplete` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `planUsageCheckedAt` DATETIME(3) NULL;

-- Replace the previous default copy while preserving custom feature lists.
-- If the new label already exists, remove only the duplicate legacy default.
DELETE legacy FROM `PlanMarketingFeature` legacy
INNER JOIN `PlanMarketingFeature` replacement
  ON replacement.`plan` = legacy.`plan` AND replacement.`label` = 'Up to 50 tracked actors per workspace'
WHERE legacy.`plan` = 'FREE' AND legacy.`label` = 'Single-actor workspace';

UPDATE `PlanMarketingFeature`
SET `label` = 'Up to 50 tracked actors per workspace'
WHERE `plan` = 'FREE' AND `label` = 'Single-actor workspace';
