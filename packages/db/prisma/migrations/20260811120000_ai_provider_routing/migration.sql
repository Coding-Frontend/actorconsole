CREATE TABLE `AiProvider` (
    `id` VARCHAR(36) NOT NULL,
    `key` VARCHAR(64) NOT NULL,
    `name` VARCHAR(128) NOT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT false,
    `priority` INTEGER NOT NULL,
    `model` VARCHAR(191) NOT NULL,
    `baseUrl` VARCHAR(1000) NOT NULL,
    `useProxy` BOOLEAN NOT NULL DEFAULT false,
    `lastTestedAt` DATETIME(3) NULL,
    `testStatus` VARCHAR(32) NULL,
    `testMessage` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `AiProvider_key_key`(`key`),
    UNIQUE INDEX `AiProvider_priority_key`(`priority`),
    INDEX `AiProvider_enabled_priority_idx`(`enabled`, `priority`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `AiProviderCredential` (
    `id` VARCHAR(36) NOT NULL,
    `providerId` VARCHAR(36) NOT NULL,
    `label` VARCHAR(191) NOT NULL,
    `encryptedApiKey` TEXT NOT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `lastUsedAt` DATETIME(3) NULL,
    `cooldownUntil` DATETIME(3) NULL,
    `authErrorAt` DATETIME(3) NULL,
    `lastTestedAt` DATETIME(3) NULL,
    `testStatus` VARCHAR(32) NULL,
    `testMessage` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `AiProviderCredential_providerId_enabled_cooldownUntil_idx`(`providerId`, `enabled`, `cooldownUntil`),
    INDEX `AiProviderCredential_providerId_lastUsedAt_idx`(`providerId`, `lastUsedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `AiProxyConfig` (
    `id` VARCHAR(36) NOT NULL DEFAULT 'default',
    `protocol` VARCHAR(16) NOT NULL DEFAULT 'http',
    `host` VARCHAR(255) NOT NULL DEFAULT 'proxy.apify.com',
    `port` INTEGER NOT NULL DEFAULT 8000,
    `username` VARCHAR(500) NOT NULL DEFAULT 'groups-auto',
    `encryptedPassword` TEXT NULL,
    `lastTestedAt` DATETIME(3) NULL,
    `testStatus` VARCHAR(32) NULL,
    `testMessage` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `AiProviderCredential` ADD CONSTRAINT `AiProviderCredential_providerId_fkey`
    FOREIGN KEY (`providerId`) REFERENCES `AiProvider`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO `AiProvider` (`id`, `key`, `name`, `enabled`, `priority`, `model`, `baseUrl`, `useProxy`, `createdAt`, `updatedAt`) VALUES
('aip_opencode_free', 'opencode_free', 'OpenCode Free', true, 10, 'deepseek-v4-flash-free', 'https://opencode.ai/zen/v1/chat/completions', false, NOW(), NOW()),
('aip_opencode_paid', 'opencode_paid', 'OpenCode Paid', false, 20, 'deepseek-v4-flash', 'https://opencode.ai/zen/v1/chat/completions', false, NOW(), NOW()),
('aip_kilocode', 'kilocode', 'KiloCode', false, 30, 'google/gemini-3.6-flash', 'https://api.kilo.ai/api/gateway/chat/completions', false, NOW(), NOW()),
('aip_gemini_studio', 'gemini_ai_studio', 'Google Gemini AI Studio', false, 40, 'gemini-3.6-flash', 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', false, NOW(), NOW());

INSERT INTO `AiProxyConfig` (`id`, `protocol`, `host`, `port`, `username`, `createdAt`, `updatedAt`)
VALUES ('default', 'http', 'proxy.apify.com', 8000, 'groups-auto', NOW(), NOW());
