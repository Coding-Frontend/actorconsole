ALTER TABLE `Ticket`
  ADD COLUMN `businessProfileId` VARCHAR(191) NULL,
  ADD COLUMN `actorId` VARCHAR(191) NULL;

CREATE INDEX `Ticket_businessProfileId_status_idx` ON `Ticket`(`businessProfileId`, `status`);
CREATE INDEX `Ticket_actorId_status_idx` ON `Ticket`(`actorId`, `status`);

ALTER TABLE `Ticket`
  ADD CONSTRAINT `Ticket_businessProfileId_fkey`
    FOREIGN KEY (`businessProfileId`) REFERENCES `BusinessProfile`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `Ticket_actorId_fkey`
    FOREIGN KEY (`actorId`) REFERENCES `Actor`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;
