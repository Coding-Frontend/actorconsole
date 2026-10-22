ALTER TABLE `Actor` ADD COLUMN `apifyRemovedAt` DATETIME(3) NULL;
CREATE INDEX `Actor_businessProfileId_apifyRemovedAt_idx` ON `Actor`(`businessProfileId`, `apifyRemovedAt`);
