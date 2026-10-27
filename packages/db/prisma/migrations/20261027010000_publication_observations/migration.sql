CREATE TABLE `ActorPublicationEvent` (
  `id` VARCHAR(191) NOT NULL,
  `runId` VARCHAR(191) NOT NULL,
  `apifyActorId` VARCHAR(191) NOT NULL,
  `username` VARCHAR(191) NOT NULL,
  `actorName` VARCHAR(191) NOT NULL,
  `publishedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `ActorPublicationEvent_runId_apifyActorId_key`(`runId`, `apifyActorId`),
  INDEX `ActorPublicationEvent_username_publishedAt_idx`(`username`, `publishedAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `InvalidPublicationDate` (
  `storeActorId` VARCHAR(191) NOT NULL,
  `originalValue` DATETIME(3) NOT NULL,
  `correctedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`storeActorId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Archive demonstrably impossible values before clearing them.
INSERT INTO `InvalidPublicationDate` (`storeActorId`, `originalValue`)
SELECT `id`, `firstPublishedAt` FROM `StoreActor`
WHERE `firstPublishedAt` IS NOT NULL AND `apifyCreatedAt` IS NOT NULL
  AND `firstPublishedAt` < `apifyCreatedAt`;

UPDATE `StoreActor` SET `firstPublishedAt` = NULL
WHERE `firstPublishedAt` IS NOT NULL AND `apifyCreatedAt` IS NOT NULL
  AND `firstPublishedAt` < `apifyCreatedAt`;
