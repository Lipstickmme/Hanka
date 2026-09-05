CREATE TABLE `marketProjects` (
	`id` int AUTO_INCREMENT NOT NULL,
	`slug` varchar(64) NOT NULL,
	`name` varchar(120) NOT NULL,
	`description` text,
	`isActive` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `marketProjects_id` PRIMARY KEY(`id`),
	CONSTRAINT `marketProjects_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
ALTER TABLE `marketRequests` MODIFY COLUMN `vouchBand` enum('under_1k','1k_5k','5k_10k','10k_25k','5k_25k','25k_50k','50k_plus','25k_plus') NOT NULL;--> statement-breakpoint
ALTER TABLE `sellerCommitments` MODIFY COLUMN `vouchBand` enum('under_1k','1k_5k','5k_10k','10k_25k','5k_25k','25k_50k','50k_plus','25k_plus') NOT NULL;--> statement-breakpoint
ALTER TABLE `marketRequests` ADD `projectSlug` varchar(64) DEFAULT 'commonsmade' NOT NULL;--> statement-breakpoint
ALTER TABLE `marketRequests` ADD `platformFeeUsdc` decimal(16,6) DEFAULT '0.000000' NOT NULL;--> statement-breakpoint
ALTER TABLE `marketRequests` ADD `sellerNetUsdc` decimal(16,6) DEFAULT '0.000000' NOT NULL;--> statement-breakpoint
ALTER TABLE `payoutRecords` ADD `grossAmountUsdc` decimal(16,6) DEFAULT '0.000000' NOT NULL;--> statement-breakpoint
ALTER TABLE `payoutRecords` ADD `platformFeeUsdc` decimal(16,6) DEFAULT '0.000000' NOT NULL;--> statement-breakpoint
ALTER TABLE `sellerCommitments` ADD `projectSlug` varchar(64) DEFAULT 'commonsmade' NOT NULL;--> statement-breakpoint
ALTER TABLE `sellerCommitments` ADD `grossUsdc` decimal(16,6);--> statement-breakpoint
ALTER TABLE `sellerCommitments` ADD `platformFeeUsdc` decimal(16,6);--> statement-breakpoint
ALTER TABLE `sellerCommitments` ADD `sellerNetUsdc` decimal(16,6);--> statement-breakpoint
ALTER TABLE `sellerCommitments` ADD `buyerWallet` varchar(64);--> statement-breakpoint
ALTER TABLE `sellerCommitments` ADD `paymentSignature` varchar(128);--> statement-breakpoint
ALTER TABLE `sellerCommitments` ADD `paymentVerifiedAt` timestamp;--> statement-breakpoint
ALTER TABLE `sellerCommitments` ADD `buyerMarkedDoneAt` timestamp;--> statement-breakpoint
ALTER TABLE `sellerCommitments` ADD CONSTRAINT `sellerCommitments_paymentSignature_unique` UNIQUE(`paymentSignature`);