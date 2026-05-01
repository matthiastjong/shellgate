CREATE TABLE "memories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_id" uuid NOT NULL,
	"user_identifier" varchar(128),
	"visibility" varchar(16) NOT NULL,
	"summary" varchar(500) NOT NULL,
	"content" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tokens" ADD COLUMN "default_user" varchar(128);--> statement-breakpoint
ALTER TABLE "memories" ADD CONSTRAINT "memories_token_id_tokens_id_fk" FOREIGN KEY ("token_id") REFERENCES "public"."tokens"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_memories_token" ON "memories" USING btree ("token_id");--> statement-breakpoint
CREATE INDEX "idx_memories_visibility" ON "memories" USING btree ("visibility");--> statement-breakpoint
CREATE INDEX "idx_memories_user" ON "memories" USING btree ("user_identifier");