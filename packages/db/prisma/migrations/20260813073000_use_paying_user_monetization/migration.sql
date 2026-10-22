-- Apify's creator Monetization dashboard excludes free-user runs from
-- revenue, cost, and profit. Earlier snapshots stored allUsersUsd in these
-- scalar columns. Preserve the full response in `monetization`, but correct
-- the reportable financial columns to payingUsersUsd.
UPDATE `ActorInsightSnapshot`
SET
  `costUsd` = CAST(JSON_UNQUOTE(JSON_EXTRACT(`monetization`, '$.daily.payingUsersUsd.costUsd')) AS DOUBLE),
  `revenueUsd` = CAST(JSON_UNQUOTE(JSON_EXTRACT(`monetization`, '$.daily.payingUsersUsd.revenueUsd')) AS DOUBLE),
  `profitUsd` = CAST(JSON_UNQUOTE(JSON_EXTRACT(`monetization`, '$.daily.payingUsersUsd.profitUsd')) AS DOUBLE),
  `profitMargin` = CAST(JSON_UNQUOTE(JSON_EXTRACT(`monetization`, '$.daily.payingUsersUsd.margin')) AS DOUBLE)
WHERE JSON_EXTRACT(`monetization`, '$.daily.payingUsersUsd') IS NOT NULL;
