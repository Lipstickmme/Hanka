ALTER TYPE "public"."market_instrument" ADD VALUE 'hanka_points';--> statement-breakpoint
CREATE TABLE "pointLedger" (
	"id" serial PRIMARY KEY NOT NULL,
	"wallet" varchar(64) NOT NULL,
	"amount" integer NOT NULL,
	"eventType" varchar(48) NOT NULL,
	"eventKey" varchar(160) NOT NULL,
	"sourceWallet" varchar(64),
	"level" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "referralProfiles" (
	"id" serial PRIMARY KEY NOT NULL,
	"wallet" varchar(64) NOT NULL,
	"referralCode" varchar(24) NOT NULL,
	"referrerWallet" varchar(64),
	"directReferrals" integer DEFAULT 0 NOT NULL,
	"bonusReferralSlots" integer DEFAULT 0 NOT NULL,
	"pointsTotal" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "pointLedger_event_unique" ON "pointLedger" USING btree ("eventKey","wallet");--> statement-breakpoint
CREATE INDEX "pointLedger_wallet_createdAt_idx" ON "pointLedger" USING btree ("wallet","createdAt");--> statement-breakpoint
CREATE UNIQUE INDEX "referralProfiles_wallet_unique" ON "referralProfiles" USING btree ("wallet");--> statement-breakpoint
CREATE UNIQUE INDEX "referralProfiles_code_unique" ON "referralProfiles" USING btree ("referralCode");--> statement-breakpoint
CREATE INDEX "referralProfiles_points_idx" ON "referralProfiles" USING btree ("pointsTotal","createdAt");