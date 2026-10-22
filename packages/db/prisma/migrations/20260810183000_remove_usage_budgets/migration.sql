-- Remove the discontinued workspace usage-budget feature and its preference.
DROP TABLE IF EXISTS `UsageBudget`;

ALTER TABLE `NotificationPreference`
  DROP COLUMN `prReviews`;

UPDATE `NotificationChannel`
SET `events` = JSON_REMOVE(
  `events`,
  JSON_UNQUOTE(JSON_SEARCH(`events`, 'one', 'usage_budget'))
)
WHERE JSON_SEARCH(`events`, 'one', 'usage_budget') IS NOT NULL;
