-- Track the Apify Console publication gates independently from source/listing readiness.
ALTER TABLE `Actor` ADD COLUMN `hasTaggedBuild` BOOLEAN;
ALTER TABLE `Actor` ADD COLUMN `hasPublicProfile` BOOLEAN;
ALTER TABLE `Actor` ADD COLUMN `hasVerifiedEmail` BOOLEAN;
ALTER TABLE `Actor` ADD COLUMN `hasNonDisposableEmail` BOOLEAN;

CREATE INDEX `Actor_businessProfileId_hasTaggedBuild_idx`
ON `Actor`(`businessProfileId`, `hasTaggedBuild`);

CREATE INDEX `Actor_businessProfileId_hasPublicProfile_idx`
ON `Actor`(`businessProfileId`, `hasPublicProfile`);
