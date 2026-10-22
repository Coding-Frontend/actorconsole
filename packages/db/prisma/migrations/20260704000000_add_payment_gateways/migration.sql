-- CreateTable
CREATE TABLE `PaymentGateway` (
    `id` VARCHAR(36) NOT NULL,
    `key` VARCHAR(64) NOT NULL,
    `name` VARCHAR(128) NOT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `config` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `PaymentGateway_key_key`(`key`),
    INDEX `PaymentGateway_enabled_sortOrder_idx`(`enabled`, `sortOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Seed the three default payment gateways
INSERT INTO `PaymentGateway` (`id`, `key`, `name`, `enabled`, `sortOrder`, `createdAt`, `updatedAt`) VALUES
('pg_seed_stripe', 'stripe', 'Stripe', false, 10, NOW(), NOW()),
('pg_seed_razorpay', 'razorpay', 'Razorpay', true, 20, NOW(), NOW()),
('pg_seed_dodo', 'dodo', 'Dodo Payments', false, 30, NOW(), NOW());
