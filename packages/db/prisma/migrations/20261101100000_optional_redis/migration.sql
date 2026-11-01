CREATE TABLE `BackgroundJob` (
    `id` VARCHAR(191) NOT NULL,
    `queue` VARCHAR(64) NOT NULL,
    `jobId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `data` JSON NOT NULL,
    `options` JSON NOT NULL,
    `state` VARCHAR(16) NOT NULL DEFAULT 'waiting',
    `deduplicationKey` VARCHAR(64) NULL,
    `sortOrder` BIGINT NOT NULL,
    `availableAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `attemptsMade` INTEGER NOT NULL DEFAULT 0,
    `progress` JSON NOT NULL,
    `result` JSON NULL,
    `failedReason` TEXT NULL,
    `leaseToken` VARCHAR(64) NULL,
    `leaseExpiresAt` DATETIME(3) NULL,
    `finishedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE INDEX `BackgroundJob_queue_jobId_key` (`queue`, `jobId`),
    UNIQUE INDEX `BackgroundJob_queue_deduplicationKey_key` (`queue`, `deduplicationKey`),
    INDEX `BackgroundJob_queue_state_availableAt_idx` (`queue`, `state`, `availableAt`),
    INDEX `BackgroundJob_queue_state_leaseExpiresAt_idx` (`queue`, `state`, `leaseExpiresAt`),
    INDEX `BackgroundJob_queue_state_finishedAt_idx` (`queue`, `state`, `finishedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `BackgroundLease` (
    `key` VARCHAR(191) NOT NULL,
    `token` VARCHAR(64) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `BackgroundSchedule` (
    `id` VARCHAR(64) NOT NULL,
    `queue` VARCHAR(64) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `pattern` VARCHAR(191) NOT NULL,
    `timezone` VARCHAR(64) NOT NULL,
    `data` JSON NOT NULL,
    `options` JSON NOT NULL,
    `nextRunAt` DATETIME(3) NOT NULL,
    INDEX `BackgroundSchedule_nextRunAt_idx` (`nextRunAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `RateLimitBucket` (
    `key` VARCHAR(64) NOT NULL,
    `timestamps` JSON NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    INDEX `RateLimitBucket_expiresAt_idx` (`expiresAt`),
    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
