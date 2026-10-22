-- CreateTable
CREATE TABLE `KeywordWatch` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `keyword` VARCHAR(191) NOT NULL,
    `normalizedKeyword` VARCHAR(191) NOT NULL,
    `searchCount` INTEGER NOT NULL DEFAULT 0,
    `latestResultCount` INTEGER NOT NULL DEFAULT 0,
    `difficultyScore` DOUBLE NULL,
    `repeatUseRate` DOUBLE NULL,
    `lastSearchedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `KeywordWatch_userId_normalizedKeyword_key`(`userId`, `normalizedKeyword`),
    INDEX `KeywordWatch_userId_updatedAt_idx`(`userId`, `updatedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `KeywordSearch` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `keyword` VARCHAR(191) NOT NULL,
    `normalizedKeyword` VARCHAR(191) NOT NULL,
    `resultCount` INTEGER NOT NULL,
    `difficultyScore` DOUBLE NULL,
    `repeatUseRate` DOUBLE NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `KeywordSearch_userId_normalizedKeyword_createdAt_idx`(`userId`, `normalizedKeyword`, `createdAt`),
    INDEX `KeywordSearch_normalizedKeyword_createdAt_idx`(`normalizedKeyword`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `KeywordWatch` ADD CONSTRAINT `KeywordWatch_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `KeywordSearch` ADD CONSTRAINT `KeywordSearch_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
