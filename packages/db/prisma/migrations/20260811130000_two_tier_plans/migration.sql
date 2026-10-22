-- Collapse the retired enterprise tier into Pro before narrowing the enum.
UPDATE `User` SET `plan` = 'PRO' WHERE `plan` = 'STUDIO';
UPDATE `BusinessProfile` SET `plan` = 'PRO' WHERE `plan` = 'STUDIO';
DELETE FROM `PlanMarketingFeature` WHERE `plan` = 'STUDIO';
DELETE FROM `PlanMarketingFeatureConfig` WHERE `plan` = 'STUDIO';

ALTER TABLE `User`
  MODIFY `plan` ENUM('FREE', 'PRO') NOT NULL DEFAULT 'FREE';

ALTER TABLE `BusinessProfile`
  MODIFY `plan` ENUM('FREE', 'PRO') NOT NULL DEFAULT 'FREE';

ALTER TABLE `PlanMarketingFeature`
  MODIFY `plan` ENUM('FREE', 'PRO') NOT NULL;

ALTER TABLE `PlanMarketingFeatureConfig`
  MODIFY `plan` ENUM('FREE', 'PRO') NOT NULL;
