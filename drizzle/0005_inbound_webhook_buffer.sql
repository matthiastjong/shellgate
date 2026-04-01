ALTER TABLE "tokens" ADD COLUMN "webhook_key" text UNIQUE;
ALTER TABLE "tokens" ADD COLUMN "webhook_secret" text;

CREATE TABLE "inbound_events" (
	"id" varchar(50) PRIMARY KEY NOT NULL,
	"token_id" uuid NOT NULL REFERENCES "tokens"("id") ON DELETE CASCADE,
	"channel" varchar(255) NOT NULL,
	"payload" jsonb NOT NULL,
	"headers" jsonb NOT NULL,
	"source_ip" text,
	"event_type" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"acked_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL
);

CREATE INDEX "inbound_events_token_id_idx" ON "inbound_events" ("token_id");
CREATE INDEX "inbound_events_status_idx" ON "inbound_events" ("status");
CREATE INDEX "inbound_events_expires_at_idx" ON "inbound_events" ("expires_at");
