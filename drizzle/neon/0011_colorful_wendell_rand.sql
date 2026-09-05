CREATE TABLE "arcSocialOffers" (
	"id" serial PRIMARY KEY NOT NULL,
	"sellerWallet" varchar(42) NOT NULL,
	"sourceHandle" varchar(80) NOT NULL,
	"subject" varchar(64) NOT NULL,
	"instrument" "market_instrument" NOT NULL,
	"availability" integer DEFAULT 1 NOT NULL,
	"followerCount" integer DEFAULT 0 NOT NULL,
	"ethosScore" integer DEFAULT 0 NOT NULL,
	"kaitoScore" integer DEFAULT 0 NOT NULL,
	"kaitoAura" integer DEFAULT 0 NOT NULL,
	"isVerifiedClaim" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "arcSocialBounties" ADD COLUMN "minimumFollowerCount" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "arcSocialBounties" ADD COLUMN "minimumEthosScore" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "arcSocialBounties" ADD COLUMN "minimumKaitoScore" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "arcSocialBounties" ADD COLUMN "minimumKaitoAura" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "arcSocialBounties" ADD COLUMN "requireVerifiedSource" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "arcSocialOffers_wallet_source_instrument_unique" ON "arcSocialOffers" USING btree ("sellerWallet","sourceHandle","instrument");--> statement-breakpoint
CREATE INDEX "arcSocialOffers_instrument_idx" ON "arcSocialOffers" USING btree ("instrument");--> statement-breakpoint
CREATE INDEX "arcSocialOffers_seller_idx" ON "arcSocialOffers" USING btree ("sellerWallet");