import { eq, sql } from "drizzle-orm";
import { db } from "../db";
import { targets } from "../db/schema";
import type { SshConfig, EmailConfig } from "../db/schema";
import { isUniqueViolation } from "../utils/db-error";
import { validateBaseUrl } from "../utils/url";

export function slugify(name: string): string {
	return name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

export async function listTargets() {
	return db
		.select({
			id: targets.id,
			name: targets.name,
			slug: targets.slug,
			type: targets.type,
			baseUrl: targets.baseUrl,
			config: targets.config,
			enabled: targets.enabled,
			createdAt: targets.createdAt,
			updatedAt: targets.updatedAt,
			authMethodCount: sql<number>`(
				SELECT COUNT(*)::int FROM target_auth_methods
				WHERE target_auth_methods.target_id = targets.id
			)`.as("auth_method_count"),
		})
		.from(targets);
}

export async function getTargetBySlug(slug: string) {
	const [row] = await db
		.select()
		.from(targets)
		.where(eq(targets.slug, slug))
		.limit(1);

	return row ?? null;
}

export async function getTargetById(id: string) {
	const [row] = await db
		.select()
		.from(targets)
		.where(eq(targets.id, id))
		.limit(1);

	return row ?? null;
}

function validateSshConfig(config: unknown): SshConfig {
	if (!config || typeof config !== "object") {
		throw new Error("SSH config is required for ssh targets");
	}
	const c = config as Record<string, unknown>;
	const host = typeof c.host === "string" ? c.host.trim() : "";
	if (!host) throw new Error("host is required for ssh targets");
	const port = typeof c.port === "number" ? c.port : 22;
	if (port < 1 || port > 65535) throw new Error("port must be between 1 and 65535");
	const username = typeof c.username === "string" ? c.username.trim() : "";
	if (!username) throw new Error("username is required for ssh targets");
	return { host, port, username };
}

function validateEmailConfig(config: unknown): EmailConfig {
	if (!config || typeof config !== "object") {
		throw new Error("email config is required for email targets");
	}
	const c = config as Record<string, unknown>;

	// Validate imap
	if (!c.imap || typeof c.imap !== "object") {
		throw new Error("imap config is required for email targets");
	}
	const imap = c.imap as Record<string, unknown>;
	const imapHost = typeof imap.host === "string" ? imap.host.trim() : "";
	if (!imapHost) throw new Error("imap.host is required for email targets");
	const imapPort = typeof imap.port === "number" ? imap.port : 993;
	if (imapPort < 1 || imapPort > 65535) throw new Error("imap.port must be between 1 and 65535");
	const imapSecure = typeof imap.secure === "boolean" ? imap.secure : true;

	// Validate smtp
	if (!c.smtp || typeof c.smtp !== "object") {
		throw new Error("smtp config is required for email targets");
	}
	const smtp = c.smtp as Record<string, unknown>;
	const smtpHost = typeof smtp.host === "string" ? smtp.host.trim() : "";
	if (!smtpHost) throw new Error("smtp.host is required for email targets");
	const smtpPort = typeof smtp.port === "number" ? smtp.port : 993;
	if (smtpPort < 1 || smtpPort > 65535) throw new Error("smtp.port must be between 1 and 65535");
	const smtpSecure = typeof smtp.secure === "boolean" ? smtp.secure : true;

	return {
		imap: { host: imapHost, port: imapPort, secure: imapSecure },
		smtp: { host: smtpHost, port: smtpPort, secure: smtpSecure },
	};
}

export async function createTarget(data: {
	name: string;
	type: "api" | "ssh" | "email";
	base_url?: string | null;
	config?: SshConfig | EmailConfig | null;
	email?: string | null;
}) {
	const name = data.name.trim();
	if (!name) throw new Error("name is required");

	if (data.type !== "api" && data.type !== "ssh" && data.type !== "email") {
		throw new Error("type must be 'api', 'ssh', or 'email'");
	}

	let baseUrl: string | null = null;
	let config: SshConfig | EmailConfig | null = null;
	let email: string | null = null;

	if (data.type === "api") {
		baseUrl = data.base_url ?? "";
		if (!baseUrl) throw new Error("base_url is required for api targets");
		const urlError = validateBaseUrl(baseUrl);
		if (urlError) throw new Error(urlError);
	} else if (data.type === "ssh") {
		config = validateSshConfig(data.config);
	} else if (data.type === "email") {
		config = validateEmailConfig(data.config);
		const emailVal = typeof data.email === "string" ? data.email.trim() : "";
		if (!emailVal) throw new Error("email is required for email targets");
		email = emailVal;
	}

	const slug = slugify(name);
	if (!slug) throw new Error("name must produce a valid slug");

	try {
		const [row] = await db
			.insert(targets)
			.values({ name, slug, type: data.type, baseUrl, config, email })
			.returning();
		return row;
	} catch (err: unknown) {
		if (isUniqueViolation(err)) {
			throw new Error("a target with this slug already exists");
		}
		throw err;
	}
}

export async function updateTarget(
	id: string,
	data: {
		name?: string;
		type?: "api" | "ssh" | "email";
		base_url?: string | null;
		config?: SshConfig | EmailConfig | null;
		email?: string | null;
		enabled?: boolean;
	},
) {
	const [existing] = await db
		.select()
		.from(targets)
		.where(eq(targets.id, id))
		.limit(1);

	if (!existing) return null;

	if (existing.connectedAccountId) {
		throw new Error("cannot modify a managed target — changes must be made via the connected account");
	}

	const updates: Record<string, unknown> = { updatedAt: new Date() };

	if (data.name !== undefined) {
		const name = data.name.trim();
		if (!name) throw new Error("name is required");
		const slug = slugify(name);
		if (!slug) throw new Error("name must produce a valid slug");
		updates.name = name;
		updates.slug = slug;
	}

	if (data.type !== undefined) {
		if (data.type !== "api" && data.type !== "ssh" && data.type !== "email") {
			throw new Error("type must be 'api', 'ssh', or 'email'");
		}
		updates.type = data.type;
	}

	if (data.base_url !== undefined) {
		if (data.base_url === null) {
			updates.baseUrl = null;
		} else {
			const baseUrl = data.base_url;
			if (!baseUrl) throw new Error("base_url must be a valid URL or null");
			const urlError = validateBaseUrl(baseUrl);
			if (urlError) throw new Error(urlError);
			updates.baseUrl = baseUrl;
		}
	}

	if (data.config !== undefined) {
		if (data.config === null) {
			updates.config = null;
		} else {
			// Determine config type: if config has imap/smtp keys it's EmailConfig
			const c = data.config as Record<string, unknown>;
			if ("imap" in c || "smtp" in c) {
				updates.config = validateEmailConfig(data.config);
			} else {
				updates.config = validateSshConfig(data.config);
			}
		}
	}

	if (data.email !== undefined) {
		if (data.email === null) {
			updates.email = null;
		} else {
			const emailVal = data.email.trim();
			if (!emailVal) throw new Error("email must be a non-empty string or null");
			updates.email = emailVal;
		}
	}

	if (data.enabled !== undefined) {
		updates.enabled = Boolean(data.enabled);
	}

	try {
		const [row] = await db
			.update(targets)
			.set(updates)
			.where(eq(targets.id, id))
			.returning();
		return row;
	} catch (err: unknown) {
		if (isUniqueViolation(err)) {
			throw new Error("a target with this slug already exists");
		}
		throw err;
	}
}

export async function deleteTarget(id: string) {
	const [existing] = await db
		.select()
		.from(targets)
		.where(eq(targets.id, id))
		.limit(1);

	if (!existing) return null;

	if (existing.connectedAccountId) {
		throw new Error("cannot delete a managed target — disconnect the account instead");
	}

	await db.delete(targets).where(eq(targets.id, id));

	return { id, deleted: true };
}
