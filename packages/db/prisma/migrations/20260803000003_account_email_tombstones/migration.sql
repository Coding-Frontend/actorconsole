-- Free a unique email address during the account deletion grace period while
-- retaining the original only long enough to restore or purge the account.
ALTER TABLE `User`
  ADD COLUMN `deletionOriginalEmail` VARCHAR(191) NULL;
