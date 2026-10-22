-- CreateTable
CREATE TABLE `ChangelogEntry` (
    `id` VARCHAR(36) NOT NULL,
    `version` VARCHAR(64) NOT NULL,
    `releaseDate` DATE NOT NULL,
    `versionSummary` VARCHAR(500) NULL,
    `type` ENUM('FEATURE', 'FIX', 'PERF', 'SECURITY', 'UI', 'CHORE') NOT NULL DEFAULT 'FEATURE',
    `text` TEXT NOT NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `isPublished` BOOLEAN NOT NULL DEFAULT false,
    `publishedAt` DATETIME(3) NULL,
    `createdById` VARCHAR(36) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ChangelogEntry_version_sortOrder_idx`(`version`, `sortOrder`),
    INDEX `ChangelogEntry_isPublished_releaseDate_idx`(`isPublished`, `releaseDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ChangelogEntry` ADD CONSTRAINT `ChangelogEntry_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed historical changelog data (previously hardcoded in the frontend)
INSERT INTO `ChangelogEntry` (`id`, `version`, `releaseDate`, `versionSummary`, `type`, `text`, `sortOrder`, `isPublished`, `publishedAt`, `createdAt`, `updatedAt`) VALUES
('cl_seed_001', 'Unreleased', '2026-06-28', 'Production readiness polish pass.', 'FEATURE', 'Full production audit & fixes — completed a comprehensive production readiness audit. Fixed the deploy pipeline, added Redis-backed rate limiting, resolved MCP scheduler actor ID resolution, added CSRF protection, enforced plan limits, created blog and docs pages, added error differentiation to dashboard pages, and standardized environment variables across all configuration files.', 0, true, NOW(), NOW(), NOW()),
('cl_seed_002', 'Unreleased', '2026-06-28', NULL, 'FEATURE', 'MCP server deploy tooling — added deploy queue type and worker handler. The one-click deploy feature now properly enqueues builds and processes them via the background worker. Added RevenueDaily sync that runs every 6 hours.', 1, true, NOW(), NOW(), NOW()),
('cl_seed_003', 'Unreleased', '2026-06-28', NULL, 'FEATURE', 'Admin integrations management — created the integrations listing page with categorized cards, configuration status badges, and live connection testing for Razorpay, Anthropic, Replicate, and Resend API keys.', 2, true, NOW(), NOW(), NOW()),
('cl_seed_004', '0.8.0', '2026-06-20', 'Plan enforcement & integrations.', 'FEATURE', 'Plan enforcement middleware — implemented plan-based gating. Free accounts are limited to 1 tracked actor, Pro accounts to 10, and Studio accounts are unlimited.', 0, true, NOW(), NOW(), NOW()),
('cl_seed_005', '0.7.0', '2026-06-18', 'Support ticketing & legal policies.', 'FEATURE', 'Support ticketing system — launched the support ticketing system with ticket creation, admin assignment, priority levels, email notifications, and a full message thread view.', 0, true, NOW(), NOW(), NOW()),
('cl_seed_006', '0.7.0', '2026-06-18', NULL, 'FEATURE', 'Legal policy management — added version-controlled legal policy system with draft/publish workflow. Admins can create, edit, and publish versions of Terms, Privacy, Cookie, Refund, AUP, and DPA policies.', 1, true, NOW(), NOW(), NOW()),
('cl_seed_007', '0.6.0', '2026-06-12', 'AI code review & scheduling.', 'FEATURE', 'AI code review pipeline — wired up the complete GitHub code review pipeline. The ActorConsole GitHub App now reviews PRs with Apify-aware checks — detecting charging bugs, memory leaks, and selector rot.', 0, true, NOW(), NOW(), NOW()),
('cl_seed_008', '0.6.0', '2026-06-12', NULL, 'FEATURE', 'Scheduled publishing engine — launched the cron-based scheduling system. Users can schedule copy rewrites, image regenerations, pricing updates, and actor runs.', 1, true, NOW(), NOW(), NOW()),
('cl_seed_009', '0.5.0', '2026-06-08', 'AI generation & billing.', 'FEATURE', 'AI copy & image generation — integrated AI-powered copy rewriting (Claude) and image generation (Replicate FLUX). Users can generate SEO-optimized titles, descriptions, READMEs, and square thumbnails.', 0, true, NOW(), NOW(), NOW()),
('cl_seed_010', '0.5.0', '2026-06-08', NULL, 'FEATURE', 'Razorpay billing integration — replaced Stripe with Razorpay for Indian market support. Added subscription creation, one-time orders, checkout verification, webhook handling, and admin refund capabilities.', 1, true, NOW(), NOW(), NOW()),
('cl_seed_011', '0.4.0', '2026-06-01', 'Initial launch.', 'FEATURE', 'Initial launch — launched ActorConsole with GitHub OAuth, Apify token management, actor sync from the Apify Store, keyword research, pricing management, and the admin dashboard.', 0, true, NOW(), NOW(), NOW());
