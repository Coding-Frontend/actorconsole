ALTER TABLE `User` ADD COLUMN `lastAcceptedTotpCounter` INTEGER NULL;
CREATE INDEX `Session_impersonatedById_idx` ON `Session`(`impersonatedById`);
ALTER TABLE `Subscription` ADD COLUMN `paymentBacked` BOOLEAN NOT NULL DEFAULT false;
-- Remove entitlements that were granted solely by abandoned checkout/mandate
-- state. Paid subscriptions are verified on their next provider readback.
UPDATE `BusinessProfile` b JOIN `Subscription` s ON s.`businessProfileId` = b.`id`
  SET b.`plan` = 'FREE'
  WHERE s.`provider` = 'razorpay' AND s.`status` IN ('created', 'authenticated');
ALTER TABLE `AnalyticsEvent` ADD COLUMN `businessProfileId` VARCHAR(191) NULL;
CREATE INDEX `AnalyticsEvent_businessProfileId_userId_createdAt_idx` ON `AnalyticsEvent`(`businessProfileId`, `userId`, `createdAt`);
ALTER TABLE `NewsletterSubscriber`
  MODIFY `status` ENUM('PENDING', 'ACTIVE', 'UNSUBSCRIBED', 'BOUNCED') NOT NULL DEFAULT 'PENDING',
  ADD COLUMN `confirmationTokenHash` VARCHAR(64) NULL,
  ADD COLUMN `confirmationExpiresAt` DATETIME(3) NULL;
CREATE UNIQUE INDEX `NewsletterSubscriber_confirmationTokenHash_key` ON `NewsletterSubscriber`(`confirmationTokenHash`);
CREATE TABLE `BulkPublishManualRun` (
  `id` VARCHAR(191) NOT NULL,
  `scheduleId` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `businessProfileId` VARCHAR(191) NOT NULL,
  `apiKeyId` VARCHAR(191) NULL,
  `idempotencyKey` VARCHAR(191) NULL,
  `expiresAt` DATETIME(3) NOT NULL,
  `consumedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `BulkPublishManualRun_scheduleId_idempotencyKey_key` (`scheduleId`, `idempotencyKey`),
  INDEX `BulkPublishManualRun_expiresAt_idx` (`expiresAt`),
  CONSTRAINT `BulkPublishManualRun_scheduleId_fkey` FOREIGN KEY (`scheduleId`) REFERENCES `BulkPublishSchedule` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
