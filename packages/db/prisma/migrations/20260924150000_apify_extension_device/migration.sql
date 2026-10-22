CREATE TABLE `ApifyExtensionDevice` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `tokenHash` VARCHAR(64) NULL,
    `claimHash` VARCHAR(64) NULL,
    `pairChallengeHash` VARCHAR(64) NULL,
    `claimExpiresAt` DATETIME(3) NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `revokedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `lastUsedAt` DATETIME(3) NULL,
    UNIQUE INDEX `ApifyExtensionDevice_tokenHash_key`(`tokenHash`),
    UNIQUE INDEX `ApifyExtensionDevice_claimHash_key`(`claimHash`),
    INDEX `ApifyExtensionDevice_userId_expiresAt_idx`(`userId`, `expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `ApifyExtensionDevice`
    ADD CONSTRAINT `ApifyExtensionDevice_userId_fkey`
    FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `ApifyExtensionSession`
    ADD COLUMN `deviceId` VARCHAR(191) NULL,
    ADD INDEX `ApifyExtensionSession_deviceId_idx`(`deviceId`);

ALTER TABLE `ApifyExtensionSession`
    ADD CONSTRAINT `ApifyExtensionSession_deviceId_fkey`
    FOREIGN KEY (`deviceId`) REFERENCES `ApifyExtensionDevice`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
