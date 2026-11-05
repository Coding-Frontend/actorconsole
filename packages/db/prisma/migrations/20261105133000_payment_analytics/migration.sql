-- AlterTable
ALTER TABLE `Subscription` ADD COLUMN `analyticsAttributionId` VARCHAR(64) NULL;

-- AlterTable
ALTER TABLE `Payment` ADD COLUMN `analyticsAttributionId` VARCHAR(64) NULL,
    ADD COLUMN `analyticsRefundedAmount` DECIMAL(13, 3) NULL;

-- CreateTable
CREATE TABLE `PaymentAnalyticsAttribution` (
    `id` VARCHAR(64) NOT NULL,
    `userId` VARCHAR(191) NULL,
    `clientId` VARCHAR(128) NULL,
    `sessionId` VARCHAR(32) NULL,
    `measurementId` VARCHAR(32) NULL,
    `interval` VARCHAR(8) NULL,
    `revokedAt` DATETIME(3) NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `PaymentAnalyticsAttribution_expiresAt_idx`(`expiresAt`),
    INDEX `PaymentAnalyticsAttribution_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PaymentAnalyticsEvent` (
    `id` VARCHAR(64) NOT NULL,
    `paymentId` VARCHAR(191) NOT NULL,
    `attributionId` VARCHAR(64) NOT NULL,
    `name` VARCHAR(16) NOT NULL,
    `value` DECIMAL(13, 3) NOT NULL,
    `currency` VARCHAR(3) NOT NULL,
    `occurredAt` DATETIME(3) NOT NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'pending',
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `availableAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `leaseToken` VARCHAR(36) NULL,
    `leaseExpiresAt` DATETIME(3) NULL,
    `lastError` VARCHAR(64) NULL,
    `sentAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `PaymentAnalyticsEvent_status_availableAt_idx`(`status`, `availableAt`),
    INDEX `PaymentAnalyticsEvent_paymentId_name_idx`(`paymentId`, `name`),
    INDEX `PaymentAnalyticsEvent_attributionId_idx`(`attributionId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `Subscription_analyticsAttributionId_idx` ON `Subscription`(`analyticsAttributionId`);

-- CreateIndex
CREATE INDEX `Payment_analyticsAttributionId_idx` ON `Payment`(`analyticsAttributionId`);

-- AddForeignKey
ALTER TABLE `Subscription` ADD CONSTRAINT `Subscription_analyticsAttributionId_fkey` FOREIGN KEY (`analyticsAttributionId`) REFERENCES `PaymentAnalyticsAttribution`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Payment` ADD CONSTRAINT `Payment_analyticsAttributionId_fkey` FOREIGN KEY (`analyticsAttributionId`) REFERENCES `PaymentAnalyticsAttribution`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PaymentAnalyticsAttribution` ADD CONSTRAINT `PaymentAnalyticsAttribution_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PaymentAnalyticsEvent` ADD CONSTRAINT `PaymentAnalyticsEvent_paymentId_fkey` FOREIGN KEY (`paymentId`) REFERENCES `Payment`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PaymentAnalyticsEvent` ADD CONSTRAINT `PaymentAnalyticsEvent_attributionId_fkey` FOREIGN KEY (`attributionId`) REFERENCES `PaymentAnalyticsAttribution`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
