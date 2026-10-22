-- The generic Apify publication response was previously classified as a
-- permanent metadata failure. Requeue those rows so the publisher can run the
-- Actor first and then retry the Store publication with the corrected flow.
UPDATE `BulkPublishScheduleActor`
SET
  `status` = 'PENDING',
  `lastError` = NULL
WHERE `status` = 'BLOCKED'
  AND LOWER(COALESCE(`lastError`, '')) LIKE '%actor cannot be published at this time%';
