-- OpenCode retired the original DeepSeek free model used by the initial
-- provider seed. Only migrate known historical defaults so an administrator's
-- explicit model choice is preserved.
UPDATE `AiProvider`
SET
    `model` = 'mimo-v2.5-free',
    `lastTestedAt` = NULL,
    `testStatus` = NULL,
    `testMessage` = NULL,
    `updatedAt` = CURRENT_TIMESTAMP(3)
WHERE `key` = 'opencode_free'
  AND `model` IN ('deepseek-v4-flash-free', 'mimo-2.5-free');
