CREATE TABLE "arcSocialProofRetentions" (
	"id" serial PRIMARY KEY NOT NULL,
	"contractAddress" varchar(42) NOT NULL,
	"taskId" bigint NOT NULL,
	"requesterWallet" varchar(42) NOT NULL,
	"takerWallet" varchar(42) NOT NULL,
	"sourceHandle" varchar(80) NOT NULL,
	"retentionStartsAt" timestamp with time zone NOT NULL,
	"retentionEndsAt" timestamp with time zone NOT NULL,
	"reportedAt" timestamp with time zone,
	"evidenceReference" text,
	"reviewStatus" varchar(16) DEFAULT 'active' NOT NULL,
	"reviewedAt" timestamp with time zone,
	"resolverWallet" varchar(42),
	"reviewNote" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "arcSocialSourceBans" (
	"id" serial PRIMARY KEY NOT NULL,
	"sourceHandle" varchar(80) NOT NULL,
	"sellerWallet" varchar(42) NOT NULL,
	"contractAddress" varchar(42) NOT NULL,
	"taskId" bigint NOT NULL,
	"reason" text NOT NULL,
	"resolverWallet" varchar(42) NOT NULL,
	"bannedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "arcSocialOffers" ADD COLUMN "isActive" boolean DEFAULT true NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "arcSocialProofRetentions_contract_task_unique" ON "arcSocialProofRetentions" USING btree ("contractAddress","taskId");--> statement-breakpoint
CREATE INDEX "arcSocialProofRetentions_source_status_idx" ON "arcSocialProofRetentions" USING btree ("sourceHandle","reviewStatus");--> statement-breakpoint
CREATE INDEX "arcSocialProofRetentions_requester_idx" ON "arcSocialProofRetentions" USING btree ("requesterWallet");--> statement-breakpoint
CREATE UNIQUE INDEX "arcSocialSourceBans_source_unique" ON "arcSocialSourceBans" USING btree ("sourceHandle");--> statement-breakpoint
CREATE INDEX "arcSocialSourceBans_seller_idx" ON "arcSocialSourceBans" USING btree ("sellerWallet");