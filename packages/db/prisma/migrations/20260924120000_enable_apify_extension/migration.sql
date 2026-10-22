-- Make the Chrome extension connection available from the workspace Apify page.
-- The feature flag remains available as an administrator kill switch.
UPDATE `FeatureFlag`
SET `enabled` = TRUE,
    `rolloutPct` = 100,
    `updatedAt` = CURRENT_TIMESTAMP(3)
WHERE `key` = 'apify_chrome_extension';
