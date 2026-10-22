ALTER TABLE `AiProvider`
  ADD COLUMN `useOpenCodeHeaders` BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN `openCodeClient` VARCHAR(191) NOT NULL DEFAULT 'cli',
  ADD COLUMN `openCodeUserAgent` VARCHAR(500) NOT NULL DEFAULT 'opencode/1.15.0/cli',
  ADD COLUMN `openCodeSessionId` VARCHAR(191) NULL,
  ADD COLUMN `openCodeProjectId` VARCHAR(191) NULL;

UPDATE `AiProvider`
SET `openCodeSessionId` = UUID(), `openCodeProjectId` = UUID();

ALTER TABLE `AiProvider`
  MODIFY COLUMN `openCodeSessionId` VARCHAR(191) NOT NULL,
  MODIFY COLUMN `openCodeProjectId` VARCHAR(191) NOT NULL;
