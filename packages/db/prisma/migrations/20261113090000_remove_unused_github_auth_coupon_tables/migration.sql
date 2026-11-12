-- Drops tables with no remaining application code: the removed GitHub App /
-- PR-review feature (GithubInstallation, GithubRepo, PullRequest, Review,
-- GithubToken), the retired Auth.js VerificationToken, and CouponRedemption.
-- Any rows in these tables are deleted permanently; the VPS deploy takes a
-- database backup before applying migrations.

-- DropForeignKey
ALTER TABLE `GithubInstallation` DROP FOREIGN KEY `GithubInstallation_userId_fkey`;

-- DropForeignKey
ALTER TABLE `GithubRepo` DROP FOREIGN KEY `GithubRepo_installationId_fkey`;

-- DropForeignKey
ALTER TABLE `GithubRepo` DROP FOREIGN KEY `GithubRepo_actorId_fkey`;

-- DropForeignKey
ALTER TABLE `PullRequest` DROP FOREIGN KEY `PullRequest_repoId_fkey`;

-- DropForeignKey
ALTER TABLE `Review` DROP FOREIGN KEY `Review_prId_fkey`;

-- DropForeignKey
ALTER TABLE `Review` DROP FOREIGN KEY `Review_actorId_fkey`;

-- DropForeignKey
ALTER TABLE `GithubToken` DROP FOREIGN KEY `GithubToken_userId_fkey`;

-- DropForeignKey
ALTER TABLE `CouponRedemption` DROP FOREIGN KEY `CouponRedemption_couponId_fkey`;

-- DropForeignKey
ALTER TABLE `CouponRedemption` DROP FOREIGN KEY `CouponRedemption_userId_fkey`;

-- DropTable
DROP TABLE `VerificationToken`;

-- DropTable
DROP TABLE `GithubInstallation`;

-- DropTable
DROP TABLE `GithubRepo`;

-- DropTable
DROP TABLE `PullRequest`;

-- DropTable
DROP TABLE `Review`;

-- DropTable
DROP TABLE `GithubToken`;

-- DropTable
DROP TABLE `CouponRedemption`;

