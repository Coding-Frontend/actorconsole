DROP TABLE `ActorBuildSnapshot`;
DROP TABLE `Deployment`;
DROP TABLE `NotificationChannel`;

ALTER TABLE `Actor`
  DROP COLUMN `sourceSyncError`,
  CHANGE COLUMN `lastBuildSyncAt` `lastOperationalSyncAt` DATETIME(3) NULL;

ALTER TABLE `ActorOptimizationResult`
  CHANGE COLUMN `sourceFingerprint` `metadataFingerprint` VARCHAR(191) NULL;

DELETE FROM `FeatureFlag` WHERE `key` = 'kill_switch_deploys';
