-- Plans and subscriptions belong to workspaces, not accounts. Existing account
-- plans and billing rows are attached to each user's default workspace.

ALTER TABLE `BusinessProfile`
  ADD COLUMN `plan` ENUM('FREE', 'PRO', 'STUDIO') NOT NULL DEFAULT 'FREE';

UPDATE `BusinessProfile` p
JOIN `User` u ON u.`id` = p.`userId`
SET p.`plan` = u.`plan`
WHERE p.`isDefault` = true;

ALTER TABLE `Subscription`
  DROP INDEX `Subscription_userId_key`,
  ADD COLUMN `businessProfileId` VARCHAR(191) NULL,
  ADD UNIQUE INDEX `Subscription_businessProfileId_key` (`businessProfileId`),
  ADD INDEX `Subscription_userId_idx` (`userId`);

UPDATE `Subscription` s
JOIN `BusinessProfile` p ON p.`userId` = s.`userId` AND p.`isDefault` = true
SET s.`businessProfileId` = p.`id`
WHERE s.`businessProfileId` IS NULL;

ALTER TABLE `Payment`
  ADD COLUMN `businessProfileId` VARCHAR(191) NULL,
  ADD INDEX `Payment_businessProfileId_idx` (`businessProfileId`);

UPDATE `Payment` p
JOIN `Subscription` s ON s.`id` = p.`subscriptionId`
SET p.`businessProfileId` = s.`businessProfileId`
WHERE p.`businessProfileId` IS NULL;

UPDATE `Payment` p
JOIN `BusinessProfile` b ON b.`userId` = p.`userId` AND b.`isDefault` = true
SET p.`businessProfileId` = b.`id`
WHERE p.`businessProfileId` IS NULL;

ALTER TABLE `Subscription`
  ADD CONSTRAINT `Subscription_businessProfileId_fkey`
    FOREIGN KEY (`businessProfileId`) REFERENCES `BusinessProfile`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `Payment`
  ADD CONSTRAINT `Payment_businessProfileId_fkey`
    FOREIGN KEY (`businessProfileId`) REFERENCES `BusinessProfile`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
