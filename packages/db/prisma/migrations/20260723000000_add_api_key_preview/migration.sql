ALTER TABLE `ApiKey`
  ADD COLUMN `keyPreview` VARCHAR(16) NULL;

DELETE FROM `ChangelogEntry`
WHERE `id` LIKE 'cl_seed_%';
