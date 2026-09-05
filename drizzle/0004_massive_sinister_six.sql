CREATE TABLE `paymentSignatureClaims` (
	`signature` varchar(128) NOT NULL,
	`entityType` varchar(32) NOT NULL,
	`entityPublicId` varchar(24) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `paymentSignatureClaims_signature` PRIMARY KEY(`signature`)
);
--> statement-breakpoint
CREATE INDEX `paymentSignatureClaims_entity_idx` ON `paymentSignatureClaims` (`entityPublicId`);