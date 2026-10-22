ALTER TABLE `User` ADD COLUMN `username` VARCHAR(191) NULL;
CREATE UNIQUE INDEX `User_username_key` ON `User`(`username`);

ALTER TABLE `ApifyToken` ADD COLUMN `consoleUserId` VARCHAR(191) NULL;
CREATE INDEX `ApifyToken_consoleUserId_idx` ON `ApifyToken`(`consoleUserId`);
