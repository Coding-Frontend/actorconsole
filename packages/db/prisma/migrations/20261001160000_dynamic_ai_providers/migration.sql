ALTER TABLE `AiProvider`
  ADD COLUMN `type` VARCHAR(64) NULL,
  ADD COLUMN `autoDisableOnError` BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN `disabledAt` DATETIME(3) NULL,
  ADD COLUMN `disabledReason` TEXT NULL;

-- Preserve every existing provider, account and priority.
UPDATE `AiProvider` SET `type` = `key`;

ALTER TABLE `AiProvider`
  MODIFY COLUMN `type` VARCHAR(64) NOT NULL,
  DROP INDEX `AiProvider_priority_key`;
