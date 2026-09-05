ALTER TABLE `sellerCommitments` ADD `sourceHandle` varchar(80);--> statement-breakpoint
ALTER TABLE `sellerCommitments` ADD `targetHandle` varchar(80);--> statement-breakpoint
ALTER TABLE `sellerCommitments` ADD `allocationKey` varchar(255);--> statement-breakpoint
ALTER TABLE `sellerCommitments` ADD CONSTRAINT `sellerCommitments_allocationKey_unique` UNIQUE(`allocationKey`);