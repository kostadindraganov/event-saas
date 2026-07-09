ALTER TABLE "user" ADD COLUMN "ical_token" text;--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_ical_token_unique" UNIQUE("ical_token");