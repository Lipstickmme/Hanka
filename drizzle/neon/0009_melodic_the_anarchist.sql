ALTER TABLE "arcSocialBounties" ADD COLUMN "title" varchar(50);--> statement-breakpoint
ALTER TABLE "arcSocialBounties" ADD COLUMN "summary" varchar(500);--> statement-breakpoint
ALTER TABLE "arcSocialBounties" ADD COLUMN "deliverables" text;--> statement-breakpoint
ALTER TABLE "arcSocialBounties" ADD COLUMN "featuredToken" varchar(80);--> statement-breakpoint
ALTER TABLE "arcSocialBounties" ADD COLUMN "location" varchar(120);--> statement-breakpoint
ALTER TABLE "arcSocialBounties" ADD COLUMN "verificationMethod" varchar(80);