-- Remove client impersonation settings. Provider requests use API-key authentication.
ALTER TABLE `AiProvider`
  DROP COLUMN `useOpenCodeHeaders`,
  DROP COLUMN `openCodeClient`,
  DROP COLUMN `openCodeUserAgent`,
  DROP COLUMN `openCodeSessionId`,
  DROP COLUMN `openCodeProjectId`;

-- Previously anonymous entries must be configured before they can be enabled again.
UPDATE `AiProvider` AS p
SET p.`enabled` = false
WHERE p.`type` = 'opencode_free'
  AND NOT EXISTS (
    SELECT 1 FROM `AiProviderCredential` AS c
    WHERE c.`providerId` = p.`id` AND c.`enabled` = true AND c.`authErrorAt` IS NULL
  );

-- Fresh proxy settings have no vendor-specific endpoint or username.
UPDATE `AiProxyConfig`
SET `host` = '', `port` = 8080, `username` = ''
WHERE `encryptedPassword` IS NULL
  AND `host` = 'proxy.apify.com' AND `port` = 8000 AND `username` = 'groups-auto';

ALTER TABLE `AiProxyConfig`
  ALTER COLUMN `host` SET DEFAULT '',
  ALTER COLUMN `port` SET DEFAULT 8080,
  ALTER COLUMN `username` SET DEFAULT '';
