-- Apify Store descriptions can exceed MySQL's default VARCHAR(191) mapping.
-- Preserve the complete marketplace text so snapshots do not fail for Actors
-- with longer descriptions.
ALTER TABLE `Actor` MODIFY `description` TEXT NULL;
