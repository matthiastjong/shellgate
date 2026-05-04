CREATE TABLE "wiki_pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"namespace" varchar(64) DEFAULT 'general' NOT NULL,
	"slug" varchar(128) NOT NULL,
	"title" varchar(256) NOT NULL,
	"summary" varchar(500),
	"tags" jsonb DEFAULT '[]'::jsonb,
	"body" text NOT NULL,
	"sources" jsonb DEFAULT '[]'::jsonb,
	"status" varchar(16) DEFAULT 'active' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_by" varchar(128),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_wiki_namespace_slug" ON "wiki_pages" USING btree ("namespace","slug");--> statement-breakpoint
CREATE INDEX "idx_wiki_namespace" ON "wiki_pages" USING btree ("namespace");--> statement-breakpoint
CREATE INDEX "idx_wiki_status" ON "wiki_pages" USING btree ("status");