-- Dodo supports currencies with three minor-unit digits (for example KWD).
-- Preserve the existing ten-digit integer range while storing their exact amounts.
ALTER TABLE `Payment`
  MODIFY `amount` DECIMAL(13, 3) NOT NULL,
  MODIFY `refundedAmount` DECIMAL(13, 3) NULL;
