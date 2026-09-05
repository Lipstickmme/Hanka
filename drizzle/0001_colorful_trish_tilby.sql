CREATE TABLE `activityLogs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`entityType` varchar(32) NOT NULL,
	`entityPublicId` varchar(24) NOT NULL,
	`eventType` varchar(64) NOT NULL,
	`actorWallet` varchar(64),
	`actorAdminOpenId` varchar(64),
	`detail` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `activityLogs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `marketRequests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`publicId` varchar(24) NOT NULL,
	`buyerWallet` varchar(64) NOT NULL,
	`targetHandle` varchar(80) NOT NULL,
	`vouchBand` enum('under_1k','1k_5k','5k_25k','25k_plus') NOT NULL,
	`requestedQuantity` int NOT NULL,
	`filledQuantity` int NOT NULL DEFAULT 0,
	`pricePerVouch` decimal(14,6) NOT NULL,
	`totalUsdc` decimal(16,6) NOT NULL,
	`paymentSignature` varchar(128),
	`paymentVerifiedAt` timestamp,
	`requestStatus` enum('awaiting_payment','open','filled','awaiting_review','completed','cancelled','disputed') NOT NULL DEFAULT 'awaiting_payment',
	`buyerMarkedDoneAt` timestamp,
	`archiveEligibleAt` timestamp NOT NULL,
	`archivedAt` timestamp,
	`archiveSummary` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `marketRequests_id` PRIMARY KEY(`id`),
	CONSTRAINT `marketRequests_paymentSignature_unique` UNIQUE(`paymentSignature`),
	CONSTRAINT `marketRequests_publicId_unique` UNIQUE(`publicId`)
);
--> statement-breakpoint
CREATE TABLE `payoutRecords` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sellerCommitmentId` int NOT NULL,
	`recipientWallet` varchar(64) NOT NULL,
	`amountUsdc` decimal(16,6) NOT NULL,
	`payoutStatus` enum('queued','sent','withheld') NOT NULL DEFAULT 'queued',
	`externalReference` varchar(160),
	`adminNote` text,
	`decidedByOpenId` varchar(64) NOT NULL,
	`decidedAt` timestamp NOT NULL DEFAULT (now()),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `payoutRecords_id` PRIMARY KEY(`id`),
	CONSTRAINT `payoutRecords_commitment_unique` UNIQUE(`sellerCommitmentId`)
);
--> statement-breakpoint
CREATE TABLE `sellerCommitments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`publicId` varchar(24) NOT NULL,
	`requestId` int,
	`sellerWallet` varchar(64) NOT NULL,
	`profileHandle` varchar(80) NOT NULL,
	`vouchBand` enum('under_1k','1k_5k','5k_25k','25k_plus') NOT NULL,
	`quantity` int NOT NULL,
	`pricePerVouch` decimal(14,6) NOT NULL,
	`sellerCommitmentStatus` enum('open','matched','done','under_review','approved','paid','cancelled','disputed') NOT NULL DEFAULT 'open',
	`sellerMarkedDoneAt` timestamp,
	`archiveEligibleAt` timestamp NOT NULL,
	`archivedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `sellerCommitments_id` PRIMARY KEY(`id`),
	CONSTRAINT `sellerCommitments_publicId_unique` UNIQUE(`publicId`)
);
--> statement-breakpoint
CREATE TABLE `walletChallenges` (
	`id` varchar(64) NOT NULL,
	`wallet` varchar(64) NOT NULL,
	`action` varchar(48) NOT NULL,
	`message` text NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`usedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `walletChallenges_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `activityLogs_entity_createdAt_idx` ON `activityLogs` (`entityPublicId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `marketRequests_status_createdAt_idx` ON `marketRequests` (`requestStatus`,`createdAt`);--> statement-breakpoint
CREATE INDEX `marketRequests_archiveEligibleAt_idx` ON `marketRequests` (`archiveEligibleAt`);--> statement-breakpoint
CREATE INDEX `payoutRecords_status_createdAt_idx` ON `payoutRecords` (`payoutStatus`,`createdAt`);--> statement-breakpoint
CREATE INDEX `sellerCommitments_requestId_status_idx` ON `sellerCommitments` (`requestId`,`sellerCommitmentStatus`);--> statement-breakpoint
CREATE INDEX `sellerCommitments_status_createdAt_idx` ON `sellerCommitments` (`sellerCommitmentStatus`,`createdAt`);--> statement-breakpoint
CREATE INDEX `walletChallenges_wallet_action_idx` ON `walletChallenges` (`wallet`,`action`);