-- Production hardening: account security, scoped keys, deletion grace periods,
-- encrypted schedule credentials, external notifications, and safer billing
-- ownership semantics. This migration is written to be safe on populated
-- installations: new JSON fields are backfilled before becoming NOT NULL.

ALTER TABLE `User`
  ADD COLUMN `deletionRequestedAt` DATETIME(3) NULL,
  ADD COLUMN `deletionScheduledFor` DATETIME(3) NULL,
  ADD COLUMN `totpEnabled` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `totpRecoveryCodes` JSON NULL,
  ADD COLUMN `totpSecretEncrypted` TEXT NULL,
  ADD INDEX `User_deletionScheduledFor_idx` (`deletionScheduledFor`);

UPDATE `User`
SET `totpRecoveryCodes` = JSON_ARRAY()
WHERE `totpRecoveryCodes` IS NULL;

ALTER TABLE `User`
  MODIFY `totpRecoveryCodes` JSON NOT NULL;

ALTER TABLE `ApiKey`
  ADD COLUMN `actorIds` JSON NULL,
  ADD COLUMN `scopes` JSON NULL;

UPDATE `ApiKey`
SET `actorIds` = JSON_ARRAY(),
    `scopes` = JSON_ARRAY('read', 'write')
WHERE `actorIds` IS NULL OR `scopes` IS NULL;

ALTER TABLE `ApiKey`
  MODIFY `actorIds` JSON NOT NULL,
  MODIFY `scopes` JSON NOT NULL;

ALTER TABLE `BlogPost`
  ADD COLUMN `deletedAt` DATETIME(3) NULL;

ALTER TABLE `EmailLog`
  ADD COLUMN `eventType` VARCHAR(191) NULL,
  ADD COLUMN `providerId` VARCHAR(191) NULL,
  ADD INDEX `EmailLog_providerId_status_idx` (`providerId`, `status`);

ALTER TABLE `Policy`
  ADD COLUMN `deletedAt` DATETIME(3) NULL;

ALTER TABLE `Schedule`
  ADD COLUMN `encryptedAnthropicApiKey` TEXT NULL,
  ADD INDEX `Schedule_userId_enabled_nextRunAt_idx` (`userId`, `enabled`, `nextRunAt`);

ALTER TABLE `Session`
  ADD COLUMN `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  ADD COLUMN `impersonatedById` VARCHAR(191) NULL,
  ADD COLUMN `impersonationExpiresAt` DATETIME(3) NULL;

ALTER TABLE `Payment`
  DROP FOREIGN KEY `Payment_userId_fkey`;

ALTER TABLE `Subscription`
  DROP FOREIGN KEY `Subscription_userId_fkey`;

ALTER TABLE `Payment`
  MODIFY `userId` VARCHAR(191) NULL;

ALTER TABLE `Subscription`
  MODIFY `userId` VARCHAR(191) NULL,
  ADD COLUMN `provider` VARCHAR(191) NOT NULL DEFAULT 'razorpay',
  ADD COLUMN `source` VARCHAR(191) NOT NULL DEFAULT 'gateway';

ALTER TABLE `Payment`
  ADD INDEX `Payment_userId_status_createdAt_idx` (`userId`, `status`, `createdAt`),
  ADD CONSTRAINT `Payment_amount_nonnegative` CHECK (`amount` >= 0),
  ADD CONSTRAINT `Payment_refundedAmount_nonnegative` CHECK (`refundedAmount` IS NULL OR `refundedAmount` >= 0);

ALTER TABLE `Subscription`
  ADD CONSTRAINT `Subscription_userId_fkey`
    FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `Payment`
  ADD CONSTRAINT `Payment_userId_fkey`
    FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE `NotificationChannel` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `provider` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `encryptedWebhookUrl` TEXT NOT NULL,
  `events` JSON NOT NULL,
  `enabled` BOOLEAN NOT NULL DEFAULT true,
  `lastDeliveredAt` DATETIME(3) NULL,
  `lastError` TEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `NotificationChannel_userId_provider_name_key` (`userId`, `provider`, `name`),
  INDEX `NotificationChannel_userId_enabled_idx` (`userId`, `enabled`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `TwoFactorChallenge` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `tokenHash` VARCHAR(191) NOT NULL,
  `expiresAt` DATETIME(3) NOT NULL,
  `attempts` INTEGER NOT NULL DEFAULT 0,
  `usedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `TwoFactorChallenge_tokenHash_key` (`tokenHash`),
  INDEX `TwoFactorChallenge_userId_expiresAt_idx` (`userId`, `expiresAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ImpersonationSession` (
  `id` VARCHAR(191) NOT NULL,
  `adminId` VARCHAR(191) NOT NULL,
  `targetUserId` VARCHAR(191) NOT NULL,
  `tokenHash` VARCHAR(191) NOT NULL,
  `sessionId` VARCHAR(191) NULL,
  `expiresAt` DATETIME(3) NOT NULL,
  `revokedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `ImpersonationSession_tokenHash_key` (`tokenHash`),
  UNIQUE INDEX `ImpersonationSession_sessionId_key` (`sessionId`),
  INDEX `ImpersonationSession_adminId_createdAt_idx` (`adminId`, `createdAt`),
  INDEX `ImpersonationSession_targetUserId_expiresAt_idx` (`targetUserId`, `expiresAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `NotificationChannel`
  ADD CONSTRAINT `NotificationChannel_userId_fkey`
    FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `TwoFactorChallenge`
  ADD CONSTRAINT `TwoFactorChallenge_userId_fkey`
    FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `ImpersonationSession`
  ADD CONSTRAINT `ImpersonationSession_adminId_fkey`
    FOREIGN KEY (`adminId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `ImpersonationSession_targetUserId_fkey`
    FOREIGN KEY (`targetUserId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
