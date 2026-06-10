CREATE TABLE "connected_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_type" varchar(64) NOT NULL,
	"email" varchar(255) NOT NULL,
	"display_name" varchar(255),
	"access_token" text NOT NULL,
	"refresh_token" text NOT NULL,
	"token_expires_at" timestamp with time zone NOT NULL,
	"status" varchar(32) DEFAULT 'connected' NOT NULL,
	"status_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "targets" ADD COLUMN "connected_account_id" uuid;--> statement-breakpoint
ALTER TABLE "targets" ADD COLUMN "capability" varchar(32);--> statement-breakpoint
ALTER TABLE "targets" ADD CONSTRAINT "targets_connected_account_id_connected_accounts_id_fk" FOREIGN KEY ("connected_account_id") REFERENCES "public"."connected_accounts"("id") ON DELETE cascade ON UPDATE no action;
