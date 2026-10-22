-- Remove the retired per-Actor cron runner. Workspace publishing schedules
-- remain in BulkPublishSchedule and its related tables.

DROP TABLE `ScheduleRun`;
DROP TABLE `Schedule`;

ALTER TABLE `NotificationPreference`
  DROP COLUMN `scheduleRuns`;

UPDATE `NotificationChannel`
SET `events` = JSON_ARRAY('deployment')
WHERE JSON_CONTAINS(`events`, '"schedule"');

ALTER TABLE `NotificationChannel`
  ALTER COLUMN `events` SET DEFAULT ('["deployment"]');
