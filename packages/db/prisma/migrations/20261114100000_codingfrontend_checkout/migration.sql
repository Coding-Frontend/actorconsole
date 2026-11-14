ALTER TABLE `BillingCheckoutOperation`
  ADD COLUMN `amountMinor` INTEGER NULL,
  ADD COLUMN `currency` VARCHAR(3) NULL;

INSERT INTO `PaymentGateway` (`id`, `key`, `name`, `enabled`, `sortOrder`, `createdAt`, `updatedAt`)
VALUES ('pg_seed_codingfrontend', 'codingfrontend', 'CodingFrontend Checkout', false, 5, NOW(), NOW());
