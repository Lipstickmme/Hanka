CREATE TABLE "sourceBans" (
	"id" serial PRIMARY KEY NOT NULL,
	"sourceHandle" varchar(80) NOT NULL,
	"sellerWallet" varchar(64) NOT NULL,
	"commitmentPublicId" varchar(24) NOT NULL,
	"reason" text NOT NULL,
	"bannedByOpenId" varchar(96) NOT NULL,
	"bannedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sellerCommitments" ADD COLUMN "retentionDays" integer DEFAULT 30 NOT NULL;--> statement-breakpoint
ALTER TABLE "sellerCommitments" ADD COLUMN "retentionStartsAt" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sellerCommitments" ADD COLUMN "retentionEndsAt" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sellerCommitments" ADD COLUMN "retentionViolationReportedAt" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sellerCommitments" ADD COLUMN "retentionViolationEvidence" text;--> statement-breakpoint
ALTER TABLE "sellerCommitments" ADD COLUMN "retentionViolationVerifiedAt" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sellerCommitments" ADD COLUMN "retentionViolationNote" text;--> statement-breakpoint
CREATE UNIQUE INDEX "sourceBans_sourceHandle_unique" ON "sourceBans" USING btree ("sourceHandle");--> statement-breakpoint
CREATE INDEX "sourceBans_sellerWallet_idx" ON "sourceBans" USING btree ("sellerWallet");--> statement-breakpoint
CREATE INDEX "sellerCommitments_retentionEndsAt_idx" ON "sellerCommitments" USING btree ("retentionEndsAt");