-- Business profiles provide an explicit workspace boundary for operational data.
-- Existing users receive one default profile and all existing rows are backfilled
-- into it before the new foreign keys become required.

CREATE TABLE `BusinessProfile` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `slug` VARCHAR(191) NOT NULL,
  `industry` VARCHAR(191) NULL,
  `website` VARCHAR(191) NULL,
  `isDefault` BOOLEAN NOT NULL DEFAULT true,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `BusinessProfile_userId_slug_key` (`userId`, `slug`),
  INDEX `BusinessProfile_userId_isDefault_createdAt_idx` (`userId`, `isDefault`, `createdAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `BusinessProfile` (`id`, `userId`, `name`, `slug`, `isDefault`, `createdAt`, `updatedAt`)
SELECT
  CONCAT('bp_', SUBSTRING(MD5(u.`id`), 1, 24)),
  u.`id`,
  COALESCE(NULLIF(TRIM(u.`name`), ''), 'My workspace'),
  'default',
  true,
  CURRENT_TIMESTAMP(3),
  CURRENT_TIMESTAMP(3)
FROM `User` u;

ALTER TABLE `Actor`
  ADD COLUMN `businessProfileId` VARCHAR(191) NULL,
  ADD INDEX `Actor_businessProfileId_idx` (`businessProfileId`),
  ADD INDEX `Actor_userId_businessProfileId_idx` (`userId`, `businessProfileId`);

ALTER TABLE `Schedule`
  ADD COLUMN `businessProfileId` VARCHAR(191) NULL,
  ADD INDEX `Schedule_businessProfileId_idx` (`businessProfileId`),
  ADD INDEX `Schedule_userId_businessProfileId_enabled_nextRunAt_idx` (`userId`, `businessProfileId`, `enabled`, `nextRunAt`);

ALTER TABLE `ApifyToken`
  DROP INDEX `ApifyToken_userId_key`,
  ADD COLUMN `businessProfileId` VARCHAR(191) NULL,
  ADD UNIQUE INDEX `ApifyToken_businessProfileId_key` (`businessProfileId`),
  ADD INDEX `ApifyToken_userId_idx` (`userId`);

ALTER TABLE `KeywordWatch`
  DROP INDEX `KeywordWatch_userId_normalizedKeyword_key`,
  ADD COLUMN `businessProfileId` VARCHAR(191) NULL,
  ADD UNIQUE INDEX `KeywordWatch_businessProfileId_normalizedKeyword_key` (`businessProfileId`, `normalizedKeyword`),
  ADD INDEX `KeywordWatch_userId_idx` (`userId`);

ALTER TABLE `KeywordSearch`
  ADD COLUMN `businessProfileId` VARCHAR(191) NULL,
  ADD INDEX `KeywordSearch_businessProfileId_normalizedKeyword_createdAt_idx` (`businessProfileId`, `normalizedKeyword`, `createdAt`);

ALTER TABLE `OnboardingState`
  DROP INDEX `OnboardingState_userId_key`,
  ADD COLUMN `businessProfileId` VARCHAR(191) NULL,
  ADD UNIQUE INDEX `OnboardingState_businessProfileId_key` (`businessProfileId`),
  ADD INDEX `OnboardingState_userId_idx` (`userId`);

UPDATE `Actor` a
JOIN `BusinessProfile` p ON p.`userId` = a.`userId` AND p.`isDefault` = true
SET a.`businessProfileId` = p.`id`
WHERE a.`businessProfileId` IS NULL;

UPDATE `Schedule` s
JOIN `BusinessProfile` p ON p.`userId` = s.`userId` AND p.`isDefault` = true
SET s.`businessProfileId` = p.`id`
WHERE s.`businessProfileId` IS NULL;

UPDATE `ApifyToken` t
JOIN `BusinessProfile` p ON p.`userId` = t.`userId` AND p.`isDefault` = true
SET t.`businessProfileId` = p.`id`
WHERE t.`businessProfileId` IS NULL;

UPDATE `KeywordWatch` w
JOIN `BusinessProfile` p ON p.`userId` = w.`userId` AND p.`isDefault` = true
SET w.`businessProfileId` = p.`id`
WHERE w.`businessProfileId` IS NULL;

UPDATE `KeywordSearch` s
JOIN `BusinessProfile` p ON p.`userId` = s.`userId` AND p.`isDefault` = true
SET s.`businessProfileId` = p.`id`
WHERE s.`businessProfileId` IS NULL;

UPDATE `OnboardingState` o
JOIN `BusinessProfile` p ON p.`userId` = o.`userId` AND p.`isDefault` = true
SET o.`businessProfileId` = p.`id`
WHERE o.`businessProfileId` IS NULL;

ALTER TABLE `Actor` MODIFY `businessProfileId` VARCHAR(191) NOT NULL;
ALTER TABLE `Schedule` MODIFY `businessProfileId` VARCHAR(191) NOT NULL;
ALTER TABLE `ApifyToken` MODIFY `businessProfileId` VARCHAR(191) NOT NULL;
ALTER TABLE `KeywordWatch` MODIFY `businessProfileId` VARCHAR(191) NOT NULL;
ALTER TABLE `KeywordSearch` MODIFY `businessProfileId` VARCHAR(191) NOT NULL;
ALTER TABLE `OnboardingState` MODIFY `businessProfileId` VARCHAR(191) NOT NULL;

ALTER TABLE `BusinessProfile`
  ADD CONSTRAINT `BusinessProfile_userId_fkey`
    FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `Actor`
  ADD CONSTRAINT `Actor_businessProfileId_fkey`
    FOREIGN KEY (`businessProfileId`) REFERENCES `BusinessProfile`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `Schedule`
  ADD CONSTRAINT `Schedule_businessProfileId_fkey`
    FOREIGN KEY (`businessProfileId`) REFERENCES `BusinessProfile`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `ApifyToken`
  ADD CONSTRAINT `ApifyToken_businessProfileId_fkey`
    FOREIGN KEY (`businessProfileId`) REFERENCES `BusinessProfile`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `KeywordWatch`
  ADD CONSTRAINT `KeywordWatch_businessProfileId_fkey`
    FOREIGN KEY (`businessProfileId`) REFERENCES `BusinessProfile`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `KeywordSearch`
  ADD CONSTRAINT `KeywordSearch_businessProfileId_fkey`
    FOREIGN KEY (`businessProfileId`) REFERENCES `BusinessProfile`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `OnboardingState`
  ADD CONSTRAINT `OnboardingState_businessProfileId_fkey`
    FOREIGN KEY (`businessProfileId`) REFERENCES `BusinessProfile`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
