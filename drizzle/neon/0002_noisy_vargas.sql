CREATE TABLE "supportMessages" (
	"id" serial PRIMARY KEY NOT NULL,
	"publicId" varchar(24) NOT NULL,
	"wallet" varchar(64) NOT NULL,
	"subject" varchar(120) NOT NULL,
	"message" text NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "supportMessages_publicId_unique" ON "supportMessages" USING btree ("publicId");--> statement-breakpoint
CREATE INDEX "supportMessages_createdAt_idx" ON "supportMessages" USING btree ("createdAt");