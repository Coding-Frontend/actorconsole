-- Input and output schemas are validated by Apify on the default build.
UPDATE `Actor`
SET `publishReady` = FALSE
WHERE `hasInputSchema` = FALSE OR `hasOutputSchema` = FALSE;

-- Preserve quota-limited Actors for the next scheduled day.
UPDATE `BulkPublishScheduleActor`
SET `status` = 'QUOTA_BLOCKED'
WHERE `status` = 'PENDING'
  AND `lastError` IS NOT NULL
  AND (
    LOWER(`lastError`) LIKE '%daily publication limit%'
    OR LOWER(`lastError`) LIKE '%24-hour publication limit%'
  );

-- Existing metadata failures are terminal until the Actor is repaired and
-- explicitly requeued. This prevents the same invalid Actors from occupying
-- every daily batch after this release.
UPDATE `BulkPublishScheduleActor`
SET `status` = 'BLOCKED'
WHERE `status` IN ('PENDING', 'FAILED')
  AND `lastError` IS NOT NULL
  AND (
    LOWER(`lastError`) LIKE '%default build has no readme%'
    OR LOWER(`lastError`) LIKE '%readme is missing from the default build%'
    OR LOWER(`lastError`) LIKE '%categor%required%'
    OR LOWER(`lastError`) LIKE '%default build has no output schema%'
    OR LOWER(`lastError`) LIKE '%default build has no input or output schema%'
    OR LOWER(`lastError`) LIKE '%missing a required output schema%'
    OR LOWER(`lastError`) LIKE '%missing a required input schema%'
    OR LOWER(`lastError`) LIKE '%missing required input and output schemas%'
  );

-- A transient call that exhausted its request-level retries must not be
-- selected automatically again. Users can explicitly requeue it after the
-- underlying problem is resolved.
UPDATE `BulkPublishScheduleActor`
SET `status` = 'FAILED'
WHERE `status` = 'PENDING' AND `lastError` IS NOT NULL;
