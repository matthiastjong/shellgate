ALTER TABLE "skills" ADD COLUMN "last_used_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "targets" ADD COLUMN "email" varchar(255);--> statement-breakpoint
ALTER TABLE "memories" DROP COLUMN "last_used_at";