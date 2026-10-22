-- Keep operational credentials and notifications isolated to the workspace
-- selected in the dashboard. Existing user-level rows belong to the user's
-- default (or oldest) workspace so no data is discarded during the migration.

ALTER TABLE `ApiKey`
  ADD COLUMN `businessProfileId` VARCHAR(191) NULL,
  ADD COLUMN `revokedAt` DATETIME(3) NULL,
  ADD COLUMN `rotatedAt` DATETIME(3) NULL;

ALTER TABLE `Notification`
  ADD COLUMN `businessProfileId` VARCHAR(191) NULL;

ALTER TABLE `NotificationChannel`
  ADD COLUMN `businessProfileId` VARCHAR(191) NULL;

ALTER TABLE `NotificationPreference`
  ADD COLUMN `businessProfileId` VARCHAR(191) NULL;

UPDATE `ApiKey` k
SET k.`businessProfileId` = (
  SELECT p.`id`
  FROM `BusinessProfile` p
  WHERE p.`userId` = k.`userId`
  ORDER BY p.`isDefault` DESC, p.`createdAt` ASC
  LIMIT 1
)
WHERE k.`businessProfileId` IS NULL;

UPDATE `Notification` n
SET n.`businessProfileId` = (
  SELECT p.`id`
  FROM `BusinessProfile` p
  WHERE p.`userId` = n.`userId`
  ORDER BY p.`isDefault` DESC, p.`createdAt` ASC
  LIMIT 1
)
WHERE n.`businessProfileId` IS NULL;

UPDATE `NotificationChannel` c
SET c.`businessProfileId` = (
  SELECT p.`id`
  FROM `BusinessProfile` p
  WHERE p.`userId` = c.`userId`
  ORDER BY p.`isDefault` DESC, p.`createdAt` ASC
  LIMIT 1
)
WHERE c.`businessProfileId` IS NULL;

UPDATE `NotificationPreference` n
SET n.`businessProfileId` = (
  SELECT p.`id`
  FROM `BusinessProfile` p
  WHERE p.`userId` = n.`userId`
  ORDER BY p.`isDefault` DESC, p.`createdAt` ASC
  LIMIT 1
)
WHERE n.`businessProfileId` IS NULL;

ALTER TABLE `ApiKey`
  MODIFY `businessProfileId` VARCHAR(191) NOT NULL,
  DROP INDEX `ApiKey_userId_idx`,
  ADD INDEX `ApiKey_userId_businessProfileId_idx` (`userId`, `businessProfileId`),
  ADD INDEX `ApiKey_businessProfileId_revokedAt_expiresAt_idx` (`businessProfileId`, `revokedAt`, `expiresAt`),
  ADD CONSTRAINT `ApiKey_businessProfileId_fkey`
    FOREIGN KEY (`businessProfileId`) REFERENCES `BusinessProfile`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `Notification`
  MODIFY `businessProfileId` VARCHAR(191) NOT NULL,
  DROP INDEX `Notification_userId_readAt_idx`,
  ADD INDEX `Notification_userId_businessProfileId_readAt_idx` (`userId`, `businessProfileId`, `readAt`),
  ADD INDEX `Notification_businessProfileId_createdAt_idx` (`businessProfileId`, `createdAt`),
  ADD CONSTRAINT `Notification_businessProfileId_fkey`
    FOREIGN KEY (`businessProfileId`) REFERENCES `BusinessProfile`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `NotificationChannel`
  MODIFY `businessProfileId` VARCHAR(191) NOT NULL,
  DROP INDEX `NotificationChannel_userId_provider_name_key`,
  DROP INDEX `NotificationChannel_userId_enabled_idx`,
  ADD UNIQUE INDEX `NotificationChannel_businessProfileId_provider_name_key` (`businessProfileId`, `provider`, `name`),
  ADD INDEX `NotificationChannel_userId_businessProfileId_enabled_idx` (`userId`, `businessProfileId`, `enabled`),
  ADD CONSTRAINT `NotificationChannel_businessProfileId_fkey`
    FOREIGN KEY (`businessProfileId`) REFERENCES `BusinessProfile`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `NotificationPreference`
  MODIFY `businessProfileId` VARCHAR(191) NOT NULL,
  DROP INDEX `NotificationPreference_userId_key`,
  ADD UNIQUE INDEX `NotificationPreference_businessProfileId_key` (`businessProfileId`),
  ADD INDEX `NotificationPreference_userId_idx` (`userId`),
  ADD CONSTRAINT `NotificationPreference_businessProfileId_fkey`
    FOREIGN KEY (`businessProfileId`) REFERENCES `BusinessProfile`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
