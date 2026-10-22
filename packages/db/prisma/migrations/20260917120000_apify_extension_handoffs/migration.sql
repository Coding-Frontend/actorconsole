-- One-time handoffs used by the ActorConsole Chrome extension. Apify cookie
-- values never enter this table; they are validated and encrypted directly
-- into the existing workspace ApifyToken record.
CREATE TABLE `ApifyExtensionSession` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `businessProfileId` VARCHAR(191) NOT NULL,
  `challengeHash` VARCHAR(64) NOT NULL,
  `expiresAt` DATETIME(3) NOT NULL,
  `consumedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `ApifyExtensionSession_userId_expiresAt_idx` (`userId`, `expiresAt`),
  INDEX `ApifyExtensionSession_businessProfileId_consumedAt_expiresAt_idx` (`businessProfileId`, `consumedAt`, `expiresAt`),
  PRIMARY KEY (`id`),
  CONSTRAINT `ApifyExtensionSession_userId_fkey`
    FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `ApifyExtensionSession_businessProfileId_fkey`
    FOREIGN KEY (`businessProfileId`) REFERENCES `BusinessProfile`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Ship the production surface behind an administrator-controlled kill switch.
-- Enable it from Admin > Feature flags after the Chrome Web Store listing and
-- extension ID are ready.
INSERT INTO `FeatureFlag` (`key`, `enabled`, `description`, `rolloutPct`, `metadata`, `createdAt`, `updatedAt`)
VALUES (
  'apify_chrome_extension',
  FALSE,
  'Allow workspace publishing credentials to be connected with the ActorConsole Chrome extension.',
  100,
  '{"surface":"dashboard_apify"}',
  CURRENT_TIMESTAMP(3),
  CURRENT_TIMESTAMP(3)
)
ON DUPLICATE KEY UPDATE
  `description` = VALUES(`description`);
