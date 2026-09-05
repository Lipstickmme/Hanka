CREATE TYPE "public"."market_instrument" AS ENUM('vouch', 'slash');--> statement-breakpoint
CREATE TYPE "public"."payout_status" AS ENUM('queued', 'sent', 'withheld');--> statement-breakpoint
CREATE TYPE "public"."request_status" AS ENUM('awaiting_payment', 'open', 'filled', 'awaiting_review', 'completed', 'cancelled', 'disputed');--> statement-breakpoint
CREATE TYPE "public"."seller_commitment_status" AS ENUM('open', 'awaiting_payment', 'matched', 'done', 'under_review', 'approved', 'paid', 'cancelled', 'disputed');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('user', 'admin');--> statement-breakpoint
CREATE TYPE "public"."vouch_band" AS ENUM('under_1k', '1k_5k', '5k_10k', '10k_25k', '5k_25k', '25k_50k', '50k_plus', '25k_plus');--> statement-breakpoint
CREATE TABLE "activityLogs" (
	"id" serial PRIMARY KEY NOT NULL,
	"entityType" varchar(32) NOT NULL,
	"entityPublicId" varchar(24) NOT NULL,
	"eventType" varchar(64) NOT NULL,
	"actorWallet" varchar(64),
	"actorAdminOpenId" varchar(64),
	"detail" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "marketProjects" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" varchar(64) NOT NULL,
	"name" varchar(120) NOT NULL,
	"description" text,
	"isActive" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "marketRequests" (
	"id" serial PRIMARY KEY NOT NULL,
	"publicId" varchar(24) NOT NULL,
	"buyerWallet" varchar(64) NOT NULL,
	"targetHandle" varchar(80) NOT NULL,
	"projectSlug" varchar(64) DEFAULT 'commonsmade' NOT NULL,
	"instrument" "market_instrument" DEFAULT 'vouch' NOT NULL,
	"vouchBand" "vouch_band",
	"requestedQuantity" integer NOT NULL,
	"filledQuantity" integer DEFAULT 0 NOT NULL,
	"pricePerVouch" numeric(14, 6) NOT NULL,
	"totalUsdc" numeric(16, 6) NOT NULL,
	"platformFeeUsdc" numeric(16, 6) DEFAULT '0.000000' NOT NULL,
	"sellerNetUsdc" numeric(16, 6) DEFAULT '0.000000' NOT NULL,
	"paymentSignature" varchar(128),
	"paymentVerifiedAt" timestamp with time zone,
	"status" "request_status" DEFAULT 'awaiting_payment' NOT NULL,
	"buyerMarkedDoneAt" timestamp with time zone,
	"archiveEligibleAt" timestamp with time zone NOT NULL,
	"archivedAt" timestamp with time zone,
	"archiveSummary" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "marketRequests_paymentSignature_unique" UNIQUE("paymentSignature")
);
--> statement-breakpoint
CREATE TABLE "paymentSignatureClaims" (
	"signature" varchar(128) PRIMARY KEY NOT NULL,
	"entityType" varchar(32) NOT NULL,
	"entityPublicId" varchar(24) NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payoutRecords" (
	"id" serial PRIMARY KEY NOT NULL,
	"sellerCommitmentId" integer NOT NULL,
	"recipientWallet" varchar(64) NOT NULL,
	"amountUsdc" numeric(16, 6) NOT NULL,
	"grossAmountUsdc" numeric(16, 6) DEFAULT '0.000000' NOT NULL,
	"platformFeeUsdc" numeric(16, 6) DEFAULT '0.000000' NOT NULL,
	"status" "payout_status" DEFAULT 'queued' NOT NULL,
	"externalReference" varchar(160),
	"adminNote" text,
	"decidedByOpenId" varchar(64) NOT NULL,
	"decidedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sellerCommitments" (
	"id" serial PRIMARY KEY NOT NULL,
	"publicId" varchar(24) NOT NULL,
	"requestId" integer,
	"parentOfferId" integer,
	"sellerWallet" varchar(64) NOT NULL,
	"profileHandle" varchar(80) NOT NULL,
	"sourceHandle" varchar(80),
	"targetHandle" varchar(80),
	"allocationKey" varchar(255),
	"projectSlug" varchar(64) DEFAULT 'commonsmade' NOT NULL,
	"instrument" "market_instrument" DEFAULT 'vouch' NOT NULL,
	"vouchBand" "vouch_band",
	"quantity" integer NOT NULL,
	"pointsPerUnit" integer,
	"pricePerVouch" numeric(14, 6) NOT NULL,
	"grossUsdc" numeric(16, 6),
	"platformFeeUsdc" numeric(16, 6),
	"sellerNetUsdc" numeric(16, 6),
	"buyerWallet" varchar(64),
	"paymentSignature" varchar(128),
	"paymentVerifiedAt" timestamp with time zone,
	"buyerMarkedDoneAt" timestamp with time zone,
	"status" "seller_commitment_status" DEFAULT 'open' NOT NULL,
	"sellerMarkedDoneAt" timestamp with time zone,
	"archiveEligibleAt" timestamp with time zone NOT NULL,
	"archivedAt" timestamp with time zone,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sellerCommitments_paymentSignature_unique" UNIQUE("paymentSignature")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"openId" varchar(64) NOT NULL,
	"name" text,
	"email" varchar(320),
	"loginMethod" varchar(64),
	"role" "user_role" DEFAULT 'user' NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"lastSignedIn" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_openId_unique" UNIQUE("openId")
);
--> statement-breakpoint
CREATE TABLE "walletChallenges" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"wallet" varchar(64) NOT NULL,
	"action" varchar(48) NOT NULL,
	"message" text NOT NULL,
	"expiresAt" timestamp with time zone NOT NULL,
	"usedAt" timestamp with time zone,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "activityLogs_entity_createdAt_idx" ON "activityLogs" USING btree ("entityPublicId","createdAt");--> statement-breakpoint
CREATE UNIQUE INDEX "marketProjects_slug_unique" ON "marketProjects" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "marketRequests_publicId_unique" ON "marketRequests" USING btree ("publicId");--> statement-breakpoint
CREATE INDEX "marketRequests_status_createdAt_idx" ON "marketRequests" USING btree ("status","createdAt");--> statement-breakpoint
CREATE INDEX "marketRequests_archiveEligibleAt_idx" ON "marketRequests" USING btree ("archiveEligibleAt");--> statement-breakpoint
CREATE INDEX "paymentSignatureClaims_entity_idx" ON "paymentSignatureClaims" USING btree ("entityPublicId");--> statement-breakpoint
CREATE UNIQUE INDEX "payoutRecords_commitment_unique" ON "payoutRecords" USING btree ("sellerCommitmentId");--> statement-breakpoint
CREATE INDEX "payoutRecords_status_createdAt_idx" ON "payoutRecords" USING btree ("status","createdAt");--> statement-breakpoint
CREATE UNIQUE INDEX "sellerCommitments_publicId_unique" ON "sellerCommitments" USING btree ("publicId");--> statement-breakpoint
CREATE UNIQUE INDEX "sellerCommitments_allocationKey_unique" ON "sellerCommitments" USING btree ("allocationKey");--> statement-breakpoint
CREATE INDEX "sellerCommitments_requestId_status_idx" ON "sellerCommitments" USING btree ("requestId","status");--> statement-breakpoint
CREATE INDEX "sellerCommitments_parentOfferId_status_idx" ON "sellerCommitments" USING btree ("parentOfferId","status");--> statement-breakpoint
CREATE INDEX "sellerCommitments_status_createdAt_idx" ON "sellerCommitments" USING btree ("status","createdAt");--> statement-breakpoint
CREATE INDEX "walletChallenges_wallet_action_idx" ON "walletChallenges" USING btree ("wallet","action");