CREATE INDEX `Actor_businessProfileId_updatedAt_idx`
  ON `Actor`(`businessProfileId`, `updatedAt`);

CREATE INDEX `BulkPublishSchedule_businessProfileId_enabled_idx`
  ON `BulkPublishSchedule`(`businessProfileId`, `enabled`);

CREATE INDEX `ActorBuildSnapshot_actorId_createdAt_idx`
  ON `ActorBuildSnapshot`(`actorId`, `createdAt`);
