CREATE TABLE "arcSocialBounties" (
	"id" serial PRIMARY KEY NOT NULL,
	"contractAddress" varchar(42) NOT NULL,
	"taskId" bigint NOT NULL,
	"requesterWallet" varchar(42) NOT NULL,
	"projectSlug" varchar(64) DEFAULT 'commonsmade' NOT NULL,
	"instrument" "market_instrument" NOT NULL,
	"targetHandle" varchar(80) NOT NULL,
	"proofDetail" varchar(240),
	"spaceMinutes" integer,
	"retentionDays" integer DEFAULT 30 NOT NULL,
	"termsHash" varchar(66) NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "arcSocialBountySources" (
	"id" serial PRIMARY KEY NOT NULL,
	"contractAddress" varchar(42) NOT NULL,
	"taskId" bigint NOT NULL,
	"takerWallet" varchar(42) NOT NULL,
	"sourceHandle" varchar(80) NOT NULL,
	"pointsPerUnit" integer NOT NULL,
	"followerCount" integer,
	"ethosScore" integer,
	"kaitoScore" integer,
	"kaitoAura" integer,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "arcSocialBounties_contract_task_unique" ON "arcSocialBounties" USING btree ("contractAddress","taskId");--> statement-breakpoint
CREATE INDEX "arcSocialBounties_target_instrument_idx" ON "arcSocialBounties" USING btree ("targetHandle","instrument");--> statement-breakpoint
CREATE INDEX "arcSocialBounties_requester_idx" ON "arcSocialBounties" USING btree ("requesterWallet");--> statement-breakpoint
CREATE UNIQUE INDEX "arcSocialBountySources_contract_task_unique" ON "arcSocialBountySources" USING btree ("contractAddress","taskId");--> statement-breakpoint
CREATE INDEX "arcSocialBountySources_source_idx" ON "arcSocialBountySources" USING btree ("sourceHandle");--> statement-breakpoint
CREATE INDEX "arcSocialBountySources_taker_idx" ON "arcSocialBountySources" USING btree ("takerWallet");