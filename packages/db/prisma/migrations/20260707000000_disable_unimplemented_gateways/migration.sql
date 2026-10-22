UPDATE `PaymentGateway`
SET `enabled` = false, `updatedAt` = NOW(3)
WHERE `key` IN ('stripe', 'dodo');
