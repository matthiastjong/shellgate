import {
	boolean,
	index,
	integer,
	jsonb,
	pgTable,
	text,
	timestamp,
	unique,
	uuid,
	varchar,
} from "drizzle-orm/pg-core";

export const tokens = pgTable("tokens", {
	id: uuid("id").primaryKey().defaultRandom(),
	name: varchar("name", { length: 255 }).notNull(),
	tokenHash: text("token_hash").notNull().unique(),
	allowedIps: jsonb("allowed_ips").$type<string[]>(),
	webhookKey: text("webhook_key").unique(),
	webhookSecret: text("webhook_secret"),
	createdAt: timestamp("created_at", { withTimezone: true })
		.notNull()
		.defaultNow(),
	revokedAt: timestamp("revoked_at", { withTimezone: true }),
	lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
	updatedAt: timestamp("updated_at", { withTimezone: true })
		.notNull()
		.defaultNow(),
});

export type Token = typeof tokens.$inferSelect;

export type SshConfig = {
	host: string;
	port: number;
	username: string;
};

export const targets = pgTable("targets", {
	id: uuid("id").primaryKey().defaultRandom(),
	name: varchar("name", { length: 255 }).notNull(),
	slug: varchar("slug", { length: 255 }).notNull().unique(),
	type: text("type").notNull().$type<"api" | "ssh">(),
	baseUrl: text("base_url"),
	config: jsonb("config").$type<SshConfig>(),
	enabled: boolean("enabled").notNull().default(true),
	createdAt: timestamp("created_at", { withTimezone: true })
		.notNull()
		.defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true })
		.notNull()
		.defaultNow(),
});

export type Target = typeof targets.$inferSelect;

export const targetAuthMethods = pgTable("target_auth_methods", {
	id: uuid("id").primaryKey().defaultRandom(),
	targetId: uuid("target_id")
		.notNull()
		.references(() => targets.id, { onDelete: "cascade" }),
	label: text("label").notNull(),
	type: text("type").notNull(),
	credential: text("credential").notNull(),
	credentialHint: text("credential_hint"),
	isDefault: boolean("is_default").notNull().default(false),
	createdAt: timestamp("created_at", { withTimezone: true })
		.notNull()
		.defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true })
		.notNull()
		.defaultNow(),
});

export type TargetAuthMethod = typeof targetAuthMethods.$inferSelect;

export const tokenPermissions = pgTable(
	"token_permissions",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		tokenId: uuid("token_id")
			.notNull()
			.references(() => tokens.id, { onDelete: "cascade" }),
		targetId: uuid("target_id")
			.notNull()
			.references(() => targets.id, { onDelete: "cascade" }),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => [unique().on(t.tokenId, t.targetId)],
);

export type TokenPermission = typeof tokenPermissions.$inferSelect;

export const users = pgTable("users", {
	id: uuid("id").primaryKey().defaultRandom(),
	email: varchar("email", { length: 255 }).notNull().unique(),
	passwordHash: text("password_hash").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true })
		.notNull()
		.defaultNow(),
});

export type User = typeof users.$inferSelect;

export const auditLogs = pgTable(
	"audit_logs",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		tokenId: uuid("token_id").references(() => tokens.id, {
			onDelete: "set null",
		}),
		tokenName: varchar("token_name", { length: 255 }),
		targetId: uuid("target_id").references(() => targets.id, {
			onDelete: "set null",
		}),
		targetSlug: varchar("target_slug", { length: 255 }),
		type: text("type").notNull().$type<"gateway" | "ssh">(),
		method: text("method"),
		path: text("path"),
		statusCode: integer("status_code"),
		clientIp: text("client_ip").notNull(),
		durationMs: integer("duration_ms"),
		guardAction: text("guard_action").$type<"allow" | "block" | "approval_required" | "approved">(),
		guardReason: text("guard_reason"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => [
		index("audit_logs_token_id_idx").on(t.tokenId),
		index("audit_logs_target_id_idx").on(t.targetId),
		index("audit_logs_created_at_idx").on(t.createdAt.desc()),
	],
);

export type AuditLog = typeof auditLogs.$inferSelect;

export const inboundEvents = pgTable(
	"inbound_events",
	{
		id: varchar("id", { length: 50 }).primaryKey(),
		tokenId: uuid("token_id")
			.notNull()
			.references(() => tokens.id, { onDelete: "cascade" }),
		channel: varchar("channel", { length: 255 }).notNull(),
		payload: jsonb("payload").notNull(),
		headers: jsonb("headers").notNull().$type<Record<string, string>>(),
		sourceIp: text("source_ip"),
		eventType: text("event_type"),
		status: text("status")
			.notNull()
			.$type<"pending" | "acked" | "expired">()
			.default("pending"),
		receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
		ackedAt: timestamp("acked_at", { withTimezone: true }),
		expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
	},
	(t) => [
		index("inbound_events_token_id_idx").on(t.tokenId),
		index("inbound_events_status_idx").on(t.status),
		index("inbound_events_expires_at_idx").on(t.expiresAt),
	],
);

export type InboundEvent = typeof inboundEvents.$inferSelect;
