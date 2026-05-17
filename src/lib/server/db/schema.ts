import {
	boolean,
	index,
	integer,
	jsonb,
	pgTable,
	text,
	timestamp,
	unique,
	uniqueIndex,
	uuid,
	varchar,
} from "drizzle-orm/pg-core";

export const tokens = pgTable("tokens", {
	id: uuid("id").primaryKey().defaultRandom(),
	name: varchar("name", { length: 255 }).notNull(),
	tokenHash: text("token_hash").notNull().unique(),
	allowedIps: jsonb("allowed_ips").$type<string[]>(),
	createdAt: timestamp("created_at", { withTimezone: true })
		.notNull()
		.defaultNow(),
	revokedAt: timestamp("revoked_at", { withTimezone: true }),
	lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
	updatedAt: timestamp("updated_at", { withTimezone: true })
		.notNull()
		.defaultNow(),
	defaultUser: varchar("default_user", { length: 128 }),
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
		type: text("type").notNull().$type<"gateway" | "ssh" | "vault">(),
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

export const webhookEndpoints = pgTable("webhook_endpoints", {
	id: uuid("id").primaryKey().defaultRandom(),
	tokenId: uuid("token_id")
		.notNull()
		.references(() => tokens.id, { onDelete: "cascade" }),
	slug: varchar("slug", { length: 255 }).notNull().unique(),
	name: varchar("name", { length: 255 }).notNull(),
	secret: text("secret"),
	signatureHeader: text("signature_header"),
	handlingInstructions: text("handling_instructions"),
	enabled: boolean("enabled").notNull().default(true),
	createdAt: timestamp("created_at", { withTimezone: true })
		.notNull()
		.defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true })
		.notNull()
		.defaultNow(),
});

export type WebhookEndpoint = typeof webhookEndpoints.$inferSelect;

export const webhookEvents = pgTable(
	"webhook_events",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		endpointId: uuid("endpoint_id")
			.notNull()
			.references(() => webhookEndpoints.id, { onDelete: "cascade" }),
		headers: jsonb("headers").$type<Record<string, string>>().notNull(),
		body: jsonb("body").notNull(),
		status: text("status")
			.notNull()
			.$type<"pending" | "delivered" | "expired">()
			.default("pending"),
		receivedAt: timestamp("received_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		deliveredAt: timestamp("delivered_at", { withTimezone: true }),
		expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
	},
	(t) => [
		index("webhook_events_endpoint_status_idx").on(t.endpointId, t.status),
		index("webhook_events_expires_at_idx").on(t.expiresAt),
	],
);

export type WebhookEvent = typeof webhookEvents.$inferSelect;

export const skills = pgTable("skills", {
	id: uuid("id").primaryKey().defaultRandom(),
	slug: varchar("slug", { length: 64 }).notNull().unique(),
	description: varchar("description", { length: 1024 }).notNull(),
	contentMd: text("content_md").notNull(),
	version: integer("version").notNull().default(1),
	createdAt: timestamp("created_at", { withTimezone: true })
		.notNull()
		.defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true })
		.notNull()
		.defaultNow(),
});

export type Skill = typeof skills.$inferSelect;

export const memories = pgTable(
	"memories",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		tokenId: uuid("token_id")
			.notNull()
			.references(() => tokens.id, { onDelete: "cascade" }),
		userIdentifier: varchar("user_identifier", { length: 128 }),
		visibility: varchar("visibility", { length: 16 }).notNull(),
		summary: varchar("summary", { length: 500 }).notNull(),
		content: text("content").notNull(),
		metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => [
		index("idx_memories_token").on(t.tokenId),
		index("idx_memories_visibility").on(t.visibility),
		index("idx_memories_user").on(t.userIdentifier),
	],
);

export type Memory = typeof memories.$inferSelect;

export type WikiSourceRef = {
	type: "url" | "file" | "mcp" | "manual" | "semrush";
	title?: string;
	uri?: string;
	retrievedAt?: string;
};

export const wikiPages = pgTable(
	"wiki_pages",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		namespace: varchar("namespace", { length: 64 }).notNull().default("general"),
		slug: varchar("slug", { length: 128 }).notNull(),
		title: varchar("title", { length: 256 }).notNull(),
		summary: varchar("summary", { length: 500 }),
		tags: jsonb("tags").$type<string[]>().default([]),
		body: text("body").notNull(),
		sources: jsonb("sources").$type<WikiSourceRef[]>().default([]),
		status: varchar("status", { length: 16 }).notNull().default("active"),
		version: integer("version").notNull().default(1),
		updatedBy: varchar("updated_by", { length: 128 }),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => [
		uniqueIndex("uq_wiki_namespace_slug").on(t.namespace, t.slug),
		index("idx_wiki_namespace").on(t.namespace),
		index("idx_wiki_status").on(t.status),
	],
);

export type WikiPage = typeof wikiPages.$inferSelect;

export const vaults = pgTable("vaults", {
	id: uuid("id").primaryKey().defaultRandom(),
	name: varchar("name", { length: 255 }).notNull(),
	slug: varchar("slug", { length: 255 }).notNull().unique(),
	description: text("description"),
	createdAt: timestamp("created_at", { withTimezone: true })
		.notNull()
		.defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true })
		.notNull()
		.defaultNow(),
});

export type Vault = typeof vaults.$inferSelect;

export const vaultItems = pgTable(
	"vault_items",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		vaultId: uuid("vault_id")
			.notNull()
			.references(() => vaults.id, { onDelete: "cascade" }),
		name: varchar("name", { length: 255 }).notNull(),
		slug: varchar("slug", { length: 255 }).notNull(),
		domain: varchar("domain", { length: 255 }),
		description: text("description"),
		allowedOrigins: jsonb("allowed_origins").$type<string[]>(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => [unique().on(t.vaultId, t.slug)],
);

export type VaultItem = typeof vaultItems.$inferSelect;

export const vaultItemFields = pgTable(
	"vault_item_fields",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		itemId: uuid("item_id")
			.notNull()
			.references(() => vaultItems.id, { onDelete: "cascade" }),
		name: varchar("name", { length: 255 }).notNull(),
		encryptedValue: text("encrypted_value").notNull(),
		sensitive: boolean("sensitive").notNull().default(true),
		sortOrder: integer("sort_order").notNull().default(0),
	},
	(t) => [unique().on(t.itemId, t.name)],
);

export type VaultItemField = typeof vaultItemFields.$inferSelect;

export const tokenVaultPermissions = pgTable(
	"token_vault_permissions",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		tokenId: uuid("token_id")
			.notNull()
			.references(() => tokens.id, { onDelete: "cascade" }),
		vaultId: uuid("vault_id")
			.notNull()
			.references(() => vaults.id, { onDelete: "cascade" }),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => [unique().on(t.tokenId, t.vaultId)],
);

export type TokenVaultPermission = typeof tokenVaultPermissions.$inferSelect;
