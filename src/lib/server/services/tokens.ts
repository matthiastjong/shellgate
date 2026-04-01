import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "../db";
import { tokens } from "../db/schema";

export function generateToken(): string {
	return `sg_${randomBytes(32).toString("hex")}`;
}

export function hashToken(token: string): string {
	return createHash("sha256").update(token).digest("hex");
}

export async function listTokens() {
	return db
		.select({
			id: tokens.id,
			name: tokens.name,
			allowedIps: tokens.allowedIps,
			createdAt: tokens.createdAt,
			revokedAt: tokens.revokedAt,
			lastUsedAt: tokens.lastUsedAt,
			updatedAt: tokens.updatedAt,
		})
		.from(tokens)
		.orderBy(desc(tokens.createdAt));
}

export async function createToken(name: string) {
	const plainToken = generateToken();
	const tokenHash = hashToken(plainToken);

	const [row] = await db
		.insert(tokens)
		.values({ name, tokenHash })
		.returning({
			id: tokens.id,
			name: tokens.name,
			createdAt: tokens.createdAt,
		});

	return { token: row, plainToken };
}

export async function renameToken(id: string, name: string) {
	const [existing] = await db
		.select({ id: tokens.id })
		.from(tokens)
		.where(eq(tokens.id, id))
		.limit(1);

	if (!existing) return null;

	const [updated] = await db
		.update(tokens)
		.set({ name, updatedAt: new Date() })
		.where(eq(tokens.id, id))
		.returning({ id: tokens.id, name: tokens.name });

	return updated;
}

export async function regenerateToken(id: string) {
	const [existing] = await db
		.select({ id: tokens.id })
		.from(tokens)
		.where(eq(tokens.id, id))
		.limit(1);

	if (!existing) return null;

	const plainToken = generateToken();
	const tokenHash = hashToken(plainToken);

	const [updated] = await db
		.update(tokens)
		.set({ tokenHash, updatedAt: new Date() })
		.where(eq(tokens.id, id))
		.returning({
			id: tokens.id,
			name: tokens.name,
			createdAt: tokens.createdAt,
			revokedAt: tokens.revokedAt,
			lastUsedAt: tokens.lastUsedAt,
			updatedAt: tokens.updatedAt,
		});

	return { token: updated, plainToken };
}

export async function revokeToken(id: string) {
	const [existing] = await db
		.select({ id: tokens.id, revokedAt: tokens.revokedAt })
		.from(tokens)
		.where(eq(tokens.id, id))
		.limit(1);

	if (!existing) return null;
	if (existing.revokedAt) return { id: existing.id, revoked: true };

	await db
		.update(tokens)
		.set({ revokedAt: new Date() })
		.where(eq(tokens.id, id));

	return { id: existing.id, revoked: true };
}

export async function findTokenByHash(hash: string) {
	const [row] = await db
		.select()
		.from(tokens)
		.where(and(eq(tokens.tokenHash, hash), isNull(tokens.revokedAt)))
		.limit(1);

	return row ?? null;
}

export async function getTokenById(id: string) {
	const [row] = await db
		.select({
			id: tokens.id,
			name: tokens.name,
			allowedIps: tokens.allowedIps,
			webhookKey: tokens.webhookKey,
			webhookSecret: tokens.webhookSecret,
			createdAt: tokens.createdAt,
			revokedAt: tokens.revokedAt,
			lastUsedAt: tokens.lastUsedAt,
			updatedAt: tokens.updatedAt,
		})
		.from(tokens)
		.where(eq(tokens.id, id))
		.limit(1);
	return row ?? null;
}

export async function updateLastUsed(id: string) {
	await db
		.update(tokens)
		.set({ lastUsedAt: new Date() })
		.where(eq(tokens.id, id));
}
