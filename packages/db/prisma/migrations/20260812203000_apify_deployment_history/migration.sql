-- Apify build IDs are unique within an Actor. This makes repeated workspace
-- synchronizations idempotent while still allowing multiple queued rows whose
-- build ID has not been assigned yet (MySQL permits multiple NULL values).
CREATE UNIQUE INDEX `Deployment_actorId_buildId_key`
    ON `Deployment`(`actorId`, `buildId`);

CREATE INDEX `Deployment_status_createdAt_idx`
    ON `Deployment`(`status`, `createdAt`);

CREATE INDEX `Deployment_triggeredBy_createdAt_idx`
    ON `Deployment`(`triggeredBy`, `createdAt`);
