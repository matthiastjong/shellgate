-- Replace provider_id (FK to integration_providers) with provider_type (string) on connected_accounts
ALTER TABLE "connected_accounts" ADD COLUMN "provider_type" varchar(64);--> statement-breakpoint
UPDATE "connected_accounts" SET "provider_type" = (SELECT "type" FROM "integration_providers" WHERE "integration_providers"."id" = "connected_accounts"."provider_id");--> statement-breakpoint
ALTER TABLE "connected_accounts" ALTER COLUMN "provider_type" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "connected_accounts" DROP CONSTRAINT "connected_accounts_provider_id_integration_providers_id_fk";--> statement-breakpoint
ALTER TABLE "connected_accounts" DROP COLUMN "provider_id";--> statement-breakpoint
DROP TABLE "integration_providers";
