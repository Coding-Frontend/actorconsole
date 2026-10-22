ALTER TABLE `ActorBuildSnapshot`
    ADD COLUMN `versionNumber` VARCHAR(191) NULL,
    ADD COLUMN `commitMessage` VARCHAR(191) NULL,
    ADD COLUMN `parentSourceHash` VARCHAR(191) NULL,
    ADD COLUMN `changedFiles` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `additions` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `deletions` INTEGER NOT NULL DEFAULT 0;

CREATE INDEX `ActorBuildSnapshot_actorId_sourceHash_idx`
    ON `ActorBuildSnapshot`(`actorId`, `sourceHash`);
