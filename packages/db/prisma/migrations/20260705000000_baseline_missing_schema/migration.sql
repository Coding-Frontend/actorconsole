-- AlterTable
ALTER TABLE `ChangelogEntry` DROP FOREIGN KEY `ChangelogEntry_createdById_fkey`;

ALTER TABLE `ChangelogEntry` DROP PRIMARY KEY,
    MODIFY `id` VARCHAR(191) NOT NULL,
    ALTER COLUMN `type` DROP DEFAULT,
    MODIFY `createdById` VARCHAR(191) NULL,
    ADD PRIMARY KEY (`id`);

-- AlterTable
ALTER TABLE `PaymentGateway` DROP PRIMARY KEY,
    MODIFY `id` VARCHAR(191) NOT NULL,
    MODIFY `key` VARCHAR(191) NOT NULL,
    MODIFY `name` VARCHAR(191) NOT NULL,
    ADD PRIMARY KEY (`id`);

ALTER TABLE `ChangelogEntry` ADD CONSTRAINT `ChangelogEntry_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
