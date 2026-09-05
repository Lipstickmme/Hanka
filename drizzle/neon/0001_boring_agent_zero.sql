ALTER TYPE "public"."market_instrument" ADD VALUE 'follow';--> statement-breakpoint
ALTER TYPE "public"."market_instrument" ADD VALUE 'repost';--> statement-breakpoint
ALTER TYPE "public"."market_instrument" ADD VALUE 'comment';--> statement-breakpoint
ALTER TYPE "public"."market_instrument" ADD VALUE 'space_listener';--> statement-breakpoint
ALTER TYPE "public"."market_instrument" ADD VALUE 'space_speaker';--> statement-breakpoint
ALTER TYPE "public"."market_instrument" ADD VALUE 'space_contributor';--> statement-breakpoint
ALTER TABLE "marketRequests" ADD COLUMN "proofDetail" varchar(240);--> statement-breakpoint
ALTER TABLE "marketRequests" ADD COLUMN "spaceMinutes" integer;--> statement-breakpoint
ALTER TABLE "sellerCommitments" ADD COLUMN "proofDetail" varchar(240);--> statement-breakpoint
ALTER TABLE "sellerCommitments" ADD COLUMN "spaceMinutes" integer;