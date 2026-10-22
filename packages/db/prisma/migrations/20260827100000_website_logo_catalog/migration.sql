-- Remove AI-generated image history. Existing Apify-hosted Actor thumbnails
-- remain referenced by Actor.currentImageUrl.
DROP TABLE IF EXISTS `Image`;

CREATE TABLE `WebsiteIdentity` (
  `id` VARCHAR(191) NOT NULL,
  `slug` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `canonicalDomain` VARCHAR(191) NULL,
  `aliases` JSON NOT NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'ACTIVE',
  `currentLogoId` VARCHAR(191) NULL,
  `logoError` TEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `WebsiteIdentity_slug_key`(`slug`),
  UNIQUE INDEX `WebsiteIdentity_currentLogoId_key`(`currentLogoId`),
  INDEX `WebsiteIdentity_canonicalDomain_idx`(`canonicalDomain`),
  INDEX `WebsiteIdentity_status_updatedAt_idx`(`status`, `updatedAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `WebsiteLogo` (
  `id` VARCHAR(191) NOT NULL,
  `websiteIdentityId` VARCHAR(191) NOT NULL,
  `storagePath` VARCHAR(191) NOT NULL,
  `sourceUrl` TEXT NULL,
  `sourceDomain` VARCHAR(191) NULL,
  `sourceKind` VARCHAR(191) NOT NULL,
  `checksum` VARCHAR(191) NOT NULL,
  `contentType` VARCHAR(191) NOT NULL,
  `width` INTEGER NOT NULL,
  `height` INTEGER NOT NULL,
  `byteSize` INTEGER NOT NULL,
  `reviewStatus` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
  `reviewNotes` TEXT NULL,
  `reviewedById` VARCHAR(191) NULL,
  `reviewedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `WebsiteLogo_websiteIdentityId_checksum_key`(`websiteIdentityId`, `checksum`),
  INDEX `WebsiteLogo_websiteIdentityId_createdAt_idx`(`websiteIdentityId`, `createdAt`),
  INDEX `WebsiteLogo_reviewStatus_createdAt_idx`(`reviewStatus`, `createdAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `Actor`
  ADD COLUMN `websiteIdentityId` VARCHAR(191) NULL,
  ADD COLUMN `websiteConfidence` DOUBLE NULL,
  ADD COLUMN `websiteMethod` VARCHAR(191) NULL,
  ADD COLUMN `websiteEvidence` JSON NULL,
  ADD COLUMN `websiteClassifiedAt` DATETIME(3) NULL,
  ADD COLUMN `websiteAdminOverride` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `websiteClassificationError` TEXT NULL,
  ADD INDEX `Actor_websiteIdentityId_idx`(`websiteIdentityId`);

ALTER TABLE `StoreActor`
  ADD COLUMN `websiteIdentityId` VARCHAR(191) NULL,
  ADD COLUMN `websiteConfidence` DOUBLE NULL,
  ADD COLUMN `websiteMethod` VARCHAR(191) NULL,
  ADD COLUMN `websiteEvidence` JSON NULL,
  ADD COLUMN `websiteClassifiedAt` DATETIME(3) NULL,
  ADD COLUMN `websiteAdminOverride` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `websiteClassificationError` TEXT NULL,
  ADD INDEX `StoreActor_websiteIdentityId_idx`(`websiteIdentityId`);

CREATE TABLE `ActorLogoRecommendation` (
  `id` VARCHAR(191) NOT NULL,
  `actorId` VARCHAR(191) NOT NULL,
  `logoId` VARCHAR(191) NOT NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
  `error` TEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  `appliedAt` DATETIME(3) NULL,
  `dismissedAt` DATETIME(3) NULL,
  UNIQUE INDEX `ActorLogoRecommendation_actorId_logoId_key`(`actorId`, `logoId`),
  INDEX `ActorLogoRecommendation_actorId_status_idx`(`actorId`, `status`),
  INDEX `ActorLogoRecommendation_logoId_status_idx`(`logoId`, `status`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `Notification`
  ADD COLUMN `dedupeKey` VARCHAR(191) NULL,
  ADD UNIQUE INDEX `Notification_dedupeKey_key`(`dedupeKey`);

ALTER TABLE `StoreCatalogSync`
  ADD COLUMN `matchedCount` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `unresolvedCount` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `failedCount` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `retryCount` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `checkpoint` VARCHAR(191) NULL;

ALTER TABLE `WebsiteLogo`
  ADD CONSTRAINT `WebsiteLogo_websiteIdentityId_fkey`
    FOREIGN KEY (`websiteIdentityId`) REFERENCES `WebsiteIdentity`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `WebsiteLogo_reviewedById_fkey`
    FOREIGN KEY (`reviewedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `WebsiteIdentity`
  ADD CONSTRAINT `WebsiteIdentity_currentLogoId_fkey`
    FOREIGN KEY (`currentLogoId`) REFERENCES `WebsiteLogo`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `Actor`
  ADD CONSTRAINT `Actor_websiteIdentityId_fkey`
    FOREIGN KEY (`websiteIdentityId`) REFERENCES `WebsiteIdentity`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `StoreActor`
  ADD CONSTRAINT `StoreActor_websiteIdentityId_fkey`
    FOREIGN KEY (`websiteIdentityId`) REFERENCES `WebsiteIdentity`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `ActorLogoRecommendation`
  ADD CONSTRAINT `ActorLogoRecommendation_actorId_fkey`
    FOREIGN KEY (`actorId`) REFERENCES `Actor`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `ActorLogoRecommendation_logoId_fkey`
    FOREIGN KEY (`logoId`) REFERENCES `WebsiteLogo`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- Remove obsolete runtime configuration and user-facing claims without
-- rewriting previously-applied migration history.
DELETE FROM `Integration` WHERE LOWER(`key`) LIKE '%replicate%';
DELETE FROM `FeatureFlag`
  WHERE LOWER(`key`) IN ('image_generation', 'image-generation', 'ai_image_generation');
UPDATE `ChangelogEntry`
  SET `text` = 'Admin integrations management — created the integrations listing page with categorized cards, configuration status badges, and live connection testing for supported billing, text AI, and email providers.'
  WHERE `id` = 'cl_seed_003';
UPDATE `ChangelogEntry`
  SET `versionSummary` = 'AI copy generation & billing.',
      `text` = 'AI copy generation — integrated AI-powered copy rewriting. Users can generate SEO-optimized titles, descriptions, categories, schemas, and READMEs.'
  WHERE `id` = 'cl_seed_009';
UPDATE `ChangelogEntry`
  SET `text` = 'Scheduled publishing engine — launched the cron-based scheduling system. Users can schedule copy rewrites, pricing updates, and Actor runs.'
  WHERE `id` = 'cl_seed_008';
