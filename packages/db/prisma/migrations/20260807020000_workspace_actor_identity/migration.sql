DROP INDEX `Actor_apifyActorId_key` ON `Actor`;

CREATE UNIQUE INDEX `Actor_businessProfileId_apifyActorId_key`
    ON `Actor`(`businessProfileId`, `apifyActorId`);
