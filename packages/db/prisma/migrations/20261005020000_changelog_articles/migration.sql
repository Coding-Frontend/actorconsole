-- Add article fields without changing existing release notes or publication state.
ALTER TABLE `ChangelogEntry`
  ADD COLUMN `title` VARCHAR(240) NULL,
  ADD COLUMN `slug` VARCHAR(200) NULL,
  ADD COLUMN `body` MEDIUMTEXT NULL,
  ADD COLUMN `category` ENUM('RELEASE', 'IMPROVEMENT', 'RETIRED') NOT NULL DEFAULT 'IMPROVEMENT';

-- Stable links for historical entries; administrators can refine titles and tags.
UPDATE `ChangelogEntry`
SET `title` = LEFT(`text`, 240),
    `slug` = CONCAT('update-', `id`),
    `category` = IF(`type` = 'FEATURE', 'RELEASE', 'IMPROVEMENT');

CREATE UNIQUE INDEX `ChangelogEntry_slug_key` ON `ChangelogEntry` (`slug`);
CREATE INDEX `ChangelogEntry_isPublished_category_releaseDate_idx`
  ON `ChangelogEntry` (`isPublished`, `category`, `releaseDate`);

CREATE TABLE `ChangelogEntryTag` (
  `entryId` VARCHAR(191) NOT NULL,
  `tag` VARCHAR(64) NOT NULL,
  PRIMARY KEY (`entryId`, `tag`),
  INDEX `ChangelogEntryTag_tag_entryId_idx` (`tag`, `entryId`),
  CONSTRAINT `ChangelogEntryTag_entryId_fkey` FOREIGN KEY (`entryId`)
    REFERENCES `ChangelogEntry` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
