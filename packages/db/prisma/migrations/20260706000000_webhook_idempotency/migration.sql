-- Remove historical duplicate provider deliveries before enforcing replay
-- protection. Null external IDs remain permitted for providers without IDs.
DELETE newer
FROM `WebhookDelivery` AS newer
INNER JOIN `WebhookDelivery` AS older
  ON newer.`source` = older.`source`
  AND newer.`externalId` = older.`externalId`
  AND newer.`externalId` IS NOT NULL
  AND (
    newer.`createdAt` > older.`createdAt`
    OR (newer.`createdAt` = older.`createdAt` AND newer.`id` > older.`id`)
  );

CREATE UNIQUE INDEX `WebhookDelivery_source_externalId_key`
  ON `WebhookDelivery`(`source`, `externalId`);
