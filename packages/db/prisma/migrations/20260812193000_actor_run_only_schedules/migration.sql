-- Expand regular schedules into a dedicated recurring Actor-run resource.
-- Legacy columns are retained temporarily so existing history can be reviewed
-- before the final contract migration removes them.
ALTER TABLE `Schedule`
  ADD COLUMN `input` JSON NULL;

-- Preserve inputs from existing live Actor-run schedules.
UPDATE `Schedule`
SET `input` = COALESCE(JSON_EXTRACT(`payload`, '$.input'), JSON_OBJECT())
WHERE `action` = 'run_actor';

-- A previous dry run must never become a live recurring Actor invocation, and
-- optimization/publishing schedules are outside the new Schedule contract.
UPDATE `Schedule`
SET `enabled` = false
WHERE `action` <> 'run_actor' OR `dryRun` = true;

ALTER TABLE `Schedule`
  MODIFY COLUMN `action` VARCHAR(191) NOT NULL DEFAULT 'run_actor',
  MODIFY COLUMN `dryRun` BOOLEAN NOT NULL DEFAULT false;
