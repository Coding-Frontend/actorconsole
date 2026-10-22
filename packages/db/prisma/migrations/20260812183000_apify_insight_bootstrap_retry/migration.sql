ALTER TABLE `ApifyToken`
  ADD COLUMN `insightsBootstrapPending` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `insightsBootstrapError` TEXT NULL;
