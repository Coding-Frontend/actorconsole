CREATE INDEX `Actor_businessProfileId_storeIsPublic_idx`
  ON `Actor`(`businessProfileId`, `storeIsPublic`);

CREATE INDEX `Actor_businessProfileId_storeIsDeprecated_idx`
  ON `Actor`(`businessProfileId`, `storeIsDeprecated`);

CREATE INDEX `Actor_businessProfileId_storeNotice_idx`
  ON `Actor`(`businessProfileId`, `storeNotice`);
