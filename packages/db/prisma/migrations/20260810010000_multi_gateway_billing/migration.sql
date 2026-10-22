-- Provider-neutral billing identifiers allow Stripe, Razorpay, and Dodo
-- subscriptions to share the existing workspace billing ledger.
ALTER TABLE `Subscription`
  ADD COLUMN `providerCustomerId` VARCHAR(191) NULL,
  ADD COLUMN `providerSubscriptionId` VARCHAR(191) NULL,
  ADD COLUMN `providerProductId` VARCHAR(191) NULL,
  ADD COLUMN `providerCheckoutId` VARCHAR(191) NULL;

UPDATE `Subscription`
SET
  `provider` = 'razorpay',
  `providerCustomerId` = `razorpayCustomerId`,
  `providerSubscriptionId` = `razorpaySubscriptionId`,
  `providerProductId` = `razorpayPlanId`
WHERE `razorpaySubscriptionId` IS NOT NULL OR `razorpayCustomerId` IS NOT NULL;

CREATE UNIQUE INDEX `Subscription_provider_providerSubscriptionId_key`
  ON `Subscription`(`provider`, `providerSubscriptionId`);
CREATE INDEX `Subscription_provider_providerCustomerId_idx`
  ON `Subscription`(`provider`, `providerCustomerId`);

ALTER TABLE `Payment`
  ADD COLUMN `provider` VARCHAR(191) NOT NULL DEFAULT 'razorpay',
  ADD COLUMN `providerOrderId` VARCHAR(191) NULL,
  ADD COLUMN `providerPaymentId` VARCHAR(191) NULL,
  ADD COLUMN `providerInvoiceId` VARCHAR(191) NULL;

UPDATE `Payment`
SET
  `provider` = 'razorpay',
  `providerOrderId` = `razorpayOrderId`,
  `providerPaymentId` = `razorpayPaymentId`,
  `providerInvoiceId` = `razorpayInvoiceId`
WHERE `razorpayPaymentId` IS NOT NULL OR `razorpayOrderId` IS NOT NULL;

CREATE UNIQUE INDEX `Payment_provider_providerPaymentId_key`
  ON `Payment`(`provider`, `providerPaymentId`);
CREATE INDEX `Payment_provider_providerOrderId_idx`
  ON `Payment`(`provider`, `providerOrderId`);
