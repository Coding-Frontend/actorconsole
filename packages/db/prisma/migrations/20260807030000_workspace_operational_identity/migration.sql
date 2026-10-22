DROP INDEX `ActorRunSnapshot_apifyRunId_key` ON `ActorRunSnapshot`;
DROP INDEX `ActorBuildSnapshot_apifyBuildId_key` ON `ActorBuildSnapshot`;

CREATE UNIQUE INDEX `ActorRunSnapshot_actorId_apifyRunId_key`
    ON `ActorRunSnapshot`(`actorId`, `apifyRunId`);

CREATE UNIQUE INDEX `ActorBuildSnapshot_actorId_apifyBuildId_key`
    ON `ActorBuildSnapshot`(`actorId`, `apifyBuildId`);
