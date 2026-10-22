-- Persist the authenticated Apify username for compact workspace identity displays.
ALTER TABLE `ApifyToken`
  ADD COLUMN `apifyUsername` VARCHAR(191) NULL;

-- Existing connected workspaces can be identified from their synchronized actors.
UPDATE `ApifyToken` AS token
SET token.`apifyUsername` = (
  SELECT MIN(actor.`username`)
  FROM `Actor` AS actor
  WHERE actor.`businessProfileId` = token.`businessProfileId`
)
WHERE token.`apifyUsername` IS NULL;
