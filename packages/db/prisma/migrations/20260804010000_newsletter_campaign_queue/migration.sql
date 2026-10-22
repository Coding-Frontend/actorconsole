CREATE TABLE `NewsletterCampaign` (
    `id` VARCHAR(191) NOT NULL,
    `idempotencyKey` VARCHAR(191) NOT NULL,
    `subject` VARCHAR(200) NOT NULL,
    `title` VARCHAR(200) NOT NULL,
    `articles` JSON NOT NULL,
    `status` ENUM('QUEUED', 'RUNNING', 'COMPLETED', 'PARTIAL', 'FAILED') NOT NULL DEFAULT 'QUEUED',
    `totalRecipients` INTEGER NOT NULL DEFAULT 0,
    `sentCount` INTEGER NOT NULL DEFAULT 0,
    `failedCount` INTEGER NOT NULL DEFAULT 0,
    `createdById` VARCHAR(191) NULL,
    `error` TEXT NULL,
    `startedAt` DATETIME(3) NULL,
    `completedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `NewsletterCampaign_idempotencyKey_key`(`idempotencyKey`),
    INDEX `NewsletterCampaign_status_createdAt_idx`(`status`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `NewsletterDelivery` (
    `id` VARCHAR(191) NOT NULL,
    `campaignId` VARCHAR(191) NOT NULL,
    `subscriberId` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `status` ENUM('PENDING', 'SENDING', 'SENT', 'FAILED') NOT NULL DEFAULT 'PENDING',
    `providerId` VARCHAR(191) NULL,
    `error` TEXT NULL,
    `sentAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `NewsletterDelivery_campaignId_subscriberId_key`(`campaignId`, `subscriberId`),
    INDEX `NewsletterDelivery_campaignId_status_idx`(`campaignId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `NewsletterDelivery` ADD CONSTRAINT `NewsletterDelivery_campaignId_fkey` FOREIGN KEY (`campaignId`) REFERENCES `NewsletterCampaign`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `NewsletterDelivery` ADD CONSTRAINT `NewsletterDelivery_subscriberId_fkey` FOREIGN KEY (`subscriberId`) REFERENCES `NewsletterSubscriber`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
